# Privacy and data handling

Collect only employment and time data needed for defined internal purposes. Candidate records remain in the website environment and are not copied automatically. Access follows self/assigned-manager/admin need, sensitive changes are audited, and employee documents remain private.

Do not log entry comments, document bodies, tokens, passwords, secrets, or unnecessary employee attributes. Define retention/deletion schedules for entries, audit logs, Auth users, documents, logs, exports, and backups. Provide processes for access/correction/deletion requests and manager changes.

Before production, obtain organizational privacy/legal review covering lawful basis, transparency, retention, processor terms, residency/transfers, data-subject requests, workplace monitoring implications, security incidents, payroll dependencies, and backup erasure. This implementation alone does not establish GDPR compliance.

AI integration is off by default and is enabled per section by an admin under
Administration → AI integration. Provider API keys are stored AES-GCM
encrypted with `REMINDER_CREDENTIAL_ENCRYPTION_KEY` and never returned to the
browser. A finance attachment is sent to the selected provider (Anthropic or
OpenAI) only when an admin or accountant clicks "Process attachment with AI",
together with the organization's category names and consultant display names
(and, for new invoices, customer names) so the provider can pick the category,
consultant and customer named in the file;
the response only pre-fills the form and nothing is stored until the person
posts the transaction. Review the provider's data-processing terms before
enabling it.

Admins can list accounting email addresses under Administration → Organization
→ Accounting. After an income or expense, invoice or VAT payment is saved, the
person saving it is asked whether to email it; only on yes are the record's
details, including the internal note, and its attachments sent to the chosen
addresses with the organization's SMTP settings. Each send is recorded in the
audit log.
