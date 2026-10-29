"use client";

import { useState, type ReactNode } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";

type Tab = "general" | "accounting";
const TABS: Tab[] = ["general", "accounting"];

/** The organization page's tabs, laid out like the employee editor. */
export function OrganizationTabs({
  initialTab,
  panels,
}: {
  initialTab: Tab;
  panels: Record<Tab, ReactNode>;
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <section className="card employee-editor">
      <div
        className="editor-tabs"
        role="tablist"
        aria-label={t("organization")}
      >
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`organization-tab-${item}`}
            aria-controls={`organization-panel-${item}`}
            aria-selected={tab === item}
            className={`editor-tab${tab === item ? " active" : ""}`}
            onClick={() => {
              setTab(item);
              window.history.replaceState(null, "", `?tab=${item}`);
            }}
          >
            {t(`organizationTab_${item}`)}
          </button>
        ))}
      </div>
      {TABS.map((item) => (
        <div
          key={item}
          className="editor-panel"
          role="tabpanel"
          id={`organization-panel-${item}`}
          aria-labelledby={`organization-tab-${item}`}
          hidden={tab !== item}
        >
          {panels[item]}
        </div>
      ))}
    </section>
  );
}
