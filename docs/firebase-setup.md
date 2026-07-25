# Firebase setup

Create distinct GCP/Firebase projects for development and production. Enable Authentication (email/password), Firestore in a Swedish/EU-compatible chosen region, Storage, App Check, Secret Manager, Artifact Registry, Cloud Run, Logging/Error Reporting, and required APIs. Region and data residency require organizational review.

Register a separate portal web app in each project. Populate environment-specific web values and expected/admin project IDs. Create a least-privilege Cloud Run runtime identity and use Application Default Credentials. Configure custom domain `portal.debageri.se`, authorized Auth domains, App Check provider/enforcement, budgets, alerts, backups, and retention.

Deploy rules/indexes only after `npm run test:rules`. Create initial admin Auth user deliberately, write matching active Firestore user, then set coarse custom claims from a trusted one-time admin process. Never download/commit service-account keys or create users in the website project.
