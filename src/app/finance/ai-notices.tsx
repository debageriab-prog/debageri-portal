"use client";

import { useLocale } from "@/components/localization/LocaleProvider";
import {
  SuccessCheckIcon,
  WarningTriangleIcon,
} from "@/components/ui/FileActionIcons";
import type { FinanceExtraction } from "@/domain/ai";

/** Banners and messages shared by the finance forms that read files with AI. */

const AI_ERROR_CODES = [
  "aiDisabled",
  "aiNotConfigured",
  "aiUnsupportedFile",
  "aiProviderRejected",
  "aiNoResult",
  "attachmentTooLarge",
];

type Translate = ReturnType<typeof useLocale>["t"];

/**
 * A success notice's first message is the success itself; any further
 * messages are follow-ups shown in a separate warning banner.
 */
export type AiNotice = {
  tone: "success" | "warning" | "error";
  messages: string[];
};

export function aiErrorNotice(
  result: { error?: string; detail?: string },
  t: Translate,
): AiNotice {
  const code = AI_ERROR_CODES.includes(result.error ?? "")
    ? result.error
    : "aiProviderFailed";
  return {
    tone: "error",
    messages: [
      t(`aiError_${code}` as Parameters<Translate>[0]),
      ...(result.detail
        ? [t("aiProviderSaid").replace("{detail}", result.detail)]
        : []),
    ],
  };
}

/** "Original: 112,00 EUR, rate …" for an AI currency conversion, or "". */
export function aiConversionText(
  extraction: FinanceExtraction,
  t: Translate,
  locale: string,
) {
  const conversion = extraction.conversion;
  if (!conversion) return "";
  return t("aiConvertedCurrency")
    .replace(
      "{amount}",
      (
        (conversion.grossMinor ?? conversion.netMinor ?? 0) / 100
      ).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    )
    .replace("{currency}", conversion.currency)
    .replace(
      "{rate}",
      conversion.rate.rate.toLocaleString(locale, { maximumFractionDigits: 4 }),
    )
    .replace("{source}", t(`exchangeRateSource_${conversion.rate.source}`))
    .replace("{date}", conversion.rate.date);
}

/** The red currency banner's lines, or null when the amounts were SEK. */
export function aiCurrencyWarningLines(
  extraction: FinanceExtraction,
  conversionText: string,
  t: Translate,
) {
  if (extraction.conversion)
    return [
      t("aiConversionCheck").replace(
        "{currency}",
        extraction.conversion.currency,
      ),
      conversionText,
    ];
  if (extraction.currency !== "SEK")
    return [t("aiForeignCurrency").replace("{currency}", extraction.currency)];
  return null;
}

export function AiNotices({
  notice,
  currencyWarning,
}: {
  notice: AiNotice | null;
  currencyWarning: string[] | null;
}) {
  const success = notice?.tone === "success";
  const main = success ? notice.messages.slice(0, 1) : (notice?.messages ?? []);
  const followUps = success ? notice.messages.slice(1) : [];
  return (
    <>
      {notice && (
        <div
          className={`form-wide notice notice-${notice.tone} notice-with-icon ai-notice`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {success ? <SuccessCheckIcon /> : <WarningTriangleIcon />}
          <div>
            {main.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        </div>
      )}
      {followUps.length > 0 && (
        <div
          className="form-wide notice notice-warning notice-with-icon ai-notice"
          role="status"
        >
          <WarningTriangleIcon />
          <div>
            {followUps.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        </div>
      )}
      {currencyWarning && (
        <div
          className="form-wide notice notice-error notice-with-icon ai-currency-warning"
          role="alert"
        >
          <WarningTriangleIcon />
          <div>
            {currencyWarning.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
