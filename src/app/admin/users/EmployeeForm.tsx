"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import type { DocumentAccess, FinanceAccess } from "@/domain/types";

export function EmployeeForm({
  onCreated,
}: {
  onCreated: (message: string) => void;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("consultant");
  const [managerReportsTime, setManagerReportsTime] = useState(false);
  const [financeAccess, setFinanceAccess] = useState<FinanceAccess>({
    enabled: false,
    myFinance: false,
    myInvoices: false,
  });
  const [documentAccess, setDocumentAccess] = useState<DocumentAccess>({
    contracts: false,
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    const form = new FormData(formElement);
    try {
      const response = await appCheckFetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: form.get("displayName"),
          email: form.get("email"),
          employeeNumber: form.get("employeeNumber"),
          password: form.get("password"),
          role,
          reportsTime: role === "consultant" || managerReportsTime,
          employmentStartDate: form.get("employmentStartDate"),
          reportingStartDate: form.get("reportingStartDate"),
          financeAccess:
            role === "consultant"
              ? financeAccess
              : { enabled: false, myFinance: false, myInvoices: false },
          documentAccess:
            role === "consultant" ? documentAccess : { contracts: false },
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        return setError(
          result.error ??
            "The employee could not be created. Please try again.",
        );
      formElement.reset();
      setRole("consultant");
      setManagerReportsTime(false);
      setFinanceAccess({
        enabled: false,
        myFinance: false,
        myInvoices: false,
      });
      setDocumentAccess({ contracts: false });
      setOpen(false);
      onCreated(t("employeeCreated"));
      router.refresh();
    } catch {
      setError(
        "We could not reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button" onClick={() => setOpen(true)}>
        <span aria-hidden="true">＋</span> {t("addEmployee")}
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-employee-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("newTeamMember")}</span>
                <h2 id="new-employee-title">{t("addEmployee")}</h2>
                <p>{t("addEmployeeDescription")}</p>
              </div>
              <button
                className="modal-close"
                aria-label={t("close")}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <form onSubmit={submit}>
              <div className="form-grid">
                <label>
                  {t("fullName")}
                  <input
                    className="field"
                    name="displayName"
                    placeholder="e.g. Anna Andersson"
                    autoFocus
                    required
                  />
                </label>
                <label>
                  {t("workEmail")}
                  <input
                    className="field"
                    name="email"
                    type="email"
                    placeholder="anna@debageri.se"
                    required
                  />
                </label>
                <label>
                  {t("employeeNumber")}
                  <input
                    className="field"
                    name="employeeNumber"
                    placeholder="DB-006"
                    required
                  />
                </label>
                <label>
                  {t("role")}
                  <select
                    className="field"
                    name="role"
                    value={role}
                    onChange={(event) => {
                      setRole(event.target.value);
                      setManagerReportsTime(false);
                      if (event.target.value !== "consultant")
                        setDocumentAccess({ contracts: false });
                      if (event.target.value !== "consultant")
                        setFinanceAccess({
                          enabled: false,
                          myFinance: false,
                          myInvoices: false,
                        });
                    }}
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
                    />
                    <span>
                      <strong>{t("reportsTime")}</strong>
                      <small>{t("managerReportsTimeHelp")}</small>
                    </span>
                  </label>
                )}
                {role === "consultant" && (
                  <fieldset className="access-section form-wide">
                    <legend>{t("access")}</legend>
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
                              enabled:
                                event.target.checked || current.myInvoices,
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
                              enabled:
                                current.myFinance || event.target.checked,
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
                {role === "consultant" && (
                  <fieldset className="access-section form-wide">
                    <legend>{t("documents")}</legend>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={documentAccess.contracts}
                        onChange={(event) =>
                          setDocumentAccess({ contracts: event.target.checked })
                        }
                      />
                      <span>
                        <strong>{t("contractsAccess")}</strong>
                      </span>
                    </label>
                  </fieldset>
                )}
                {(role === "consultant" || managerReportsTime) && (
                  <>
                    <label>
                      {t("reportingStartDate")}
                      <input
                        className="field"
                        name="reportingStartDate"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                        required
                      />
                      <small>{t("reportingStartHelp")}</small>
                    </label>
                  </>
                )}
                <label>
                  {t("employmentStartDate")}
                  <input
                    className="field"
                    name="employmentStartDate"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </label>
                <label className="form-wide">
                  {t("temporaryPassword")}
                  <input
                    className="field"
                    name="password"
                    type="password"
                    minLength={8}
                    placeholder={t("atLeast8Characters")}
                    required
                  />
                  <small>{t("temporaryPasswordHelp")}</small>
                </label>
              </div>
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              <footer className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setOpen(false)}
                >
                  {t("cancel")}
                </button>
                <button className="button" disabled={busy}>
                  {busy ? t("creating") : t("createEmployee")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
