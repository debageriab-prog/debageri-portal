import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { parseContractForm } from "@/server/validators/contracts";
import {
  assertConsultant,
  canManageContracts,
  ContractError,
  contractVisible,
  removeContractFiles,
  uploadContractFiles,
} from "@/server/services/contract-service";

async function load(id: string) {
  const actor = await verifySession();
  if (!actor)
    return {
      error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  const services = getAdminServices();
  const contract = await services.db.collection("contracts").doc(id).get();
  if (
    !contract.exists ||
    contract.data()?.organizationId !== actor.organizationId ||
    !contractVisible(actor, contract.data()!)
  )
    return { error: NextResponse.json({ error: "notFound" }, { status: 404 }) };
  return { actor, contract, ...services };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const value = await load(id);
  if ("error" in value) return value.error;
  if (!canManageContracts(value.actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await request.formData();
  const parsed = parseContractForm(form);
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const files = form
    .getAll("files")
    .filter((item): item is File => item instanceof File && item.size > 0);
  let removedIds: string[];
  try {
    removedIds = JSON.parse(String(form.get("removedFileIds") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }
  if (
    !Array.isArray(removedIds) ||
    removedIds.some((id) => typeof id !== "string")
  )
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const existing = await value.db
    .collection("contractFiles")
    .where("organizationId", "==", value.actor.organizationId)
    .where("contractId", "==", id)
    .get();
  if (
    existing.size - removedIds.length + files.length < 1 ||
    existing.size - removedIds.length + files.length > 10
  )
    return NextResponse.json({ error: "contractFileLimit" }, { status: 400 });
  try {
    const consultantName = await assertConsultant(
      value.db,
      value.actor,
      parsed.data.consultantId,
    );
    await uploadContractFiles(value.db, value.storage, value.actor, id, files);
    await value.contract.ref.update({
      ...parsed.data,
      consultantName,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: value.actor.id,
    });
    await removeContractFiles(
      value.db,
      value.storage,
      value.actor,
      id,
      removedIds,
    );
    await value.db.collection("auditLogs").add({
      organizationId: value.actor.organizationId,
      actorUserId: value.actor.id,
      action: "contract.updated",
      entityType: "contract",
      entityId: id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {},
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ContractError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Contract update failed", { contractId: id, error });
    return NextResponse.json({ error: "contractSaveFailed" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const value = await load(id);
  if ("error" in value) return value.error;
  if (!canManageContracts(value.actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (body?.confirmation !== "I am sure")
    return NextResponse.json(
      { error: "confirmationRequired" },
      { status: 400 },
    );
  const files = await value.db
    .collection("contractFiles")
    .where("organizationId", "==", value.actor.organizationId)
    .where("contractId", "==", id)
    .get();
  await removeContractFiles(
    value.db,
    value.storage,
    value.actor,
    id,
    files.docs.map((file) => file.id),
  );
  await value.contract.ref.delete();
  await value.db.collection("auditLogs").add({
    organizationId: value.actor.organizationId,
    actorUserId: value.actor.id,
    action: "contract.deleted",
    entityType: "contract",
    entityId: id,
    timestamp: FieldValue.serverTimestamp(),
    metadata: {},
  });
  return NextResponse.json({ ok: true });
}
