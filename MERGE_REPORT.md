# Merge and verification report

## Implemented

- ReviewTap's original purple/indigo public website, marketing structure, responsive styling, and customer-first language are retained as the locked design layer.
- One Express service serves the public site, business portal, endpoint links, guest ordering and the canonical `/api` namespace.
- JWT/bcrypt authentication, PostgreSQL/Prisma models, business profiles, branches, staff listing, products, endpoints, QR generation, guest sessions, orders, real-time events, analytics, audits, events and integrations are retained from SIP.
- Smart endpoints replace the ReviewTap `Card` model. Their editable `actionProfile` now supplies real review, WhatsApp, website, social and directions destinations.
- The business portal uses the shared contract only: business editing, products, locations, endpoint creation, endpoint destination updates, QR downloads and analytics summary.
- Public pages use the same contract for endpoint resolution, action tracking, guest sessions, orders, M-Pesa payment creation and payment-status polling.
- M-Pesa payment creation requires a client idempotency key. Replays return the original payment; overlapping in-progress payments for the same selected item are rejected.
- The payment callback uses a serialized database transaction and row lock, records an allocation snapshot, marks each line's full outstanding quantity paid, and treats competing or stale allocations as `REQUIRES_REVIEW` rather than double-paying them.

## Intentionally deferred

- Production M-Pesa callback signature/credential verification, rate limiting, alerting, retention policy, restore drills, tax handling and country-specific legal review.
- Stripe, Paystack, Flutterwave, PesaPal and other payment-provider implementations. They remain data-model extension points, not callable checkout choices.
- Reseller workspace, shipping/physical fulfilment, recurring subscription checkout/enforcement, Google Business Profile API, POS/PMS/CRM adapters, staff management UI and events/integrations UI.

## Removed

- ReviewTap's JSON file database, SHA-256 passwords, cookie session, `/api/cards`, `/api/orders` package-order demo, `/api/events` card-event endpoint, `/api/config`, `/api/dashboard`, `/api/reseller`, `/api/qr/:cardId`, `/s/:slug` template and hard-coded WhatsApp/social placeholder controls.
- The separate SIP React/Vite client and its alternative slate UI/API wrapper. The backend now serves one locked ReviewTap interface, so no duplicate API base URLs or stale frontend calls remain.
- Fabricated landing-page dashboard totals. The visual preview remains, but it no longer presents invented business metrics as live data.

## Verification performed

- Parsed every merged browser module, server module, public route module and payment route with `node --check`.
- Ran `scripts/verify-contract.mjs`, which checks browser `API.*` references against `contract/api-contract.js` and rejects legacy ReviewTap route names.
- Performed a route scan for legacy JSON/cookie API paths and alternative frontend API clients; none remain in the merged frontend.
- Dependency installation was attempted with an isolated workspace cache. The host left Prisma's downloaded package in an incomplete state, so Prisma CLI schema validation and a live database-backed startup check could not be completed in this environment. Run `npm install`, `npm run prisma:generate`, `npm run prisma:migrate -- --name reviewtap_initial`, and `npm run check` on a normal local Node/PostgreSQL setup before deployment.
