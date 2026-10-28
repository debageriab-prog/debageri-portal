"use client";

import { useEffect, useState } from "react";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { useLocale } from "@/components/localization/LocaleProvider";
import type { MessageKey } from "@/lib/localization/messages";

/** Placeholders a template can use, each with a copy button and a meaning. */
export function PlaceholderTable({
  names,
  vat = false,
}: {
  names: string[];
  /** VAT payments use their own meaning of `amount` and `period`. */
  vat?: boolean;
}) {
  const { t } = useLocale();
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!names.length) return null;

  async function copy(name: string) {
    try {
      await navigator.clipboard.writeText(`{{${name}}}`);
      setCopied(name);
    } catch {
      setCopied("");
    }
  }

  return (
    <div className="table-wrap placeholder-table form-wide">
      <table>
        <thead>
          <tr>
            <th>{t("placeholder")}</th>
            <th>{t("description")}</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name) => {
            const key = (
              vat && (name === "amount" || name === "period")
                ? `placeholderHelp_vat_${name}`
                : `placeholderHelp_${name}`
            ) as MessageKey;
            const label = (
              copied === name ? t("placeholderCopied") : t("copyPlaceholder")
            ).replace("{name}", `{{${name}}}`);
            return (
              <tr key={name}>
                <td>
                  <span className="placeholder-name">
                    <code>{`{{${name}}}`}</code>
                    <button
                      type="button"
                      className="table-action icon-action"
                      aria-label={label}
                      title={label}
                      onClick={() => void copy(name)}
                    >
                      <ActionIcon type={copied === name ? "copied" : "copy"} />
                    </button>
                  </span>
                </td>
                <td>{t(key)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
