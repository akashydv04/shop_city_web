# DukaanSetu web

For the feature inventory, verification evidence, and remaining release blockers, see `DEVELOPMENT_REPORT.md` (22 October 2026). Run `npm run check` for TypeScript and the API-adapter regression suite. These tests use mocked HTTP responses; they do not replace authenticated browser acceptance testing.

A focused customer-facing storefront foundation for Gurugram neighbourhood commerce. Checkout remains preview-first. When `VITE_API_BASE_URL` is configured, the frontend supports API-backed registration, login, logout, session restore, role-aware navigation, and an explicitly selected local sandbox payment flow in `dev` only. In `dev` only, a clearly labelled seeded-login fallback remains available for local testing.

## Environment configuration

Vite modes are explicit and use the same four labels everywhere: `dev`, `uat`, `preprod`, and `prod`. Public frontend configuration is limited to the catalogue API base URL, the environment label, and demo fallback. Do not put API keys, credentials, bearer tokens, payment secrets, or production identities in Vite env files; `VITE_*` values are bundled into browser code.

Copy the example for the mode you need to a mode-specific local file:

```bash
cp .env.dev.example .env.dev.local
# edit VITE_API_BASE_URL when a reachable catalogue service is available
```

For two separate, reproducible local storefront URLs, use the dedicated demo and API modes:

```bash
# Terminal 1 — dummy/demo data at http://localhost:5173
npm run dev:demo

# Terminal 2 — backend/database data at http://localhost:5174
npm run dev:api
```

The commands load `.env.demo` and `.env.api` respectively. To customize either mode without changing tracked files, copy the matching example to a local override:

```bash
cp .env.demo.example .env.demo.local
cp .env.api.example .env.api.local
```

The demo mode has no API URL and permits the sample catalogue. The API mode points to `http://localhost:8080`, disables fallback, and fails closed when the backend is unavailable. Both modes keep `VITE_APP_ENV=dev`, so development-only seeded login and local payment/refund sandbox behavior remain clearly labelled.

For the running local stack, the backend is available at `http://localhost:8080` and the web app can be started with:

```bash
VITE_APP_ENV=dev VITE_API_BASE_URL=http://localhost:8080 VITE_ALLOW_DEMO_FALLBACK=false npm run dev -- --host 0.0.0.0 --port 5174
```

The UAT, preprod, and prod examples disable demo fallback. With an API URL, all environments use the real account auth routes and bearer tokens; `X-User-Id` is never sent outside `dev`. Without an API URL, protected workspaces remain unavailable and the storefront says why. No payment secret, provider key, webhook signing secret, or card data is accepted by this frontend. Production payment success is never simulated or claimed.

## Run locally

```bash
npm install
npm run dev                 # dev mode; reads .env.dev[.local]
# npm run dev:uat           # reads .env.uat[.local]
# npm run dev:preprod       # reads .env.preprod[.local]
# npm run dev:prod          # reads .env.prod[.local]
```

### Catalogue source

The storefront has an explicit catalogue adapter. In `dev`, the example configuration permits the clearly labelled local demo catalogue. In `uat`, `preprod`, and `prod`, the API URL is required and a failed or missing API never silently falls back to demo data. To use the backend discovery endpoint, set the API origin in the mode-specific local file:

```bash
cp .env.dev.example .env.dev.local
# set VITE_API_BASE_URL when a local backend is available; leave blank for the dev demo
npm run dev
```

With `VITE_API_BASE_URL` set, the app makes `GET /api/shops?city=Gurugram` and maps each shop's nested products into the storefront types. Every returned product has a **See** action that opens its detail panel. After a buyer signs in, the cart drawer reads `GET /api/carts/current`, adds through `POST /api/carts/items`, updates or deletes `/api/carts/current/items/{productId}`, and requests `POST /api/carts/current/checkout-preview` with the bearer session. The add endpoint returns the persisted cart snapshot, so the header count updates from the server response. When a live API buyer is not signed in, Add/Sign in sends the user to the login screen instead of silently doing nothing. The backend should be reachable from the browser (including CORS configuration where applicable). If a request fails, the UI keeps its error state and retry action; it does not silently fall back to demo data.

### Local sandbox payment (dev only)

The cart keeps the server-priced checkout preview as the default. A buyer must explicitly tick **I explicitly want to test sandbox payment in dev** before any order or payment request is sent. The control is rendered only when `VITE_APP_ENV=dev`; demo mode without an API and UAT/preprod/prod never expose or call it.

The adapters in `src/services/orderApi.ts` and `src/services/paymentApi.ts` use this backend contract:

