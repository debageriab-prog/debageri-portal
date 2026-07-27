# Authentication and authorization

The portal has its own Firebase Authentication tenant/user base in each portal project. Email/password is enabled for V1; MFA and an enterprise identity provider are recommended follow-ups.

The browser signs in with Firebase, sends the ID token once to `/api/auth/session`, and receives a Secure (production), HTTP-only, SameSite=Lax session cookie. Server layouts/services verify the cookie with revocation checking and load `users/{uid}`. Inactive/missing users are denied.

Custom claims may cache coarse role and organization hints but never replace Firestore state. Trusted services verify active status, organization, role, subject ownership, manager assignment, latest workflow state, and input schema. The browser cannot choose a role or reviewer. Firestore rules independently constrain direct reads/entry editing and block direct administrative/approval writes.

Portal roles are `consultant`, `manager`, `accountant`, and `admin`.
`reportsTime` is a separate capability: consultants always have it, managers
may have it, and accountants and admins do not. Legacy `employee` records are
treated as consultants with time reporting enabled. Managers can review
consultant reports, admins can also review reports from time-reporting managers,
and accountants can only read consultant reports.

Admins deliberately onboard employees in portal Auth and Firestore. Candidate accounts and records are never copied automatically.
