# DukaanSetu — frontend development report

**Date:** 22 October 2026 (Asia/Kolkata)  
**Application:** DukaanSetu local-commerce website  
**Frontend:** `shop_city_web`  
**Companion API:** `shop_city_backend`

## 1. Executive summary

This development pass completed a broad integration and usability update across the existing buyer, seller, admin, support, refund, and notification screens. It corrected concrete API-contract mismatches, made the cart's asynchronous operations safer, exposed inventory and order/payment details, removed misleading/nonfunctional controls, and added repeatable frontend regression tests to CI.

**Release assessment: ready for local/API-backed acceptance testing, not certified production-ready or complete for every possible marketplace feature.** The implemented frontend is bounded by the existing backend. Live payments, delivery-address handling, durable fulfilment details, real email/SMS, and comprehensive authenticated browser acceptance testing remain outstanding. These are not presented as completed below.

### Evidence from this pass

- Frontend TypeScript checking passed.
- **13 frontend API-adapter regression tests passed**, with no failures or skips.
- Production, development, UAT, preprod, demo, and API-mode builds passed. Production was rebuilt after the final responsive CSS adjustment.
- **60 backend tests across 17 suites passed**, with no failures, errors, or skips in the Gradle XML results.
- Whitespace checks passed in both repositories.
- API-backed web returned HTTP 200; backend health returned `UP`.
- Built-in browser displayed the live public catalogue and stock labels at a 310-pixel viewport. Opening the guest cart and dismissing it with Escape were verified, including focus restoration to Cart.
- A subsequent shop-arrow browser dispatch failed before execution. That action and authenticated role flows are **not** claimed as browser-verified.
- No commit, push, deployment, real payment, or real refund was performed in this pass.

## 2. Feature inventory

“Implemented” means the frontend exists and is wired to the current contract; it does not imply every flow passed a real-browser end-to-end test. Automated checks use mocked HTTP for frontend adapters and the backend's test profile for integration tests.

### Public storefront

| Feature | Current result | Qualification |
| --- | --- | --- |
| Shop/product discovery | Loads public shops and their products from `/api/shops` | Current city query is Gurugram |
| Search | Filters shop and product names/descriptions | Client-side search of loaded catalogue |
| Keyboard search | Ctrl/Command + K focuses search | Does not steal focus while a storefront modal is open |
| Categories | Category filters and reset behaviour | Category inference is a frontend heuristic when API categories are absent |
| Shop selection | Avatar/arrow selects a shop, filters products and scrolls to product section | Browser automation of the arrow was not completed |
| View all | Clears search, category and selected-shop filters | Returns to shop list |
| Product details | Detail dialog, price, description and stock label | Reads the loaded catalogue, not a separate live availability request |
| Inventory | Shows available quantity; disables sold-out additions and additions beyond loaded stock | Final inventory validation remains server-owned |
| Shop metadata | Missing rating shows “Not rated”; missing opening hours do not imply open or closed | No fabricated distance/opening-hours claims |
| Loading/error/empty states | Explicit messages and retry controls | API failures do not masquerade as demo success |
| Saved items | Nonfunctional hearts removed | No favourites persistence API exists; not implemented |
| Location selection | Decorative dropdown removed | Multi-city/address selection is not implemented |

### Accounts and access

- Buyer/seller registration, sign-in, logout and session restoration.
- Role-aware navigation for buyer, seller, support and admin.
- Explicit seeded-role login restricted to development configuration.
- Password-reset request and confirmation now use the backend's actual routes.
- Email-verification resend is for the signed-in account, not an arbitrary email address.
- Token verification remains available through the public verification-token endpoint.
- Real requests use bearer authentication; seeded user headers are development-only.
- Development recovery tokens are not exposed by the adapter in non-development modes.
- Real email delivery is not connected. The UI does not claim that email was sent.

### Buyer cart and fulfilment

