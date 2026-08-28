# ReviewTap merged system

ReviewTap's original public visual language is the application shell. The backend, data model, authentication, NFC/QR endpoints, guest sessions, ordering, billing, payments, analytics, audit logs, branches, events and integrations are from the Smart Interaction Platform foundation.

## Run locally

1. Copy `backend/.env.example` to `backend/.env` and set a real PostgreSQL `DATABASE_URL` and a 32-character-or-longer `JWT_SECRET`.
2. In `backend`, run `npm install`, `npm run prisma:generate`, and `npm run prisma:migrate -- --name reviewtap_initial`.
3. Run `npm start` in `backend`, then open `http://localhost:4000`.

The backend serves the locked ReviewTap UI directly. There is no second frontend server or second API namespace.

See `contract/api-contract.js` and `docs/API_CONTRACT.md` for the canonical interface, and `MERGE_REPORT.md` for the implementation boundary.
