"use client";

import Link from "next/link";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import { parseSek } from "@/domain/finance/calculations";
import type { PayrollProfile } from "@/domain/salary/payroll-profile";
import { normalizePersonalNumber } from "@/domain/salary/personal-number";
import {
  formatTaxRate,
  suggestTaxTable,
  TAX_COLUMNS,
  taxRateFor,
  type Municipality,
} from "@/domain/salary/tax";

/** Payroll form fields as entered; numbers are still text. */
export interface PayrollValues {
  personalNumber: string;
  addressLine: string;
  postalCode: string;
  city: string;
  municipalityCode: string;
  churchMember: boolean;
  parish: string;
  taxTable: string;
  taxColumn: string;
  adjustmentType: "none" | "percent" | "amount";
  adjustmentValue: string;
  bankClearing: string;
  bankAccount: string;
}

export function payrollFormDefaults(profile: PayrollProfile): PayrollValues {
  const adjustment = profile.taxAdjustment;
  return {
    personalNumber: profile.personalNumber,
    addressLine: profile.addressLine,
    postalCode: profile.postalCode,
    city: profile.city,
    municipalityCode: profile.municipalityCode,
    churchMember: profile.churchMember,
    parish: profile.parish,
    taxTable: profile.taxTable === null ? "" : String(profile.taxTable),
    taxColumn: String(profile.taxColumn),
    adjustmentType: adjustment.type,
    adjustmentValue:
      adjustment.type === "percent"
        ? String(adjustment.bps / 100)
        : adjustment.type === "amount"
          ? String(adjustment.minor / 100)
          : "",
    bankClearing: profile.bankClearing,
    bankAccount: profile.bankAccount,
  };
}

export function payrollPayload(
  values: PayrollValues,
  municipalities: Municipality[],
) {
  const municipality = municipalities.find(
    (item) => item.code === values.municipalityCode,
  );
  const value = values.adjustmentValue.trim();
  return {
    personalNumber:
      normalizePersonalNumber(values.personalNumber) ?? values.personalNumber,
    addressLine: values.addressLine,
    postalCode: values.postalCode,
    city: values.city,
    municipalityCode: values.municipalityCode,
    municipalityName: municipality?.name ?? "",
    churchMember: values.churchMember,
    parish: values.churchMember ? values.parish : "",
    taxTable: values.taxTable ? Number(values.taxTable) : null,
    taxColumn: Number(values.taxColumn),
    taxAdjustment:
      values.adjustmentType === "percent"
        ? {
            type: "percent" as const,
            bps: Math.round(Number(value.replace(",", ".")) * 100),
          }
        : values.adjustmentType === "amount"
          ? { type: "amount" as const, minor: parseSek(value || "0") }
          : { type: "none" as const },
    bankClearing: values.bankClearing,
    bankAccount: values.bankAccount,
  };
}

/** The table the kommun and church choice point to, when they are known. */
function suggestion(values: PayrollValues, municipalities: Municipality[]) {
  const municipality = municipalities.find(
    (item) => item.code === values.municipalityCode,
  );
  if (!municipality) return null;
  const rate = taxRateFor(municipality, values.churchMember, values.parish);
  return rate === null ? null : { rate, table: suggestTaxTable(rate) };
}

/**
 * Personnummer and home address. Kept for everyone, paid or not, and shown
 * on the employee's General information tab.
 */
export function PersonalDetailsFields({
  values,
  onChange,
}: {
  values: PayrollValues;
  onChange(values: Partial<PayrollValues>): void;
}) {
  const { t } = useLocale();
  const personalNumberInvalid =
    values.personalNumber.trim() !== "" &&
    normalizePersonalNumber(values.personalNumber) === null;
  return (
    <fieldset className="access-section personal-details">
      <legend>{t("payrollPersonHeading")}</legend>
      <div className="form-grid">
        <label>
          {t("personalNumber")}
          <input
            className="field"
            value={values.personalNumber}
            onChange={(event) =>
              onChange({ personalNumber: event.target.value })
            }
            onBlur={(event) => {
              const normalized = normalizePersonalNumber(event.target.value);
              if (normalized) onChange({ personalNumber: normalized });
            }}
            ref={(input) =>
              input?.setCustomValidity(
                personalNumberInvalid ? t("personalNumberInvalid") : "",
              )
            }
            placeholder="YYYYMMDD-XXXX"
            autoComplete="off"
            maxLength={13}
          />
        </label>
        <label className="form-wide">
          {t("streetAddress")}
          <input
            className="field"
            value={values.addressLine}
            onChange={(event) => onChange({ addressLine: event.target.value })}
            maxLength={120}
          />
        </label>
        <label>
          {t("postalCode")}
          <input
            className="field"
            value={values.postalCode}
            onChange={(event) => onChange({ postalCode: event.target.value })}
            maxLength={10}
          />
        </label>
        <label>
          {t("city")}
          <input
            className="field"
            value={values.city}
            onChange={(event) => onChange({ city: event.target.value })}
            maxLength={60}
          />
        </label>
      </div>
    </fieldset>
  );
}

