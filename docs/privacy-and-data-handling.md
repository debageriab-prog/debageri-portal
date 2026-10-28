# Privacy and data handling

Collect only employment and time data needed for defined internal purposes. Candidate records remain in the website environment and are not copied automatically. Access follows self/assigned-manager/admin need, sensitive changes are audited, and employee documents remain private.

Do not log entry comments, document bodies, tokens, passwords, secrets, or unnecessary employee attributes. Define retention/deletion schedules for entries, audit logs, Auth users, documents, logs, exports, and backups. Provide processes for access/correction/deletion requests and manager changes.

Before production, obtain organizational privacy/legal review covering lawful basis, transparency, retention, processor terms, residency/transfers, data-subject requests, workplace monitoring implications, security incidents, payroll dependencies, and backup erasure. This implementation alone does not establish GDPR compliance.

AI integration is off by default and is enabled per section by an admin under
Administration → AI integration. Provider API keys are stored AES-GCM
encrypted with `REMINDER_CREDENTIAL_ENCRYPTION_KEY` and never returned to the
browser. A finance attachment is sent to the selected provider (Anthropic or
OpenAI) only when an admin or accountant clicks "Process attachment with AI";
the response only pre-fills the form and nothing is stored until the person
posts the transaction. Review the provider's data-processing terms before
enabling it.
