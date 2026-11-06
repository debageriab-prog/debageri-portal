/**
 * Invoice articles: the things the company invoices, such as "Timmar" at
 * 850 kr per hour, with the price, unit and VAT that rows made from them
 * use. An article is for all invoices, for company-only invoices, or for one
 * consultant's invoices, and is valid for a date range.
 */

/** Shown on every invoice. */
export const ARTICLE_FOR_ALL = "all";
/** Shown only on invoices without a consultant. */
export const ARTICLE_FOR_COMPANY = "company";

export type InvoiceArticle = {
  id: string;
  articleNumber: string;
  description: string;
  unit: string;
  unitPriceMinor: number;
  /** `all`, `company` or a consultant's user ID. */
  consultantScope: string;
  vatRateBps: number;
  validFrom: string;
  validTo: string | null;
};

export function articleValidOn(
  article: Pick<InvoiceArticle, "validFrom" | "validTo">,
  date: string,
) {
  return (
    article.validFrom <= date && (!article.validTo || article.validTo >= date)
  );
}

export function articleAppliesTo(
  article: Pick<InvoiceArticle, "consultantScope">,
  consultantId: string | null,
) {
  if (article.consultantScope === ARTICLE_FOR_ALL) return true;
  if (article.consultantScope === ARTICLE_FOR_COMPANY) return !consultantId;
  return article.consultantScope === consultantId;
}

/**
 * The articles an invoice for this consultant (or the company) on this date
 * can use, consultant-specific ones first, then by article number.
 */
export function articlesForInvoice<T extends InvoiceArticle>(
  articles: readonly T[],
  consultantId: string | null,
  issueDate: string,
) {
  const rank = (article: T) =>
    article.consultantScope === ARTICLE_FOR_ALL
      ? 2
      : article.consultantScope === ARTICLE_FOR_COMPANY
        ? 1
        : 0;
  return articles
    .filter(
      (article) =>
        articleAppliesTo(article, consultantId) &&
        articleValidOn(article, issueDate),
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.articleNumber.localeCompare(b.articleNumber, "sv-SE", {
          numeric: true,
        }),
    );
}

/** Whether two validity ranges share a day; an open end runs forever. */
export function validityOverlaps(
  a: Pick<InvoiceArticle, "validFrom" | "validTo">,
  b: Pick<InvoiceArticle, "validFrom" | "validTo">,
) {
  return (
    (!a.validTo || a.validTo >= b.validFrom) &&
    (!b.validTo || b.validTo >= a.validFrom)
  );
}

/** Where an article stands on a date, for the article list. */
export function articleStatus(
  article: Pick<InvoiceArticle, "validFrom" | "validTo">,
  today: string,
): "active" | "upcoming" | "ended" {
  if (article.validFrom > today) return "upcoming";
  if (article.validTo && article.validTo < today) return "ended";
  return "active";
}
