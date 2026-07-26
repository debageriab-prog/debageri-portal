# Local development

Use Node 22 and npm. Copy `.env.example` to `.env.local`, install with `npm ci`, start `npm run emulators`, and run `npm run dev`. Emulator UI is at `http://127.0.0.1:4000`; Next.js defaults to `http://localhost:3000`. The emulator project ID is `debageri-portal-local`; it is not a cloud development environment.

The application does not create fixture accounts or sample business data. Provision the initial organization, administrator, and time codes explicitly before testing employee workflows.

Never point local development at production, create a cloud project matching the local ID, import production exports, or seed real personal/candidate data.
