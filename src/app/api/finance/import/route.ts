import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  invoiceCsvHeaders,
  missingHeaders,
  parseFinanceCsv,
  transactionExportCsvHeaders,
  transactionCsvHeaders,
} from "@/domain/finance/csv";
import { parseSek } from "@/domain/finance/calculations";
import {
  createFinancialTransaction,
  createInvoice,
  FinanceError,
  markInvoicePaid,
} from "@/server/services/finance-service";

const requestSchema = z.object({
  kind: z.enum(["invoices", "transactions", "income", "expenses"]),
  csv: z.string().min(1).max(2_000_000),
  commit: z.boolean(),
});

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || !["admin", "accountant"].includes(actor.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsedRequest = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedRequest.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });

  const { db } = getAdminServices();
  try {
    const organization = await db
      .collection("organizations")
      .doc(actor.organizationId)
      .get();
    if (organization.data()?.financeEnabled !== true)
      return NextResponse.json({ error: "financeDisabled" }, { status: 409 });
    const rows = parseFinanceCsv(parsedRequest.data.csv);
    if (rows.length > 500)
      return NextResponse.json({ error: "importTooLarge" }, { status: 400 });
    const required =
      parsedRequest.data.kind === "invoices"
        ? invoiceCsvHeaders
        : parsedRequest.data.kind === "transactions"
          ? transactionExportCsvHeaders
          : transactionCsvHeaders;
    const missing = missingHeaders(rows[0]!, required);
    if (missing.length)
      return NextResponse.json(
        { error: "importHeaders", details: missing.join(", ") },
        { status: 400 },
      );

    const [users, categories, invoices, transactions, agreements, customers] =
      await Promise.all([
        db
          .collection("users")
          .where("organizationId", "==", actor.organizationId)
          .get(),
        db
          .collection("financeCategories")
          .where("organizationId", "==", actor.organizationId)
          .get(),
        db
          .collection("invoices")
          .where("organizationId", "==", actor.organizationId)
          .get(),
        db
          .collection("financialTransactions")
          .where("organizationId", "==", actor.organizationId)
          .get(),
        db
          .collection("compensationAgreements")
          .where("organizationId", "==", actor.organizationId)
          .get(),
        db
          .collection("financeCustomers")
          .where("organizationId", "==", actor.organizationId)
          .get(),
      ]);
    const usersByNumber = new Map(
      users.docs.map((document) => [
        String(document.data().employeeNumber),
        document.id,
      ]),
    );
    const categoriesByCode = new Map(
      categories.docs.map((document) => [
        String(document.data().code),
        { id: document.id, direction: document.data().direction },
      ]),
    );
    const customersByName = new Map(
      customers.docs.map((document) => [
        String(document.data().name).trim().toLocaleLowerCase("sv-SE"),
        document.id,
      ]),
    );
    const invoiceNumbers = new Set(
      invoices.docs.map((document) => String(document.data().invoiceNumber)),
    );
    const invoiceImportKeys = new Set(
      invoices.docs
        .map((document) => String(document.data().importKey ?? ""))
        .filter(Boolean),
    );
    const transactionImportKeys = new Set(
      transactions.docs
        .flatMap((document) => [
          document.id,
          String(document.data().importKey ?? ""),
        ])
        .filter(Boolean),
    );
    const hasAgreement = (userId: string, date: string) =>
      agreements.docs.some((document) => {
        const data = document.data();
        return (
          data.userId === userId &&
          data.validFrom <= date &&
          (!data.validTo || data.validTo >= date)
        );
      });
    const fileKeys = new Set<string>();
    const errors: Array<{ row: number; message: string }> = [];
    const prepared: Array<Record<string, unknown>> = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const value = (key: string) => row[key] ?? "";
      const importKey = value("import_key");
      const employeeNumber = value("consultant_employee_number");
      const consultantId = employeeNumber
        ? usersByNumber.get(employeeNumber)
        : null;
      const category = categoriesByCode.get(
        parsedRequest.data.kind === "invoices"
          ? value("income_category_code")
          : value("category_code"),
      );
      const direction =
        parsedRequest.data.kind === "transactions"
          ? value("direction")
          : parsedRequest.data.kind === "expenses"
            ? "expense"
            : "income";
      if (!["income", "expense"].includes(direction))
        errors.push({ row: rowNumber, message: "importRowDirectionInvalid" });
      if (!importKey)
        errors.push({ row: rowNumber, message: "importRowKeyRequired" });
      else if (fileKeys.has(importKey))
        errors.push({
          row: rowNumber,
          message: "importRowKeyDuplicate",
        });
      else fileKeys.add(importKey);
      if (employeeNumber && !consultantId)
        errors.push({
          row: rowNumber,
          message: "importRowConsultantMissing",
        });
      if (!category || category.direction !== direction)
        errors.push({
          row: rowNumber,
          message: "importRowCategoryInvalid",
        });
      try {
        const netMinor = parseSek(value("net_sek"));
        const vatRateBps = Math.round(Number(value("vat_percent")) * 100);
        if (
          !Number.isInteger(vatRateBps) ||
          vatRateBps < 0 ||
          vatRateBps > 10_000
        )
          throw new Error();
        if (parsedRequest.data.kind === "invoices") {
          const customerId = customersByName.get(
            value("customer").trim().toLocaleLowerCase("sv-SE"),
          );
          if (
            !value("invoice_number") ||
            !value("customer") ||
            !isoDate.test(value("issue_date")) ||
            !isoDate.test(value("due_date"))
          )
            throw new Error();
          if (!customerId)
            errors.push({
              row: rowNumber,
              message: "importRowCustomerMissing",
            });
          if (consultantId && !hasAgreement(consultantId, value("issue_date")))
            errors.push({
              row: rowNumber,
              message: "importRowCompensationMissing",
            });
          if (value("paid_date") && !isoDate.test(value("paid_date")))
            throw new Error();
          if (
            invoiceNumbers.has(value("invoice_number")) &&
            !invoiceImportKeys.has(importKey)
          )
            errors.push({
              row: rowNumber,
              message: "importRowInvoiceDuplicate",
            });
          prepared.push({
            importKey,
            invoiceNumber: value("invoice_number"),
            consultantId: consultantId ?? null,
            customerId,
            issueDate: value("issue_date"),
            dueDate: value("due_date"),
            paidDate: value("paid_date") || null,
            netMinor,
            vatRateBps,
            categoryId: category?.id,
            visibleDescription: value("description"),
            internalNote: value("internal_note"),
            shareBpsOverride: value("share_percent")
              ? Math.round(Number(value("share_percent")) * 100)
              : null,
          });
        } else {
          if (!isoDate.test(value("date"))) throw new Error();
          if (consultantId && !hasAgreement(consultantId, value("date")))
            errors.push({
              row: rowNumber,
              message: "importRowCompensationMissing",
            });
          if (
            direction === "expense" &&
            !["company", "consultant"].includes(value("funding"))
          )
            errors.push({
              row: rowNumber,
              message: "importRowFundingInvalid",
            });
          prepared.push({
            importKey,
            direction,
            categoryId: category?.id,
            consultantId: consultantId ?? null,
            date: value("date"),
            netMinor,
            vatRateBps,
            funding: direction === "expense" ? value("funding") : null,
            applyConsultantShare:
              direction === "income" &&
              ["true", "yes", "1"].includes(value("apply_share").toLowerCase()),
            visibleDescription: value("description"),
            internalNote: value("internal_note"),
          });
        }
      } catch {
        errors.push({
          row: rowNumber,
          message: "importRowValuesInvalid",
        });
      }
    });

    if (errors.length || !parsedRequest.data.commit)
      return NextResponse.json({
        ok: errors.length === 0,
        rows: rows.length,
        errors,
      });

    let imported = 0;
    let skipped = 0;
    for (const item of prepared) {
      const importKey = String(item.importKey);
      if (parsedRequest.data.kind === "invoices") {
        if (invoiceImportKeys.has(importKey)) {
          skipped += 1;
          continue;
        }
        const invoiceId = await createInvoice(db, actor, {
          invoiceNumber: String(item.invoiceNumber),
          consultantId: item.consultantId as string | null,
          customerId: String(item.customerId),
          issueDate: String(item.issueDate),
          dueDate: String(item.dueDate),
          netMinor: Number(item.netMinor),
          vatRateBps: Number(item.vatRateBps),
          visibleDescription: String(item.visibleDescription),
          internalNote: String(item.internalNote),
          shareBpsOverride: item.shareBpsOverride as number | null,
          importKey,
        });
        if (item.paidDate)
          await markInvoicePaid(db, actor, {
            invoiceId,
            paidDate: String(item.paidDate),
            categoryId: String(item.categoryId),
          });
      } else {
        if (transactionImportKeys.has(importKey)) {
          skipped += 1;
          continue;
        }
        await createFinancialTransaction(
          db,
          actor,
          item as Parameters<typeof createFinancialTransaction>[2],
        );
      }
      imported += 1;
    }
    const importRef = db.collection("financeImportJobs").doc();
    const auditRef = db.collection("auditLogs").doc();
    const batch = db.batch();
    batch.create(importRef, {
      organizationId: actor.organizationId,
      kind: parsedRequest.data.kind,
      rowCount: rows.length,
      importedCount: imported,
      skippedCount: skipped,
      status: "completed",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
    batch.create(auditRef, {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "financeImport.completed",
      entityType: "financeImportJob",
      entityId: importRef.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        kind: parsedRequest.data.kind,
        rows: rows.length,
        imported,
        skipped,
      },
    });
    await batch.commit();
    return NextResponse.json({
      ok: true,
      rows: rows.length,
      imported,
      skipped,
      errors: [],
    });
  } catch (error) {
    if (error instanceof FinanceError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    return NextResponse.json({ error: "importInvalid" }, { status: 400 });
  }
}
