# Product requirements

Debageri Portal is an employee platform, initially centered on time reporting but designed for profile data, leave, payslips, documents, and internal services. Swedish is default and English is supported through translation resources.

## V1 journeys

Employees authenticate, allocate multiple configurable codes to each date, safely draft, submit an ISO week, correct rejected weeks, review history, and report over week/month/year/custom ranges. Managers see only assigned employees, review complete week detail, approve, or reject with a reason. Admins manage user state, roles, manager assignments, date-versioned employment terms, codes, organization settings, and audit history.

The approval lifecycle is `draft → submitted → approved`, `submitted → rejected → submitted`, and `approved → reopened → submitted`. Unsupported transitions fail. Submitted/approved entries are locked.

## Acceptance priorities

Durations are positive integer minutes. Expected time is derived per date from effective employment terms. Codes are effective-dated, snapshots remain immutable, and totals are recomputed by trusted server code. Organization, active-user, role, and manager relationships are checked at every sensitive boundary.

Payslip generation, payroll/provider/accounting integration, leave balance accounting, expenses, billing, candidate migration, native apps, and complex notifications are excluded from V1.
