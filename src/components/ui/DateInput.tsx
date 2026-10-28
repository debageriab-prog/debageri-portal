"use client";

import { type InputHTMLAttributes, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { isIsoDate, normalizeDateText } from "@/lib/dates/date-text";

type DateInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max"
> & {
  value?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  /** Called with a complete YYYY-MM-DD date or "" only, like a date input. */
  onChange?(event: { target: { value: string } }): void;
};

/**
 * Date field that always shows YYYY-MM-DD, whatever the browser language.
 * A native date input would format dates by browser locale, so this is a
 * text field with a calendar button that opens the browser's date picker.
 */
export function DateInput({
  value,
  defaultValue,
  min,
  max,
  onChange,
  className,
  disabled,
  ...rest
}: DateInputProps) {
  const { t } = useLocale();
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value ?? defaultValue ?? "");
  // The last complete value reported or received, to follow outside changes.
  const [committed, setCommitted] = useState(value ?? defaultValue ?? "");
  if (value !== undefined && value !== committed) {
    setCommitted(value);
    setText(value);
  }

  useEffect(() => {
    const message =
      text && !isIsoDate(text)
        ? t("dateFormatError")
        : text && min && text < min
          ? t("dateTooEarlyError").replace("{date}", min)
          : text && max && text > max
            ? t("dateTooLateError").replace("{date}", max)
            : "";
    textRef.current?.setCustomValidity(message);
  }, [text, min, max, t]);

  function change(next: string) {
    setText(next);
    if ((next === "" || isIsoDate(next)) && next !== committed) {
      setCommitted(next);
      onChange?.({ target: { value: next } });
    }
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker) return;
    picker.value = isIsoDate(text) ? text : "";
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  }

  return (
    <span className="date-input">
      <input
        {...rest}
        ref={textRef}
        className={className}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t("datePlaceholder")}
        maxLength={10}
        value={text}
        disabled={disabled}
        onChange={(event) => change(event.target.value)}
        onBlur={(event) => {
          const normalized = normalizeDateText(event.target.value);
          if (normalized !== event.target.value) change(normalized);
          rest.onBlur?.(event);
        }}
      />
      <button
        className="date-input-button"
        type="button"
        aria-label={t("openCalendar")}
        title={t("openCalendar")}
        disabled={disabled}
        onClick={openPicker}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        className="date-input-picker"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        onChange={(event) => change(event.target.value)}
      />
    </span>
  );
}
