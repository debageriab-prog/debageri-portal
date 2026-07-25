# Infrastructure isolation

`debageri-web` owns public pages, candidate applications, résumés, recruitment documents, and any website identity. Debageri Portal owns employee identities, terms, entries, approvals, leave, future payslips/documents, audit records, and all supporting infrastructure.

Development and production use separate projects: expected IDs are `debageri-portal-dev` and `debageri-portal-prod` (adjust only if unavailable, consistently in safeguards/docs). They have separate Auth, Firestore, Storage, functions/Cloud Run, service accounts, IAM, secrets, App Check, logs, backups, CI environments, and billing/alerts. Nothing connects to `debageri-web-prod`; no credentials, exports, users, buckets, functions, or candidate records are reused.

`.firebaserc` contains named portal aliases. Deployment scripts explicitly select one alias, display it, and reject missing, non-portal, or `debageri-web*` targets. Startup environment validation requires public/admin/expected IDs to match, refuses website IDs, refuses production locally, and requires a portal production ID in production. CI runs the same safeguard and never deploys.

Grant runtime identities only necessary Firestore/Auth/Storage/secret/log access; grant deployers only environment-specific deployment roles through Workload Identity Federation. Do not grant Owner or store JSON keys. Separate GitHub environments and approvals for production.

Brand tokens, reviewed components, and public logo assets may be recreated/copied with provenance. Data access modules and Firebase configuration must not be shared. Candidate-to-employee onboarding is a deliberate admin workflow that creates a new portal account from verified employment data; it is not a database migration or account link.
