import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { parseContractForm } from "@/server/validators/contracts";
import {
  assertConsultant,
  canManageContracts,
  ContractError,
  uploadContractFiles,
} from "@/server/services/contract-service";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || !canManageContracts(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await request.formData();
  const parsed = parseContractForm(form);
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const files = form
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length)
    return NextResponse.json(
      { error: "contractFilesRequired" },
      { status: 400 },
    );
  const { db, storage } = getAdminServices();
  const ref = db.collection("contracts").doc();
  try {
    const consultantName = await assertConsultant(
      db,
      actor,
      parsed.data.consultantId,
    );
    await ref.create({
      organizationId: actor.organizationId,
      ...parsed.data,
      consultantName,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    });
    try {
      await uploadContractFiles(db, storage, actor, ref.id, files);
    } catch (error) {
      await ref.delete();
      throw error;
    }
    await db.collection("auditLogs").add({
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "contract.created",
      entityType: "contract",
      entityId: ref.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {},
    });
    return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ContractError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Contract creation failed", { actorId: actor.id, error });
    return NextResponse.json({ error: "contractSaveFailed" }, { status: 500 });
  }
}
