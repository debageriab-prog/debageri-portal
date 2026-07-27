# Product requirements

Debageri Portal is an employee platform, initially centered on time reporting but designed for profile data, leave, payslips, documents, and internal services. Swedish is default and English is supported through translation resources.

## V1 journeys

Consultants authenticate, allocate multiple configurable codes to each date,
safely submit an ISO week, correct rejected weeks, and review history. Managers
always review consultant reports and may optionally have their own
time-reporting capability. Admins review consultant reports plus reports from
time-reporting managers and manage users, terms, codes, organization settings,
and audit history. Accountants have read-only access to consultant time reports.

The approval lifecycle is `draft → submitted → approved`, `submitted → rejected → submitted`, and `approved → reopened → submitted`. Unsupported transitions fail. Submitted/approved entries are locked.

## Acceptance priorities

Durations are positive integer minutes. Every eligible weekday expects eight reported hours, classified across work and absence codes. Codes are effective-dated, snapshots remain immutable, and totals are recomputed by trusted server code. Organization, active-user, role, and manager relationships are checked at every sensitive boundary.

Payslip generation, payroll/provider/accounting integration, leave balance accounting, expenses, billing, candidate migration, native apps, and complex notifications are excluded from V1.
