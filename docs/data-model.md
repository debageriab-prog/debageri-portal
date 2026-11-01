# Data model

Every organization-owned document has `organizationId`. Dates are `YYYY-MM-DD` in `Europe/Stockholm`; durations are integer minutes to avoid floating-point errors. Server timestamps provide audit chronology.

| Collection                | ID / purpose                                                                               | Write owner              | Reads                       |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------ | --------------------------- |
| `organizations`           | organization ID; locale, timezone, schedule defaults                                       | admin service            | members                     |
| `users`                   | Firebase UID; profile, role, reporting dates, `reportsTime`, active status, email `locale` | admin service            | role/capability based       |
| `timeCodes`               | stable code ID; localized names, category, behavior, effective range                       | admin service            | members                     |
| `timesheets`              | `{org}_{uid}_{isoYear}-W{ww}`; week state and trusted totals                               | trusted workflow         | self/assigned manager/admin |
| `timeEntries`             | generated ID; date allocation and immutable code snapshot                                  | employee while editable  | self/assigned manager/admin |
| `timesheetAttachments`    | generated; file metadata for a time report, keyed by `timesheetId`                         | timesheet attachment API | server only (role checked)  |
| `approvalEvents`          | generated; append-only transition history                                                  | trusted workflow         | participants/admin          |
| `holidays`                | stable date/region ID                                                                      | admin service            | members                     |
| `auditLogs`               | generated; immutable sensitive action record                                               | trusted services         | admin                       |
| `compensationAgreements`  | effective-dated flexible/fixed/hybrid compensation and rates                               | admin service            | finance server only         |
| `financeCategories`       | bilingual income/expense classifications                                                   | admin service            | finance server only         |
| `invoices`                | consultant attribution, net/VAT/gross values, payment state                                | finance service          | admin/accountant server     |
| `financialTransactions`   | immutable income, expense, and reversal ledger in integer Ã¶re                             | finance service          | role-scoped finance server  |
| `aiSettings`              | organization ID; AI on/off, provider, model, enabled sections, encrypted keys              | admin service            | server only                 |
| `accountingEmailSettings` | per-organization accounting email addresses and which finance changes each receives        | accounting email service | server only (admin API)     |

Weekly sheets are approval/state units; entries remain separate so one date can have multiple codes and date-range reporting stays queryable. Each eligible weekday expects eight reported hours, while submitted sheets preserve their historical expected total. Code snapshots preserve historical meaning after a rename/deactivation. Approval events are append-only because current sheet fields are not history.

Time report files are private Storage objects under `organizations/{org}/timesheets/{uid}/{timesheetId}/`. The reporter adds and views them and can remove a file while the report is an unsent draft. Once a report has been sent, only admins and managers remove files. Every removal needs the typed confirmation phrase and is audited. Deleting a report keeps its files, which return when the same week is reported again, and deleting a sent report sets `locked` on them so the reporter cannot remove them that way.

Entries duplicate ISO year/week, calendar year/month, and a UTC noon `dateTimestamp` for safe indexed queries. Snapshots contain code, localized-at-write name, category, and worked/expected flags. Used codes are deactivated, never deleted.

Finance uses SEK integer Ã¶re. Flexible consultant balances are the sum of
snapshotted `consultantBalanceDeltaMinor` values: paid income creates a credit,
consultant-funded expenses create a debit, and corrections create linked
reversals. Fixed-salary consultants have attributed revenue and costs but no
personal balance. Hybrid consultants have a fixed monthly salary plus an
invoice share: the share follows the flexible balance rules, and the salary is
booked as a company-funded expense so it never touches the balance. VAT is
stored separately from net revenue and cost. Internal
notes never pass through consultant-facing responses.

Indexes in `firestore.indexes.json` serve user date/week entry queries, user sheet history, and manager status queues. Future `leaveBalances`, `payslips`, `employeeDocuments`, `projects`, and `reportSummaries` retain organization isolation and server ownership. The portal database is separate because candidate recruitment data has a different purpose, access population, retention policy, and threat boundary.