- Server-backed cart load, add, quantity change and last-item removal.
- Cart loads even when the public catalogue is empty, preserving server-returned product names/prices.
- One-shop cart restriction and server-derived cart totals.
- Cart read/mutation/preview/payment operations are serialized to avoid stale overlapping operations.
- Account-specific storefront state resets when the account changes; stale results are guarded.
- Failed additions are visible rather than hidden in an unopened drawer.
- Refresh invalidates a stale checkout preview and preserves a still-valid fulfilment choice.
- **Take away** maps to `PICKUP`; **Home delivery** maps to `DELIVERY`.
- Shop availability flags, delivery fees, `localDate` slots, and remaining slot capacity are mapped correctly, including direct API responses.
- No-slot delivery is explicitly unscheduled under the current optional-slot API contract. It does not promise an arrival time.
- Server-priced checkout preview remains separate from order/payment creation.
- Development checkout creates a test order and sandbox payment intent only after explicit selection.
- Order creation consumes the matching cart; order/payment results remain visible outside the nonempty-cart section.
- Ambiguous checkout retries retain the same frozen request and idempotency keys while the checkout remains mounted.
- Real checkout, delivery-address capture, and live money movement are not implemented.

### Buyer orders and refunds

- Order history and server-backed detail views.
- Shop name, items, quantities, totals, created/updated timestamps.
- Payment method and payment status display.
- Backend status-history timeline.
- Development-only full/partial refund requests with a reason.
- Caller-owned refund idempotency keys survive retries and session reloads through session storage, with in-memory fallback.
- Refund history, decision notes and status history from backend responses.
- Refund submission is a request for human review, never automatic money movement.

### Seller studio

- Seller profile/contact onboarding and shop creation/listing.
- Correct display of backend `verificationStatus: VERIFIED` using the existing approved UI state.
- Approved-shop product creation and editing: name, description, price, stock, active state.
- Low-stock watch based on current inventory data, not an AI prediction.
- Seller order queue and supported status transitions.
- Take-away/home-delivery enablement and fee settings using the correct PATCH operation.
- Minimum-order and business-timezone form fields with validation.
- Delivery-slot creation, listing and enable/disable controls.
- Slot payload uses `localDate`; response maps `reservedCount` to displayed bookings.

### Admin and support

- Admin pending-shop queue, seller/shop detail, approve/reject confirmation and refresh.
- Customer support cases can be general, shop-related or order-related.
- Only the relevant order/shop identifier is submitted for each case type.
- Support/admin queue filters: all, open, in review, resolved and closed.
- Operator detail reads use the authorized queue route rather than the buyer-only detail route.
- Case status changes and resolution notes.
- Refund review includes requested, under-review **and approved** items, so approved requests remain accessible after reload.
- Removed the generic refund status-save control that had no backend implementation.
- Approve/reject require an explicit decision note and confirmation.
- Approved requests have a separate, development-only “Complete in sandbox” action.

### Notifications and UI behaviour

- Notification center, unread badge, mark-one-read and mark-all-read.
- Backend `readAt` drives persistent read state after refresh.
- Backend related entity type/id are retained; links go only to known role-appropriate in-app workspaces.
- Links are workspace navigation, not guaranteed auto-selection of the exact related record.
- Responsive storefront, seller, order and support layouts.
- Cart/product dialogs support Escape, focus containment/restoration and body scroll locking.
- Cart close/refresh controls remain visible on mobile.
- Narrow-screen header wrapping and long shop-metadata wrapping were improved.
- No formal WCAG conformance or cross-browser accessibility certification is claimed.

## 3. Important defects corrected

| Area | Previous defect | Correction |
| --- | --- | --- |
| Cart fulfilment | Empty `{}` from a missing `data` envelope swallowed a valid direct response | Fall back to the actual root payload |
| Slot mapping | `localDate` / `reservedCount` did not match frontend names | Translate fields and filter full slots |
| Checkout display | Payment availability was hardcoded false | Preserve server-owned availability and status |
| Empty cart | Failed route could appear as an empty cart | Surface 404/error responses; use successful empty snapshot |
| Cart state | Reads, mutations and preview/payment could overwrite one another | Operation guards, invalidation and account isolation |
| Payment outcome | Empty-cart UI could hide the order/payment result | Render checkout outcome independently of cart lines |
| Auth recovery | Password reset and verification resend routes were wrong | Align all three paths to backend controllers |
| Seller settings | PUT sent to a PATCH-only fulfilment endpoint | Correct method and preserve settings fields |
| Seller slot creation | Sent `date` rather than `localDate` | Translate request and response at adapter boundary |
| Refund creation | Required idempotency header missing | Caller supplies a stable submission key |
| Refund review | Generic status action always threw | Remove unsupported action; retain decisions and sandbox completion |
| Refund completion | Approved items disappeared from the queue | Include APPROVED and expose explicit completion |
| Support | UI required an order for every case | Add case scopes matching optional backend fields |
| Operator case detail | Used buyer-only GET endpoint | Read authorized queue payload |
| Notifications | Ignored read timestamp and related-entity field names | Map backend fields and safe workspace destinations |
| Product cards | Offered purchase of known zero-stock products | Stock-aware labels and disabled additions |
| Metadata/controls | Fake opening-hours defaults and dead favourites buttons | Honest missing data and removal of unsupported controls |

