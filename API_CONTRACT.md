# Canonical ReviewTap API contract

`contract/api-contract.js` is the route catalogue consumed by the browser and the Express application. All JSON errors use `{ "error": "human-readable message" }`. A bearer token means `Authorization: Bearer <JWT>`. Requests without an authentication requirement must not send a business token.

## Auth and business

| Method and path | Auth | Request | Success response |
| --- | --- | --- | --- |
| `POST /api/auth/register` | None | `{ businessName, name, email, password }` | `201 { token, user, business }` |
| `POST /api/auth/login` | None | `{ email, password }` | `{ token, user, business }` |
| `GET /api/business/me` | Bearer | — | business with subscription |
| `PATCH /api/business/me` | Bearer | Any of `{ name, websiteUrl, googleBusinessUrl, currency, timezone }` | updated business |
| `GET /api/business/branches` | Bearer | — | branch array |
| `POST /api/business/branches` | Bearer | `{ name, code, address? }` | `201` branch |
| `GET /api/business/staff` | Bearer | — | active staff array |

## Catalogue and endpoints

| Method and path | Auth | Request | Success response |
| --- | --- | --- | --- |
| `GET /api/products` | Bearer | — | product array |
| `POST /api/products` | Bearer | `{ name, price, description?, sku?, currency? }` | `201` product; omitted currency uses the business currency |
| `PATCH /api/products/:id` | Bearer | Any of `{ name, description, price, active }` | product |
| `GET /api/endpoints` | Bearer | — | endpoint array including `publicUrl` |
| `POST /api/endpoints` | Bearer | `{ name, code, type, branchId?, actionProfile? }` | `201` endpoint including `publicUrl` |
| `PATCH /api/endpoints/:id` | Bearer | Any endpoint settings or `actionProfile` | endpoint including `publicUrl` |
| `GET /api/endpoints/:id/qr` | Bearer | — | `image/png` |
| `GET /api/analytics/summary` | Bearer | — | `{ endpoints, sessions, orders, successfulPayments, interactionEvents, paidAmountMinor }` |

`actionProfile` is a strict object containing optional nullable URLs `reviewUrl`, `whatsappUrl`, `websiteUrl`, `socialUrl`, and `directionsUrl`, plus optional `allowOrdering`. This makes every visible customer action a configured destination, rather than a ReviewTap placeholder.

## Public customer flow

| Method and path | Auth | Request | Success response |
| --- | --- | --- | --- |
| `GET /api/public/endpoint/:token` | None | — | `{ endpoint, business, activeSession }` |
| `POST /api/public/endpoint/:token/actions` | None | `{ action }` where action is `REVIEW_CLICKED`, `WHATSAPP_CLICKED`, `WEBSITE_CLICKED`, `SOCIAL_CLICKED`, or `DIRECTIONS_CLICKED` | `201 { recorded: true }` |
| `POST /api/public/endpoint/:token/session` | None | `{ guestName?, guestPhone? }` | `201 { session, existing: false }` or existing session |
| `GET /api/public/session/:token` | None | — | `{ session, business, orders, bill }` |
| `GET /api/public/session/:token/products` | None | — | active product array |
| `POST /api/public/session/:token/orders` | None | `{ items: [{ productId, quantity }], notes? }` | `201` order with line items |

## Payments

| Method and path | Auth | Request | Success response |
| --- | --- | --- | --- |
| `POST /api/payments/session/:token/request` | None | Header `Idempotency-Key`; `{ provider: "MPESA", phone, selectedItemIds }` | `201 { paymentId, status, providerReference, reused: false }`, or existing `200` with `reused: true` |
| `GET /api/payments/:paymentId` | None | — | payment status and safe public fields |
| `POST /api/payments/mpesa/callback` | M-Pesa provider | Daraja STK callback body | `{ ResultCode: 0, ResultDesc: "Accepted" }` |

Only M-Pesa initiation is enabled. Other provider enum values remain in the data model for future adapters but are deliberately rejected by this release's request schema. Payments are finalized only by the provider callback, never by a browser redirect.

## Deferred operational APIs

`GET/POST /api/events` and `GET/POST /api/integrations` remain authenticated SIP foundation routes. They are documented in `contract/api-contract.js`; their management screens are intentionally deferred rather than exposed as incomplete ReviewTap controls.
