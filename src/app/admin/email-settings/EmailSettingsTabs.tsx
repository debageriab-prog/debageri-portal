"use client";

import { useState, type ReactNode } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";

export type EmailSettingsTab = "smtp" | "notifications" | "templates";
const EMAIL_SETTINGS_TABS: EmailSettingsTab[] = [
  "smtp",
  "notifications",
  "templates",
];

/** The email settings page's tabs, laid out like the employee editor. */
export function EmailSettingsTabs({
  initialTab,
  panels,
}: {
  initialTab: EmailSettingsTab;
  panels: Record<EmailSettingsTab, ReactNode>;
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState<EmailSettingsTab>(initialTab);
  return (
    <section className="card employee-editor">
      <div
        className="editor-tabs"
        role="tablist"
        aria-label={t("emailSettings")}
      >
        {EMAIL_SETTINGS_TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`email-settings-tab-${item}`}
            aria-controls={`email-settings-panel-${item}`}
            aria-selected={tab === item}
            className={`editor-tab${tab === item ? " active" : ""}`}
            onClick={() => {
              setTab(item);
              window.history.replaceState(null, "", `?tab=${item}`);
            }}
          >
            {t(`emailSettingsTab_${item}`)}
          </button>
        ))}
      </div>
      {EMAIL_SETTINGS_TABS.map((item) => (
        <div
          key={item}
          className="editor-panel"
          role="tabpanel"
          id={`email-settings-panel-${item}`}
          aria-labelledby={`email-settings-tab-${item}`}
          hidden={tab !== item}
        >
          {panels[item]}
        </div>
      ))}
    </section>
  );
}
