# Data model

Every organization-owned document has `organizationId`. Dates are `YYYY-MM-DD` in `Europe/Stockholm`; durations are integer minutes to avoid floating-point errors. Server timestamps provide audit chronology.

| Collection        | ID / purpose                                                                      | Write owner             | Reads                       |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------- | --------------------------- |
| `organizations`   | organization ID; locale, timezone, schedule defaults                              | admin service           | members                     |
| `users`           | Firebase UID; profile, role, active status, manager                               | admin service           | self/assigned manager/admin |
| `employmentTerms` | generated ID; user, effective range, percentage, weekly minutes, weekday schedule | admin service           | self/assigned manager/admin |
| `timeCodes`       | stable code ID; localized names, category, behavior, effective range              | admin service           | members                     |
| `timesheets`      | `{org}_{uid}_{isoYear}-W{ww}`; week state and trusted totals                      | trusted workflow        | self/assigned manager/admin |
| `timeEntries`     | generated ID; date allocation and immutable code snapshot                         | employee while editable | self/assigned manager/admin |
| `approvalEvents`  | generated; append-only transition history                                         | trusted workflow        | participants/admin          |
| `holidays`        | stable date/region ID                                                             | admin service           | members                     |
| `auditLogs`       | generated; immutable sensitive action record                                      | trusted services        | admin                       |

Weekly sheets are approval/state units; entries remain separate so one date can have multiple codes and date-range reporting stays queryable. Effective-dated terms preserve historical expected time. Code snapshots preserve historical meaning after a rename/deactivation. Approval events are append-only because current sheet fields are not history.

Entries duplicate ISO year/week, calendar year/month, and a UTC noon `dateTimestamp` for safe indexed queries. Snapshots contain code, localized-at-write name, category, and worked/expected flags. Used codes are deactivated, never deleted.

Indexes in `firestore.indexes.json` serve user date/week entry queries, user sheet history, manager status queues, and term lookup. Future `leaveBalances`, `payslips`, `employeeDocuments`, `projects`, and `reportSummaries` retain organization isolation and server ownership. The portal database is separate because candidate recruitment data has a different purpose, access population, retention policy, and threat boundary.
