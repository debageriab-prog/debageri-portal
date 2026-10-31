"use client";

import { DateInput } from "@/components/ui/DateInput";
import { useLocale } from "@/components/localization/LocaleProvider";
import type { CompensationValues } from "@/domain/finance/compensation";
import { appCheckFetch } from "@/lib/firebase/client";

/** Runs a compensation action; returns the error code, or null on success. */
export async function postCompensationAction(payload: Record<string, unknown>) {
  const response = await appCheckFetch("/api/finance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (response.ok) return null;
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return result.error ?? "financeOperationFailed";
}

export function CompensationFields({
  values,
  onChange,
}: {
  values: CompensationValues;
  onChange(values: Partial<CompensationValues>): void;
}) {
  const { t } = useLocale();
  return (
    <>
      <label>
        {t("compensationModel")}
        <select
          className="field"
          value={values.model}
          onChange={(event) =>
            onChange({
              model: event.target.value as CompensationValues["model"],
            })
          }
        >
          <option value="flexible">{t("flexible")}</option>
          <option value="fixed">{t("fixedSalary")}</option>
        </select>
      </label>
      {values.model === "flexible" ? (
        <label>
          {t("invoiceSharePercent")}
          <input
            className="field"
            type="number"
            value={values.sharePercent}
            onChange={(event) => onChange({ sharePercent: event.target.value })}
            min="0"
            max="100"
            step="0.01"
            required
          />
        </label>
      ) : (
        <label>
          {t("monthlySalary")}
          <input
            className="field"
            type="number"
            value={values.fixedSalary}
            onChange={(event) => onChange({ fixedSalary: event.target.value })}
            min="0.01"
            step="0.01"
            required
          />
        </label>
      )}
      <label>
        {t("validFrom")}
        <DateInput
          className="field"
          value={values.validFrom}
          onChange={(event) => onChange({ validFrom: event.target.value })}
          required
        />
      </label>
      <label>
        {t("validTo")}
        <DateInput
          className="field"
          value={values.validTo}
          onChange={(event) => onChange({ validTo: event.target.value })}
          min={values.validFrom || undefined}
        />
      </label>
    </>
  );
}
