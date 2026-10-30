# Cloud Run deployment

CI runs for branches and pull requests. Every non-main branch replaces the
stable development service connected only to the development Firebase project,
and every push to `main` automatically deploys production.

Production uses project and service `debageri-portal`. Branches use project and
service `debageri-portal-dev`. Each project has its own Firebase Web App,
Firestore database, Authentication users, Storage bucket, runtime identity, and
Artifact Registry images.

## GitHub repository secrets

Configure these under repository **Settings → Secrets and variables → Actions → Secrets**:

| Name                                                | Value                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GCP_PROJECT_ID`                                    | `debageri-portal`                                                                                            |
| `GCP_REGION`                                        | `europe-west1`                                                                                               |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`                    | Full provider name: `projects/NUMBER/locations/global/workloadIdentityPools/github/providers/github-actions` |
| `GCP_DEPLOYER_SERVICE_ACCOUNT`                      | GitHub deployer service-account email                                                                        |
| `GCP_RUNTIME_SERVICE_ACCOUNT`                       | `portal-runtime@debageri-portal.iam.gserviceaccount.com`                                                     |
| `GCP_PREVIEW_SERVICE_ACCOUNT`                       | `portal-preview@debageri-portal.iam.gserviceaccount.com`                                                     |
| `NEXT_PUBLIC_FIREBASE_API_KEY`                      | Firebase Web App API key                                                                                     |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`                  | Firebase Web App auth domain                                                                                 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`               | Firebase Web App Storage bucket                                                                              |
| `NEXT_PUBLIC_FIREBASE_APP_ID`                       | Firebase Web App ID                                                                                          |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`          | Firebase Web App sender ID                                                                                   |
| `NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` | App Check web provider site key                                                                              |
| `NEXT_PUBLIC_PORTAL_URL`                            | Production portal URL, normally `https://portal.debageri.se`                                                 |
| `REMINDER_CREDENTIAL_ENCRYPTION_KEY`                | Long random hex secret used to encrypt stored reminder SMTP passwords                                        |
| `REMINDER_CRON_SECRET`                              | Long random hex secret Cloud Scheduler sends to `/api/cron/reminders`                                        |

Development previews also require:

| Name                               | Value                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `DEV_GCP_PROJECT_ID`               | `debageri-portal-dev`                                                             |
| `DEV_GCP_REGION`                   | `europe-west1`                                                                    |
| `DEV_GCP_RUNTIME_SERVICE_ACCOUNT`  | `portal-dev-runtime@debageri-portal-dev.iam.gserviceaccount.com`                  |
| `DEV_FIREBASE_API_KEY`             | Development Firebase Web App API key                                              |
| `DEV_FIREBASE_AUTH_DOMAIN`         | Development Firebase Web App auth domain                                          |
| `DEV_FIREBASE_STORAGE_BUCKET`      | Development Firebase Web App Storage bucket                                       |
| `DEV_FIREBASE_APP_ID`              | Development Firebase Web App ID                                                   |
| `DEV_FIREBASE_MESSAGING_SENDER_ID` | Development Firebase Web App sender ID                                            |
| `DEV_FIREBASE_APP_CHECK_SITE_KEY`  | Development App Check reCAPTCHA v3 public site key                                |
| `DEV_REMINDER_ENCRYPTION_KEY`      | Development-only random encryption key; never reuse the production encryption key |
| `DEV_REMINDER_CRON_SECRET`         | Development-only scheduler secret; never reuse the production secret              |

Firebase web values are public application configuration, but GitHub secrets keep build configuration consistent and avoid accidental logging. Do not add a Firebase Admin JSON key.

Generate the reminder encryption key once and keep it stable:

```bash
openssl rand -hex 32
```

Changing or deleting this key makes previously saved SMTP passwords
undecryptable. After rotating it, an administrator must save the reminder
sender password again.

## Automatic reminders

