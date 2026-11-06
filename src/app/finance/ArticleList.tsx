"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { formatSek } from "@/domain/finance/calculations";
import {
  ARTICLE_FOR_ALL,
  ARTICLE_FOR_COMPANY,
  articleStatus,
  type InvoiceArticle,
} from "@/domain/finance/invoice-articles";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** The invoice articles table, with filters by consultant and status. */
export function ArticleList({
  articles,
  users,
  canAdd,
  canEdit,
}: {
  articles: InvoiceArticle[];
  users: Array<{ id: string; displayName: string }>;
  canAdd: boolean;
  canEdit: boolean;
}) {
  const { t, locale } = useLocale();
  const [scope, setScope] = useState("any");
  const [status, setStatus] = useState("current");
  const date = today();
  const scopeLabel = (value: string) =>
    value === ARTICLE_FOR_ALL
      ? t("articleForAll")
      : value === ARTICLE_FOR_COMPANY
        ? t("companyOnly")
        : (users.find((user) => user.id === value)?.displayName ??
          t("articleUnknownConsultant"));
  const shown = useMemo(
    () =>
      articles.filter((article) => {
        const state = articleStatus(article, date);
        if (status === "current" && state === "ended") return false;
        if (status !== "current" && status !== "all" && state !== status)
          return false;
        return scope === "any" || article.consultantScope === scope;
      }),
    [articles, date, scope, status],
  );
  return (
    <>
      <section className="card">
        <div className="week-head">
          <h2>{t("invoiceArticles")}</h2>
          {canAdd && (
            <Link className="button" href="/finance/articles/new">
              {t("addArticle")}
            </Link>
          )}
        </div>
        <div className="finance-filter-bar">
          <label>
            {t("articleConsultant")}
            <select
              className="field"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="any">{t("allConsultantsAndCompany")}</option>
              <option value={ARTICLE_FOR_ALL}>{t("articleForAll")}</option>
              <option value={ARTICLE_FOR_COMPANY}>{t("companyOnly")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("status")}
            <select
              className="field"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="current">{t("articleStatusCurrent")}</option>
              <option value="active">{t("articleStatus_active")}</option>
              <option value="upcoming">{t("articleStatus_upcoming")}</option>
              <option value="ended">{t("articleStatus_ended")}</option>
              <option value="all">{t("allStatuses")}</option>
            </select>
          </label>
        </div>
      </section>
      <section className="card table-wrap">
        {!shown.length ? (
          <p className="muted">{t("noArticles")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("invoiceLineArticle")}</th>
                <th>{t("invoiceLineDescription")}</th>
                <th>{t("invoiceLineUnit")}</th>
                <th>{t("invoiceLineUnitPrice")}</th>
                <th>{t("vatPercent")}</th>
                <th>{t("articleConsultant")}</th>
                <th>{t("articleValidity")}</th>
                <th>{t("status")}</th>
                {canEdit && (
                  <th>
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((article) => {
                const state = articleStatus(article, date);
                return (
                  <tr key={article.id}>
                    <td>{article.articleNumber}</td>
                    <td>{article.description}</td>
                    <td>{article.unit}</td>
                    <td>{formatSek(article.unitPriceMinor, locale)}</td>
                    <td>{article.vatRateBps / 100}%</td>
                    <td>{scopeLabel(article.consultantScope)}</td>
                    <td>
                      {article.validFrom} {"–"} {article.validTo ?? ""}
                    </td>
                    <td>{t(`articleStatus_${state}`)}</td>
                    {canEdit && (
                      <td>
                        <Link
                          className="table-action icon-action"
                          href={`/finance/articles/${encodeURIComponent(article.id)}/edit`}
                          aria-label={t("editArticle")}
                          title={t("editArticle")}
                        >
                          <ActionIcon type="edit" />
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
