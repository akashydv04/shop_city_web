# DukaanSetu web

A focused customer-facing storefront foundation for Gurugram neighbourhood commerce. Checkout is intentionally disabled, and there are no payment or authentication claims.

## Environment configuration

Vite modes are explicit and use the same four labels everywhere: `dev`, `uat`, `preprod`, and `prod`. Public frontend configuration is limited to the catalogue API base URL, the environment label, and whether demo fallback is allowed. Do not put API keys, credentials, payment secrets, or auth tokens in Vite env files; `VITE_*` values are bundled into browser code.

Copy the example for the mode you need to a mode-specific local file:

```bash
cp .env.dev.example .env.dev.local
# edit VITE_API_BASE_URL when a reachable catalogue service is available
```

For the running local stack, the backend is available at `http://localhost:8080` and the web app can be started with:

```bash
VITE_APP_ENV=dev VITE_API_BASE_URL=http://localhost:8080 VITE_ALLOW_DEMO_FALLBACK=false npm run dev -- --host 0.0.0.0 --port 5174
```

The UAT, preprod, and prod examples disable demo fallback. Production is fail-closed in code even if `VITE_ALLOW_DEMO_FALLBACK=true` is accidentally supplied: without `VITE_API_BASE_URL`, the catalogue shows an error instead of demo data. A configured URL is only a catalogue endpoint; this app makes no payment or authentication claims.

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

With `VITE_API_BASE_URL` set, the app makes `GET /api/shops?city=Gurugram` and maps each shop's nested products into the storefront types. The backend should be reachable from the browser (including CORS configuration where applicable). If the request fails, the UI keeps its error state and retry action; it does not silently fall back to demo data.

Other available commands:

```bash
npm run build          # TypeScript check + fail-closed prod-mode Vite build
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
- One-shop cart drawer with quantity controls and clear demo-only checkout state
- Loading, empty, and error states in the browse flow
- `src/services/catalogApi.ts` as the explicit API adapter and demo fallback boundary

## Structure

- `src/data/demo.ts` — seeded demo-only catalogue
- `src/config/environment.ts` — validated mode, public API URL, and fallback policy
- `src/services/catalogApi.ts` — future backend integration boundary
- `src/App.tsx` — storefront shell and interactions
- `src/styles.css` — responsive visual system
