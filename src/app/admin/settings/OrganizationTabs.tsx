"use client";

import { useState, type ReactNode } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ORGANIZATION_TABS, type OrganizationTab } from "./tabs";

/** The organization page's tabs, laid out like the email settings tabs. */
export function OrganizationTabs({
  initialTab,
  panels,
}: {
  initialTab: OrganizationTab;
  panels: Record<OrganizationTab, ReactNode>;
}) {
  const { t } = useLocale();
  const [tab, setTab] = useState<OrganizationTab>(initialTab);
  return (
    <section className="card employee-editor">
      <div
        className="editor-tabs"
        role="tablist"
        aria-label={t("organization")}
      >
        {ORGANIZATION_TABS.map((item) => (
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
      {ORGANIZATION_TABS.map((item) => (
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
