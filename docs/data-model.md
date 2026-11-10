# Data model

Every organization-owned document has `organizationId`. Dates are `YYYY-MM-DD` in `Europe/Stockholm`; durations are integer minutes to avoid floating-point errors. Server timestamps provide audit chronology.

| Collection                | ID / purpose                                                                                   | Write owner              | Reads                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------- |
| `organizations`           | organization ID; locale, timezone, schedule defaults, `invoicing` company details              | admin service            | members                         |
| `users`                   | Firebase UID; profile, role, reporting dates, `reportsTime`, active status, email `locale`     | admin service            | role/capability based           |
| `timeCodes`               | stable code ID; localized names, category, behavior, effective range                           | admin service            | members                         |
| `timesheets`              | `{org}_{uid}_{isoYear}-W{ww}`; week state and trusted totals                                   | trusted workflow         | self/assigned manager/admin     |
| `timeEntries`             | generated ID; date allocation and immutable code snapshot                                      | employee while editable  | self/assigned manager/admin     |
| `timesheetAttachments`    | generated; file metadata for a time report, keyed by `timesheetId`                             | timesheet attachment API | server only (role checked)      |
| `approvalEvents`          | generated; append-only transition history                                                      | trusted workflow         | participants/admin              |
| `holidays`                | stable date/region ID                                                                          | admin service            | members                         |
| `auditLogs`               | generated; immutable sensitive action record                                                   | trusted services         | admin                           |
| `compensationAgreements`  | effective-dated compensation: flexible (share plus requested salary), fixed, hybrid, salaried  | admin service            | finance server only             |
| `payrollProfiles`         | `{org}_{uid}`; personnummer, address, kommun, tax table and column, jämkning, salary account   | admin user API           | server only                     |
| `taxTables`               | `{org}_{year}_{table}`; Skatteverket's monthly brackets (amount or percent per column 1–6)     | tax table import         | server only                     |
| `municipalTaxRates`       | `{org}_{year}`; every kommun's tax rate and its parishes' rates with church fee                | tax table import         | server only                     |
| `salaryRuns`              | `{org}_{YYYY-MM}`; a month's payment date and the period its events come from                  | salary service           | server only                     |
| `salarySlips`             | `{org}_{uid}_{YYYY-MM}`; one person's salary: lines, tax, totals, status, payslip and expenses | salary service           | server only                     |
| `financeCategories`       | bilingual income/expense classifications                                                       | admin service            | finance server only             |
| `financeCustomers`        | customer name, contacts, customer number, address, org/VAT number, invoice defaults            | finance service          | finance server only             |
| `invoiceArticles`         | article number, description, unit, price, VAT, consultant scope, validity                      | finance service          | finance server only             |
| `invoices`                | consultant attribution, rows, net/VAT/gross values, OCR, PDF and sending, payment state        | finance service          | admin/accountant server         |
| `financialTransactions`   | immutable income, expense, and reversal ledger in integer Ã¶re                                 | finance service          | role-scoped finance server      |
| `aiSettings`              | organization ID; AI on/off, provider, model, enabled sections, encrypted keys                  | admin service            | server only                     |
| `accountingEmailSettings` | per-organization accounting email addresses and which finance changes each receives            | accounting email service | server only (admin API)         |
| `incomingEmailSettings`   | organization ID; finance mailbox (IMAP, encrypted password), trusted senders, read state       | incoming email service   | server only (admin API)         |
| `incomingFinanceEmails`   | generated; forwarded email, its files and what AI read, waiting to become a record             | incoming email service   | finance server only             |
| `requests`                | generated; equipment, education, seminar or travel request, its links, files and status        | request service          | requester/reviewers server only |
| `requestEvents`           | generated; append-only status history of a request                                             | request service          | requester/reviewers server only |

Weekly sheets are approval/state units; entries remain separate so one date can have multiple codes and date-range reporting stays queryable. Each eligible weekday expects eight reported hours, while submitted sheets preserve their historical expected total. Code snapshots preserve historical meaning after a rename/deactivation. Approval events are append-only because current sheet fields are not history.

