# Firebase App Check and reCAPTCHA

The portal uses Firebase App Check with the reCAPTCHA v3 provider, matching the
`debageri-web` implementation. It runs invisibly, so users do not solve a
checkbox challenge. The browser obtains an App Check token and sends it with
portal API requests. Production API routes verify that token with Firebase
Admin before running application code.

Local emulator development does not require reCAPTCHA. Server-side App Check
verification remains production-only. Development registers its own App Check
application and reCAPTCHA key in monitoring mode.

## 1. Create the reCAPTCHA v3 key pair

1. Open the [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin/create).
2. Set the label to **Debageri Portal**.
3. Select **Score based (v3)** as the reCAPTCHA type.
4. Add the production portal hostnames under **Domains**:

   ```text
   portal.debageri.se
   debageri-portal-so2zcmdfgq-ew.a.run.app
   ```

5. Accept the terms and submit the registration.
6. Copy both generated values:
   - **Site key**, which is public browser configuration.
   - **Secret key**, which must remain private.

Do not reuse the key pair from `debageri-web`. The portal has different
hostnames and a separate Firebase project.

## 2. Register the portal web app

1. Open Firebase Console and select `debageri-portal`.
2. Open **Security**, **App Check**.
3. Select the existing **Debageri Portal** web app.
4. Choose **reCAPTCHA** as the provider. In the current Firebase console this
   label is the reCAPTCHA v3 provider used by the portal code. Do not choose
   **reCAPTCHA Enterprise** for this implementation.
5. Paste the private **reCAPTCHA secret key** created in step 1.
6. Keep the default token time to live unless there is a reviewed reason to
   change it.
7. Register the app.

Firebase stores the secret key. Do not add the secret key to GitHub, application
environment variables, source code, or documentation.

## 3. Configure allowed domains

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

Enter hostnames only, without `https://`, paths, or trailing slashes. After
changing allowed domains, use a private browser window or clear site data if
the SDK is temporarily backing off after earlier failed token exchanges.

Development branches use one stable `debageri-portal-dev` Cloud Run service
hostname, so its hostname is added once to the development reCAPTCHA key and
Firebase Authentication authorized domains.

## 4. Add the GitHub Actions secret

In GitHub, open **debageri-portal**, **Settings**, **Secrets and variables**,
**Actions**, then create or update this repository secret:

```text
NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY
```

Paste only the public reCAPTCHA v3 **site key** created in step 1. Do not paste
the reCAPTCHA secret key. The production and preview workflows pass the site
key into the Docker build automatically.

## 5. Deploy and verify monitoring

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

## 6. Enable Firebase product enforcement gradually

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