- `POST /api/orders` with `Idempotency-Key: <stable checkout key>` and `{ "shopId": "...", "items": [{ "productId": "...", "quantity": 1 }] }` creates or replays the buyer's order.
- `POST /api/orders/{orderId}/payment-intents` with `Idempotency-Key: <stable payment key>` creates or replays a sandbox payment intent. The backend derives the amount and currency from the order.
- `GET /api/orders/{orderId}/payment` reads the backend payment state after the provider/webhook contract updates it. The browser never calls a provider webhook and never trusts a client-side success callback.

Real sessions send `Authorization: Bearer <accessToken>`. The existing `authApi.headers()` helper uses the seeded `X-User-Id` fallback only when the app is in `dev` and there is no real bearer session. The payment adapter refuses all non-dev environments and sends no secrets. Pending, succeeded, and failed states are shown from backend responses. Retries reuse both idempotency keys, so a network retry does not intentionally duplicate an order or payment intent. The order link is shown only after a succeeded backend payment state; if the backend confirms payment without returning an order link, the UI honestly directs the buyer to Orders or Support.

### Seller studio

Use the **Seller studio** control in the storefront header or open `/#seller`. The surface requires a signed-in seller. Register or sign in through **Sign in**; in `dev`, **Seeded development fallback** can be used for local seller testing. Authenticated sessions are retained in browser `localStorage` and refreshed with `GET /api/auth/me`.

```bash
VITE_APP_ENV=dev
VITE_API_BASE_URL=http://localhost:8080
```

When enabled, `src/services/sellerApi.ts` uses these backend routes with `Authorization: Bearer <accessToken>` for real accounts. The seeded dev fallback uses `X-User-Id` only in `dev`.

- `GET /api/seller/profile` — load the current seller profile (a `404` is treated as an empty onboarding form).
- `PUT /api/seller/profile` — submit `businessName`, `contactName`, `email`, `phone`, `address`, and `city`.
- `GET /api/seller/shops` — list the seller's shops.
- `POST /api/seller/shops` — create a shop with `name`, optional `slug`, `description`, and `city`.
- `GET /api/seller/shops/{shopId}/products` — load the product catalogue for an approved seller shop.
- `POST /api/seller/shops/{shopId}/products` — add `{ "name": "...", "description": "...", "price": 99.00, "initialQuantity": 10 }` to an approved seller shop.
- `PATCH /api/seller/shops/{shopId}/products/{productId}` — update `name`, `description`, `price`, `quantity`, and `active` for one product.
- `GET /api/seller/shops/{shopId}/fulfilment` and `PATCH /api/seller/shops/{shopId}/fulfilment` — read and save delivery/pickup enablement, `deliveryFee`, `minimumOrder`, and `businessTimezone` for an approved shop.
- `GET /api/seller/shops/{shopId}/delivery-slots`, `POST /api/seller/shops/{shopId}/delivery-slots`, and `PATCH /api/seller/shops/{shopId}/delivery-slots/{slotId}` — list, create, and enable/disable date/time/capacity delivery slots. The seller studio only exposes this section for approved shops and keeps the backend response as the displayed state.

The adapter accepts `status`, `reviewStatus`, or `approvalStatus` values from the backend and displays `Pending review`, `Approved`, or `Rejected`, including a backend rejection reason when present. The frontend does not approve sellers or shops. If the backend does not expose an onboarding endpoint, the UI shows the actual request failure rather than pretending a submission succeeded.

The catalogue section lists only shops whose backend status is `APPROVED`. It loads each approved shop's products, shows price, inventory quantity, and availability, provides an **Add a new product** form, and provides an inline editor for product name, description, price, quantity, and active state. Client-side validation requires a non-empty name, a non-negative price, and a whole-number quantity. A successful POST appends the server response to the selected shop; a successful PATCH is reflected in the row; when the backend returns `204`, the adapter reads the product list back before reporting success. Real seller sessions use the bearer token; the seeded dev fallback uses `X-User-Id` only in `dev`.

The seller studio also shows a read-only **Low-stock watch** for active products at or below five units across approved shops. It is calculated from the latest backend catalogue response, including the backend's `availableQuantity` field, and never changes inventory or calls an AI provider. Empty, loading, and catalogue-error states remain explicit.

The seller studio also has an order queue. It reads `GET /api/seller/orders`, displays backend order items/totals/statuses, and sends valid transitions to `POST /api/orders/{orderId}/status`. The UI only renders actions permitted by the current status (`PENDING -> CONFIRMED/CANCELLED -> PREPARING -> READY -> COMPLETED`), confirms every action, and refreshes the queue after success. If the configured backend does not expose the seller queue route yet, the studio shows the actual request error; it never creates local or fake orders.

