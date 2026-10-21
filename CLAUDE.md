# CLAUDE.md

Working context for Claude Code in this repository. Follow
[AGENTS.md](AGENTS.md) as well; its rules are binding and summarized under
"House rules" below.

## What this is

Debageri Portal is Debageri's internal employee portal (`portal.debageri.se`).
It covers weekly time reporting with manager approval, consultant time-report
dashboards, finance (invoices, transactions, VAT settlements, compensation,
CSV import, attachments), contract documents, missing-week reminders by email,
and administration (users, time codes, red days, email settings/templates,
audit log). Deeper background lives in [docs/](docs) (architecture, data
model, auth, security, deployment, testing, UI design system, decisions).

## Stack

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4 plus
hand-written classes in `src/app/globals.css`, Firebase Auth / Firestore /
Storage (client SDK 12, Admin SDK 14), Zod 4, Nodemailer, Vitest, ESLint,
Prettier. Node 22 and npm. Deployed as a standalone container on Cloud Run.

## Commands

```bash
npm run dev            # Next.js on :3000
npm run emulators      # Firebase emulators (project debageri-portal-local, UI on :4000)
npm test               # Vitest unit tests (tests/unit)
npm run test:rules     # Firestore rules tests, needs the Firebase emulator (Java)
npm run typecheck
npm run lint
npm run format:check   # Prettier also checks Markdown and JSON
npm run ci             # Everything above plus build
```

CI (`.github/workflows/ci.yml`) runs `check:project`, format, lint,
typecheck, unit tests, rules tests and build on every push and PR. Run
`npm run format` before committing. Only report a check as passing after
actually running it.

## Layout

- `src/app/<area>/` — pages per area (`employee`, `manager`, `time-reports`,
  `finance`, `documents`, `reminders`, `admin`, `auth`). Each area's
  `layout.tsx` calls `verifySession()` and gates access by role and capability,
  redirecting to `/auth/login` or `/unauthorized`.
- `src/app/api/**/route.ts` — trusted route handlers. Pattern: `verifySession()`
  → Zod `safeParse` → call a service → map errors to stable codes such as
  `{ error: "invalidInput" }`. Finance uses one `POST /api/finance` with an
  `action` discriminator (`financeActionSchema`).
- `src/server/services/` — business logic using Firebase Admin; authorizes,
  validates and writes transactionally, with audit and approval events.
  `finance-service.ts` is the largest.
- `src/server/validators/` — Zod schemas. `src/server/auth/` — session and
  `requireRole`. `src/server/security/app-check.ts` — App Check enforcement,
  applied to `/api/*` by `src/proxy.ts` (Next 16's replacement for middleware).
- `src/domain/` — pure, testable logic (`types.ts`, timesheet rules, finance
  calculations and CSV, report aggregation, reminders). Put logic here when it
  can be unit tested without Firebase.
- `src/lib/` — Firebase client/admin setup (`appCheckFetch` for client API
  calls), environment validation, ISO weeks, durations, localization.
- `src/components/` — `PortalShell` (navigation), `LocaleProvider`,
  `WeeklyTimesheet`, and shared UI such as `ui/ActionIcon.tsx` and
  `ui/FileActionIcons.tsx`.
- `src/locales/en.json`, `src/locales/sv.json` — flat key catalogs; they must
  keep identical key sets.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json` — deployed by
  CI. Add an index when you add a new compound query.

## Domain essentials

- Roles: `consultant`, `manager`, `accountant`, `admin`. `reportsTime` is a
  separate capability (always on for consultants, optional for managers).
  Legacy `employee` means consultant. Consultants have a compensation model
  (`flexible` or `fixed`) from effective-dated `compensationAgreements`, and
  finance access flags (`financeAccess.myFinance` / `myInvoices`).
- Every organization-owned document carries `organizationId`. Always scope
  queries by it and check it.
- Dates are `YYYY-MM-DD` in `Europe/Stockholm`. Durations are integer minutes.
  Money is integer öre (SEK minor units). Never use floats for time or money.
- Timesheet IDs are `{org}_{uid}_{isoYear}-W{ww}`. The lifecycle is
  draft → submitted → approved/rejected, with reopen. Transitions happen only in
  trusted server code, and rules deny direct approval writes.
- Time entries are top-level documents with immutable time-code snapshots.
  Used codes are deactivated, never deleted.
- The finance ledger is immutable. Corrections are linked reversals or voids.
  Flexible consultant balances are sums of `consultantBalanceDeltaMinor`. VAT
  is stored separately. Internal notes never reach consultant-facing
  responses.

## Environments

Three isolated Firebase/GCP targets: local emulators (`debageri-portal-local`),
`debageri-portal-dev` (every non-main branch deploys to one shared dev Cloud
Run service through `preview.yml`), and `debageri-portal` (production, `main`
only, through `deploy.yml`). `scripts/validate-project.ts` and
`src/lib/config/environment.ts` refuse anything resembling `debageri-web`.
Never point local work at production or commit credentials. Variables are
listed in `.env.example`.

## House rules (from AGENTS.md and existing code)

- **Bilingual UI**: all user-facing copy goes into both `en.json` and
  `sv.json`. Use `useLocale().t(key)` in client components and
  `getTranslator()` (from `@/lib/localization/server`) on the server.
  Interpolate with `t("key").replace("{name}", value)`. Never hard-code labels.
  English (`en-SE`) is the default locale, stored in the `debageri-locale`
  cookie.
- **Create and edit on dedicated pages** (for example `.../new/page.tsx`,
  `.../[id]/edit/page.tsx`), never inline forms on list pages.
- **No `alert` / `confirm` / `prompt`.** Use the styled modal markup
  (`modal-backdrop` > `section.modal[role=dialog][aria-modal]` with
  `modal-header`, `modal-close`, `modal-actions`; `modal-small` for
  confirmations) and `notice` / `notice-error` / `notice-success` /
  `notice-warning` banners.
- **Consistent controls**: reuse `ActionIcon` and `FileActionIcons` icon
  buttons for view, download, edit and remove instead of new text buttons.
- **Publishing a PR**: after pushing, watch the required CI checks until they
  pass. Fix failures the PR caused and keep watching the new run.
- Follow the visual identity in `docs/ui-design-system.md`: warm beige and
  brown palette, calm, no gradients or marketing layouts.
