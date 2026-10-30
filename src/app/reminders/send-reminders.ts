import { appCheckFetch } from "@/lib/firebase/client";

export type ReminderSendResult = {
  sent: number;
  skipped: number;
  failed: number;
  error: string;
};

export async function sendReminders(
  userIds: string[],
): Promise<ReminderSendResult> {
  const response = await appCheckFetch("/api/reminders/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userIds }),
  }).catch(() => null);
  const result = (await response?.json().catch(() => null)) as
    Partial<ReminderSendResult> | null | undefined;
  if (!response?.ok)
    return {
      sent: 0,
      skipped: 0,
      failed: userIds.length,
      error: result?.error ?? "",
    };
  return {
    sent: result?.sent ?? 0,
    skipped: result?.skipped ?? 0,
    failed: result?.failed ?? 0,
    error: result?.error ?? "",
  };
}
