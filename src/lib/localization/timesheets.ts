import type { MessageKey } from "@/lib/localization/messages";

type Translate = (key: MessageKey) => string;

/** Translates a stable error code from the time report routes. */
export function timesheetErrorMessage(
  t: Translate,
  code: unknown,
  fallback: MessageKey = "timesheetError_operationFailed",
) {
  const message =
    typeof code === "string"
      ? t(`timesheetError_${code}` as MessageKey)
      : undefined;
  return message ?? t(fallback);
}

export function timesheetStatusLabel(t: Translate, status: string) {
  return t(`status_${status}` as MessageKey) ?? status;
}

export function dateRangeLabel(t: Translate, start: string, end: string) {
  return t("reportDateRange").replace("{start}", start).replace("{end}", end);
}
