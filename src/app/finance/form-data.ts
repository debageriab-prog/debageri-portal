import "server-only";

import { redirect } from "next/navigation";
import {
  can,
  hasOrganizationFinance,
  type PermissionKey,
} from "@/domain/access/permissions";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import type { Firestore } from "firebase-admin/firestore";
import { invoiceSettingsFrom } from "@/domain/finance/invoice-settings";
import type { InvoiceArticle } from "@/domain/finance/invoice-articles";

import type {
  EditableCustomer,
  InvoiceCustomer,
  InvoiceDefaults,
} from "./FinanceForms";

export async function financeFormContext(permission: PermissionKey) {
  const actor = await verifySession();
  if (!actor) redirect("/auth/login");
  if (!can(actor, permission)) redirect("/unauthorized");
  return { actor, db: getAdminServices().db };
}

export async function financeUsers() {
  const actor = await verifySession();
  if (!actor) redirect("/auth/login");
  if (!hasOrganizationFinance(actor)) redirect("/unauthorized");
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("users")
    .where("organizationId", "==", actor.organizationId)
    .get();
  return snapshot.docs
    .map((document) => ({
      id: document.id,
      displayName: String(document.data().displayName),
      role: document.data().role as string,
    }))
    .filter((user) => user.role === "consultant")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function invoiceSettingsFor(
  db: Firestore,
  organizationId: string,
) {
  const organization = (
    await db.collection("organizations").doc(organizationId).get()
  ).data();
  return invoiceSettingsFrom(
    organization?.invoicing,
    String(organization?.name ?? ""),
  );
}

/** A stored customer as the customer form edits it. */
export function editableCustomer(
  id: string,
  data: FirebaseFirestore.DocumentData,
): EditableCustomer {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    id,
    name: text(data.name),
    contactPerson: text(data.contactPerson),
    financeEmail: text(data.financeEmail),
    financeBccEmail: text(data.financeBccEmail),
    customerNumber: text(data.customerNumber),
    orgNumber: text(data.orgNumber),
    vatNumber: text(data.vatNumber),
    addressLine: text(data.addressLine),
    postalCode: text(data.postalCode),
    city: text(data.city),
    country: text(data.country),
    defaultYourReference: text(data.defaultYourReference),
    paymentTermsDays: Number.isInteger(data.paymentTermsDays)
      ? Number(data.paymentTermsDays)
      : null,
    invoiceLocale: data.invoiceLocale === "en-SE" ? "en-SE" : "sv-SE",
  };
}

/** Customers for the invoice form, with what it fills in from them. */
export async function invoiceCustomers(
  db: Firestore,
  organizationId: string,
): Promise<InvoiceCustomer[]> {
  const snapshot = await db
    .collection("financeCustomers")
    .where("organizationId", "==", organizationId)
    .get();
  return snapshot.docs
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        name: String(data.name),
        defaultYourReference: String(data.defaultYourReference ?? ""),
        paymentTermsDays: Number.isInteger(data.paymentTermsDays)
          ? Number(data.paymentTermsDays)
          : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function invoiceDefaults(
  db: Firestore,
  organizationId: string,
): Promise<InvoiceDefaults> {
  const settings = await invoiceSettingsFor(db, organizationId);
  return {
    nextInvoiceNumber: settings.nextInvoiceNumber,
    defaultOurReference: settings.defaultOurReference,
    paymentTermsDays: settings.paymentTermsDays,
  };
}

export function invoiceArticleFrom(
  id: string,
  data: FirebaseFirestore.DocumentData,
): InvoiceArticle {
  return {
    id,
    articleNumber: String(data.articleNumber ?? ""),
    description: String(data.description ?? ""),
    unit: String(data.unit ?? ""),
    unitPriceMinor: Number(data.unitPriceMinor ?? 0),
    consultantScope: String(data.consultantScope ?? "all"),
    vatRateBps: Number(data.vatRateBps ?? 0),
    validFrom: String(data.validFrom ?? ""),
    validTo: data.validTo ? String(data.validTo) : null,
  };
}

/** Every invoice article; the invoice form picks the ones that apply. */
export async function invoiceArticles(db: Firestore, organizationId: string) {
  const snapshot = await db
    .collection("invoiceArticles")
    .where("organizationId", "==", organizationId)
    .get();
  return snapshot.docs.map((document) =>
    invoiceArticleFrom(document.id, document.data()),
  );
}