The login screen supports buyer/seller registration and login through `POST /api/auth/register` and `POST /api/auth/login`, session restoration through `GET /api/auth/me`, and logout. Password recovery uses `POST /api/auth/request-password-reset` and `POST /api/auth/reset-password`. Email verification at `#verify-email` uses authenticated `POST /api/auth/request-email-verification` for the current account and public `POST /api/auth/verify-email` for the token. An email provider is not connected. Explicit development tokens are shown only in dev, never in UAT/preprod/prod. Only the dev seeded fallback sends `X-User-Id`; real accounts send bearer authentication.

The API cart offers **Take away** (`PICKUP`) and **Home delivery** (`DELIVERY`), based on shop settings. It sends the selected method and optional `deliverySlotId` to the checkout-preview and order APIs. Preview displays server subtotal, delivery fee, total, and payment availability without placing an order. Unscheduled delivery does not promise a delivery time. Order creation consumes the cart; the sandbox result stays visible even when the cart is empty. Checkout retry keys survive retries in the mounted checkout, but not a full reload. Demo mode uses an in-memory cart and never creates orders or payments.

### Admin console

Use the **Admin** link in the storefront header or open `/#admin` directly after signing in as **App admin**. The surface is available only to that role:

```bash
VITE_APP_ENV=dev
VITE_API_BASE_URL=http://localhost:8080
```

`src/services/adminApi.ts` uses the bearer session and these routes. The dev seeded fallback uses `X-User-Id` only in `dev`.

- `GET /api/admin/shops?status=PENDING` — load the pending review queue.
- `POST /api/admin/shops/{shopId}/approve` — approve a shop after confirmation.
- `POST /api/admin/shops/{shopId}/reject` — reject a shop after confirmation, optionally sending `{ "reason": "..." }`.

The console shows seller and shop details, loading/error/empty states, asks for confirmation before each decision, and reloads the pending queue after a successful action so the displayed status comes from the backend. Admin controls are hidden for buyer, seller, support, and guest sessions.

### Customer orders

Use **Orders** in the storefront header or open `/#orders` directly after signing in as a buyer. `src/services/orderApi.ts` calls `GET /api/orders` for history and `GET /api/orders/{orderId}` for detail with the bearer session. Missing API configuration, missing buyer identity, and backend failures show explicit unavailable/error states; demo mode never fabricates order history.

### Support cases

Buyers can use **Support** in the storefront header, the **Need help with an order?** entry on `/#orders`, or open `/#support` to create and review cases. `src/services/supportApi.ts` calls these customer routes with the bearer session:

- `POST /api/support/cases` with `reasonCode`, `description`, and optional `orderId` or `shopId` — create an order-related, shop-related, or general case.
- `GET /api/support/cases` — list the signed-in buyer's cases.
- `GET /api/support/cases/{caseId}` — read one buyer-owned case.

Support operators and admins can open `/#support` to use the queue. The adapter sends the bearer session and restricts queue/detail/status calls in the browser to `SUPPORT` or `ADMIN` identities. The dev seeded fallback is the only case that uses `X-User-Id`.

- `GET /api/support/queue` with optional `status=OPEN|IN_REVIEW|RESOLVED|CLOSED` — load the support queue and operator-authorized case details. The individual-case GET endpoint is buyer-only.
- `PATCH /api/support/cases/{caseId}/status` with `{ "status": "OPEN|IN_REVIEW|RESOLVED|CLOSED", "resolutionNote": "..." }` — update a case status and optional resolution note.

The customer and operator views show loading, error, and empty states and keep the backend response as the displayed state. The workflow explicitly does not automatically perform refunds or any other financial decision. Without a valid account session, these views fail closed.

### Development-only refund requests

In `dev` only, a buyer can open an order detail from `/#orders` and submit a full or partial refund request with a reason. The buyer sees backend-owned status, decision notes, and request history. The UI sends the requested amount to the refund API and never calls a payment provider, fabricates a refund, or moves money automatically.

`src/services/refundApi.ts` uses the bearer session for real accounts and the existing seeded `X-User-Id` fallback only when the app is in `dev` and no bearer session exists:

- `POST /api/orders/{orderId}/refund-requests` with `Idempotency-Key` and `{ "amount": 125.00, "reason": "..." }` — create a buyer-owned request. The caller preserves the submission key for ambiguous retries, including session reloads.
- `GET /api/refunds` and `GET /api/orders/{orderId}/refunds` — read the signed-in buyer's requests.
- `GET /api/refunds?status=REQUESTED`, `UNDER_REVIEW`, and `APPROVED` — load and merge the review/completion queue. There is no generic status-update or `/api/refunds/queue` route.
- `PATCH /api/refunds/{requestId}/decision` with `{ "decision": "APPROVED|REJECTED", "note": "..." }` — record an explicitly confirmed authorized-human decision.
- `POST /api/refunds/{requestId}/sandbox-complete` — explicitly complete an approved refund through the local sandbox only.

