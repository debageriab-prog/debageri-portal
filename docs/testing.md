# Testing

Vitest covers ISO week boundaries, Monday–Sunday generation, duration parse/format, effective employment terms/overlap, state transitions, entry validity, trusted totals, multiple codes per date, manager/organization authorization, report aggregation, and project isolation.

`npm run test:rules` starts the Firestore emulator and proves employee/manager read isolation plus denial of direct approvals. Storage rules deny all writes and restrict future reads; add emulator Storage tests when the document workflow is enabled. Full browser E2E should be added against seeded emulators before launch to cover authentication and all employee/manager/admin workflows.

CI runs formatting, lint, type checking, unit tests, rule tests, and production build. A command is reported as passing only when executed successfully.
