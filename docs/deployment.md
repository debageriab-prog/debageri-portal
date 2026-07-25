# Deployment

Recommended production topology is standalone Next.js on Cloud Run behind a custom domain, with portal-only Firebase services. CI validates, builds an immutable image, authenticates to the selected portal project through Workload Identity Federation, and deploys to an environment-specific service. Firebase CLI deploys rules/indexes/storage rules separately.

Before deployment run `npm run ci`, `npm run test:rules`, and `npm run check:project -- --target=dev|prod`. Then `npm run deploy:dev` or `npm run deploy:prod`; each explicitly selects and displays a portal alias and refuses website targets. Production should require GitHub Environment approval and never auto-deploy from unreviewed branches.

Manual gates: create projects/resources, configure CI federation and scoped IAM, set Secret Manager/env values, enable App Check enforcement, deploy indexes/rules, seed only organization/admin configuration, configure domain/TLS, enable monitoring/backups/alerts, and conduct security/privacy review.
