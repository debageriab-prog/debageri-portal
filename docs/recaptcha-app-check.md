# Firebase App Check and reCAPTCHA

The portal uses Firebase App Check with the reCAPTCHA v3 provider, matching the
`debageri-web` implementation. It runs invisibly, so users do not solve a
checkbox challenge. The browser obtains an App Check token and sends it with
portal API requests. Production API routes verify that token with Firebase
Admin before running application code.

Local emulator development does not require reCAPTCHA. App Check verification
is enabled only when `PORTAL_ENVIRONMENT=production` and the site key is
configured. This allows a staged rollout without locking users out.

## 1. Register the portal web app

1. Open Firebase Console and select `debageri-portal`.
2. Open **Build**, **App Check**.
3. Select the existing **Debageri Portal** web app.
4. Choose **reCAPTCHA v3** as the provider.
5. Register the app and copy the generated site key.

Use the portal provider and site key. Do not reuse a key from the public
`debageri-web` Firebase project.

## 2. Configure allowed domains

Open the reCAPTCHA key linked from App Check, then add every hostname from which
people will use the portal:

```text
portal.debageri.se
debageri-portal-so2zcmdfgq-ew.a.run.app
```

Use the current Cloud Run service hostname shown by:

```bash
gcloud run services describe debageri-portal \
  --project debageri-portal \
  --region europe-west1 \
  --format="value(status.url)"
```

Enter hostnames only, without `https://`, paths, or trailing slashes. If a
branch preview uses a different tagged hostname, add that exact hostname before
testing the preview. After changing allowed domains, use a private browser
window or clear site data if the SDK is temporarily backing off after earlier
failed token exchanges.

## 3. Add the GitHub Actions secret

In GitHub, open **debageri-portal**, **Settings**, **Secrets and variables**,
**Actions**, then create or update this repository secret:

```text
NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY
```

Paste only the reCAPTCHA v3 site key. This is public browser configuration, not
the reCAPTCHA secret key. The production and preview workflows pass it into the
Docker build automatically.

## 4. Deploy and verify monitoring

Merge the PR to deploy production, then:

1. Open the portal in a private browser window and sign in.
2. Use an authenticated action such as loading or submitting a timesheet.
3. In browser developer tools, inspect the application request and confirm it
   contains an `X-Firebase-AppCheck` request header.
4. In Firebase Console, open **App Check**, **Metrics** and confirm valid
   requests appear for the portal web app.
5. Check Cloud Run logs for unexpected `401` responses before enabling
   enforcement.

The reCAPTCHA token exchange itself is visible in the browser network panel.
A `403` response there normally means the site key is wrong, belongs to another
Firebase project, or the current hostname is not allowed.

## 5. Enable Firebase product enforcement gradually

Keep App Check in monitoring mode until normal login and portal workflows show
valid traffic. Then enable enforcement separately for the Firebase products the
portal uses, beginning with Firestore. Confirm production after each change
before enabling the next product.

Custom portal API routes are already enforced by the application in production.
Do not enable enforcement before the site key is present in GitHub and the
production hostname is allowed, because users would be unable to sign in or use
the portal.

## Troubleshooting

### Security check error from the portal API

Confirm the deployed image was built after the GitHub secret was added. Check
that the current hostname is allowed and that the site key belongs to the
`debageri-portal` web app.

### Login fails before the session request

Inspect the reCAPTCHA token exchange. A rejected exchange prevents Firebase
Authentication from receiving a valid App Check token when Auth enforcement is
enabled.

### Local development

Leave `NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` empty and use
`NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`. The emulator workflow intentionally
skips App Check.
