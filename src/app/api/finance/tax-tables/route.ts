import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  importTaxTables,
  TaxTableError,
} from "@/server/services/tax-table-service";
import { taxTableImportSchema } from "@/server/validators/payroll";

/** Imports a year's monthly tax tables and tax rates from Skatteverket. */
export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = taxTableImportSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    const { db } = getAdminServices();
    const result = await importTaxTables(db, actor, parsed.data.year);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof TaxTableError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Tax table import failed", error);
    return NextResponse.json(
      { error: "taxTablesUnavailable" },
      { status: 500 },
    );
  }
}
