# Repository inspection and assumptions

## Portal baseline

`debageri-portal` was an empty Git repository on `main` with no commits, framework, package manager, runtime declaration, infrastructure configuration, CI, linting, tests, design system, or application code. No Firebase/GCP reference or credential existed, so there was nothing to inherit or detach. npm was selected to match the reference repository.

## Read-only website reference

`debageri-web` was inspected without modification. At inspection it used Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5 strict, Tailwind CSS 4, npm/package-lock, Node 20 in CI, ESLint 9/`eslint-config-next`, Firebase 12/Admin 14, Cloud Run standalone output, Firebase rules/indexes, and GitHub Actions for CI/deployment/preview. No unit-test framework or formatter was configured.

Reusable non-sensitive patterns were the client/Admin Firebase module split, server session-cookie approach, App Router conventions, `@/*` imports, named component exports, accessibility rules, environment placeholders, and public brand guidance/assets. Error handling returned generic client messages; Admin credentials came from environment/Application Default Credentials. Recruitment collections, Auth users, buckets, rules, sessions, deployment identities, environment values, candidate data, résumés, and secrets were not copied.

The visual system uses Inter, warm beige `#F7F2EA`, dark brown `#3D3027`, supporting browns/tans, off-white cards, subtle borders/shadows, generous spacing, rounded cards/pill buttons, a line/circuit-influenced logo, responsive layouts, and restrained Swedish language. The portal adapts these into denser productivity navigation, tables, status tokens, and keyboard-friendly forms.

## Assumptions and risks

Expected portal IDs are `debageri-portal-dev` and `debageri-portal-prod`, subject to availability. `debageri` is the initial organization, `Europe/Stockholm` is authoritative, and email/password is the initial provider. Cloud region, retention, App Check provider, identity federation, legal basis, payroll interpretation, and production admin onboarding require explicit organizational decisions.

The largest remaining risks are incomplete live UI/repository wiring, missing provisioned cloud resources, missing production App Check/monitoring/backups, incomplete browser E2E and Storage-rule tests, and dependency advisories without upstream non-breaking fixes. These are launch blockers, not silently accepted production risks.