Support and Admin users review these requests in `/#support`. Approval and rejection require a decision note and browser confirmation. These controls record the operational decision only; they do not claim a live refund, provider integration, payment-status change, or automatic money movement. UAT, preprod, and prod do not render the development refund surfaces.

### In-app notifications

Signed-in buyer, seller, support, and admin accounts can open **Notifications** from the bell in the shared navigation or `/#notifications`. `src/services/notificationsApi.ts` uses the existing bearer session adapter (and the explicit seeded `X-User-Id` fallback only in `dev`) for these protected routes:

- `GET /api/notifications` — load the current user's notifications.
- `GET /api/notifications/unread-count` — load the bell badge count.
- `POST /api/notifications/{id}/read` — mark one notification read.
- `POST /api/notifications/read-all` — mark all notifications read.

The center provides loading, error, empty, retry, mark-read, mark-all-read, and role-aware in-app links to orders, support, seller, or admin workspaces where the related context is safe. It refreshes after navigation and on a modest 60-second interval; it does not fabricate notifications when the API, session, or endpoint is unavailable. Email and SMS delivery are not connected.

Other available commands:

```bash
npm run build          # TypeScript check + fail-closed prod-mode Vite build
npm run check          # TypeScript + isolated API adapter contract tests
npm test               # Mocked-HTTP adapter regression tests
npm run build:dev      # Build with dev mode configuration
npm run build:uat      # Build with UAT configuration
npm run build:preprod  # Build with preprod configuration
npm run build:prod     # Build with prod configuration
npm run preview        # Serve the prod-mode build locally
```

## What is included

- Gurugram delivery location and local-demo badge
- Search across shops and products
- Accessible category tabs/chips, shop cards, and product cards
- One-shop cart drawer with local demo controls or server-backed cart refresh, quantity updates, and deletion
- Hash-routed local seller studio with accessible profile/shop forms, seller shop list, and backend-owned review statuses
- Seller order queue with backend-owned status transitions and honest unavailable/error states
- Customer order history and server-backed order detail at `#orders`
- Hash-routed admin console with pending-shop queue, seller/shop details, confirmed approve/reject actions, optional rejection reason, and refreshed backend status
- Honest server-priced checkout preview plus explicitly selected dev-only sandbox payment intent state; no real checkout or production payment claim
- Approved-shop fulfilment settings and capacity-controlled delivery slot management
- Live buyer pickup/delivery selection and slot-aware server checkout preview
- Loading, empty, and error states in the browse flow
- `src/services/catalogApi.ts` as the explicit API adapter and demo fallback boundary

## Structure

- `src/data/demo.ts` — seeded demo-only catalogue
- `src/config/environment.ts` — validated mode, public API URL, and fallback policy
- `src/services/authApi.ts` — API register/login/me/logout adapter, bearer session, and dev fallback state
- `src/AuthControls.tsx`, `src/LoginView.tsx`, and `src/VerifyEmailView.tsx` — role badge, account login/register/logout, recovery, verification, and dev fallback
- `src/services/catalogApi.ts` — catalogue API and demo fallback boundary
- `src/services/cartApi.ts` — server cart and checkout-preview adapter
- `src/services/sellerApi.ts` — bearer-authenticated seller onboarding, shop, and product catalogue adapter
- `src/SellerView.tsx` — hash-routed seller onboarding, shop management, and approved-shop catalogue surface
- `src/services/orderApi.ts` — bearer-authenticated customer order history/detail adapter
- `src/services/paymentApi.ts` — dev-only sandbox payment-intent adapter with server status polling and idempotent retries
- `src/OrdersView.tsx` — hash-routed customer order history and server-backed detail surface
- `src/services/adminApi.ts` — bearer-authenticated pending-shop review adapter
- `src/AdminView.tsx` — hash-routed admin queue and decision surface
- `src/services/supportApi.ts` — bearer-authenticated customer case and support queue/status adapter
- `src/SupportView.tsx` — customer case form/history and support/admin queue/status surface
- `src/services/refundApi.ts` — dev-only bearer-authenticated refund request/review adapter
- `src/OrdersView.tsx` — dev-only buyer refund request form and backend-owned refund history
- `src/SupportView.tsx` — authorized-human support/admin refund queue, status, decision note, and confirmation controls
- `src/services/notificationsApi.ts` — bearer-authenticated in-app notification adapter and safe related-context links
- `src/NotificationBell.tsx` and `src/NotificationsView.tsx` — shared navigation badge and hash-routed notification center
- `src/App.tsx` — storefront shell and interactions
- `src/styles.css` — responsive visual system
