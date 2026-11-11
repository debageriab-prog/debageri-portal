# Core architecture decisions

## 001: Separate website and portal cloud projects

Accepted. Recruitment and employee data have different users, purposes, retention, and risk; no production infrastructure is shared.

## 002: Local emulators plus isolated development and production projects

Superseded. Local work uses the Firebase Emulator Suite and fictitious project
ID `debageri-portal-local`. Feature branches use `debageri-portal-dev`, while
`main` alone uses `debageri-portal`. Development and production data, runtime
identities, Firebase applications, and secrets remain isolated.

## 003: Firestore as primary database

Accepted. It matches the Firebase stack, query patterns, emulator support, and current scale. No SQL requirement exists.

## 004: Weekly timesheet as approval unit

Accepted. One deterministic ISO-week document provides clear locking, totals, versioning, and manager workflow.

## 005: Integer minutes

Accepted. Integer arithmetic is exact, auditable, and maps to employment schedules; floating-point hours are prohibited.

## 006: Top-level time entries

Accepted. Date/user/week queries and future reporting are simpler than nested per-sheet entries; organization/user constraints remain mandatory.

## 007: Immutable time-code snapshots

Accepted. Historical reports retain the code meaning used at entry time after configuration changes.

## 008: Server-controlled approvals

Accepted. Trusted code verifies current state, authorization, manager assignment, totals, transitions, and atomic events; rules deny direct writes.

## 009: Standard 40-hour reporting

Accepted. Every eligible weekday expects eight classified hours. Employment and reporting dates live on the user, and submitted timesheets preserve historical expected totals.

## 010: Separate Authentication user base

Accepted. Employees are deliberately onboarded and never mixed or automatically linked with candidates/public users.

## 011: Separate private employee Storage

Accepted. Employee documents use portal-only buckets and private organization/employee paths; website résumé storage is never reused.

## 012: Access profiles decide permissions

Accepted. Roles remain and say who someone is. Permissions come from one admin-defined access profile per user, resolved on each request, so access can be tuned per person without code changes. Administration stays admin-only. There is no fallback: a non-admin without a valid profile has no access, so a mistake closes access rather than opening it. Consultant profiles can only grant a person's own data.

## 013: Payroll details kept apart from users

Accepted. Personnummer, address and tax details are needed for payslips and tax deductions but are more sensitive than the rest of a profile. They are stored in a server-only `payrollProfiles` collection instead of the user document, which its owner can read, and audit entries name the changed fields without their values. Tax tables are imported from Skatteverket per organization and year, so a payslip is always worked out from the tables that applied when it was made.

## 014: Requests follow the receipt review pattern

Accepted. Requests for equipment, education, seminars and travel are their own server-only collection, with a status table in `src/domain/requests.ts` that only trusted code applies (see 008). Each request type has its own permission, so access can be given per type. A finalized request is not posted to the ledger by itself. A reviewer with ledger access turns it into an ordinary expense, as receipts do, so finance stays the only writer of transactions.

## 015: Equipment receipts are accepted in the portal

Accepted. When company equipment is handed to someone, the recipient accepts the receipt in the portal instead of signing paper. Acceptance is only possible for the signed-in recipient, after ticking a confirmation, giving the place and signing, either by drawing in a box or by typing their name, shown in a handwriting-style font. The browser sends the signature as a PNG; the server only accepts a well-formed image with some ink on it, stores it, and prints it on the PDF above the line that records the electronic acceptance. The time, place, language and signature method are recorded in a server-only `assetHandovers` document, and the signed PDF is generated once and stored so it never changes. The receipt keeps a snapshot of the equipment and company details from when it was issued. A hand-signed scan can be added when a paper signature is also needed. Personnummer is not copied onto the receipt; it is read from `payrollProfiles` when the PDF is made, only if the issuer chose to print it (see 013). As with requests (see 014), buying or selling equipment never posts to the ledger by itself; someone with ledger access turns it into an ordinary transaction.
