/**
 * Which finance records a staff member's employee groups reach. A record
 * tied to a consultant needs that consultant; one tied to nobody needs the
 * company group.
 */

import {
  reachesCompany,
  reachesRecord,
  reachesUser,
  type Reach,
} from "@/domain/access/groups";
import { ARTICLE_FOR_ALL, ARTICLE_FOR_COMPANY } from "./invoice-articles";

type TransactionOwnerFields = {
  consultantId?: string | null;
  /** The staff member a salary expense of a non-consultant is for. */
  employeeId?: string | null;
  invoiceConsultantId?: string | null;
};

/**
 * The person a transaction belongs to: its consultant, the employee whose
 * salary it is, or else the consultant of its invoice (the company share of
 * a consultant's invoice belongs to that consultant, like the invoice).
 */
export function transactionOwnerId(transaction: TransactionOwnerFields) {
  return (
    transaction.consultantId ||
    transaction.employeeId ||
    transaction.invoiceConsultantId ||
    null
  );
}

export function reachesTransaction(
  reach: Reach,
  transaction: TransactionOwnerFields,
) {
  return reachesRecord(reach, transactionOwnerId(transaction));
}

/** Articles for all invoices are a shared catalog anyone may look at. */
export function articleVisibleTo(reach: Reach, consultantScope: string) {
  if (consultantScope === ARTICLE_FOR_ALL) return true;
  if (consultantScope === ARTICLE_FOR_COMPANY) return reachesCompany(reach);
  return reachesUser(reach, consultantScope);
}

/**
 * Who may add or change an article for this scope: one for all invoices
 * also applies to company invoices and to consultants outside the reach,
 * so it needs the company group.
 */
export function articleScopeEditableBy(reach: Reach, consultantScope: string) {
  if (consultantScope === ARTICLE_FOR_ALL) return reachesCompany(reach);
  return articleVisibleTo(reach, consultantScope);
}