## 4. API contracts used

### Public/authentication

```text
GET   /api/shops?city=Gurugram
POST  /api/auth/register
POST  /api/auth/login
GET   /api/auth/me
POST  /api/auth/logout
POST  /api/auth/request-password-reset
POST  /api/auth/reset-password
POST  /api/auth/request-email-verification
POST  /api/auth/verify-email
POST  /api/auth/dev-login                      [development only]
```

### Cart/orders

```text
GET    /api/carts/current
POST   /api/carts/items
PATCH  /api/carts/current/items/{productId}
DELETE /api/carts/current/items/{productId}
GET    /api/carts/current/fulfilment-options?shopId={id}
POST   /api/carts/current/checkout-preview
GET    /api/orders
GET    /api/orders/{orderId}
POST   /api/orders                            [Idempotency-Key]
POST   /api/orders/{orderId}/payment-intents   [Idempotency-Key; dev UI]
GET    /api/orders/{orderId}/payment
```

The preview and create-order payloads carry `fulfilmentMethod` and an optional `deliverySlotId`. Amounts remain server-calculated. The browser never calls a payment provider webhook.

### Seller/admin

```text
GET/PUT    /api/seller/profile
GET/POST   /api/seller/shops
GET/POST   /api/seller/shops/{shopId}/products
PATCH      /api/seller/shops/{shopId}/products/{productId}
GET/PATCH  /api/seller/shops/{shopId}/fulfilment
GET/POST   /api/seller/shops/{shopId}/delivery-slots
PATCH      /api/seller/shops/{shopId}/delivery-slots/{slotId}
GET        /api/seller/orders
POST       /api/orders/{orderId}/status
GET        /api/admin/shops?status=PENDING
POST       /api/admin/shops/{shopId}/approve
POST       /api/admin/shops/{shopId}/reject
```

### Support/refunds/notifications

```text
GET/POST /api/support/cases
GET      /api/support/cases/{caseId}           [buyer-owned]
GET      /api/support/queue                   [optional status filter]
PATCH    /api/support/cases/{caseId}/status
POST     /api/orders/{orderId}/refund-requests [Idempotency-Key]
GET      /api/refunds                         [optional status filter]
PATCH    /api/refunds/{id}/decision
POST     /api/refunds/{id}/sandbox-complete    [development UI only]
GET      /api/notifications
GET      /api/notifications/unread-count
POST     /api/notifications/{id}/read
POST     /api/notifications/read-all
```

## 5. Verification and reproducibility

### Frontend checks executed

From `shop_city_web`:

```bash
npm run check
npm test
npm run build
npm run build:dev
npm run build:uat
npm run build:preprod
npx vite build --mode demo
npx vite build --mode api
git diff --check
```

All passed on their final executions. A clean `npm ci` followed by `npm run check` and `npm run build` also passed after the final source changes. Each build writes the same `dist` directory; deploy only a fresh production build with the intended production configuration, not the last arbitrary mode output.

Final measured production output at that check: approximately **420.60 kB JS (115.74 kB gzip)** and **61.01 kB CSS (11.73 kB gzip)**. These are bundle measurements, not a performance or load-test result.

### New frontend regression suite

Files: `tests/api-contracts.test.mjs` and `tests/adapter-harness.mjs`.

The suite runs the actual adapter source with isolated configuration/authentication and mocked HTTP responses. It uses Node's test runner and pinned Rolldown to compile TypeScript modules in memory. `npm run check` separately typechecks the application. No test sends real credentials or writes to the live backend.

Covered cases:

1. Direct/wrapped fulfilment payloads, local dates, remaining capacity and full slots.
2. Cart CRUD routes and snapshots without catalogue data.
3. Cart API failure propagation instead of false empty-state success.
4. Delivery selection and server checkout totals/state.
5. Seller PATCH settings, slot payload/response fields and verification status.
6. Order shop name, payment state, timestamps and timeline mapping.
7. Refund idempotency requirement and reuse after simulated network failure.
8. Approved refund queue inclusion and development-only sandbox completion.
9. Notification read state and role-safe destinations.
10. General/shop support cases and operator queue filters/details.
11. Catalogue stock and honest unknown metadata.
12. Actual recovery/verification paths and authenticated resend.
13. Non-dev suppression of development tokens and seeded authentication.