Incoming financial emails are read from the finance mailbox every hour from
08:00 to 23:00 and on "Read now", only while the mailbox is switched on and the
AI section "Finance: Process incoming financial emails" is enabled. Only mail
from the trusted senders is stored, and mail whose DMARC check failed is
skipped. Each message is remembered by its IMAP UID (and UIDVALIDITY) and marked
as read, so it is never read twice. Its PDF and image attachments are private
Storage objects under `organizations/{org}/finance/incomingEmails/{id}/`. An
email moves from `ready` (or `failed`, when AI could not read it) to `converted`
when someone creates the income, expense or invoice from it, or to `dismissed`.
Nothing is booked without that step, and the created record gets its own copy
of the files.

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
notes and customer contact details never pass through consultant-facing
responses, and consultants see neither invoice details nor invoice files. A
consultant's access to My invoices comes from their access profile, whatever
their compensation model. My finances also comes from the profile, but is never
shown to fixed-salary consultants because they have no personal balance. The
same goes for their Income and expenses page, which has its own permission.

Consultants are always paid. Other staff are paid when `users.paysSalary` is
set ("Company will pay salary"), and their only compensation model is
`salaried`: a fixed monthly salary that is a company expense with no invoice
income and no personal balance. A flexible agreement also holds
`requestedMonthlySalaryMinor`, the gross salary the consultant asks for until
further notice; it is paid from their balance together with employer
contributions. Changing it means adding a new agreement period, so the history
stays effective-dated.

Payroll details live in `payrollProfiles`, not on the user document, because
the user can read their own user document and the profile holds the
personnummer. The personnummer and home address are kept for every employee
and edited under Personal details on the General information tab; the tax
details and salary account are on the Payroll tab, shown only for people the
company pays. Both are saved with the rest of the employee, and the audit log
records only which fields changed. Preliminary tax comes from Skatteverket's monthly tax tables, which
an admin imports per year under Finance > Salaries > Tax tables from
Skatteverket's open data (EntryScape rowstore). The kommun's total rate, with
the parish church fee for members, suggests the table: rates are rounded to
the nearest whole percent and exactly half rounds down. Amount brackets give
kronor of tax; the brackets above them give a percent of the whole kronor of
taxable pay, rounded down. A jämkning decision (a fixed percent or amount)
replaces the table tax.

Salaries are prepared per month under Finance > Salaries. Generating a
month creates a salary row for everyone paid that month: consultants with a
fixed, hybrid or salaried agreement, flexible consultants with a requested
salary, and staff with `paysSalary`. The row holds snapshots of the person,
their payroll details and tax, and lines built from the agreement and the
approved time reports of the event period (usually the month before): the
monthly salary, a vacation supplement (semestertillägg) per run of vacation
days at the person's `supplementBps` (0.8 % without vacation settings), and
hourly deductions for unpaid, parental and care leave, and sick pay under
the Sick Pay Act (`src/domain/salary/sick-pay.ts`): sick days are grouped into
sick pay periods counted in calendar days, days 1–14 are paid at 80 % (20 %
of each hour deducted) and later days are deducted in full, as
Försäkringskassan pays them. Each period starts with a waiting-day deduction
(karensavdrag) of 20 % of a week's sick pay, at most the period's sick pay;
falling ill again within five days continues the period without a new one,
and after ten in twelve months none are made. Approved sick days of the year
before the event period are read for this. Lines added or changed by hand
survive a rebuild. Added lines marked `repeat` are copied, with new ids and
without dates, into the person's row when the next month is generated. Generating asks whom to pay: people left out, or
removed from the month while their row is prepared, are kept in the run's
`excludedUserIds` and stay out on the next update. Each row can turn
`useTimeReports` off to pay the full monthly salary whatever was reported;
`reportedDays` flags a row with no approved time in the event period.
Taxable pay lines marked `oneTime` (engångsbelopp, such as a bonus) are taxed
apart with engångsskatt: a percent from Skatteverket's table for one-time
payments (built into `src/domain/salary/one-time-tax.ts` per year), chosen by
the expected annual income, which is this month's regular taxable pay × 12 plus
this year's one-time payments, and 30 % without a monthly salary. A jämkning
percent covers them too. An `extraTax` line is extra tax the person asked
to have withheld; it adds to `taxMinor` (also when the tax is typed by hand)
and so to the yearly tax and the booked tax. Rows move from `initiated` to `ready`, `payslipGenerated`
and `booked`; `problem` keeps a row without payroll details or tax tables
from becoming ready unless the tax is typed by hand.

