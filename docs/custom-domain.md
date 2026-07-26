# Portal custom domain

This runbook connects the production Cloud Run service to:

```text
https://portal.debageri.se
```

The domain is managed at one.com. The application runs in Google Cloud project
`debageri-portal`, region `europe-west1`, as Cloud Run service
`debageri-portal`.

## Architecture

Use a direct Cloud Run domain mapping, matching the setup used by
`debageri-web` for `debageri.se` and `www.debageri.se`.

Cloud Run direct domain mapping is currently a Preview feature. It is the
simplest option and keeps the portal consistent with the public site. Google
recommends an external Application Load Balancer for production workloads that
require a generally available domain-routing product.

## 1. Confirm ownership of `debageri.se`

Domain ownership was already verified when the `debageri-web` custom domain was
configured. Google associates verification with the Google account that
completed it.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select project `debageri-portal`.
3. Open **Cloud Run**, then **Domain mappings**.
4. Click **Add mapping** and select production service `debageri-portal`.
5. Choose the already verified base domain `debageri.se`.

If `debageri.se` is not available:

1. Choose **Verify a new domain** and enter `debageri.se`.
2. Google provides a TXT verification record.
3. In one.com, open **DNS settings**, then **DNS records**.
4. Add the TXT record. Leave **Hostname** empty because verification applies to
   the root domain.
5. Return to Google Cloud and finish verification.

Do not remove the existing verification TXT record. A verification TXT record
does not route website traffic and does not interfere with the public website
or email.

## 2. Create the portal domain mapping

In the Cloud Run domain-mapping form:

1. Select production service `debageri-portal`.
2. Select verified domain `debageri.se`.
3. Enter only `portal` in the subdomain field.
4. Confirm that the resulting hostname is `portal.debageri.se`.
5. Create the mapping.

If the console rejects the valid subdomain, open Cloud Shell and run:

```bash
gcloud config set project debageri-portal
gcloud beta run domain-mappings create \
  --service debageri-portal \
  --domain portal.debageri.se \
  --region europe-west1
```

Never map the hostname to a branch preview revision. The mapping must target
the production `debageri-portal` service.

## 3. Add the CNAME at one.com

Cloud Run displays the required DNS record after creating the mapping. Open the
mapping's three-dot menu and select **DNS Records**.

In one.com:

1. Open **DNS settings** under **Advanced settings**.
2. Open **DNS records**.
3. Check for an existing `portal` A, AAAA, CNAME, web-forward, or web-alias
   record. Remove it only if it is not used by another service.
4. Create the CNAME shown by Cloud Run.

The expected record is:

```text
Type: CNAME
Hostname: portal
Is an alias of: ghs.googlehosted.com
TTL: default
```

Always use the exact target currently displayed by Cloud Run. If Cloud Run
displays `ghs.googlehosted.com.`, remove the final dot if one.com rejects it.

Do not enter:

- `portal.debageri.se` in the one.com Hostname field;
- `https://` or a URL path;
- a Cloud Run `run.app` hostname unless Cloud Run explicitly displays it as the
  required DNS target;
- an A record copied from the `debageri.se` apex mapping.

The CNAME affects only `portal.debageri.se`. It does not change
`debageri.se`, `www.debageri.se`, email, or other subdomains.

## 4. Authorize the hostname

### Firebase Authentication

1. Open the [Firebase console](https://console.firebase.google.com/).
2. Select project `debageri-portal`.
3. Open **Authentication**, then **Settings**.
4. Under **Authorized domains**, add:

```text
portal.debageri.se
```

Use the hostname only, without protocol, path, or trailing slash.

### Firebase App Check and reCAPTCHA

If App Check uses reCAPTCHA:

1. Open the reCAPTCHA key associated with
   `NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY`.
2. Add `portal.debageri.se` to its allowed-domain list.
3. Keep the Cloud Run preview hostnames required for branch testing.

If App Check rejects a domain, token exchange returns 403 before the
application request reaches the backend. After correcting the domain, use a
fresh private window or clear that site's browser storage to reset any local
retry backoff.

### Firebase browser API key

If the Firebase browser API key has HTTP referrer restrictions:

1. Open **Google Cloud**, then **APIs and services**, then **Credentials**.
2. Open the browser API key used by the portal.
3. Add:

```text
https://portal.debageri.se/*
```

No GitHub secret needs to change merely because the public hostname changes.
The existing Firebase `authDomain` also remains unchanged for email and
password authentication.

## 5. Verify DNS and HTTPS

On Windows:

```powershell
Resolve-DnsName portal.debageri.se -Type CNAME
```

The result must match the DNS target displayed by Cloud Run. one.com remaining
the nameserver provider is expected.

Cloud Run issues and renews a Google-managed TLS certificate after DNS is
correct. Provisioning commonly takes about 15 minutes but can take up to 24
hours. Do not bypass certificate warnings or submit credentials until the
mapping reports that the certificate is active. Avoid deleting and recreating
a pending mapping because that can restart certificate provisioning.

Use a private browser window and verify:

1. `https://portal.debageri.se/auth/login` opens with a valid certificate.
2. An employee can sign in and open time reporting.
3. An admin can sign in and open the admin pages.
4. A time report can be submitted and appears in history.
5. Refreshing a protected page keeps the session active.
6. Developer tools show no authorized-domain, API-key, or App Check errors.

Keep the original `run.app` URL for deployment diagnostics and branch
previews.

## Troubleshooting

### `debageri.se` is not available as a verified domain

Use the same Google account that verified the domain for `debageri-web`, or
complete the TXT verification step at one.com.

### DNS does not show the Cloud Run target

- Confirm the one.com hostname is `portal`.
- Remove conflicting records for the `portal` host.
- Confirm the CNAME target exactly matches Cloud Run's DNS Records dialog.
- Allow several hours for DNS propagation.

### Certificate remains in provisioning

- Confirm the public CNAME matches the value from Cloud Run.
- Wait up to 24 hours.
- Confirm no proxy or web-forward record intercepts `portal`.
- Avoid deleting and recreating the mapping while provisioning.

### Login reports an unauthorized domain

Add `portal.debageri.se` under Firebase Authentication **Authorized domains**.

### Firebase requests return 403

Add `portal.debageri.se` to the App Check reCAPTCHA allowed-domain list. If the
browser API key is restricted, also add
`https://portal.debageri.se/*` to its allowed referrers.

## Official references

- [Google Cloud: Mapping custom domains](https://cloud.google.com/run/docs/mapping-custom-domains)
- [one.com: Create a CNAME record](https://help.one.com/hc/en-us/articles/360000803517-How-do-I-create-a-CNAME-record)
- [Firebase Authentication: Authorized domains](https://firebase.google.com/docs/auth/web/multi-factor#enabling_multi-factor_authentication)
