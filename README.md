# PicoSEO — Zero-Bloat Shopify SEO, JSON-LD, IndexNow & `/llms.txt` AI Feed

**PicoSEO** is a zero-bloat Shopify application built with **Remix**, **Prisma/PostgreSQL**, **Shopify Admin GraphQL (`2025-10`)**, and a **100% Liquid Theme App Extension** (`0.0 kB` client-side JavaScript).

## Core Capabilities

1. **Resilient GraphQL Catalog Auditor & 1-Click Bulk Fixer**
   - Audits up to 50 recently updated products via the Shopify Admin GraphQL API without restrictive status filters.
   - Traverses `featuredImage`, `MediaImage` nodes, and variant images with `width=300` CDN transforms and `object-fit: contain` rendering.
   - Computes a deterministic `0–100` **SEO & AI Readiness Score** and repairs missing SEO titles, meta descriptions, and media alt texts in 1 click (per-product or bulk).
   - Refreshes the loaded audit on demand and exports the currently filtered products to a spreadsheet-safe CSV.
   - Leaves healthy products untouched unless overwrite is explicitly requested, and reports partial bulk failures.
2. **Zero-JavaScript Liquid JSON-LD Schema & Core Web Vitals LCP Preload**
   - Theme App Extension (`extensions/picoseo-schema/blocks/picoseo-head.liquid`) injects `Product`, `Offer`, `Brand`, and Conversational `FAQPage` JSON-LD plus `<link rel="preload" as="image" fetchpriority="high">` into `<head>` with zero client-side JS.
3. **Automated AI Crawler Feed (`/llms.txt`)**
   - App Proxy route (`/apps/picoseo/llms.txt` redirected from `/llms.txt`) outputs a structured Markdown catalog summary for ChatGPT, Perplexity, and Claude product citations.
4. **Instant IndexNow Search Engine Pinger**
   - Automatically pings `https://api.indexnow.org/indexnow` on `products/update` webhooks and manual 1-click optimizations.
5. **Wide Centered Native Shopify Billing (`/app/billing`)**
   - Single-tier **PicoSEO Pro** subscription with a 7-day free trial powered natively by `appSubscriptionCreate`.

## Built-for-Shopify Admin Routes

- `/app` — **SEO & AI Overview**: Live system health bar, dismissible Theme Editor deep-link onboarding banner, Store SEO & AI Readiness Score hero gauge, 3 KPI tiles, interactive Product SEO Audit Table, and Partner Revenue Suite footer.
- `/app/settings` — **Automation Studio & Live SERP Customizer**: Two-column split layout with clickable dynamic token chips and a sticky live preview switching between Google Search Snippet, AI Answer Engine Citation, and raw `/llms.txt` views across Desktop and Mobile bezels.
- `/app/simulator` — **Live SEO & Speed Simulator**: Interactive diagnostic sandbox inspecting resolved meta tags, generated media alt texts, JSON-LD schema payload, simulated Core Web Vitals impact, and a 1-click **Run Live IndexNow & Schema Test** action.
- `/app/billing` — **Subscription & Billing**: Centered `800px` single-tier **PicoSEO Pro** card with native Shopify billing.

## Vercel Production Deployment

1. Import `harishamouti-cyber/pico-seo-shopify-app` into Vercel.
2. Create a persistent PostgreSQL database (for example, Neon or Supabase).
3. Configure the environment variables documented in [`.env.example`](.env.example)
   in Vercel's secret settings. `DATABASE_URL` is the Prisma-compatible pooled
   runtime connection; `DIRECT_URL` is the direct/unpooled migration connection.
   Both can point to the same database URL for a local PostgreSQL server.
4. Give Preview deployments a separate database or provider branch. **Do not
   configure Preview builds to run migrations against the production database.**
5. Vercel executes `npm run vercel-build`
   (`prisma generate && prisma migrate deploy && remix vite:build`).
   A missing database or failed migration stops the build instead of deploying
   an app with temporary storage.
6. Verify app launch from Shopify Admin after deploying. For the authentication
   changes, ensure the deployed commit is the one containing the fix.

### Persistent storage and migration

Sessions, merchant settings, IndexNow keys, and optimization history now use a
shared PostgreSQL database. The runtime never changes `DATABASE_URL` or creates
tables. `npm run setup` generates the Prisma client and applies committed
migrations; `npm run db:deploy` applies migrations alone.

The existing PostgreSQL initial migration is unchanged. The Prisma schema matches
its `SubscriptionStatus` enum, so an already-migrated PostgreSQL database does not
need a reset. Do not use `prisma migrate reset` against merchant data.

Earlier versions used `file:/tmp/dev.sqlite` on Vercel. That storage was
temporary and isolated per instance; surviving SQLite records are **not**
automatically copied to PostgreSQL. Export any recoverable merchant settings
and history before switching an existing installation. Sessions can be obtained
again through Shopify's session-token flow; merchant preferences and old
history cannot be reconstructed if the temporary files are already gone.
If IndexNow keys change, save settings to synchronize storefront redirects.
PostgreSQL's existing records must be backed up using your provider's tools.

### Troubleshooting app launch

- An expired access token must be allowed to trigger Shopify's original
  reauthentication response, including its App Bridge headers. Do not convert
  that response to a generic JSON error or an empty catalog.
- A plain `401` now offers **Retry Shopify connection**, which starts a new
  document request without replaying the old `id_token`. Shopify's own HTML
  redirect responses are still handled by its Remix boundary.
- If retrying still fails, verify that `SHOPIFY_API_KEY` matches `client_id` in
  `shopify.app.toml`, the secret belongs to that same app, and
  `SHOPIFY_APP_URL` matches the deployed HTTPS origin and configured redirect
  URLs. Check server logs without sharing tokens or secrets.
- After deployment, verify launch from Shopify Admin, navigation between app
  pages, and reconnecting after an expired session. An unauthenticated HTTP
  check alone cannot prove an installed merchant's session works.

## Local checks

Start a local PostgreSQL server, copy `.env.example` to `.env`, and configure
`DATABASE_URL`, `DIRECT_URL`, and Shopify credentials. Keep real credentials
out of Git.

```sh
npm ci
npm run setup
npm test
npm run test:database
npm run typecheck
npm run build
```

The regression suite covers authentication response propagation, failed audit
and mutation handling, non-destructive bulk optimization, recovery URLs, and
CSV escaping/formula protection. Unit tests mock external services.
`npm run test:database` uses a real **isolated test PostgreSQL database**, with
the committed migrations applied, to verify session and settings persistence
through independent clients. It creates and removes only uniquely named test
shop records. Never point this suite at a live merchant database.

GitHub Actions runs unit tests, type checking, PostgreSQL integration tests,
the Vercel build, and a migration/schema drift check. These checks do not replace
a signed-in Shopify Admin acceptance test or validate production credentials.
