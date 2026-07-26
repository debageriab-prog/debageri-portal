# Security

## Threat model and controls

Primary threats are cross-employee/organization access, manager overreach, privilege escalation, manipulated totals/transitions, stolen sessions, unsafe project selection, document disclosure, injection, excessive error detail, secrets leakage, and insider misuse.

Authentication uses revocation-checked server sessions; authorization combines active Firestore membership, organization, role, ownership, and manager assignment. Sensitive transitions/admin changes are server-only, schema validated, transactionally based on current state, and audited. Firestore/Storage rules deny by default. App Check must be enforced in production as defense in depth, not identity. Rate limits are recommended on session and mutation routes.

Use separate portal projects, least-privilege runtime/deployer service accounts, Workload Identity Federation for CI, Secret Manager, key rotation, and no downloaded runtime keys. Log correlation/action/outcome without comments, tokens, document contents, or unnecessary personal data. Monitor repeated authorization failures, mutation errors, and privileged changes.

Enable Firestore PITR where available plus tested scheduled exports to a portal-only, retention-controlled bucket. Define audit/document retention and deletion policies with the organization. Employee records are personal and potentially sensitive; minimize access and collection.

Security documentation is not a legal-compliance claim. Organizational/legal/privacy/payroll review is required for GDPR lawful basis, employee notice, access/erasure handling, retention, processor agreements, international transfers, audit access, payslip/document classification, backup deletion, union/employment rules, and incident response.
