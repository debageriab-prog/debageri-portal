# Authentication and authorization

The portal has its own Firebase Authentication tenant/user base in each portal project. Users sign in with email/password plus a mandatory TOTP second factor (an authenticator app such as Google Authenticator or Microsoft Authenticator). An enterprise identity provider remains a possible follow-up.

## Two-factor authentication

TOTP multi-factor authentication uses Firebase Authentication with Identity
Platform; secrets live in Firebase, never in Firestore. Enforcement is
controlled by `AUTH_REQUIRE_MFA` (`true` on the dev Cloud Run service, `false`
locally because the Auth emulator does not support TOTP).

- `/api/auth/session` refuses to create a session unless the ID token carries
  `firebase.sign_in_second_factor`. It answers `mfaEnrollmentRequired` for
  users without a factor and `mfaRequired` otherwise.
- `verifySession()` rejects session cookies minted without a second factor, so
  pre-MFA sessions end when enforcement is switched on.
- On first sign-in the login page explains that 2FA is mandatory, links to the
  authenticator apps, calls `/api/auth/mfa/prepare` (marks the admin-provided
  email as verified, which Firebase requires before enrollment), shows a QR
  code and setup key, and enrolls the factor after the user enters a code.
- Changing your own password asks for a current code when a factor is enrolled.
- Admins can reset another user's second factor from the employee list
  (`DELETE /api/admin/users/{id}/mfa`). This removes enrolled factors, revokes
  sessions, and writes the `user.mfa_reset` audit event; the user enrolls again
  at the next sign-in.

The browser signs in with Firebase, sends the ID token once to `/api/auth/session`, and receives a Secure (production), HTTP-only, SameSite=Lax session cookie. Server layouts/services verify the cookie with revocation checking and load `users/{uid}`. Inactive/missing users are denied.

Custom claims may cache coarse role and organization hints but never replace Firestore state. Trusted services verify active status, organization, role, subject ownership, manager assignment, latest workflow state, and input schema. The browser cannot choose a role or reviewer. Firestore rules independently constrain direct reads/entry editing and block direct administrative/approval writes.

Portal roles are `consultant`, `manager`, `accountant`, and `admin`.
`reportsTime` is a separate capability: consultants always have it, managers
may have it, and accountants and admins do not. Legacy `employee` records are
treated as consultants with time reporting enabled. Managers can review
consultant reports, admins can also review reports from time-reporting managers,
and accountants can only read consultant reports.

Admins deliberately onboard employees in portal Auth and Firestore. Candidate accounts and records are never copied automatically.
