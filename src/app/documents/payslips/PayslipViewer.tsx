"use client";

import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { formatPayslipMonth, parsePayslipPeriod } from "@/domain/payslips";
import { MonthStepper } from "./MonthStepper";
import { PayslipPreview, type PayslipItem } from "./PayslipPreview";

export function PayslipViewer({
  payslips,
  currentPeriod,
}: {
  payslips: PayslipItem[];
  currentPeriod: string;
}) {
  const { t, locale } = useLocale();
  const latest = payslips[0];
  const [period, setPeriod] = useState(latest?.period ?? currentPeriod);
  const selected = payslips.find((item) => item.period === period);
  const parsed = parsePayslipPeriod(period);
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("documents")}</div>
          <h1>{t("payslips")}</h1>
          <p className="muted page-description">{t("myPayslipsDescription")}</p>
        </div>
      </div>
      {!latest ? (
        <section className="card">
          <div className="empty-state">
            <h2>{t("noPayslips")}</h2>
            <p>{t("noOwnPayslipsDescription")}</p>
          </div>
        </section>
      ) : (
        <section className="card payslip-viewer">
          <header className="payslip-viewer-header">
            <MonthStepper
              value={period}
              onChange={setPeriod}
              label={t("payslipPeriod")}
            />
            {selected?.id === latest.id && (
              <span className="status status-approved">
                {t("latestPayslip")}
              </span>
            )}
          </header>
          {selected ? (
            <PayslipPreview payslip={selected} />
          ) : (
            <div className="empty-state">
              <h2>
                {t("noPayslipForMonth").replace(
                  "{month}",
                  parsed
                    ? formatPayslipMonth(locale, parsed.year, parsed.month)
                    : period,
                )}
              </h2>
              <p>{t("noPayslipForMonthDescription")}</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
