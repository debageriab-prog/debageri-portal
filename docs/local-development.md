# Local development

Use Node 20–22 and npm. Copy `.env.example` to `.env.local`, install with `npm ci`, start `npm run emulators`, then run `npm run seed` in a second terminal and `npm run dev`. Emulator UI is at `http://127.0.0.1:4000`; Next.js defaults to `http://localhost:3000`.

The seed script aborts unless Auth and Firestore emulator hosts are present. It creates one organization, admin, manager, two employees, assignments, terms, default codes, sheets across each workflow state, and sample history. Local passwords are documented only for disposable emulator identities.

Never point local development at production, import production exports, or seed real personal/candidate data.