export function PayrollPanel({
  values,
  onChange,
  municipalities,
  taxYear,
}: {
  values: PayrollValues;
  onChange(values: Partial<PayrollValues>): void;
  municipalities: Municipality[];
  taxYear: number | null;
}) {
  const { t } = useLocale();
  const municipality = municipalities.find(
    (item) => item.code === values.municipalityCode,
  );
  const suggested = suggestion(values, municipalities);

  /** Changes the kommun or church choice and moves the table along. */
  function changeTaxBasis(change: Partial<PayrollValues>) {
    const next = { ...values, ...change };
    const nextSuggestion = suggestion(next, municipalities);
    onChange({
      ...change,
      ...(nextSuggestion ? { taxTable: String(nextSuggestion.table) } : {}),
    });
  }

  return (
    <div className="payroll-sections">
      <fieldset className="access-section">
        <legend>{t("payrollTaxHeading")}</legend>
        <div className="form-grid">
          {!municipalities.length ? (
            <p className="notice form-wide">
              {t("payrollNoTaxRates")}{" "}
              <Link className="text-link" href="/finance/salaries/tax-tables">
                {t("importTaxTables")}
              </Link>
            </p>
          ) : (
            <>
              <label>
                <span>
                  {t("municipality")}{" "}
                  <InfoTip
                    text={t("municipalityTip").replace(
                      "{year}",
                      String(taxYear ?? ""),
                    )}
                  />
                </span>
                <select
                  className="field"
                  value={values.municipalityCode}
                  onChange={(event) =>
                    changeTaxBasis({
                      municipalityCode: event.target.value,
                      parish: "",
                    })
                  }
                >
                  <option value="">{t("chooseMunicipality")}</option>
                  {municipalities.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name} ({formatTaxRate(item.rate)} %)
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-row form-wide">
                <input
                  type="checkbox"
                  checked={values.churchMember}
                  onChange={(event) =>
                    changeTaxBasis({ churchMember: event.target.checked })
                  }
                />
                <span>{t("churchMember")}</span>
                <InfoTip text={t("churchMemberTip")} />
              </label>
              {values.churchMember &&
                municipality &&
                municipality.parishes.length > 1 && (
                  <label>
                    {t("parish")}
                    <select
                      className="field"
                      value={values.parish}
                      onChange={(event) =>
                        changeTaxBasis({ parish: event.target.value })
                      }
                    >
                      <option value="">{t("chooseParish")}</option>
                      {municipality.parishes.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name} ({formatTaxRate(item.rateWithChurch)} %)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
            </>
          )}
          <label>
            <span>
              {t("taxTable")}{" "}
              <InfoTip
                text={
                  suggested
                    ? t("taxTableSuggestedTip")
                        .replace("{table}", String(suggested.table))
                        .replace("{rate}", formatTaxRate(suggested.rate))
                    : t("taxTableTip")
                }
              />
            </span>
            <input
              className="field"
              type="number"
              min="1"
              max="99"
              step="1"
              value={values.taxTable}
              onChange={(event) => onChange({ taxTable: event.target.value })}
            />
          </label>
          <label>
            <span>
              {t("taxColumn")} <InfoTip text={t("taxColumnTip")} />
            </span>
            <select
              className="field"
              value={values.taxColumn}
              onChange={(event) => onChange({ taxColumn: event.target.value })}
            >
              {TAX_COLUMNS.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              {t("taxAdjustment")} <InfoTip text={t("taxAdjustmentTip")} />
            </span>
            <select
              className="field"
              value={values.adjustmentType}
              onChange={(event) =>
                onChange({
                  adjustmentType: event.target
                    .value as PayrollValues["adjustmentType"],
                  adjustmentValue: "",
                })
              }
            >
              <option value="none">{t("taxAdjustment_none")}</option>
              <option value="percent">{t("taxAdjustment_percent")}</option>
              <option value="amount">{t("taxAdjustment_amount")}</option>
            </select>
          </label>
          {values.adjustmentType !== "none" && (
            <label>
              {values.adjustmentType === "percent"
                ? t("taxAdjustmentPercent")
                : t("taxAdjustmentAmount")}
              <input
                className="field"
                type="number"
                min={values.adjustmentType === "percent" ? "0.01" : "0"}
                max={values.adjustmentType === "percent" ? "100" : undefined}
                step="0.01"
                value={values.adjustmentValue}
                onChange={(event) =>
                  onChange({ adjustmentValue: event.target.value })
                }
                required
              />
            </label>
          )}
        </div>
        {municipalities.length > 0 && (
          <p>
            <Link className="text-link" href="/finance/salaries/tax-tables">
              {t("manageTaxTables")}
            </Link>
          </p>
        )}
      </fieldset>

      <fieldset className="access-section">
        <legend>{t("payrollBankHeading")}</legend>
        <div className="form-grid">
          <label>
            {t("bankClearing")}
            <input
              className="field"
              value={values.bankClearing}
              onChange={(event) =>
                onChange({ bankClearing: event.target.value })
              }
              inputMode="numeric"
              pattern="\d{4,5}"
              maxLength={5}
            />
          </label>
          <label>
            {t("bankAccount")}
            <input
              className="field"
              value={values.bankAccount}
              onChange={(event) =>
                onChange({ bankAccount: event.target.value })
              }
              inputMode="numeric"
              pattern="[\d -]{0,20}"
              maxLength={20}
            />
          </label>
        </div>
      </fieldset>
    </div>
  );
}
