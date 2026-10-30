"use client";

import { useState, type ReactNode } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";

export type RemindersTab = "overview" | "auto";
const REMINDERS_TABS: RemindersTab[] = ["overview", "auto"];

/** The reminders page's tabs, laid out like the employee editor. */
export function RemindersTabs({
  initialTab,
  panels,
}: {
  initialTab: RemindersTab;
  panels: Record<RemindersTab, ReactNode>;
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState<RemindersTab>(initialTab);
  return (
    <section className="card employee-editor">
      <div className="editor-tabs" role="tablist" aria-label={t("reminders")}>
        {REMINDERS_TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`reminders-tab-${item}`}
            aria-controls={`reminders-panel-${item}`}
            aria-selected={tab === item}
            className={`editor-tab${tab === item ? " active" : ""}`}
            onClick={() => {
              setTab(item);
              window.history.replaceState(null, "", `?tab=${item}`);
            }}
          >
            {t(`remindersTab_${item}`)}
          </button>
        ))}
      </div>
      {REMINDERS_TABS.map((item) => (
        <div
          key={item}
          className="editor-panel"
          role="tabpanel"
          id={`reminders-panel-${item}`}
          aria-labelledby={`reminders-tab-${item}`}
          hidden={tab !== item}
        >
          {panels[item]}
        </div>
      ))}
    </section>
  );
}
