#!/usr/bin/env bash
# Enables TOTP (authenticator app) multi-factor sign-in for a portal project.
#
# Prerequisite (one time per project, in the Firebase Console):
#   Authentication > Settings > Upgrade to Firebase Authentication with
#   Identity Platform. TOTP MFA is only available after this upgrade.
#
# Usage: scripts/enable-totp-mfa.sh debageri-portal-dev
set -euo pipefail

PROJECT_ID="${1:-}"

if [[ "$PROJECT_ID" =~ ^debageri-web(-|$) ]]; then
  echo "Refusing to touch the public website project: $PROJECT_ID" >&2
  exit 1
fi
if [[ "$PROJECT_ID" != "debageri-portal-dev" && "$PROJECT_ID" != "debageri-portal" ]]; then
  echo "Usage: $0 debageri-portal-dev|debageri-portal" >&2
  exit 1
fi

TOKEN="$(gcloud auth print-access-token)"

curl --fail-with-body --silent --show-error \
  -X PATCH \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=mfa" \
  -d '{
    "mfa": {
      "state": "ENABLED",
      "providerConfigs": [
        { "state": "ENABLED", "totpProviderConfig": { "adjacentIntervals": 1 } }
      ]
    }
  }'
echo
echo "TOTP multi-factor sign-in is enabled for ${PROJECT_ID}."
echo "Set AUTH_REQUIRE_MFA=true on the Cloud Run service to make it mandatory."
