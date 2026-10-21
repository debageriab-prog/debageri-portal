#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-debageri-portal}"
REGION="${REGION:-europe-west1}"
REPOSITORY="${REPOSITORY:-debageri-portal}"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-portal-runtime}"
PREVIEW_SERVICE_ACCOUNT="${PREVIEW_SERVICE_ACCOUNT:-portal-preview}"
FIRESTORE_DATABASE="${FIRESTORE_DATABASE:-(default)}"
STORAGE_BUCKET="${STORAGE_BUCKET:-${PROJECT_ID}.firebasestorage.app}"
DAILY_BACKUP_RETENTION="${DAILY_BACKUP_RETENTION:-7d}"
WEEKLY_BACKUP_RETENTION="${WEEKLY_BACKUP_RETENTION:-14w}"
STORAGE_SOFT_DELETE_DURATION="${STORAGE_SOFT_DELETE_DURATION:-30d}"

if [[ "$PROJECT_ID" != "debageri-portal" ]]; then
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

for role in roles/datastore.user roles/firebaseauth.admin roles/storage.objectUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${RUNTIME_EMAIL}" \
    --role "$role" \
    --condition=None >/dev/null
done

PREVIEW_EMAIL="${PREVIEW_SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$PREVIEW_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$PREVIEW_SERVICE_ACCOUNT" \
    --display-name "Debageri Portal branch preview (no data access)"
fi

# Backups run only once Firebase has created the database and bucket; rerun
# this script after configuring Firebase products to enable them.
BACKUPS_READY=true
if gcloud firestore databases describe --database "$FIRESTORE_DATABASE" >/dev/null 2>&1; then
  gcloud firestore databases update \
    --database "$FIRESTORE_DATABASE" \
    --enable-pitr >/dev/null
  SCHEDULES="$(gcloud firestore backups schedules list \
    --database "$FIRESTORE_DATABASE" --format json)"
  if ! grep -q '"dailyRecurrence"' <<<"$SCHEDULES"; then
    gcloud firestore backups schedules create \
      --database "$FIRESTORE_DATABASE" \
      --recurrence daily \
      --retention "$DAILY_BACKUP_RETENTION" >/dev/null
  fi
  if ! grep -q '"weeklyRecurrence"' <<<"$SCHEDULES"; then
    gcloud firestore backups schedules create \
      --database "$FIRESTORE_DATABASE" \
      --recurrence weekly \
      --day-of-week SUN \
      --retention "$WEEKLY_BACKUP_RETENTION" >/dev/null
  fi
else
  BACKUPS_READY=false
  echo "Firestore database $FIRESTORE_DATABASE not found; skipped PITR and backup schedules." >&2
fi

if gcloud storage buckets describe "gs://${STORAGE_BUCKET}" >/dev/null 2>&1; then
  gcloud storage buckets update "gs://${STORAGE_BUCKET}" \
    --soft-delete-duration "$STORAGE_SOFT_DELETE_DURATION" >/dev/null
else
  BACKUPS_READY=false
  echo "Storage bucket gs://${STORAGE_BUCKET} not found; skipped soft delete." >&2
fi

echo "Base production resources are ready."
echo "Runtime identity: $RUNTIME_EMAIL"
echo "Preview identity: $PREVIEW_EMAIL (intentionally has no Firebase data roles)"
if [[ "$BACKUPS_READY" == true ]]; then
  echo "Backups: Firestore PITR, daily ($DAILY_BACKUP_RETENTION) and weekly ($WEEKLY_BACKUP_RETENTION) backups, Storage soft delete ($STORAGE_SOFT_DELETE_DURATION)."
else
  echo "Backups: incomplete; rerun this script after configuring Firebase products."
fi
echo "Next: configure Firebase products, GitHub WIF, repository values, and push a branch."
