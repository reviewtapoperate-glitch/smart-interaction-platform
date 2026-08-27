# Smart Interaction Platform — Foundation v1

A provider-agnostic NFC/QR business interaction layer.

This release is intentionally focused on the real core rather than pretending to be a finished global payment marketplace. It includes:

- Business registration and login
- Branches
- Endpoints for tables, rooms, products, waiters and event stations
- NFC/QR endpoint URLs
- Public guest sessions with no forced customer account
- Catalog/products
- Orders
- Bills
- Whole-bill payment selection
- Individual item selection
- Session lifecycle
- Verified webhook foundation
- M-Pesa Daraja STK Push adapter
- Provider adapter architecture for adding other gateways
- Analytics events
- Staff assignment
- Event mode
- Subscription plan metadata
- Audit logs
- React/Tailwind admin interface
- Public guest interface
- Socket.IO live updates

Important:
- No offline operations are implemented.
- The application requires a network connection.
- Customer funds are not held by this platform.
- Payment status must be confirmed server-side by the provider callback/webhook.
- M-Pesa credentials are supplied by the business/platform operator through environment configuration.
- Other payment providers are intentionally adapters so they can be added without rewriting the core.

## Requirements

- Node.js 20.19+ or a current supported Node.js release
- PostgreSQL 14+
- npm

## Project structure

smart-interaction-platform-v1/
  backend/
  frontend/

## Backend setup

1. Copy backend/.env.example to backend/.env
2. Set DATABASE_URL to PostgreSQL
3. Set JWT_SECRET to a long random secret
4. Set PUBLIC_BASE_URL to the backend's public URL
5. Install packages:

   cd backend
   npm install

6. Generate Prisma client:

   npm run prisma:generate

7. Create the database:

   npm run prisma:migrate -- --name initial

8. Start:

   npm run dev

Backend defaults to http://localhost:4000

## Frontend setup

1. Copy frontend/.env.example to frontend/.env
2. Set VITE_API_URL=http://localhost:4000/api
3. Install:

   cd frontend
   npm install

4. Start:

   npm run dev

Frontend defaults to the Vite development URL.

## First business

Use the Register screen to create a business. The first account is the business owner.

After login:

1. Create a branch.
2. Create endpoints such as TABLE_01, ROOM_204, WAITER_01 or EVENT_01.
3. Add products.
4. Open the endpoint's public URL or QR image.
5. Use the public guest page to create a session and order.
6. The bill can be viewed as a guest.
7. Whole-bill or selected-item payment can be requested.
8. Configure M-Pesa if live payment testing is required.

## M-Pesa

The backend contains a Daraja STK Push adapter.

Set these variables:

MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORT_CODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=

For production, change MPESA_ENV=production and use production credentials and callback URL.

The callback endpoint is:

POST /api/payments/mpesa/callback

The platform verifies the provider callback structure and reconciles the transaction against the existing payment record. It does not mark a payment successful merely because the browser returned.

## NFC

The platform uses a stable endpoint URL as the NDEF payload.

Example conceptually:

https://your-domain.com/e/<publicEndpointToken>

The tag does not store the current bill. It stores the stable endpoint URL. The server resolves the endpoint to the current business/table/room/session state.

Ordinary NFC programming can be performed with an NFC-capable Android phone. The browser Web NFC API is not required for customers to tap tags; the phone's operating system can open an NDEF URL. Web NFC is only useful for compatible deployment tooling and has limited browser availability.

## Security baseline

Before production:

- Use HTTPS.
- Rotate JWT secrets.
- Put secrets only in environment variables.
- Use a managed PostgreSQL instance with encrypted connections.
- Add rate limiting at the edge and application layer.
- Add provider-specific webhook signature verification whenever the provider supports it.
- Add idempotency for every payment webhook.
- Add production audit retention policies.
- Add database backups and restore testing.
- Complete payment, tax, privacy and consumer-law review for every launch country.
- Do not store raw card PAN/CVV.