**Result: 13 passed, 0 failed, 0 skipped.** The first harness attempt assumed the older TypeScript compiler API, which is absent in the installed TypeScript 7 package; the harness now uses Rolldown. The tests then caught missing reserved-capacity calculation, which was fixed before the final passing run.

CI now runs `npm test` in addition to the existing build jobs. CI was edited locally; no remote CI run is claimed.

### Backend checks executed

From `shop_city_backend`:

```bash
./gradlew test --no-daemon --console=plain
git diff --check
```

**Result: BUILD SUCCESSFUL; 60 tests, 17 suites, no errors/failures/skips.** Suites cover account recovery (including non-dev behaviour), authentication, carts, core orders, order operations, seller onboarding/catalogue, fulfilment, notifications, payment/refund sandbox, environment safety and seeded configuration.

Evidence: `shop_city_backend/build/test-results/test/TEST-*.xml` and the generated Gradle HTML test report. These use the backend test profile; they are not PostgreSQL durability or production deployment checks.

### Browser/runtime checks and limits

- `http://localhost:5174/` returned HTTP 200 and rendered the API catalogue in the built-in browser.
- `http://localhost:8080/health` returned `UP`.
- Guest Cart opened with an explicit sign-in requirement, rather than a fake local API cart.
- Mobile Close/Refresh controls were present; Escape dismissed the dialog and focus returned to Cart.
- Mobile header wrapping was checked through fresh browser element bounds.
- A shop-arrow dispatch failed before execution; no successful arrow click is claimed for this pass.
- No authenticated multi-role browser run, provider webhook completion, screen-reader audit, load test, or cross-browser matrix was completed.

## 6. Remaining work and release blockers

### Required before real commerce

1. **Delivery addresses and fulfilment persistence.** The cart can select home delivery, but there is no complete address capture/validation flow. The current order entity/response does not persist/expose the selected fulfilment method, delivery-slot association or separate fee breakdown. Charging a delivery fee is not equivalent to a deliverable order. Add the backend contract and migration, then the address/fulfilment detail UI.
2. **Live payments/refunds.** Existing payment and refund controls are local sandbox workflows. A real provider, reconciliation, secure webhook operations and settlement are not connected. Do not enable sandbox controls as production checkout.
3. **Checkout recovery across reload.** Checkout order/payment retry keys currently survive only the mounted checkout. Reload/navigation can lose an ambiguous in-flight attempt; durable server-linked recovery is needed before production. Refund submission keys have stronger session-level persistence, but this does not solve order recovery.
4. **Delivery capacity lifecycle.** Existing backend order work reserves a selected slot. Durable linkage and appropriate cancellation/release behaviour need further backend work and dedicated tests. The optional-slot contract must also be agreed for real delivery operations.
5. **Real account recovery delivery.** Email/SMS providers are absent. Development tokens are not a production recovery mechanism.
6. **Authenticated browser acceptance.** Execute the checklist below with buyer/seller/admin/support accounts. Adapter and backend tests independently passing do not prove the full UI-to-server path.
7. **Production persistence/deployment.** PostgreSQL migration/durability verification, deployment configuration, monitoring, backups, transport/session hardening and operational security review remain separate work. No such readiness is certified here.

### Features not implemented or only partially represented

- Persisted saved shops/products/favourites (dead buttons were removed, not replaced with false persistence).
- Multi-city selection, geolocation, maps, serviceability/pincode checks or delivery tracking.
- Product/shop images upload, a reviews/ratings system, coupons, promotions or wishlist APIs.
- Real-time inventory push; catalogue stock remains a snapshot and checkout must revalidate.
- Exact notification-record deep-link selection; links currently navigate to the relevant workspace.
- A fresh backend shop-detail/product-availability request when opening every card.
- Buyer self-service order cancellation, a production payment-method selector and address book.
- Full desktop/tablet/mobile browser matrix and formal accessibility/performance certification.
- AI/voice features, advanced analytics, staff/branch permissions or mobile-app completion.

These are disclosed gaps, not hidden behind “all features completed.” The current work completes a substantial frontend integration pass against existing APIs, not the entire future product roadmap.