Generating payslips only stores each row's PDF under
`organizations/{org}/salaries/{YYYY-MM}/` and records it in the row's `pdf`,
for finance to check; employees see nothing yet. Booking then does the steps
chosen for it, kept in `booking`: publishing a copy as the person's
`payslips` document for the month (`generated: true`, `salarySlipId`, with
the usual email), creating the expenses, and attaching the row's PDF to each
expense through `financeAttachments` (`salarySlipId`); an attached PDF is
marked `attached` and is no longer deleted when the payslip is generated
again. Expenses add the payout on `salary`, optionally the withheld tax on
`salary_tax` and employer contributions on `employer_tax`, creating those
categories when missing. Employer contributions use each person's rate for
their age (`src/domain/salary/employer-fee.ts`, from the year of birth and the
payment date): 31.42 %, 10.21 % for people who turned 66 before the year
began, nothing for people born 1937 or earlier, and 20.81 % on pay up to
25 000 kr a month for 19–23-year-olds from April 2026 to September 2027;
`booking.employerFeeGroup` records which. A flexible consultant's salary is consultant-funded
and lowers their balance; everyone else is a company expense, with
`employeeId` naming the person. Salary expenses carry `salarySlipId` and are
changed only from their row: a booked row is reversed with linked reversals
and reopened. Reported monthly and yearly figures drop the öre, as
Skatteverket expects whole kronor.

The month's AGI file (arbetsgivardeklaration på individnivå, Skatteverket's
XML schema 1.1, built in `src/domain/salary/agi.ts`) is downloaded from `POST
/api/finance/salaries/agi` with `finance.salary.book`. It covers the month's
booked rows: a huvuduppgift per payment month with the summed employer
contributions (fält 487) and tax (497), an individuppgift per person with cash
pay (011), benefits and withheld tax (001), and a frånvarouppgift per day of
parental leave (`FORALDRAPENNING`) and care of a sick child
(`TILLFALLIG_FORALDRAPENNING`) from the approved time reports. Benefit rows
with the item `car` go in fält 013 (bilförmån), `fuel` in 018 (drivmedel vid
bilförmån) and all other benefits in 012. It needs the company's organisation
number in the invoice settings and a personnummer on each row. Each export is
audited as `salaryRun.agiExported`.

