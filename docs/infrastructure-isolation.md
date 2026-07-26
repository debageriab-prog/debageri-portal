# Infrastructure isolation

`debageri-web` owns public pages, candidate applications, résumés, recruitment documents, and any website identity. Debageri Portal owns employee identities, terms, entries, approvals, leave, future payslips/documents, audit records, and all supporting infrastructure.

The portal uses local Firebase emulators for development and one cloud project, `debageri-portal`. The local ID `debageri-portal-local` is deliberately fictitious and must never resolve to a cloud project. The cloud project has its own Auth, Firestore, Storage, Cloud Run service, service accounts, IAM, secrets, App Check, logs, backups, CI environment, and billing/alerts. Nothing connects to `debageri-web-prod`; no credentials, exports, users, buckets, functions, or candidate records are reused.

`.firebaserc` contains only the `portal` deployment alias and intentionally has no default. Deployment scripts explicitly select it, display it, and require the exact project ID `debageri-portal`. Startup validation requires public/admin/expected IDs to match, refuses website IDs, requires the fictitious local ID plus emulators in local mode, requires the exact cloud ID in production, and refuses emulators in production.

Branch previews follow the website's tagged, zero-traffic Cloud Run revision pattern but intentionally use `portal-preview`, which has no Firestore or Firebase Authentication roles, plus fictitious Firebase browser configuration. This preserves visual preview deployments without granting unreviewed branch code access to employee production data.

Grant the runtime identity only necessary Firestore and Firebase Authentication access; add bucket-scoped Storage permissions only when document workflows are implemented. Grant the GitHub deployer only production deployment roles through Workload Identity Federation. Do not grant Owner or store JSON keys. Protect the GitHub `production` environment with required reviewers.

Brand tokens, reviewed components, and public logo assets may be recreated/copied with provenance. Data access modules and Firebase configuration must not be shared. Candidate-to-employee onboarding is a deliberate admin workflow that creates a new portal account from verified employment data; it is not a database migration or account link.
