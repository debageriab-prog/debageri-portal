# Firebase production setup

The portal has no separate cloud development environment. Local development uses Firebase emulators with project ID `debageri-portal-local`; the only real Firebase/GCP project is `debageri-portal`.

## 1. Create the project

In Firebase Console, create `debageri-portal` and attach a billing account. If that globally unique ID is unavailable, stop and update `.firebaserc`, project validation, workflow configuration, tests, and documentation before creating a differently named project. Never select or add Firebase resources to a `debageri-web*` project.

Choose the Firestore and Storage locations only after confirming data-residency, latency, backup, and organizational requirements. Locations cannot be casually changed later.

## 2. Enable Firebase products

In the production project:

1. Register a Web App named **Debageri Portal**.
2. Enable Authentication → Email/Password.
3. Create the default Firestore database in production mode.
4. Create the default Cloud Storage bucket.
5. Configure App Check for the portal domain. Start with monitoring, validate legitimate traffic, then enforce it before launch.
6. Add `portal.debageri.se` and the Cloud Run URL to Firebase Authentication authorized domains.

Record the Web App values for GitHub configuration. Firebase web configuration is public application identification, but it must still point only to the production portal project.

## 3. Create base GCP resources

From Google Cloud Shell:

```bash
git clone https://github.com/debageriab-prog/debageri-portal.git
cd debageri-portal
git checkout main
PROJECT_ID=debageri-portal bash scripts/setup-gcp-production.sh
```

The script validates the exact project ID, enables required APIs, creates the `europe-west1` Artifact Registry repository, creates `portal-runtime@debageri-portal.iam.gserviceaccount.com` with Firestore/Auth access, and creates `portal-preview@debageri-portal.iam.gserviceaccount.com` without production-data roles.

Do not generate a JSON key. Cloud Run uses its attached service identity and Application Default Credentials.

## 4. Deploy Firebase configuration

Before the first application deployment:

```bash
npm ci
npm run check:project
npm run test:rules
npm run deploy
```

This deploys only resources declared in `firebase.json`: Firestore rules/indexes and Storage rules. The repository has no default Firebase alias, so an unqualified deployment cannot silently select production.

## 5. Create the first administrator

Create the Auth user deliberately in Firebase Authentication. Use its Firebase UID as `users/{uid}` and create:

```json
{
  "organizationId": "debageri",
  "employeeNumber": "DB-001",
  "email": "admin@example.com",
  "displayName": "Portal Administrator",
  "role": "admin",
  "status": "active",
  "managerId": null,
  "timezone": "Europe/Stockholm",
  "locale": "sv-SE"
}
```

Create `organizations/debageri` using the model in `docs/data-model.md`. Production onboarding must use real reviewed values, not the emulator seed or its password.

## 6. Production controls

Configure budgets and alerts, Firestore point-in-time recovery or scheduled exports, log-based alerts, retention, App Check enforcement, custom domain/TLS, an incident contact, and periodic access review. Complete security, privacy, employment, payroll, retention, and GDPR review before launch.
