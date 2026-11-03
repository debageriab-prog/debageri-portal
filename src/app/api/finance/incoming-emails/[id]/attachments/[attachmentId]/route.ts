import { readIncomingEmailAttachment } from "@/server/services/incoming-email-service";
import { incomingEmailContext, incomingEmailFailure } from "../../../context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const value = await incomingEmailContext("finance.incomingEmails.view");
  if ("error" in value) return value.error;
  const { id, attachmentId } = await params;
  try {
    const file = await readIncomingEmailAttachment(
      value.db,
      value.storage,
      value.actor,
      id,
      attachmentId,
    );
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return incomingEmailFailure(error);
  }
}
