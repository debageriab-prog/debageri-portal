# Infrastructure isolation

`debageri-web` owns public pages, candidate applications, résumés, recruitment documents, and any website identity. Debageri Portal owns employee identities, terms, entries, approvals, leave, future payslips/documents, audit records, and all supporting infrastructure.

The portal uses local Firebase emulators, the isolated cloud development
project `debageri-portal-dev`, and the production project `debageri-portal`.
The local ID `debageri-portal-local` is deliberately fictitious and must never
resolve to a cloud project. Development and production each have their own
Auth, Firestore, Storage, Cloud Run service, runtime identity, secrets, App
Check configuration, and data. Nothing connects to `debageri-web-prod`; no
credentials, exports, users, buckets, functions, or candidate records are
reused.

`.firebaserc` contains explicit `dev` and `prod` aliases and intentionally has
no default. Startup validation requires public/admin/expected IDs to match,
refuses website IDs, requires the fictitious local ID plus emulators in local
mode, and requires the exact environment-specific cloud project without
emulators.

All branches deploy to one stable development Cloud Run service and share only
sanitized development data. The latest successful branch deployment replaces
the previous development revision. Branch workflows refuse the production
project ID.

Grant the runtime identity only necessary Firestore and Firebase Authentication access; add bucket-scoped Storage permissions only when document workflows are implemented. Grant the GitHub deployer only production deployment roles through Workload Identity Federation. Do not grant Owner or store JSON keys. Protect the GitHub `production` environment with required reviewers.

Brand tokens, reviewed components, and public logo assets may be recreated/copied with provenance. Data access modules and Firebase configuration must not be shared. Candidate-to-employee onboarding is a deliberate admin workflow that creates a new portal account from verified employment data; it is not a database migration or account link.
