"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { parseSek } from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";
import { ActionIcon } from "@/components/ui/ActionIcon";

type ExpenseTemplate = {
  id: string;
  consultantId: string | null;
  date: string;
  categoryId: string;
  netMinor: number;
  vatRateBps: number;
  funding: "company" | "consultant";
  visibleDescription: string;
  internalNote: string;
};

type EditableExpense = Omit<ExpenseTemplate, "netMinor" | "vatRateBps"> & {
  netAmount: string;
  vatPercent: string;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function previousMonth() {
  const value = new Date();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() - 1);
  return value.toISOString().slice(0, 7);
}

function dateInMonth(sourceDate: string, targetMonth: string) {
  const [year, month] = targetMonth.split("-").map(Number);
  const sourceDay = Number(sourceDate.slice(8, 10));
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return `${targetMonth}-${String(Math.min(sourceDay, lastDay)).padStart(2, "0")}`;
}

export function ExpenseCopyForm({
  users,
  categories,
  expenses,
}: {
  users: Array<{ id: string; displayName: string }>;
  categories: Array<{
    id: string;
    name: { en: string; sv: string };
    active: boolean;
  }>;
  expenses: ExpenseTemplate[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [sourceMonth, setSourceMonth] = useState(previousMonth());
  const [targetMonth, setTargetMonth] = useState(currentMonth());
  const [scope, setScope] = useState("all");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() =>
    categories
      .filter((category) => category.active)
      .map((category) => category.id),
  );
  const [rows, setRows] = useState<EditableExpense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const categoryMultiselectRef = useRef<HTMLDetailsElement>(null);
  const activeCategories = categories.filter((category) => category.active);
  const allCategoriesSelected =
    activeCategories.length > 0 &&
    selectedCategoryIds.length === activeCategories.length;

  useEffect(() => {
    function closeCategoryMenu(event: PointerEvent) {
      const menu = categoryMultiselectRef.current;
      if (
        menu?.open &&
        event.target instanceof Node &&
        !menu.contains(event.target)
      ) {
        menu.open = false;
      }
    }

    function closeCategoryMenuWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && categoryMultiselectRef.current?.open) {
        categoryMultiselectRef.current.open = false;
        categoryMultiselectRef.current.querySelector("summary")?.focus();
      }
    }

    document.addEventListener("pointerdown", closeCategoryMenu);
    document.addEventListener("keydown", closeCategoryMenuWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeCategoryMenu);
      document.removeEventListener("keydown", closeCategoryMenuWithEscape);
    };
  }, []);

  function updateCategorySelection(categoryIds: string[]) {
    setSelectedCategoryIds(categoryIds);
    setRows([]);
    setLoaded(false);
    setError("");
  }

  function loadExpenses() {
    if (sourceMonth === targetMonth) {
      setRows([]);
      setLoaded(false);
      setError(t("copyMonthMustDiffer"));
      return;
    }
    const selected = expenses.filter(
      (expense) =>
        expense.date.startsWith(sourceMonth) &&
        selectedCategoryIds.includes(expense.categoryId) &&
        (scope === "all"
          ? true
          : scope === "company"
            ? expense.consultantId === null
            : expense.consultantId === scope),
    );
    setRows(
      selected.map((expense) => ({
        ...expense,
        date: dateInMonth(expense.date, targetMonth),
        netAmount: (expense.netMinor / 100).toFixed(2),
        vatPercent: (expense.vatRateBps / 100).toFixed(2),
      })),
    );
    setLoaded(true);
    setError("");
  }

  function updateRow(id: string, field: keyof EditableExpense, value: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const copyGroups = new Map<
        string,
        {
          consultantId: string | null;
          expenses: Array<{
            categoryId: string;
            date: string;
            netMinor: number;
            vatRateBps: number;
            funding: "company" | "consultant";
            visibleDescription: string;
            internalNote: string;
          }>;
        }
      >();
      for (const row of rows) {
        const consultantId =
          scope === "all"
            ? row.consultantId
            : scope === "company"
              ? null
              : scope;
        const groupKey = consultantId
          ? `consultant:${consultantId}`
          : "company";
        const group = copyGroups.get(groupKey) ?? {
          consultantId,
          expenses: [],
        };
        group.expenses.push({
          categoryId: row.categoryId,
          date: row.date,
          netMinor: parseSek(row.netAmount),
          vatRateBps: Math.round(Number(row.vatPercent) * 100),
          funding: row.funding,
          visibleDescription: row.visibleDescription,
          internalNote: row.internalNote,
        });
        copyGroups.set(groupKey, group);
      }
      for (const group of copyGroups.values()) {
        const response = await appCheckFetch("/api/finance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "createExpenseCopies",
            consultantId: group.consultantId,
            expenses: group.expenses,
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          setError(
            t(
              `financeError_${result.error ?? "financeOperationFailed"}` as Parameters<
                typeof t
              >[0],
            ),
          );
          return;
        }
      }
      router.push("/finance?section=transactions");
      router.refresh();
    } catch {
      setError(t("financeError_invalidInput"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/finance?section=transactions">
            ← {t("backToTransactions")}
          </Link>
          <h1>{t("copyExpensesTitle")}</h1>
          <p className="muted page-description">
            {t("copyExpensesDescription")}
          </p>
        </div>
      </div>
      <section className="card">
        <div className="form-grid">
          <label>
            {t("copyFromMonth")}
            <input
              className="field"
              type="month"
              value={sourceMonth}
              onChange={(event) => {
                setSourceMonth(event.target.value);
                setRows([]);
                setLoaded(false);
                setError("");
              }}
            />
          </label>
          <label>
            {t("createInMonth")}
            <input
              className="field"
              type="month"
              value={targetMonth}
              onChange={(event) => {
                setTargetMonth(event.target.value);
                setRows([]);
                setLoaded(false);
                setError("");
              }}
            />
          </label>
          <label>
            {t("consultantOrCompany")}
            <select
              className="field"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
                setRows([]);
                setLoaded(false);
                setError("");
              }}
            >
              <option value="all">{t("allOwners")}</option>
              <option value="company">{t("companyOnly")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="category-multiselect-field">
            <span>{t("categoriesToCopy")}</span>
            <details
              ref={categoryMultiselectRef}
              className="category-multiselect"
            >
              <summary className="field">
                {allCategoriesSelected
                  ? t("allCategories")
                  : selectedCategoryIds.length === 0
                    ? t("noCategoriesSelected")
                    : `${selectedCategoryIds.length} ${t("categoriesSelected")}`}
              </summary>
              <div className="category-multiselect-options">
                <label>
                  <input
                    type="checkbox"
                    checked={allCategoriesSelected}
                    onChange={(event) =>
                      updateCategorySelection(
                        event.target.checked
                          ? activeCategories.map((category) => category.id)
                          : [],
                      )
                    }
                  />
                  {t("allCategories")}
                </label>
                {activeCategories.map((category) => (
                  <label key={category.id}>
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(category.id)}
                      onChange={(event) =>
                        updateCategorySelection(
                          event.target.checked
                            ? [...selectedCategoryIds, category.id]
                            : selectedCategoryIds.filter(
                                (categoryId) => categoryId !== category.id,
                              ),
                        )
                      }
                    />
                    {category.name[locale === "sv-SE" ? "sv" : "en"]}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="form-wide actions">
            <button
              className="button secondary"
              type="button"
              onClick={loadExpenses}
            >
              {t("loadExpenses")}
            </button>
          </div>
        </div>
      </section>

      {rows.length > 0 ? (
        <form onSubmit={submit}>
          <section className="card table-wrap expense-copy-table">
            <table>
              <thead>
                <tr>
                  <th>{t("date")}</th>
                  <th>{t("category")}</th>
                  <th>{t("netAmountSek")}</th>
                  <th>{t("vatPercent")}</th>
                  <th>{t("funding")}</th>
                  <th>{t("description")}</th>
                  <th>{t("internalNote")}</th>
                  <th>
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        className="field"
                        type="date"
                        value={row.date}
                        onChange={(event) =>
                          updateRow(row.id, "date", event.target.value)
                        }
                        required
                      />
                    </td>
                    <td>
                      <select
                        className="field"
                        value={row.categoryId}
                        onChange={(event) =>
                          updateRow(row.id, "categoryId", event.target.value)
                        }
                        required
                      >
                        {categories
                          .filter((category) => category.active)
                          .map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name[locale === "sv-SE" ? "sv" : "en"]}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="field"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.netAmount}
                        onChange={(event) =>
                          updateRow(row.id, "netAmount", event.target.value)
                        }
                        required
                      />
                    </td>
                    <td>
                      <input
                        className="field"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.vatPercent}
                        onChange={(event) =>
                          updateRow(row.id, "vatPercent", event.target.value)
                        }
                        required
                      />
                    </td>
                    <td>
                      <select
                        className="field"
                        value={row.funding}
                        onChange={(event) =>
                          updateRow(row.id, "funding", event.target.value)
                        }
                      >
                        <option value="company">{t("companyFunded")}</option>
                        <option value="consultant">
                          {t("consultantFunded")}
                        </option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="field"
                        value={row.visibleDescription}
                        onChange={(event) =>
                          updateRow(
                            row.id,
                            "visibleDescription",
                            event.target.value,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="field"
                        value={row.internalNote}
                        onChange={(event) =>
                          updateRow(row.id, "internalNote", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="table-action table-action-danger icon-action"
                        type="button"
                        aria-label={t("remove")}
                        title={t("remove")}
                        onClick={() =>
                          setRows((current) =>
                            current.filter((item) => item.id !== row.id),
                          )
                        }
                      >
                        <ActionIcon type="delete" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="actions expense-copy-actions">
            <button className="button" disabled={busy || rows.length === 0}>
              {t("createAllExpenses")}
            </button>
          </div>
          {error && <p className="notice notice-error">{error}</p>}
        </form>
      ) : (
        <section className="card">
          <p className="muted">
            {loaded ? t("noExpensesFound") : t("noExpensesLoaded")}
          </p>
          {error && <p className="notice notice-error">{error}</p>}
        </section>
      )}
    </>
  );
}
