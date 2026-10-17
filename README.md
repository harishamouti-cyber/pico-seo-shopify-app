# PicoSEO — Zero-Bloat Shopify SEO, JSON-LD, IndexNow & `/llms.txt` AI Feed

**PicoSEO** is a zero-bloat, zero-server-cost Shopify application built with **Remix**, **Prisma**, **Shopify Admin GraphQL (`2025-10`)**, and a **100% Liquid Theme App Extension** (`0.0 kB` client-side JavaScript).

## Core Capabilities

1. **Resilient GraphQL Catalog Auditor & 1-Click Bulk Fixer**
   - Audits all catalog products via the Shopify Admin GraphQL API without restrictive status filters.
   - Traverses `featuredImage`, `MediaImage` nodes, and variant images with `width=300` CDN transforms and `object-fit: contain` rendering.
   - Computes a deterministic `0–100` **SEO & AI Readiness Score** and repairs missing SEO titles, meta descriptions, and media alt texts in 1 click (per-product or bulk).
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
2. Configure the environment variables documented in [`.env.example`](.env.example).
3. Vercel automatically executes `npm run vercel-build` (`prisma generate && prisma migrate deploy && remix vite:build`).
