"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";

export type ManagedTimeCode = {
  id: string;
  code: string;
  name: string;
  category: string;
  hourlyRate: number;
  active: boolean;
  employeeCanSelect: boolean;
  assignedUserId: string | null;
  requiresComment: boolean;
  countsAsWorkedTime: boolean;
};

const categories = [
  "work",
  "overtime",
  "vacation",
  "parental_leave",
  "sick_leave",
  "care_leave",
  "unpaid_leave",
  "compensatory_leave",
  "holiday",
  "other",
];

type AssignableUser = {
  id: string;
  displayName: string;
  status: string;
};

export function TimeCodeManagement({
  codes,
  users,
}: {
  codes: ManagedTimeCode[];
  users: AssignableUser[];
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [editing, setEditing] = useState<ManagedTimeCode | "new" | null>(null);
  const [deleting, setDeleting] = useState<ManagedTimeCode | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const isNew = editing === "new";
      const response = await appCheckFetch(
        isNew
          ? "/api/admin/time-codes"
          : `/api/admin/time-codes/${encodeURIComponent(editing.id)}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: form.get("code"),
            name: form.get("name"),
            category: form.get("category"),
            hourlyRate: Number(form.get("hourlyRate")),
            active: form.get("active") === "on",
            employeeCanSelect: form.get("employeeCanSelect") === "on",
            assignedUserId: form.get("assignedUserId") || null,
            requiresComment: form.get("requiresComment") === "on",
            countsAsWorkedTime: form.get("countsAsWorkedTime") === "on",
          }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? t("timeCodeSaveFailed"));
        return;
      }
      setEditing(null);
      setMessage(isNew ? t("timeCodeCreated") : t("timeCodeUpdated"));
      router.refresh();
    } catch {
      setError(t("serverTryAgain"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting || confirmation !== "I am sure") return;
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        `/api/admin/time-codes/${encodeURIComponent(deleting.id)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? t("timeCodeDeleteFailed"));
        return;
      }
      setDeleting(null);
      setConfirmation("");
      setMessage(t("timeCodeDeleted"));
      router.refresh();
    } catch {
      setError(t("serverTryAgain"));
    } finally {
      setBusy(false);
    }
  }

  const value = editing === "new" ? null : editing;
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("timeCodes")}</h1>
          <p className="muted page-description">
            {t("timeCodesPageDescription")}
          </p>
        </div>
        <button className="button" onClick={() => setEditing("new")}>
          {t("addTimeCode")}
        </button>
      </div>
      {message && (
        <div className="toast toast-success" role="status">
          {message}
        </div>
      )}
      <section className="card table-wrap">
        {codes.length === 0 ? (
          <div className="empty-state">
            <h2>{t("noTimeCodes")}</h2>
            <p>{t("noTimeCodesDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("code")}</th>
                <th>{t("name")}</th>
                <th>{t("category")}</th>
                <th>{t("hourlyRate")}</th>
                <th>{t("status")}</th>
                <th>{t("assignedTo")}</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id}>
                  <td>{code.code}</td>
                  <td>{code.name}</td>
                  <td className="capitalize">
                    {code.category.replaceAll("_", " ")}
                  </td>
                  <td>{code.hourlyRate.toFixed(2)}</td>
                  <td>{code.active ? t("active") : t("inactive")}</td>
                  <td>
                    {code.assignedUserId
                      ? (users.find((user) => user.id === code.assignedUserId)
                          ?.displayName ?? t("unknownEmployee"))
                      : t("everyone")}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="table-action"
                        onClick={() => setEditing(code)}
                      >
                        {t("edit")}
                      </button>
                      <button
                        className="table-action table-action-danger"
                        onClick={() => {
                          setConfirmation("");
                          setError("");
                          setDeleting(code);
                        }}
                      >
                        {t("delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {editing && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("reportingSetup")}</span>
                <h2>
                  {editing === "new" ? t("addTimeCode") : t("editTimeCode")}
                </h2>
                <p>{t("timeCodeDialogDescription")}</p>
              </div>
            </header>
            <form onSubmit={save}>
              <div className="form-grid">
                <label>
                  {t("code")}
                  <input
                    className="field"
                    name="code"
                    defaultValue={value?.code}
                    required
                  />
                </label>
                <label>
                  {t("name")}
                  <input
                    className="field"
                    name="name"
                    defaultValue={value?.name}
                    required
                  />
                </label>
                <label>
                  {t("category")}
                  <select
                    className="field"
                    name="category"
                    defaultValue={value?.category ?? "work"}
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("hourlyRate")}
                  <input
                    className="field"
                    name="hourlyRate"
                    type="number"
                    min="0"
                    step=".01"
                    defaultValue={value?.hourlyRate ?? 0}
                    required
                  />
                </label>
                <label className="form-wide">
                  {t("assignedEmployee")}
                  <select
                    className="field"
                    name="assignedUserId"
                    defaultValue={value?.assignedUserId ?? ""}
                  >
                    <option value="">{t("everyone")}</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName}
                        {user.status === "inactive" ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                  <small>{t("assignedEmployeeHelp")}</small>
                </label>
                <label>
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={value?.active ?? true}
                  />{" "}
                  {t("active")}
                </label>
                <label>
                  <input
                    name="employeeCanSelect"
                    type="checkbox"
                    defaultChecked={value?.employeeCanSelect ?? true}
                  />{" "}
                  {t("employeesCanSelect")}
                </label>
                <label>
                  <input
                    name="requiresComment"
                    type="checkbox"
                    defaultChecked={value?.requiresComment ?? false}
                  />{" "}
                  {t("requiresComment")}
                </label>
                <label>
                  <input
                    name="countsAsWorkedTime"
                    type="checkbox"
                    defaultChecked={value?.countsAsWorkedTime ?? true}
                  />{" "}
                  {t("countsAsWorkedTime")}
                </label>
              </div>
              {error && <p className="notice notice-error">{error}</p>}
              <footer className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditing(null)}
                >
                  {t("cancel")}
                </button>
                <button className="button" disabled={busy}>
                  {busy ? t("saving") : t("saveTimeCode")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow danger-text">
                  {t("permanentAction")}
                </span>
                <h2>
                  {t("delete")} {deleting.code}?
                </h2>
                <p>{t("deleteTimeCodeDescription")}</p>
              </div>
            </header>
            <label>
              {t("typeConfirmation")} <strong>I am sure</strong>
              <input
                className="field"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            {error && <p className="notice notice-error">{error}</p>}
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setDeleting(null)}
              >
                {t("keepTimeCode")}
              </button>
              <button
                className="button danger"
                disabled={busy || confirmation !== "I am sure"}
                onClick={remove}
              >
                {busy ? t("deleting") : t("deleteTimeCode")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
