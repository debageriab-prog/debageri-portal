# Production deployment

The portal runs as a standalone Next.js container on Cloud Run in `debageri-portal-prod`. Images are stored in the production project's Artifact Registry. Firebase Auth, Firestore, Storage, rules, logs, IAM, and backups belong to the same portal production project and are never shared with `debageri-web`.

## GitHub production environment

Create a GitHub Environment named `production` and require reviewer approval. Configure:

### Environment secrets

| Name                                                | Value                                         |
| --------------------------------------------------- | --------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`                    | Full Workload Identity Provider resource name |
| `GCP_DEPLOYER_SERVICE_ACCOUNT`                      | GitHub deployer service-account email         |
| `NEXT_PUBLIC_FIREBASE_API_KEY`                      | Firebase Web App API key                      |
| `NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` | App Check web provider site key               |

### Environment variables

| Name                                       | Value                                                         |
| ------------------------------------------ | ------------------------------------------------------------- |
| `GCP_RUNTIME_SERVICE_ACCOUNT`              | `portal-runtime@debageri-portal-prod.iam.gserviceaccount.com` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Value from the production Firebase Web App                    |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | Value from the production Firebase Web App                    |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | Value from the production Firebase Web App                    |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Value from the production Firebase Web App                    |

## Workload Identity Federation

Create a production deployer service account and a Workload Identity Pool/Provider that trusts only `debageriab-prog/debageri-portal`. Bind the repository principal to the deployer service account with Workload Identity User. Do not create a service-account key.

The deployer needs narrowly scoped ability to:

- push images to the `debageri-portal` Artifact Registry repository;
- deploy/update the `debageri-portal` Cloud Run service;
- act as the `portal-runtime` service account;
- deploy Firestore indexes/rules and Storage rules;
- read enabled-service/project metadata needed by the deployment tools.

Use resource-level roles where available. Do not grant Owner.

## Deploy

1. Merge reviewed changes to `main`.
2. Open GitHub Actions → **Deploy production**.
3. Select **Run workflow**.
4. Approve the protected `production` environment.

The workflow:

1. installs dependencies;
2. validates the exact Firebase alias/project;
3. runs formatting, lint, strict type checking, unit tests, emulator rule tests, and production build;
4. authenticates to GCP with short-lived GitHub OIDC credentials;
5. deploys Firestore rules/indexes and Storage rules;
6. builds and pushes an immutable image tagged with the commit SHA;
7. deploys Cloud Run using the dedicated runtime identity.

Cloud Run allows unauthenticated HTTP access because the login page and Firebase token exchange must be reachable; application data access remains protected by Firebase authentication, server authorization, and Security Rules.

## Custom domain

After the first Cloud Run deployment succeeds, map `portal.debageri.se` using a supported Cloud Run domain mapping or an external HTTPS load balancer. Add the final domain to Firebase Authentication authorized domains and the App Check configuration. Verify TLS, login, session cookies, rules, and authorization before inviting employees.

## Rollback

Cloud Run revisions are immutable. Route traffic back to a known-good revision in Cloud Run, then investigate before redeploying. Rules/index changes require their own reviewed rollback commit; do not weaken rules directly in the console.
