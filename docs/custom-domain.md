# Portal custom domain

This runbook connects the production Cloud Run service to:

```text
https://portal.debageri.se
```

The domain is managed at one.com. The application runs in Google Cloud project
`debageri-portal`, region `europe-west1`, as Cloud Run service
`debageri-portal`.

## Recommended architecture

Use a global external Application Load Balancer with:

- a reserved global IPv4 address;
- a serverless network endpoint group pointing to Cloud Run;
- a Google-managed TLS certificate for `portal.debageri.se`;
- an HTTPS frontend on port 443;
- an optional HTTP frontend that redirects to HTTPS.

Google recommends this option for production. Direct Cloud Run domain mappings
are still a Preview feature and Google does not recommend them for production
services.

## 1. Create the load balancer in Google Cloud

Sign in to the
[Google Cloud console](https://console.cloud.google.com/) and select project
`debageri-portal`.

1. Open **Network services**, then **Load balancing**.
2. Click **Create load balancer**.
3. Choose **Application Load Balancer (HTTP/HTTPS)**.
4. Choose **Public facing (external)** and **Global**.
5. Select the global external managed load balancer when asked for the
   generation.
6. Give it a recognizable name, such as `debageri-portal`.

### Backend

1. Create a backend service, such as `debageri-portal-backend`.
2. For the backend type, choose a **serverless network endpoint group**.
3. Create the serverless NEG in `europe-west1`.
4. Select **Cloud Run** and service `debageri-portal`.
5. Do not configure a URL mask.
6. Keep Cloud CDN disabled because this portal contains authenticated,
   employee-specific pages.

### Frontend and certificate

1. Reserve a new **global static external IPv4 address**. Record this address.
   It is the value that will be entered at one.com.
2. Create an HTTPS frontend on port 443 using that address.
3. Create a **Google-managed certificate** containing only
   `portal.debageri.se`.
4. Attach the certificate to the HTTPS frontend.
5. Optionally create an HTTP frontend on port 80 and enable redirect to HTTPS.
6. Review and create the load balancer.

Do not change Cloud Run ingress to `internal-and-cloud-load-balancing` yet.
Branch preview revisions currently use tagged `run.app` URLs and require direct
Cloud Run ingress. Restricting ingress would make those previews inaccessible.

## 2. Add the DNS record at one.com

Wait until the load balancer has a reserved IPv4 address.

1. Sign in to the [one.com control panel](https://www.one.com/admin/).
2. Open **DNS settings** under **Advanced settings**.
3. Open **DNS records**.
4. Check for an existing `portal` A, AAAA, CNAME, web forward, or web alias
   record. Remove the conflicting record only if it is not used by another
   service.
5. Create an **A** record with:

| one.com field          | Value                                              |
| ---------------------- | -------------------------------------------------- |
| Hostname               | `portal`                                           |
| Points to / IP address | The global static IPv4 address from Google Cloud   |
| TTL                    | Leave empty for the one.com default, or use `3600` |

Do not enter `portal.debageri.se` in the Hostname field. one.com expects only
the subdomain label `portal`.

Do not point the record directly to a temporary Cloud Run IP address. Cloud Run
does not provide a stable service IP. The record must point to the load
balancer's reserved global address.

## 3. Wait for DNS and TLS

Check DNS from a terminal:

```powershell
Resolve-DnsName portal.debageri.se -Type A
```

The returned address must equal the load balancer address. DNS commonly updates
within minutes but can take several hours. Google can issue the managed
certificate only after public DNS points to the load balancer. Certificate
provisioning commonly takes about 15 minutes but can take up to 24 hours.

In Google Cloud, open **Certificate Manager** or the load balancer frontend and
wait until the certificate status is **Active**. Do not test production login
until `https://portal.debageri.se` loads with a valid certificate.

## 4. Authorize the domain in Firebase Authentication

1. Open the [Firebase console](https://console.firebase.google.com/).
2. Select project `debageri-portal`.
3. Open **Authentication**, then **Settings**.
4. Under **Authorized domains**, add:

```text
portal.debageri.se
```

Enter the hostname only, without `https://` or a path.

The portal currently uses email and password authentication, so the existing
Firebase `authDomain` can remain unchanged. If OAuth redirect providers are
added later, their authorized redirect URIs must also be configured for the
custom domain.

## 5. Update browser-key and App Check restrictions

If the Firebase browser API key has HTTP referrer restrictions:

1. Open **Google Cloud**, then **APIs and services**, then **Credentials**.
2. Open the browser API key used by the portal.
3. Add this allowed website referrer:

```text
https://portal.debageri.se/*
```

If Firebase App Check uses reCAPTCHA:

1. Open the reCAPTCHA key associated with
   `NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY`.
2. Add `portal.debageri.se` to its allowed domains.
3. Keep the existing Cloud Run preview domains that are needed for branch
   testing.

No GitHub secret needs to change merely because the public hostname changes.

## 6. Verify the completed setup

Use a private browser window and verify:

1. `http://portal.debageri.se` redirects to HTTPS.
2. `https://portal.debageri.se/auth/login` has a valid certificate.
3. An employee can sign in and open the time-reporting page.
4. An admin can sign in and open the admin pages.
5. A time report can be submitted and appears in history.
6. Browser developer tools show no mixed-content, Firebase authorized-domain,
   API-key referrer, or App Check errors.
7. Refreshing a protected page keeps the session active.

Keep the original `run.app` URL available for deployment diagnostics and branch
previews.

## Troubleshooting

### DNS does not resolve to the load balancer

- Confirm the one.com hostname is `portal`, not the full hostname.
- Remove conflicting `portal` CNAME, AAAA, web-forward, or web-alias records.
- Confirm the A record contains the reserved global load balancer address.

### Certificate remains in provisioning

- Confirm public DNS resolves to the load balancer address.
- Wait up to 24 hours.
- Confirm the certificate contains exactly `portal.debageri.se`.
- Check whether a restrictive CAA record prevents Google from issuing the
  certificate.

### Login reports an unauthorized domain

Add `portal.debageri.se` under Firebase Authentication **Authorized domains**.

### Firebase requests are blocked

Add `https://portal.debageri.se/*` to the browser API key's allowed referrers
and add the hostname to the App Check reCAPTCHA key.

### The load balancer returns a 404 or 5xx response

- Confirm the serverless NEG targets service `debageri-portal` in
  `europe-west1`.
- Confirm the URL map sends the default host and path to the portal backend.
- Confirm the latest Cloud Run revision is healthy at its `run.app` URL.

## Official references

- [Google Cloud: Mapping custom domains](https://cloud.google.com/run/docs/mapping-custom-domains)
- [Google Cloud: Set up a global external Application Load Balancer with Cloud Run](https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless)
- [one.com: Manage DNS settings](https://help.one.com/hc/en-us/articles/115005595925-Manage-your-DNS-settings)
- [Firebase Authentication: Authorized domains](https://firebase.google.com/docs/auth/web/multi-factor#enabling_multi-factor_authentication)
