# Off-site backups

The protections in [Deployment → Backups](deployment.md#backups) (Firestore
PITR, scheduled Firestore backups, Storage soft delete) all live inside the
production project. They recover from mistakes, but not from losing the
project itself: a deleted or compromised `debageri-portal` project takes its
backups and soft-deleted files with it.

Off-site backups close that gap. Every night, a copy of the Storage bucket and
a Firestore export are written to a separate project, `debageri-portal-backup`,
in a different EU region. Nothing in production can delete them.

| What                                     | Where                                   | Kept                                                              |
| ---------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| Files (contracts, payslips, attachments) | `gs://debageri-portal-backup-files`     | Mirror of production; deleted or overwritten versions for 90 days |
| Firestore export                         | `gs://debageri-portal-backup-firestore` | 90 days; cannot be deleted during the first 30 days               |

Firebase Authentication users are not included. Administrators recreate
accounts after a restore.

## When to run this

Run the steps below once when setting up production, and again whenever the
production project, its Storage bucket, or its Firestore database is
recreated. Each step is safe to rerun; commands that already succeeded fail
with "already exists" and can be skipped. Run everything from Google Cloud
Shell as an owner of both projects.

## 1. Variables

Choose an EU region different from the production bucket's location:

```bash
gcloud storage buckets describe gs://debageri-portal.firebasestorage.app --format="value(location)"
```

Set these in every new Cloud Shell session before running later steps:

```bash
PROD=debageri-portal
BACKUP=debageri-portal-backup
REGION=europe-north1
SCHEDULER_REGION=europe-west1
SOURCE=gs://debageri-portal.firebasestorage.app
FILES=gs://debageri-portal-backup-files
FSX=gs://debageri-portal-backup-firestore
```

## 2. Backup project and buckets

Find the billing account ID with `gcloud billing accounts list` (the
`ACCOUNT_ID` column), or reuse production's with
`gcloud billing projects describe debageri-portal --format="value(billingAccountName)"`.

```bash
gcloud projects create $BACKUP
gcloud billing projects link $BACKUP --billing-account=BILLING_ID
gcloud services enable storagetransfer.googleapis.com cloudresourcemanager.googleapis.com --project=$BACKUP

gcloud storage buckets create $FILES $FSX --project=$BACKUP --location=$REGION \
  --default-storage-class=NEARLINE --uniform-bucket-level-access --public-access-prevention
```

Retention: versioning keeps replaced and deleted files for 90 days; the export
bucket refuses deletion for 30 days and expires exports after 90.

```bash
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"isLive":false,"daysSinceNoncurrentTime":90}}]}' > files-lc.json
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":90}}]}' > fs-lc.json

gcloud storage buckets update $FILES --versioning --soft-delete-duration=30d --lifecycle-file=files-lc.json
gcloud storage buckets update $FSX --retention-period=30d --lifecycle-file=fs-lc.json
```

## 3. Nightly file copy (Storage Transfer Service)

The transfer service account is only created the first time the API is asked
for it, so request it before granting roles. Without the
`x-goog-user-project` header the call fails with a quota-project error.

```bash
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "x-goog-user-project: $BACKUP" \
  "https://storagetransfer.googleapis.com/v1/googleServiceAccounts/$BACKUP"

gcloud transfer authorize --add-missing --project=$BACKUP

BACKUP_NUM=$(gcloud projects describe $BACKUP --format="value(projectNumber)")
STS="serviceAccount:project-${BACKUP_NUM}@storage-transfer-service.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding $SOURCE --member=$STS --role=roles/storage.objectViewer
gcloud storage buckets add-iam-policy-binding $SOURCE --member=$STS --role=roles/storage.legacyBucketReader
```

Create the job. `--delete-from=destination-if-unique` mirrors deletions, so a
file deleted in production becomes a noncurrent version in the backup and is
purged after 90 days instead of being kept forever. Failure logging feeds the
alert in step 6.

```bash
gcloud transfer jobs create $SOURCE $FILES --project=$BACKUP \
  --schedule-repeats-every=1d --schedule-starts=$(date -u -d tomorrow +%Y-%m-%dT01:00:00Z) \
  --overwrite-when=different --delete-from=destination-if-unique \
  --log-actions=find,copy,delete --log-action-states=failed \
  --description="Nightly copy of portal files"
```

