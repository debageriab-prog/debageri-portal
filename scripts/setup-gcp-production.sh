#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-debageri-portal-prod}"
REGION="${REGION:-europe-west1}"
REPOSITORY="${REPOSITORY:-debageri-portal}"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-portal-runtime}"

if [[ "$PROJECT_ID" != "debageri-portal-prod" ]]; then
  echo "Refusing unexpected project: $PROJECT_ID" >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  artifactregistry.googleapis.com \
  firebase.googleapis.com \
  firestore.googleapis.com \
  iamcredentials.googleapis.com \
  identitytoolkit.googleapis.com \
  run.googleapis.com \
  securetoken.googleapis.com \
  sts.googleapis.com

if ! gcloud artifacts repositories describe "$REPOSITORY" \
  --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPOSITORY" \
    --repository-format docker \
    --location "$REGION" \
    --description "Debageri Portal production images"
fi

RUNTIME_EMAIL="${RUNTIME_SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$RUNTIME_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUNTIME_SERVICE_ACCOUNT" \
    --display-name "Debageri Portal Cloud Run runtime"
fi

for role in roles/datastore.user roles/firebaseauth.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${RUNTIME_EMAIL}" \
    --role "$role" \
    --condition=None >/dev/null
done

echo "Base production resources are ready."
echo "Runtime identity: $RUNTIME_EMAIL"
echo "Next: configure Firebase products, GitHub WIF, repository environment values, and run Deploy production."