The Auto Reminder tab only stores which reminders are enabled. They are sent by
a Cloud Scheduler job that calls `POST /api/cron/reminders` at 09:00 and 17:00
Stockholm time on weekdays. The endpoint works out which reminders are due, so
the job needs no changes when the options change. Without
`REMINDER_CRON_SECRET` it refuses every call.

Generate the secret with `openssl rand -hex 32`, save it as the
`REMINDER_CRON_SECRET` GitHub secret, deploy, and then create the job once:

```bash
gcloud scheduler jobs create http portal-auto-reminders \
  --project=debageri-portal \
  --location=europe-west1 \
  --schedule="0 9,17 * * 1-5" \
  --time-zone="Europe/Stockholm" \
  --http-method=POST \
  --uri="https://portal.debageri.se/api/cron/reminders" \
  --headers="Authorization=Bearer YOUR_SECRET" \
  --attempt-deadline=300s
```

Leave the job out of `debageri-portal-dev` unless you are testing reminders,
because it would email the development users.

The App Check site key setup, allowed domains, staged enforcement, and
verification procedure are documented in
[Firebase App Check and reCAPTCHA](recaptcha-app-check.md).

## Workload Identity Federation and IAM

Create a deployer service account and a Workload Identity Pool/Provider that trusts only `debageriab-prog/debageri-portal`. Bind the repository principal to the deployer with Workload Identity User.

Copy the provider name into the GitHub secret exactly as returned by:

```bash
gcloud iam workload-identity-pools providers describe github-actions \
  --project=debageri-portal \
  --location=global \
  --workload-identity-pool=github \
  --format='value(name)'
```

The value must include the numeric project number, pool, and provider. Do not prefix it with `//iam.googleapis.com/`, use a provider URL, or use only the pool name.

The deployer needs narrowly scoped permission to:

- push to the portal Artifact Registry repository;
- deploy/update the `debageri-portal` Cloud Run service;
- act as both `portal-runtime` and `portal-preview`;
- deploy Firestore rules/indexes and Storage rules;
- read required project/service metadata.

`portal-runtime` receives Firestore, Firebase Authentication, and Storage Object
User roles. Storage access is needed for private employee avatar uploads and
downloads through authenticated portal API routes. `portal-preview`
deliberately receives no Firestore, Auth, Storage, or Secret Manager data roles.
Do not grant Owner.

For an existing environment created before avatar support, grant the new role
once from Google Cloud Shell:

```bash
gcloud projects add-iam-policy-binding debageri-portal \
  --member="serviceAccount:portal-runtime@debageri-portal.iam.gserviceaccount.com" \
  --role="roles/storage.objectUser" \
  --condition=None
```

New environments receive the same role automatically from
`scripts/setup-gcp-production.sh`.

## Continuous integration

`.github/workflows/ci.yml` runs for every pushed branch and pull request:

1. install dependencies;
2. validate the exact Firebase project alias;
3. formatting check;
4. lint;
5. strict type check;
6. unit tests;
7. Firestore emulator rule tests;
8. production build.

## Branch previews

Every non-main branch triggers `.github/workflows/preview.yml`. The workflow:

1. runs the complete CI suite against local test infrastructure;
2. refuses any cloud target except `debageri-portal-dev`;
3. deploys rules and indexes only to development;
4. builds an immutable development image;
5. deploys it to the stable `debageri-portal-dev` Cloud Run service.

All branches share the same stable URL and development database. The most
recent successful branch deployment replaces the previous development
revision. This avoids per-branch Authentication and reCAPTCHA domain changes.

Add the stable Cloud Run hostname once to development Firebase Authentication
authorized domains and to the development reCAPTCHA v3 key. Development uses
test accounts and sanitized data only.

The existing GitHub Workload Identity provider and deployer identity may be
reused, but that deployer receives deployment roles in the development project
and permission to act as `portal-dev-runtime`. The development runtime identity
has no roles in production.

