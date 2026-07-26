# Cloud Run deployment

The portal follows the same delivery shape as `debageri-web`: CI runs for branches and pull requests, every non-main branch receives a tagged zero-traffic preview revision, and every push to `main` automatically deploys production. The portal adds data-isolation controls because employee data is more sensitive than public website content.

The only cloud project is `debageri-portal`. Images live in its `debageri-portal` Artifact Registry repository and the Cloud Run service is named `debageri-portal`.

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

Firebase web values are public application configuration, but GitHub secrets keep build configuration consistent and avoid accidental logging. Do not add a Firebase Admin JSON key.

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

`portal-runtime` receives Firestore and Firebase Authentication roles. `portal-preview` deliberately receives no Firestore, Auth, Storage, or Secret Manager data roles. Do not grant Owner.

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

Every non-main branch triggers `.github/workflows/preview.yml`. It validates the full project, builds an immutable branch-tagged image, and deploys a tagged Cloud Run revision with zero production traffic.

Unlike the website previews, portal previews use:

- fictitious `debageri-portal-local` Firebase browser configuration;
- `portal-preview`, which has no employee-data permissions;
- `PORTAL_ENVIRONMENT=test`;
- no production Firebase rules deployment.

The preview is suitable for visual and interaction review, but login and production-backed workflows are intentionally unavailable. This prevents unreviewed branch code from reading or mutating employee data.

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

After the first deployment, map `portal.debageri.se` to the production service using a supported Cloud Run mapping or external HTTPS load balancer. Add the final domain to Firebase Authentication authorized domains and App Check. Preview tag URLs do not receive production Firebase/App Check configuration.

## Rollback

Route traffic to a known-good immutable Cloud Run revision, then investigate before redeploying. Rules/index changes require a reviewed rollback commit; do not weaken rules directly in the console.
