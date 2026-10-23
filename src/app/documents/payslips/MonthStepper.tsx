"use client";

import { useLocale } from "@/components/localization/LocaleProvider";
import { shiftPayslipPeriod } from "@/domain/payslips";

export function MonthStepper({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (period: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="month-stepper">
      <button
        className="button secondary month-step-button"
        type="button"
        aria-label={t("previousMonth")}
        title={t("previousMonth")}
        disabled={disabled || !value}
        onClick={() => onChange(shiftPayslipPeriod(value, -1))}
      >
        {"‹"}
      </button>
      <input
        className="field finance-period"
        type="month"
        aria-label={label}
        value={value}
        disabled={disabled}
        required
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="button secondary month-step-button"
        type="button"
        aria-label={t("nextMonth")}
        title={t("nextMonth")}
        disabled={disabled || !value}
        onClick={() => onChange(shiftPayslipPeriod(value, 1))}
      >
        {"›"}
      </button>
    </div>
  );
}
