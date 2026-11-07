"use client";

import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  DEFAULT_VACATION_SETTINGS,
  daysToMinutes,
  type VacationSettings,
} from "@/domain/vacation/periods";
import { AdjustVacationDialog } from "./AdjustVacationDialog";
import {
  formatDays,
  useVacationSummary,
  VacationBalanceTiles,
} from "./VacationSummary";

export interface VacationFormValues {
  tracked: boolean;
  resetDay: string;
  resetMonth: string;
  daysPerYear: string;
  supplementPercent: string;
  openingNormalDays: string;
  advanceDays: string;
}

export function vacationFormDefaults(
  settings: VacationSettings | null,
  creating: boolean,
): VacationFormValues {
  const value = settings ?? DEFAULT_VACATION_SETTINGS;
  return {
    tracked: creating || Boolean(settings),
    resetDay: String(value.resetDay),
    resetMonth: String(value.resetMonth),
    daysPerYear: String(value.daysPerYear),
    supplementPercent: String(value.supplementBps / 100),
    openingNormalDays: "0",
    advanceDays: "0",
  };
}

function number(value: string) {
  return Number(value.replace(",", "."));
}

/** The `vacation` and `vacationOpening` fields of the employee payload. */
export function vacationPayload(
  values: VacationFormValues,
  role: string,
  creating: boolean,
) {
  if (role === "admin" || !values.tracked) return { vacation: null };
  const vacation: VacationSettings = {
    resetMonth: Number(values.resetMonth),
    resetDay: Number(values.resetDay),
    daysPerYear: Number(values.daysPerYear),
    supplementBps: Math.round(number(values.supplementPercent) * 100),
  };
  return creating
    ? {
        vacation,
        vacationOpening: {
          normalMinutes: daysToMinutes(number(values.openingNormalDays)),
          advanceMinutes: daysToMinutes(number(values.advanceDays)),
        },
      }
    : { vacation };
}

function monthNames(locale: string) {
  const format = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  });
  return Array.from({ length: 12 }, (_, index) =>
    format.format(new Date(Date.UTC(2026, index, 1))),
  );
}

