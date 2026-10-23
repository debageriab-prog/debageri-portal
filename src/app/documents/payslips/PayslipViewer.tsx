"use client";

import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { formatPayslipMonth } from "@/domain/payslips";
import { PayslipPreview, type PayslipItem } from "./PayslipPreview";

export function PayslipViewer({ payslips }: { payslips: PayslipItem[] }) {
  const { t, locale } = useLocale();
  const [index, setIndex] = useState(0);
  const current = payslips[index];
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("documents")}</div>
          <h1>{t("payslips")}</h1>
          <p className="muted page-description">{t("myPayslipsDescription")}</p>
        </div>
      </div>
      {!current ? (
        <section className="card">
          <div className="empty-state">
            <h2>{t("noPayslips")}</h2>
            <p>{t("noOwnPayslipsDescription")}</p>
          </div>
        </section>
      ) : (
        <section className="card payslip-viewer">
          <header className="payslip-viewer-header">
            <nav className="week-nav" aria-label={t("payslipMonthNavigation")}>
              <button
                type="button"
                className="icon-button"
                aria-label={t("olderPayslip")}
                title={t("olderPayslip")}
                disabled={index >= payslips.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                ‹
              </button>
              <select
                className="field"
                aria-label={t("payslipMonth")}
                value={current.id}
                onChange={(event) =>
                  setIndex(
                    payslips.findIndex(
                      (item) => item.id === event.target.value,
                    ),
                  )
                }
              >
                {payslips.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatPayslipMonth(locale, item.year, item.month)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-button"
                aria-label={t("newerPayslip")}
                title={t("newerPayslip")}
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                ›
              </button>
            </nav>
            {index === 0 && (
              <span className="status status-approved">
                {t("latestPayslip")}
              </span>
            )}
          </header>
          <PayslipPreview payslip={current} />
        </section>
      )}
    </>
  );
}
