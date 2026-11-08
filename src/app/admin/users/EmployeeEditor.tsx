"use client";

import { DateInput } from "@/components/ui/DateInput";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import { defaultLocale, type Locale } from "@/lib/localization/locale";
import { audienceForRole } from "@/domain/access/permissions";
import {
  NOTIFICATION_TOPICS,
  type EmailPreferences,
} from "@/domain/notifications";
import {
  canBePaidSalary,
  compensationInput,
  compensationModelsFor,
  defaultCompensationValues,
  receivesSalary,
  type CompensationRecord,
} from "@/domain/finance/compensation";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  CompensationFields,
  postCompensationAction,
} from "./CompensationFields";
import {
  AddCompensationDialog,
  CompensationTable,
  EndCompensationDialog,
} from "./CompensationHistory";
import type { ManagedUser } from "./UserManagement";
import {
  PayrollPanel,
  PersonalDetailsFields,
  payrollFormDefaults,
  payrollPayload,
} from "./PayrollPanel";
import {
  emptyPayrollProfile,
  type PayrollProfile,
} from "@/domain/salary/payroll-profile";
import type { Municipality } from "@/domain/salary/tax";
import {
  VacationPanel,
  vacationFormDefaults,
  vacationPayload,
} from "./VacationPanel";
import type { AccessProfile } from "@/server/services/access-profile-service";
import { PermissionSummary } from "../access-profiles/PermissionTree";
import { accessProfileError } from "../access-profiles/AccessProfileForm";

const staffRoles = ["manager", "accountant"];

type Tab =
  | "general"
  | "employment"
  | "compensation"
  | "payroll"
  | "vacation"
  | "access"
  | "notifications";