export function VacationPanel({
  values,
  onChange,
  role,
  employeeId,
  savedSettings,
}: {
  values: VacationFormValues;
  onChange: (change: Partial<VacationFormValues>) => void;
  role: string;
  /** Set when editing; the balance card needs saved settings to show. */
  employeeId?: string;
  savedSettings: VacationSettings | null;
}) {
  const { t, locale } = useLocale();
  const creating = !employeeId;
  const showBalance = !creating && Boolean(savedSettings) && role !== "admin";
  const { summary, error, loading, reload } = useVacationSummary(
    showBalance ? employeeId : null,
  );
  const [adjusting, setAdjusting] = useState(false);
  const [message, setMessage] = useState("");

  if (role === "admin")
    return <p className="notice">{t("vacationNotForAdmins")}</p>;

  return (
    <>
      <div className="form-grid">
        <label className="checkbox-row form-wide">
          <input
            type="checkbox"
            checked={values.tracked}
            onChange={(event) => onChange({ tracked: event.target.checked })}
          />
          <span>
            <strong>{t("vacationTrack")}</strong>
          </span>
        </label>
        {values.tracked && (
          <>
            <fieldset className="vacation-reset-date">
              <legend>
                {t("vacationYearStarts")}{" "}
                <InfoTip text={t("vacationYearStartsTip")} />
              </legend>
              <input
                className="field"
                type="number"
                min={1}
                max={31}
                step={1}
                aria-label={t("vacationResetDay")}
                value={values.resetDay}
                onChange={(event) => onChange({ resetDay: event.target.value })}
                required
              />
              <select
                className="field"
                aria-label={t("vacationResetMonth")}
                value={values.resetMonth}
                onChange={(event) =>
                  onChange({ resetMonth: event.target.value })
                }
              >
                {monthNames(locale).map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </fieldset>
            <label>
              <span>
                {t("vacationDaysPerYear")}{" "}
                <InfoTip text={t("vacationDaysPerYearTip")} />
              </span>
              <input
                className="field"
                type="number"
                min={0}
                max={60}
                step={1}
                value={values.daysPerYear}
                onChange={(event) =>
                  onChange({ daysPerYear: event.target.value })
                }
                required
              />
            </label>
            <label>
              <span>
                {t("vacationSupplementPercent")}{" "}
                <InfoTip text={t("vacationSupplementTip")} />
              </span>
              <input
                className="field"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={values.supplementPercent}
                onChange={(event) =>
                  onChange({ supplementPercent: event.target.value })
                }
                required
              />
            </label>
            {creating && (
              <>
                <label>
                  <span>
                    {t("vacationOpeningNormal")}{" "}
                    <InfoTip text={t("vacationOpeningNormalTip")} />
                  </span>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    max={200}
                    step={0.5}
                    value={values.openingNormalDays}
                    onChange={(event) =>
                      onChange({ openingNormalDays: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  <span>
                    {t("vacationAdvanceDays")}{" "}
                    <InfoTip text={t("vacationAdvanceTip")} />
                  </span>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    max={200}
                    step={0.5}
                    value={values.advanceDays}
                    onChange={(event) =>
                      onChange({ advanceDays: event.target.value })
                    }
                    required
                  />
                </label>
              </>
            )}
          </>
        )}
      </div>

      {!creating && values.tracked && !savedSettings && (
        <p className="notice">{t("vacationSaveFirst")}</p>
      )}
      {showBalance && (
        <section className="vacation-period">
          <div className="week-head">
            <h2>
              {t("vacationCurrentPeriod")}
              {summary && (
                <span className="muted">
                  {" "}
                  · {summary.period.start} – {summary.period.end}
                </span>
              )}
            </h2>
            {summary && (
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setMessage("");
                  setAdjusting(true);
                }}
              >
                {t("vacationAdjustBalance")}
              </button>
            )}
          </div>
          {loading && !summary && <p className="muted">{t("loading")}</p>}
          {error && (
            <p className="notice notice-error" role="alert">
              {t("vacationLoadFailed")}
            </p>
          )}
          {message && <p className="notice notice-success">{message}</p>}
          {summary && (
            <>
              <VacationBalanceTiles summary={summary} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("date")}</th>
                      <th>{t("vacationChange")}</th>
                      <th>{t("vacationDays")}</th>
                      <th>{t("vacationBy")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.balance.used > 0 && (
                      <tr>
                        <td>
                          {summary.period.start} – {summary.period.end}
                        </td>
                        <td>{t("vacationUsedFromReports")}</td>
                        <td>−{formatDays(summary.balance.used, locale)}</td>
                        <td>{t("vacationBySystem")}</td>
                      </tr>
                    )}
                    {summary.adjustments.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString(
                                "sv-SE",
                              )
                            : "—"}
                        </td>
                        <td>
                          {t(`vacationReason_${item.reason}`)} ·{" "}
                          {t(`vacationBucket_${item.bucket}`)}
                          {item.note && (
                            <small className="muted"> — {item.note}</small>
                          )}
                        </td>
                        <td>
                          {item.deltaMinutes > 0 ? "+" : "−"}
                          {formatDays(Math.abs(item.deltaMinutes), locale)}
                        </td>
                        <td>{item.actorName ?? t("vacationBySystem")}</td>
                      </tr>
                    ))}
                    {summary.period.grantedMinutes > 0 && (
                      <tr>
                        <td>{summary.period.start}</td>
                        <td>{t("vacationReason_renewal")}</td>
                        <td>
                          +{formatDays(summary.period.grantedMinutes, locale)}
                        </td>
                        <td>{t("vacationBySystem")}</td>
                      </tr>
                    )}
                    {summary.nextRenewal && (
                      <tr className="muted">
                        <td>{summary.nextRenewal.date}</td>
                        <td>
                          {t("vacationNextRenewalRow").replace(
                            "{days}",
                            String(summary.settings.daysPerYear),
                          )}
                        </td>
                        <td>
                          {formatDays(
                            summary.nextRenewal.estimatedMinutes,
                            locale,
                          )}
                        </td>
                        <td>{t("vacationScheduled")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
      {adjusting && summary && employeeId && (
        <AdjustVacationDialog
          employeeId={employeeId}
          summary={summary}
          close={() => setAdjusting(false)}
          onSaved={() => {
            setAdjusting(false);
            setMessage(t("vacationBalanceSaved"));
            void reload();
          }}
        />
      )}
    </>
  );
}
