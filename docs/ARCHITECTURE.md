# Architecture decisions

## 1. Physical endpoint

A physical NFC tag and its printed QR code point to the same stable endpoint URL.

The endpoint identifies a business context such as:

- table
- room
- product
- service
- waiter
- event station

The tag does not contain a live bill amount.

## 2. Session

A session is the current interaction state for an endpoint.

For table/room use, the system allows one active session per endpoint in Foundation v1. A new session is only created after the previous session is no longer active.

## 3. Shared tables

The physical layer remains one tag/QR per table. Multiple people can participate in the same session. They can select the items they want to pay, or one person can pay the whole remaining bill.

No seat-specific NFC hardware is required.

## 4. Guest customers

Customer accounts are optional. Guest users receive a short-lived contextual session through a public endpoint.

## 5. Existing business systems

The platform is designed as an integration layer. Integration records are stored separately from the core order/session model.

Future adapters can synchronize with:

- POS
- PMS
- booking systems
- accounting systems
- CRM
- payment providers

## 6. Businesses without POS

The platform's own catalog, orders, sessions and billing can provide the minimum operational layer needed to run the endpoint flow.

This means a small business does not have to purchase another POS before using the system.

## 7. Payment truth

The payment provider is authoritative.

A browser return is not treated as proof of payment.

A provider callback/webhook must reconcile against an existing payment record.

Webhook handling must be idempotent.

## 8. Offline

There is no offline business operation in this release.

A live network connection is required to:

- open endpoint state
- create sessions
- create orders
- retrieve bills
- request payment
- receive live status
- synchronize analytics

## 9. NFC programming

For ordinary tags, the deployment tool writes a URL NDEF record. The URL is stable and points to the platform endpoint.

For mass deployment, a dedicated NFC encoder can be added later. It is not required for the initial deployment workflow.