## 4. Nightly Firestore export

```bash
gcloud services enable cloudscheduler.googleapis.com --project=$PROD

PROD_NUM=$(gcloud projects describe $PROD --format="value(projectNumber)")
FS_AGENT="serviceAccount:service-${PROD_NUM}@gcp-sa-firestore.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding $FSX --member=$FS_AGENT --role=roles/storage.objectAdmin
gcloud storage buckets add-iam-policy-binding $FSX --member=$FS_AGENT --role=roles/storage.legacyBucketReader

gcloud iam service-accounts create firestore-exporter --project=$PROD
gcloud projects add-iam-policy-binding $PROD \
  --member=serviceAccount:firestore-exporter@$PROD.iam.gserviceaccount.com \
  --role=roles/datastore.importExportAdmin

gcloud scheduler jobs create http firestore-nightly-export --project=$PROD --location=$SCHEDULER_REGION \
  --schedule="0 3 * * *" --time-zone="Europe/Stockholm" --http-method=POST \
  --uri="https://firestore.googleapis.com/v1/projects/$PROD/databases/(default):exportDocuments" \
  --headers=Content-Type=application/json \
  --message-body="{\"outputUriPrefix\":\"$FSX\"}" \
  --oauth-service-account-email=firestore-exporter@$PROD.iam.gserviceaccount.com
```

Each export lands in its own timestamped folder.

## 5. Access

Only the company owner, with 2-step verification, holds Owner on
`debageri-portal-backup`. The production runtime, preview and GitHub deploy
identities get no role there. After a few weeks of successful runs, the export
bucket's retention can be locked with
`gcloud storage buckets update $FSX --lock-retention-period`. The lock is
permanent and cannot be shortened, so only do it once 30 days is settled.

## 6. Failure alerts

Notification channels belong to a project, so create an email channel in both
projects under **Monitoring → Alerting → Edit notification channels → Email**.

Then, in each project, open **Logging → Logs Explorer**, paste the query, and
choose **Actions → Create log alert** with 1 hour between notifications and
7-day autoclose:

| Project                  | Alert name                      | Query                                                                                                   |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `debageri-portal-backup` | Backup file transfer failed     | `resource.type="storage_transfer_job" severity>=ERROR`                                                  |
| `debageri-portal`        | Firestore nightly export failed | `resource.type="cloud_scheduler_job" resource.labels.job_id="firestore-nightly-export" severity>=ERROR` |

These alerts do not fire when a job never runs (deleted or paused), and the
Scheduler alert only sees whether the export started. Check monthly that the
newest backups are from last night:

```bash
gcloud storage ls gs://debageri-portal-backup-firestore/ | tail -3
gcloud transfer operations list --project=debageri-portal-backup --limit=3 \
  --format="table(name,metadata.status,metadata.endTime)"
```

## 7. Verify and test a restore

Run both jobs once instead of waiting for the night:

```bash
gcloud transfer jobs list --project=$BACKUP --format="value(name)"
gcloud transfer jobs run transferJobs/JOB_ID --project=$BACKUP
gcloud scheduler jobs run firestore-nightly-export --project=$PROD --location=$SCHEDULER_REGION
```

Restore a single file by copying it back, picking an older version with
`gcloud storage ls --all-versions` when needed:

```bash
gcloud storage cp "$FILES/PATH#GENERATION" "$SOURCE/PATH"
```

Restore Firestore into a new, temporary database, check it, then copy back only
the affected documents and delete the temporary database:

```bash
gcloud firestore databases create --database=restore-test --location=LOCATION --project=$PROD
gcloud firestore import $FSX/EXPORT_FOLDER --database=restore-test --project=$PROD
gcloud firestore databases delete --database=restore-test --project=$PROD
```

Test a restore at least once after setup.

## Retention and privacy

The bookkeeping law's seven-year retention applies to the records in
production, which the app never hard-deletes; backups only cover recovery.
Personal data deleted in production therefore remains in off-site backups for
up to 90 days, which [Privacy and data handling](privacy-and-data-handling.md)
records. Nearline storage costs about €0.01 per GB per month.