const TABS: Tab[] = [
  "general",
  "employment",
  "compensation",
  "payroll",
  "vacation",
  "access",
  "notifications",
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function EmployeeEditor({
  employee,
  isSelf = false,
  financeEnabled,
  accessProfiles,
  agreements = [],
  initialTab = "general",
  compensationFailed = false,
  payroll,
  municipalities = [],
  taxYear = null,
}: {
  employee?: ManagedUser;
  accessProfiles: AccessProfile[];
  isSelf?: boolean;
  financeEnabled: boolean;
  agreements?: CompensationRecord[];
  initialTab?: Tab;
  compensationFailed?: boolean;
  payroll?: PayrollProfile;
  municipalities?: Municipality[];
  taxYear?: number | null;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const creating = !employee;
  const [tab, setTab] = useState<Tab>(initialTab);
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
    employee && staffRoles.includes(employee.role)
      ? employee.reportsTime
      : false,
  );
  const defaultProfileFor = (nextRole: string) =>
    accessProfiles.find((profile) => profile.defaultForRole === nextRole)?.id ??
    "";
  const [accessProfileId, setAccessProfileId] = useState(
    employee?.accessProfileId ??
      (employee ? "" : defaultProfileFor("consultant")),
  );
  const [emailPreferences, setEmailPreferences] = useState<EmailPreferences>(
    employee?.emailPreferences ?? {
      receipts: true,
      payslips: true,
      timesheets: true,
    },
  );
  const [language, setLanguage] = useState<Locale>(
    employee?.locale ?? defaultLocale,
  );
  const [vacation, setVacation] = useState(() =>
    vacationFormDefaults(employee?.vacation ?? null, !employee),
  );
  const [payrollValues, setPayrollValues] = useState(() =>
    payrollFormDefaults(payroll ?? emptyPayrollProfile()),
  );
  const [paysSalary, setPaysSalary] = useState(employee?.paysSalary ?? false);
  const [addCompensation, setAddCompensation] = useState(false);
  const [compensation, setCompensation] = useState(() =>
    defaultCompensationValues(today()),
  );
  const [addingAgreement, setAddingAgreement] = useState(false);
  const [endingAgreement, setEndingAgreement] =
    useState<CompensationRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    compensationFailed ? t("employeeCompensationSaveFailed") : "",
  );
  const [message, setMessage] = useState("");
  const reportsTime =
    role === "consultant" || (staffRoles.includes(role) && managerReportsTime);
  const audience = audienceForRole(role);
  const availableProfiles = accessProfiles.filter(
    (profile) => profile.audience === audience,
  );
  const selectedProfile = availableProfiles.find(
    (profile) => profile.id === accessProfileId,
  );
  const salaryChoice = canBePaidSalary(role);
  const isPaid = receivesSalary({
    role,
    paysSalary: salaryChoice && paysSalary,
  });
  // Agreements attach to the stored role and salary choice, so changes to
  // either must be saved first.
  const savedPaid =
    !!employee &&
    receivesSalary(employee) &&
    compensationModelsFor(employee.role).join() ===
      compensationModelsFor(role).join();
  const canAddCompensation = financeEnabled && isPaid && savedPaid;

  function set(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function changeRole(nextRole: string) {
    setRole(nextRole);
    if (!staffRoles.includes(nextRole)) setManagerReportsTime(false);
    setAccessProfileId(defaultProfileFor(nextRole));
    setCompensation((current) => ({
      ...defaultCompensationValues(
        current.validFrom,
        compensationModelsFor(nextRole)[0],
      ),
    }));
    if (nextRole === "admin" && tab === "vacation") setTab("general");
  }

  /** Shows the tab holding the first invalid field, then explains it. */
  const visibleTabs = TABS.filter(
    (item) =>
      (item !== "vacation" || role !== "admin") &&
      (item !== "payroll" || isPaid),
  );
  const onLastTab = tab === visibleTabs[visibleTabs.length - 1];

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

  /** Moves a new employee's form to the next tab once this one is valid. */
  function goToNextTab() {
    const invalid = formRef.current?.querySelector<HTMLInputElement>(
      `[data-tab="${tab}"] input:invalid, [data-tab="${tab}"] select:invalid`,
    );
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    const next = visibleTabs[visibleTabs.indexOf(tab) + 1];
    if (next) setTab(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A new employee steps through the tabs before being created.
    if (creating && !onLastTab) {
      goToNextTab();
      return;
    }
    if (revealInvalidField()) return;
    setBusy(true);
    setError("");
    setMessage("");
    const payload = {
      displayName: values.displayName,
      email: values.email,
      employeeNumber: values.employeeNumber,
      role,
      reportsTime,
      employmentStartDate: values.employmentStartDate || null,
      reportingStartDate: reportsTime ? values.reportingStartDate : null,
      accessProfileId: audience ? accessProfileId : null,
      emailPreferences,
      locale: language,
      ...vacationPayload(vacation, role, creating),
      paysSalary: salaryChoice && paysSalary,
      // Personal details are kept for everyone; tax fields keep their values.
      payroll: payrollPayload(payrollValues, municipalities),
      ...(creating
        ? { password: values.password }
        : {
            status: values.status,
            employmentEndDate: values.employmentEndDate || null,
          }),
    };
    let createdId: string | undefined;
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
        id?: string;
      };
      if (!response.ok) {
        setError(
          result.error?.startsWith("profile")
            ? t(accessProfileError(result.error))
            : (result.error ?? t("employeeSaveFailed")),
        );
        return;
      }
      createdId = result.id;
      if (creating && isPaid && addCompensation && createdId) {
        const failure = await postCompensationAction({
          action: "setCompensation",
          userId: createdId,
          ...compensationInput(compensation),
        });
        if (failure) throw new Error(failure);
      }
      router.push(`/admin/users?saved=${creating ? "created" : "updated"}`);
      router.refresh();
    } catch {
      if (createdId) {
        // The employee exists, so continue on their page instead of resubmitting.
        router.push(
          `/admin/users/${encodeURIComponent(createdId)}/edit?tab=compensation&compensationFailed=1`,
        );
        router.refresh();
        return;
      }
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form
        ref={formRef}
        className="card employee-editor"
        onSubmit={submit}
        noValidate
      >
        <div className="editor-tabs" role="tablist" aria-label={t("employee")}>
          {visibleTabs.map((item) => (
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
            {staffRoles.includes(role) && (
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
            <label>
              {t("language")}
              <select
                className="field"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Locale)}
                disabled={isSelf}
              >
                <option value="en-SE">English</option>
                <option value="sv-SE">Svenska</option>
              </select>
              <small>{t("employeeLanguageHelp")}</small>
            </label>
            {creating ? (
              <label>
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
              <label>
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
          <PersonalDetailsFields
            values={payrollValues}
            onChange={(change) =>
              setPayrollValues((current) => ({ ...current, ...change }))
            }
          />
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
          data-tab="compensation"
          role="tabpanel"
          id="employee-panel-compensation"
          aria-labelledby="employee-tab-compensation"
          hidden={tab !== "compensation"}
        >
          <p className="muted editor-panel-intro">
            {t("employeeTabIntro_compensation")}
          </p>
          {!financeEnabled && (
            <p className="notice">{t("financeError_financeDisabled")}</p>
          )}
          {salaryChoice && (
            <div className="form-grid">
              <label className="checkbox-row form-wide">
                <input
                  type="checkbox"
                  checked={paysSalary}
                  onChange={(event) => setPaysSalary(event.target.checked)}
                />
                <span>{t("companyPaysSalary")}</span>
                <InfoTip text={t("companyPaysSalaryTip")} />
              </label>
            </div>
          )}
          {!isPaid && (
            <p className="notice">
              {t(
                salaryChoice
                  ? "employeeCompensationNotPaid"
                  : "employeeCompensationRoleNotPaid",
              )}
            </p>
          )}
          {creating ? (
            financeEnabled &&
            isPaid && (
              <div className="form-grid">
                <label className="checkbox-row form-wide">
                  <input
                    type="checkbox"
                    checked={addCompensation}
                    onChange={(event) => {
                      setAddCompensation(event.target.checked);
                      if (event.target.checked)
                        setCompensation((current) => ({
                          ...current,
                          validFrom: values.employmentStartDate,
                        }));
                    }}
                  />
                  <span>
                    <strong>{t("addCompensationNow")}</strong>
                  </span>
                </label>
                {addCompensation && (
                  <CompensationFields
                    values={compensation}
                    role={role}
                    onChange={(change) =>
                      setCompensation((current) => ({ ...current, ...change }))
                    }
                  />
                )}
              </div>
            )
          ) : (
            <>
              {financeEnabled && isPaid && !savedPaid && (
                <p className="notice">
                  {t("employeeCompensationSaveRoleFirst")}
                </p>
              )}
              <div className="week-head">
                <h2>{t("compensationHistory")}</h2>
                {canAddCompensation && (
                  <button
                    className="button"
                    type="button"
                    onClick={() => setAddingAgreement(true)}
                  >
                    {t("addCompensation")}
                  </button>
                )}
              </div>
              <CompensationTable
                agreements={agreements}
                canEnd={financeEnabled}
                onEnd={setEndingAgreement}
              />
            </>
          )}
        </section>

        <section
          className="editor-panel"
          data-tab="payroll"
          role="tabpanel"
          id="employee-panel-payroll"
          aria-labelledby="employee-tab-payroll"
          hidden={tab !== "payroll" || !isPaid}
        >
          <p className="muted editor-panel-intro">
            {t("employeeTabIntro_payroll")}
          </p>
          {isPaid && (
            <PayrollPanel
              values={payrollValues}
              onChange={(change) =>
                setPayrollValues((current) => ({ ...current, ...change }))
              }
              municipalities={municipalities}
              taxYear={taxYear}
            />
          )}
        </section>

        <section
          className="editor-panel"
          data-tab="vacation"
          role="tabpanel"
          id="employee-panel-vacation"
          aria-labelledby="employee-tab-vacation"
          hidden={tab !== "vacation"}
        >
          <p className="muted editor-panel-intro">
            {t("employeeTabIntro_vacation")}
          </p>
          {role !== "admin" && (
            <VacationPanel
              values={vacation}
              onChange={(change) =>
                setVacation((current) => ({ ...current, ...change }))
              }
              role={role}
              employeeId={employee?.id}
              savedSettings={employee?.vacation ?? null}
            />
          )}
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
          {!audience ? (
            <p className="notice">{t("employeeAccessByRole")}</p>
          ) : (
            <>
              {!accessProfileId && (
                <p className="notice notice-warning">
                  {t("employeeNeedsProfile")}
                </p>
              )}
              <label>
                {t("accessProfile")}
                <select
                  className="field"
                  required
                  value={accessProfileId}
                  onChange={(event) => setAccessProfileId(event.target.value)}
                >
                  <option value="">{t("chooseAccessProfile")}</option>
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedProfile && (
                <PermissionSummary
                  audience={selectedProfile.audience}
                  permissions={selectedProfile.permissions}
                />
              )}
              <p>
                <Link className="text-link" href="/admin/access-profiles">
                  {t("manageAccessProfiles")}
                </Link>
              </p>
            </>
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
        {message && <p className="notice notice-success">{message}</p>}
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
                ? onLastTab
                  ? t("createEmployee")
                  : t("next")
                : t("saveChanges")}
          </button>
        </footer>
      </form>
      {addingAgreement && employee && (
        <AddCompensationDialog
          employee={employee}
          openAgreement={
            agreements.find((agreement) => agreement.validTo === null) ?? null
          }
          close={() => setAddingAgreement(false)}
          onSaved={() => {
            setAddingAgreement(false);
            setError("");
            setMessage(t("compensationSaved"));
          }}
        />
      )}
      {endingAgreement && (
        <EndCompensationDialog
          agreement={endingAgreement}
          close={() => setEndingAgreement(null)}
          onSaved={() => {
            setEndingAgreement(null);
            setError("");
            setMessage(t("validToSaved"));
          }}
        />
      )}
    </>
  );
}