## 7. Local usage and acceptance checklist

Start the API using the project's existing, intended database configuration. Do not overwrite local configuration or restart an in-memory database without accounting for its data.

Frontend:

```bash
cd shop_city_web
npm ci
npm run check
npm run dev:api     # http://localhost:5174
# Separate terminal if a demo-only storefront is desired:
npm run dev:demo    # http://localhost:5173
```

Use real registered accounts where possible. Seeded Buyer/Seller/Support/Admin fallback is for the configured development backend only. Never put real provider secrets in `VITE_*` variables; they are browser-visible.

### Buyer

- Browse, search, select a category/shop, then View all.
- Open product details, close by button/Escape, verify focus restoration.
- Sign in, add stock, verify the cart count, increment/decrement, remove the final line, then select another shop.
- Reload and confirm the API cart is restored; sign out and confirm prior-account cart details disappear.
- Select Take away, preview; change to Home delivery, inspect fee and optional time slot, preview again.
- Explicitly opt into sandbox checkout only for testing. Confirm an order is created once, the cart is consumed, and pending/payment results remain visible.
- Review order detail, payment state and timeline.
- Submit general, shop-related and order-related support cases.
- For an eligible paid test order, submit/refetch a refund request and inspect its history.

### Seller

- Complete profile, submit shop and inspect pending status.
- After admin approval, create/update a product and stock/active state.
- Configure take away/home delivery, fee, minimum order and timezone.
- Create a future slot, confirm date/capacity/bookings, toggle it, and verify it in buyer options.
- Load the order queue and perform only permitted status transitions.

### Admin/support

- Admin approves/rejects a submitted shop and verifies the refreshed queue.
- Operator filters support cases through their lifecycle and records a resolution note.
- Reviewer approves/rejects an eligible refund with a note.
- Approved refund remains accessible after refresh; explicit sandbox completion updates the backend state.
- Confirm unauthorized roles cannot perform the same operations through direct API calls.

### Notifications

- Verify unread count, read-one/read-all behaviour after refresh, and role-appropriate workspace links.

## 8. Changed files and delivery state

### Frontend application

- `src/App.tsx` — storefront/cart concurrency, checkout outcome, stock rendering, navigation and dialogs.
- `src/useModalFocus.ts` — new modal focus/Escape/scroll-lock helper.
- `src/styles.css` — stock/disabled-state styling, mobile controls and wrapping.
- `src/types.ts` — inventory and optional shop metadata.
- `src/OrdersView.tsx` — payment/timeline display and stable refund submissions.
- `src/SellerView.tsx` — minimum-order/timezone configuration and richer order labels.
- `src/SupportView.tsx` — scoped case creation, queue filters and supported refund review/completion.
- `src/VerifyEmailView.tsx` — signed-in verification resend flow.
- `src/NotificationsView.tsx` — read-state and related-context rendering.
- `src/services/authApi.ts`, `cartApi.ts`, `catalogApi.ts`, `notificationsApi.ts`, `orderApi.ts`, `refundApi.ts`, `sellerApi.ts`, `supportApi.ts` — contract fixes and state mapping.

### Verification/documentation

- `tests/adapter-harness.mjs` and `tests/api-contracts.test.mjs` — new repeatable test suite.
- `package.json` / `package-lock.json` — test/check commands and pinned test compiler dependency.
- `.github/workflows/ci.yml` — adapter tests added to CI.
- `README.md` — corrected route/method documentation and verification guidance.
- `DEVELOPMENT_REPORT.md` — this report.

### Existing backend work preserved and tested

The workspace already contained uncommitted cart/fulfilment changes from the preceding requests in:

- `shop_city_backend/src/main/kotlin/com/dukaansetu/api/ApiModels.kt`
- `shop_city_backend/src/main/kotlin/com/dukaansetu/service/Services.kt`
- `shop_city_backend/src/test/kotlin/com/dukaansetu/CartIntegrationTest.kt`
- `shop_city_backend/src/test/kotlin/com/dukaansetu/OrderOperationsIntegrationTest.kt`

Those changes were preserved and included in the passing backend test run; they were not represented as newly completed production delivery infrastructure.

**Delivery state:** source changes and this report are saved locally and remain uncommitted. No repository was pushed and no remote environment was deployed. The next release gate is authenticated end-to-end acceptance followed by the backend/production blockers in section 6.
