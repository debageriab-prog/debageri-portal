"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import type { InvoiceSettings } from "@/domain/finance/invoice-settings";
import { vatNumberFor } from "@/domain/finance/swedish-identifiers";

type TextField = Exclude<
  keyof InvoiceSettings,
  | "fSkatt"
  | "ocrEnabled"
  | "paymentTermsDays"
  | "nextInvoiceNumber"
  | "nextCustomerNumber"
>;

const SECTIONS: Array<{
  title: string;
  fields: Array<{ key: TextField; type?: string; required?: boolean }>;
}> = [
  {
    title: "invoiceSettingsCompany",
    fields: [
      { key: "legalName", required: true },
      { key: "orgNumber", required: true },
      { key: "vatNumber", required: true },
      { key: "addressLine", required: true },
      { key: "postalCode", required: true },
      { key: "city", required: true },
      { key: "country" },
      { key: "phone", type: "tel" },
      { key: "email", type: "email" },
      { key: "website" },
    ],
  },
  {
    title: "invoiceSettingsPayment",
    fields: [
      { key: "bankgiro", required: true },
      { key: "bankName" },
      { key: "iban" },
      { key: "bic" },
      { key: "lateInterestText" },
      { key: "defaultOurReference" },
    ],
  },
];

export function InvoiceSettingsForm({
  settings,
}: {
  settings: InvoiceSettings;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [values, setValues] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const set = <K extends keyof InvoiceSettings>(
    key: K,
    value: InvoiceSettings[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setFieldErrors({});
    try {
      const response = await appCheckFetch("/api/admin/organization", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Array<{ field: string; code: string }>;
      };
      if (!response.ok) {
        const fields = Object.fromEntries(
          (result.fields ?? []).map((item) => [
            item.field,
            t(
              (item.code.endsWith("Invalid")
                ? `invoiceSettingsError_${item.code}`
                : "invoiceSettingsError_field") as Parameters<typeof t>[0],
            ),
          ]),
        );
        setFieldErrors(fields);
        setError(t("invoiceSettingsSaveFailed"));
        return;
      }
      setMessage(t("invoiceSettingsSaved"));
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card invoice-settings-form" onSubmit={save} noValidate>
      {SECTIONS.map((section) => (
        <fieldset className="access-section" key={section.title}>
          <legend>{t(section.title as Parameters<typeof t>[0])}</legend>
          <div className="form-grid">
            {section.fields.map((field) => (
              <label key={field.key}>
                {t(`invoiceSetting_${field.key}` as Parameters<typeof t>[0])}
                {field.required && <span aria-hidden="true"> *</span>}
                <input
                  className="field"
                  type={field.type ?? "text"}
                  value={values[field.key]}
                  required={field.required}
                  aria-invalid={Boolean(fieldErrors[field.key]) || undefined}
                  onChange={(event) => set(field.key, event.target.value)}
                  onBlur={() => {
                    if (
                      field.key === "orgNumber" &&
                      !values.vatNumber.trim() &&
                      vatNumberFor(values.orgNumber)
                    )
                      set("vatNumber", vatNumberFor(values.orgNumber));
                  }}
                />
                {fieldErrors[field.key] && (
                  <span className="field-error" role="alert">
                    {fieldErrors[field.key]}
                  </span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="access-section">
        <legend>{t("invoiceSettingsNumbering")}</legend>
        <div className="form-grid">
          {(
            [
              "paymentTermsDays",
              "nextInvoiceNumber",
              "nextCustomerNumber",
            ] as const
          ).map((key) => (
            <label key={key}>
              {t(`invoiceSetting_${key}`)}
              <InfoTip text={t(`invoiceSettingTip_${key}`)} />
              <input
                className="field"
                type="number"
                min={key === "paymentTermsDays" ? 0 : 1}
                step={1}
                value={values[key]}
                onChange={(event) =>
                  set(key, Math.max(0, Math.round(Number(event.target.value))))
                }
              />
              {fieldErrors[key] && (
                <span className="field-error" role="alert">
                  {fieldErrors[key]}
                </span>
              )}
            </label>
          ))}
          <label className="checkbox-row form-wide">
            <input
              type="checkbox"
              checked={values.fSkatt}
              onChange={(event) => set("fSkatt", event.target.checked)}
            />
            <span>{t("invoiceSetting_fSkatt")}</span>
            <InfoTip text={t("invoiceSettingTip_fSkatt")} />
          </label>
          <label className="checkbox-row form-wide">
            <input
              type="checkbox"
              checked={values.ocrEnabled}
              onChange={(event) => set("ocrEnabled", event.target.checked)}
            />
            <span>{t("invoiceSetting_ocrEnabled")}</span>
            <InfoTip text={t("invoiceSettingTip_ocrEnabled")} />
          </label>
        </div>
      </fieldset>
      {error && <p className="notice notice-error">{error}</p>}
      {message && <p className="notice notice-success">{message}</p>}
      <div className="actions">
        <Link className="button secondary" href="/admin/settings?tab=invoicing">
          {t("cancel")}
        </Link>
        <button className="button" disabled={busy}>
          {busy ? t("saving") : t("saveSettings")}
        </button>
      </div>
    </form>
  );
}
