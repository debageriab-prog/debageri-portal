# Debageri Portal

Debageri Portal (Debageri Medarbetarportal) is Debageri's internal employee platform at the intended domain `portal.debageri.se`. Version 1 provides localized weekly time reporting, manager approval, administration, reporting, and an extensible foundation for future employee services.

## Status and stack

The repository contains a working Next.js 16/React 19/strict TypeScript portal, Firebase Authentication sessions, Firestore-backed employee administration and time-reporting workflows, responsive branded UI, and automated domain/rules tests. Cloud resources must still be created manually in the isolated portal projects.

Node 22 and npm are required. The app uses Tailwind CSS 4, Firebase 12/Admin 14, Zod 4, Vitest, ESLint, and Prettier.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run emulators
npm run dev
```

Create the initial organization and administrator through the documented Firebase setup process. Administrators create employee accounts from the portal.

Quality commands:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:rules
npm run build
```

## Configuration

All variables are documented in [.env.example](.env.example). Public Firebase web configuration is not secret; Admin credentials are server-only. Prefer Application Default Credentials/Cloud Run service identity in deployed environments. Never commit service-account keys.

The application has two modes: local Firebase emulators and the single cloud project `debageri-portal`. There is no separate cloud development project. The only deployment alias is `portal`; `npm run deploy` validates and displays it before deploying Firebase configuration.

The application is packaged by [Dockerfile](Dockerfile) for Cloud Run. Every branch runs CI and receives a zero-traffic tagged preview revision with no production-data access. Pushes to `main` automatically validate, deploy Firebase rules/indexes, publish an Artifact Registry image, and deploy production through Workload Identity Federation.

## Documentation

- [Product requirements](docs/product-requirements.md)
- [Repository inspection and assumptions](docs/repository-inspection.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Authentication and authorization](docs/authentication-and-authorization.md)
- [Security](docs/security.md)
- [Infrastructure isolation](docs/infrastructure-isolation.md)
- [Local development](docs/local-development.md)
- [Firebase setup](docs/firebase-setup.md)
- [Deployment](docs/deployment.md)
- [Testing](docs/testing.md)
- [UI design system](docs/ui-design-system.md)
- [Privacy and data handling](docs/privacy-and-data-handling.md)
- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/decisions)