## Main deployment

Every push or merged PR to `main` triggers `.github/workflows/deploy.yml`. A manual dispatch is also available. The workflow:

1. runs all CI gates again;
2. verifies `GCP_PROJECT_ID` equals exactly `debageri-portal`;
3. authenticates through GitHub OIDC/WIF;
4. deploys Firestore rules/indexes and Storage rules;
5. builds and pushes SHA and `latest` images;
6. deploys Cloud Run with `portal-runtime`;
7. routes 100% of production traffic to the latest healthy revision;
8. prints the service URL.

Cloud Run allows unauthenticated HTTP invocation because the login page and Firebase token exchange must be reachable. Application data remains protected by Firebase authentication, server authorization, IAM, and Security Rules.

## Custom domain

The production hostname is `portal.debageri.se`. Use the direct Cloud Run
domain-mapping setup documented in
[Portal custom domain](custom-domain.md). This matches the approach used by
`debageri-web`. The runbook includes Google Cloud, one.com DNS, managed TLS,
Firebase Authentication, browser API key, App Check, verification, and
troubleshooting steps.

## Backups

`scripts/setup-gcp-production.sh` enables production data protection once the
Firestore database and Firebase Storage bucket exist. It is safe to rerun and
skips anything that does not exist yet:

- Firestore point-in-time recovery (PITR), which keeps one-minute versions for
  the last 7 days;
- a daily Firestore backup kept for 7 days and a weekly backup (Sunday) kept
  for 14 weeks;
- Storage soft delete on the production bucket, so deleted or overwritten
  contract files, invoice attachments, and avatars stay recoverable for 30
  days.

Override `FIRESTORE_DATABASE`, `STORAGE_BUCKET`, `DAILY_BACKUP_RETENTION`,
`WEEKLY_BACKUP_RETENTION`, or `STORAGE_SOFT_DELETE_DURATION` in the environment
when the defaults do not apply. For an existing environment, rerun the script
from Google Cloud Shell and confirm the result:

```bash
gcloud firestore databases describe --database="(default)" \
  --project=debageri-portal --format="value(pointInTimeRecoveryEnablement)"
gcloud firestore backups schedules list --database="(default)" \
  --project=debageri-portal
gcloud storage buckets describe gs://debageri-portal.firebasestorage.app \
  --format="value(soft_delete_policy)"
```

Restores always create a new database, so live data is never overwritten.
Restore a scheduled backup, or clone the database as it was at a point within
the PITR window:

```bash
gcloud firestore backups list --project=debageri-portal
gcloud firestore databases restore --project=debageri-portal \
  --source-backup=projects/debageri-portal/locations/LOCATION/backups/BACKUP_ID \
  --destination-database=restore-YYYYMMDD
gcloud firestore databases clone --project=debageri-portal \
  --source-database="projects/debageri-portal/databases/(default)" \
  --snapshot-time=2026-01-31T12:00:00Z \
  --destination-database=restore-YYYYMMDD
```

Verify the restored database, then copy back only the affected documents or
switch over deliberately. Delete temporary restore databases afterwards because
they are billed. Recover soft-deleted Storage objects with
`gcloud storage ls --soft-deleted gs://BUCKET/**` and
`gcloud storage restore gs://BUCKET/OBJECT#GENERATION`.

Firestore backups do not include Firebase Authentication users. Administrators
can recreate accounts, and `firebase auth:export` may be run occasionally into
private, retention-controlled storage; the export contains password hashes and
must never be committed. Test a restore at least once before relying on these
backups. Backup retention must also be covered by the privacy and deletion
policies in [Privacy and data handling](privacy-and-data-handling.md).

## Rollback

For production, route traffic to a known-good immutable Cloud Run revision,
then investigate before redeploying. Rules/index changes require a reviewed
rollback commit; do not weaken rules directly in the console. Development is
disposable and can be redeployed from `main` or reset from sanitized fixtures.