Generated invoices replace Fortnox. `organizations/{org}.invoicing` holds the
company details printed on them (name, address, org and VAT number, F-skatt,
bankgiro or plusgiro, IBAN/BIC, payment terms, late interest text) and the
`nextInvoiceNumber` and `nextCustomerNumber` counters. Admins edit it under
Administration > Organization. Creating an invoice suggests the counter; saving
a plain number at or above it moves the counter past that number in the same
transaction, so a changed number is fine. Invoices store `lines` (quantity in
thousandths, unit price and amount in öre) and their net is the sum of the
rows; older invoices without rows print as one row. With OCR on, the
`ocrReference` is the invoice number plus a length digit and a Luhn check
digit. The PDF is made on the server with the built-in PDF writer and stored at
`organizations/{org}/finance/invoice/{id}/generated-invoice.pdf`; generating
again overwrites it. The PDF is also a `financeAttachments` record with
`generated: true` (ID `{invoiceId}-invoice-pdf`), so it lists and downloads
with the invoice's files without counting toward their limit of three, and
removing it clears the invoice's PDF. On the invoice form, "Generate PDF
invoice and attach" shows a preview made from the unsaved form; saving makes
the stored PDF from the saved invoice. An invoice has one PDF at a time: the
button stays off while one is attached and comes back when it is removed. When the invoice has an OCR number, the last page ends
with a bankgiro payment slip ("Inbetalning/Girering AVI") whose code line
follows Bankgirot's layout for a fixed amount: bankgiro, amount with its
check digit and OCR number, read from the right and ending in `#41#`. It is
set in Courier Bold 12, which has Bankgirot's pitch of ten characters per
inch, so bank apps can scan it. A company with a plusgiro instead of a bankgiro gets
no slip: the payment box and the invoice email ask for payment to the
plusgiro. With both filled in, invoices use the bankgiro. Each generation copies the company details and the
customer's address into the invoice (`issuerSnapshot`, `customerAddress`).
Invoice articles (Invoice management > Invoice articles) hold what the
company invoices: number, description, unit, unit price, VAT rate and a
validity range with an open end allowed. `consultantScope` is `all`,
`company` (invoices without a consultant) or one consultant's ID, and the
invoice form only offers the articles that suit its consultant and invoice
date. Two articles may share a number only when their scope or validity
differs. A row made from an article stores `articleId` with a copy of the
article's details, taken on the server when the invoice is saved, so later
price changes leave saved invoices alone. All article rows on an invoice
must share its VAT rate. `useGenerator` says an invoice was made with the
invoice generator: its rows come from articles and the portal makes, stores
and sends its PDF. Without it (CSV imports, invoices made in another system,
and every invoice saved before the flag existed) the invoice has one typed
net amount, no rows, and its file is attached by hand; the portal neither
generates nor sends a PDF for it.
"Fill from approved hours" only sets the quantity of the invoice's hourly
article (unit `h`) to the consultant's approved worked hours in the period.
Paid, sent and void invoices open on the same edit page with their amounts,
rows and dates disabled and their files still editable. A paid invoice can
also change its references, invoice text, consultant-visible description and
internal note (`updateInvoiceLabels`, audited as `invoice.labelsUpdated`);
its ledger entries and sent PDF stay as they were.
Sending emails the PDF to the customer's finance email, with a BCC to the
customer's current `financeBccEmail` when set, and sets `sentAt` (and
`sentBcc`); from
then on the invoice keeps those copies and can no longer be edited, only
voided.

`accessProfiles` holds `organizationId`, `name`, `description`, `audience`
(`consultant` or `staff`), `permissions` and `defaultForRole`. It is server-only:
rules deny all direct access. `users/{uid}.accessProfileId` assigns one. The
`financeAccess` and `documentAccess` fields on older user documents are unused.

Indexes in `firestore.indexes.json` serve user date/week entry queries, user sheet history, and manager status queues. Future `leaveBalances`, `payslips`, `employeeDocuments`, `projects`, and `reportSummaries` retain organization isolation and server ownership. The portal database is separate because candidate recruitment data has a different purpose, access population, retention policy, and threat boundary.

Requests are how people ask the company for equipment, education, seminars or travel. A request stores its `type`, title, description, up to five http(s) `links`, `estimatedCostMinor` (öre, including VAT), `vatRateBps` (25, 12, 6 or 0 %, missing on early requests), `payer` (`company` or `self`), optional `startDate`/`endDate` for education, seminars and travel, and up to five `files` kept at `organizations/{org}/requests/{uid}/{requestId}/{fileId}` and streamed through `/api/requests/{id}/files/{fileId}`. Each type has its own permission (`my.requests.equipment`, `my.requests.education`, `my.requests.seminar`, `my.requests.travel`) under `my.requests`, so a company can allow some types and not others. The usual path is `requested` → `under_review` → `accepted` → `finalized`, but a reviewer can set any status except `withdrawn` at any time, for example straight to `finalized` after ordering the item, and `finalized` can never be changed again. A reviewer can also choose `changes_requested`, with a note on what to change. The requester then edits the request, and saving sends it back to `requested` (audit `request.resubmitted`) and tells the reviewers again. Reviewers (`documents.requests.review`) make every change except `withdrawn`, which only the requester can choose, and only while the request is `requested` or `changes_requested`. Reviewers cannot decide on their own requests. The requester can edit a request while it is `requested` or `changes_requested`, and can withdraw it in those statuses too. Each change writes a `requestEvents` entry and an audit entry (`request.submitted`, `request.updated`, `request.{status}`) in the same transaction. A finalized request becomes an expense through `/finance/transactions/new?requestId=…`, which fills in the consultant, amount, funding and files. Creating it sets `expenseTransactionId` (audit `request.expenseCreated`), so the request is never booked twice.
