"use client";

import { DateInput } from "@/components/ui/DateInput";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import type { DocumentAccess, FinanceAccess } from "@/domain/types";
import {
  NOTIFICATION_TOPICS,
  type EmailPreferences,
} from "@/domain/notifications";
import type { ManagedUser } from "./UserManagement";

type Tab = "general" | "employment" | "access" | "notifications";
const TABS: Tab[] = ["general", "employment", "access", "notifications"];

const noFinance: FinanceAccess = {
  enabled: false,
  myFinance: false,
  myInvoices: false,
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Access flags a role can hold; the server enforces the same rules. */
function documentAccessForRole(
  role: string,
  access: DocumentAccess,
): DocumentAccess {
  const reportsToCompany = ["consultant", "manager"].includes(role);
  return {
    contracts: role === "consultant" && access.contracts,
    payslips: reportsToCompany && access.payslips,
    receipts: reportsToCompany && access.receipts,
  };
}

export function EmployeeEditor({
  employee,
  isSelf = false,
}: {
  employee?: ManagedUser;
  isSelf?: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const creating = !employee;
  const [tab, setTab] = useState<Tab>("general");
  const [values, setValues] = useState({
    displayName: employee?.displayName ?? "",
    email: employee?.email ?? "",
    employeeNumber: employee?.employeeNumber ?? "",
    password: "",
    status: employee?.status ?? "active",
    employmentStartDate: employee?.employmentStartDate || today(),
    employmentEndDate: employee?.employmentEndDate ?? "",
    reportingStartDate: employee?.reportingStartDate || today(),
  });
  const [role, setRole] = useState(
    employee?.role === "employee"
      ? "consultant"
      : (employee?.role ?? "consultant"),
  );
  const [managerReportsTime, setManagerReportsTime] = useState(
    employee?.role === "manager" ? employee.reportsTime : false,
  );
  const [financeAccess, setFinanceAccess] = useState<FinanceAccess>(
    employee?.financeAccess ?? noFinance,
  );
  const [documentAccess, setDocumentAccess] = useState<DocumentAccess>(
    employee?.documentAccess ?? {
      contracts: false,
      payslips: false,
      receipts: false,
    },
  );
  const [emailPreferences, setEmailPreferences] = useState<EmailPreferences>(
    employee?.emailPreferences ?? {
      receipts: true,
      payslips: true,
      timesheets: true,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reportsTime =
    role === "consultant" || (role === "manager" && managerReportsTime);
  const isConsultant = role === "consultant";
  const hasDocumentAccess = ["consultant", "manager"].includes(role);

  function set(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function changeRole(nextRole: string) {
    setRole(nextRole);
    if (nextRole !== "manager") setManagerReportsTime(false);
    if (nextRole !== "consultant") setFinanceAccess(noFinance);
    setDocumentAccess((current) => documentAccessForRole(nextRole, current));
  }

  /** Shows the tab holding the first invalid field, then explains it. */
  function revealInvalidField() {
    const invalid = formRef.current?.querySelector<HTMLInputElement>(
      "input:invalid, select:invalid",
    );
    if (!invalid) return false;
    const panel = invalid.closest<HTMLElement>("[data-tab]");
    if (panel) setTab(panel.dataset.tab as Tab);
    window.setTimeout(() => invalid.reportValidity(), 0);
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (revealInvalidField()) return;
    setBusy(true);
    setError("");
    const payload = {
      displayName: values.displayName,
      email: values.email,
      employeeNumber: values.employeeNumber,
      role,
      reportsTime,
      employmentStartDate: values.employmentStartDate || null,
      reportingStartDate: reportsTime ? values.reportingStartDate : null,
      financeAccess: isConsultant ? financeAccess : noFinance,
      documentAccess: documentAccessForRole(role, documentAccess),
      emailPreferences,
      ...(creating
        ? { password: values.password }
        : {
            status: values.status,
            employmentEndDate: values.employmentEndDate || null,
          }),
    };
    try {
      const response = await appCheckFetch(
        creating
          ? "/api/admin/users"
          : `/api/admin/users/${encodeURIComponent(employee.id)}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? t("employeeSaveFailed"));
        return;
      }
      router.push(`/admin/users?saved=${creating ? "created" : "updated"}`);
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      className="card employee-editor"
      onSubmit={submit}
      noValidate
    >
      <div className="editor-tabs" role="tablist" aria-label={t("employee")}>
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`employee-tab-${item}`}
            aria-controls={`employee-panel-${item}`}
            aria-selected={tab === item}
            className={`editor-tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {t(`employeeTab_${item}`)}
          </button>
        ))}
      </div>

      <section
        className="editor-panel"
        data-tab="general"
        role="tabpanel"
        id="employee-panel-general"
        aria-labelledby="employee-tab-general"
        hidden={tab !== "general"}
      >
        <p className="muted editor-panel-intro">
          {t("employeeTabIntro_general")}
        </p>
        <div className="form-grid">
          <label>
            {t("fullName")}
            <input
              className="field"
              value={values.displayName}
              onChange={(event) => set("displayName", event.target.value)}
              placeholder="e.g. Anna Andersson"
              minLength={2}
              maxLength={100}
              autoFocus
              required
            />
          </label>
          <label>
            {t("workEmail")}
            <input
              className="field"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              placeholder="anna@debageri.se"
              required
            />
          </label>
          <label>
            {t("employeeNumber")}
            <input
              className="field"
              value={values.employeeNumber}
              onChange={(event) => set("employeeNumber", event.target.value)}
              placeholder="DB-006"
              maxLength={30}
              disabled={isSelf}
              required
            />
          </label>
          <label>
            {t("role")}
            <select
              className="field"
              value={role}
              onChange={(event) => changeRole(event.target.value)}
              disabled={isSelf}
            >
              <option value="consultant">{t("consultant")}</option>
              <option value="manager">{t("manager")}</option>
              <option value="accountant">{t("accountant")}</option>
              <option value="admin">{t("administrator")}</option>
            </select>
          </label>
          {role === "manager" && (
            <label className="checkbox-row form-wide">
              <input
                type="checkbox"
                checked={managerReportsTime}
                onChange={(event) =>
                  setManagerReportsTime(event.target.checked)
                }
                disabled={isSelf}
              />
              <span>
                <strong>{t("reportsTime")}</strong>
                <small>{t("managerReportsTimeHelp")}</small>
              </span>
            </label>
          )}
          {creating ? (
            <label className="form-wide">
              {t("temporaryPassword")}
              <input
                className="field"
                type="password"
                value={values.password}
                onChange={(event) => set("password", event.target.value)}
                minLength={8}
                maxLength={128}
                placeholder={t("atLeast8Characters")}
                autoComplete="new-password"
                required
              />
              <small>{t("temporaryPasswordHelp")}</small>
            </label>
          ) : (
            <label className="form-wide">
              {t("accountStatus")}
              <select
                className="field"
                value={values.status}
                onChange={(event) => set("status", event.target.value)}
                disabled={isSelf}
              >
                <option value="active">{t("active")}</option>
                <option value="inactive">{t("inactive")}</option>
              </select>
              <small>{t("inactiveAccountHelp")}</small>
            </label>
          )}
        </div>
      </section>

      <section
        className="editor-panel"
        data-tab="employment"
        role="tabpanel"
        id="employee-panel-employment"
        aria-labelledby="employee-tab-employment"
        hidden={tab !== "employment"}
      >
        <p className="muted editor-panel-intro">
          {t("employeeTabIntro_employment")}
        </p>
        <div className="form-grid">
          <label>
            {t("employmentStartDate")}
            <DateInput
              className="field"
              value={values.employmentStartDate}
              onChange={(event) =>
                set("employmentStartDate", event.target.value)
              }
              disabled={isSelf}
              required
            />
          </label>
          {!creating && (
            <label>
              {t("employmentEndDate")}
              <DateInput
                className="field"
                value={values.employmentEndDate}
                onChange={(event) =>
                  set("employmentEndDate", event.target.value)
                }
                min={values.employmentStartDate || undefined}
                disabled={isSelf}
              />
            </label>
          )}
          {reportsTime ? (
            <label>
              {t("reportingStartDate")}
              <DateInput
                className="field"
                value={values.reportingStartDate}
                onChange={(event) =>
                  set("reportingStartDate", event.target.value)
                }
                disabled={isSelf}
                required
              />
              <small>{t("reportingStartHelp")}</small>
            </label>
          ) : (
            <p className="muted form-wide">{t("employeeNoTimeReporting")}</p>
          )}
        </div>
      </section>

      <section
        className="editor-panel"
        data-tab="access"
        role="tabpanel"
        id="employee-panel-access"
        aria-labelledby="employee-tab-access"
        hidden={tab !== "access"}
      >
        <p className="muted editor-panel-intro">
          {t("employeeTabIntro_access")}
        </p>
        {!isConsultant && !hasDocumentAccess ? (
          <p className="notice">{t("employeeAccessByRole")}</p>
        ) : (
          <div className="editor-access-groups">
            {isConsultant && (
              <fieldset className="access-section">
                <legend>{t("finance")}</legend>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={financeAccess.enabled}
                    onChange={(event) =>
                      setFinanceAccess({
                        enabled: event.target.checked,
                        myFinance: event.target.checked,
                        myInvoices: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>{t("finance")}</strong>
                  </span>
                </label>
                <div className="access-children">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={financeAccess.myFinance}
                      disabled={!financeAccess.enabled}
                      onChange={(event) =>
                        setFinanceAccess((current) => ({
                          ...current,
                          enabled: event.target.checked || current.myInvoices,
                          myFinance: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <strong>{t("myFinanceAccess")}</strong>
                    </span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={financeAccess.myInvoices}
                      disabled={!financeAccess.enabled}
                      onChange={(event) =>
                        setFinanceAccess((current) => ({
                          ...current,
                          enabled: current.myFinance || event.target.checked,
                          myInvoices: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <strong>{t("myInvoices")}</strong>
                    </span>
                  </label>
                </div>
              </fieldset>
            )}
            {hasDocumentAccess && (
              <fieldset className="access-section">
                <legend>{t("documents")}</legend>
                {(
                  [
                    ...(isConsultant ? (["contracts"] as const) : []),
                    "payslips",
                    "receipts",
                  ] as const
                ).map((key) => (
                  <label className="checkbox-row" key={key}>
                    <input
                      type="checkbox"
                      checked={documentAccess[key]}
                      onChange={(event) =>
                        setDocumentAccess((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <strong>{t(`${key}Access`)}</strong>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        )}
      </section>

      <section
        className="editor-panel"
        data-tab="notifications"
        role="tabpanel"
        id="employee-panel-notifications"
        aria-labelledby="employee-tab-notifications"
        hidden={tab !== "notifications"}
      >
        <p className="muted editor-panel-intro">
          {t("employeeTabIntro_notifications")}
        </p>
        <fieldset className="access-section">
          <legend>{t("emailNotificationSettings")}</legend>
          {NOTIFICATION_TOPICS.map((topic) => (
            <label className="checkbox-row" key={topic}>
              <input
                type="checkbox"
                checked={emailPreferences[topic]}
                onChange={(event) =>
                  setEmailPreferences((current) => ({
                    ...current,
                    [topic]: event.target.checked,
                  }))
                }
              />
              <span>
                <strong>{t(`notificationTopic_${topic}`)}</strong>
                <small>{t(`notificationTopicHelp_${topic}`)}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      {isSelf && <p className="notice">{t("ownAccountEditHelp")}</p>}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <footer className="modal-actions editor-actions">
        <Link className="button secondary" href="/admin/users">
          {t("cancel")}
        </Link>
        <button className="button" disabled={busy}>
          {busy
            ? creating
              ? t("creating")
              : t("saving")
            : creating
              ? t("createEmployee")
              : t("saveChanges")}
        </button>
      </footer>
    </form>
  );
}
