# Architecture

## Overview

```
 Expo app (iOS / Android / Web) ──HTTPS──▶  NestJS API  ──▶ PostgreSQL + PostGIS
          │   signed PUT                     │   │                 (pg_trgm, unaccent, tsvector)
          └──────────────▶ Cloudflare R2 ◀───┘   └──▶ Expo Push service, SMTP
 Next.js admin ──(same-origin /api/proxy, httpOnly cookies)──▶ NestJS API (/admin/*)
```

A **modular monolith**: one NestJS service with clear module boundaries (auth, users, providers, listings, search, organizations, engagement, reviews, notifications, analytics, media, moderation, subscriptions, admin). Each module owns its service logic; controllers only validate and delegate. Modules can be split into services later if load justifies it.

## Key decisions

| Decision | Why |
|---|---|
| **One account for everyone** — provider is an optional storefront linked 1:1 to a user | Spec: users are not forced to choose a role. One storefront per user keeps ownership checks simple; a business with branches uses multiple *locations*. |
| **Listing = the unit of search** | Providers have many listings across categories; search ranks listings and shows the provider on each card. |
| **Zod schemas in `packages/shared`** used by the app (forms), the API (validation pipe) and Swagger (JSON Schema) | One source of truth for validation on client and server. |
| **Raw parameterised SQL for search and geo** (Prisma tagged templates) | PostGIS `ST_DWithin`/`ST_Distance`, `tsvector`, trigram similarity and keyset pagination run in one statement in the database. |
| **Public vs private location** | Each location stores the exact point (private) and a public point (exact if the provider opts in, otherwise rounded to ~500 m). All public distances and radius filters use the public point, so results cannot be used to triangulate a home address. |
| **Visibility rules in one place** (`AccessService`) | Search, listing detail, provider pages and favourites all use the same SQL predicate / check. A composite foreign key guarantees a listing's group belongs to its organization. |
| **Refresh-token rotation with family revocation** | Refresh tokens are random, stored hashed, single-use; reuse of a rotated token revokes the whole family. Access tokens are short-lived JWTs (15 min). |
| **AuthGuard reloads user status and admin permissions from the DB** (30 s cache, invalidated on changes) | Suspensions and role changes take effect immediately; tokens never carry authorization claims. |
| **Database-backed notification outbox** instead of Redis/BullMQ | `NotificationDelivery` rows are claimed with `FOR UPDATE SKIP LOCKED`, retried with exponential backoff, and receipts are checked later. No extra infrastructure; safe with several API replicas. Swap for a queue if volume grows. |
| **Analytics: raw events + daily aggregates** | Raw `AnalyticsEvent` rows are pruned after 90 days; dashboards read `ProviderAnalyticsDaily`. Search appearances go straight into the aggregate in one statement per search, so they never create per-result rows. |
| **Sponsored results are a separate list** | Paid placements match the same filters, are labelled "Sponsored" and never change organic ranking. |
| **Admin portal as a BFF** | The Next.js server holds the admin's tokens in httpOnly, SameSite=Strict cookies and proxies an allow-list of API paths. Mutations need a custom header (CSRF defence in depth). The API still authorises every request. |
| **Radar map instead of a tile map** | The Stitch search design is a stylised "radar" with the user at the centre and pins at their real offsets. It works identically on native and web without map API keys; "Get directions" opens Google Maps. |

## Request flow (search)

1. App builds params from the search store (query, filters) and location store (GPS or manual place, radius).
2. `SearchService.resolve` turns a typed area into coordinates (gazetteer, then provider-location centroid), expands a parent category to its children, matches category names/aliases against the text, and loads the viewer's memberships (validating org/group scope).
3. One SQL statement filters (status, visibility, type, category, org/group, price overlap, rating, verified, availability, provider type, text, radius — including provider service areas and product delivery radii), ranks, and paginates with an opaque `(sortKey, id, now)` cursor.
4. First page only: total count, sponsored placements, search-appearance counters, and a `SearchEvent` (location rounded to ~1 km).

## Security & privacy

Argon2id password hashing; constant-time-ish login (dummy hash for unknown users); rate limits (global + strict on credential endpoints); Helmet; strict CORS allow-list; 100 kB JSON limit; Zod validation on every input; uploads validated by type/size/purpose and confirmed by checking the stored object; private media served only to owners and verifying admins; internal moderation notes never serialised; audit log for auth, admin and destructive actions; account deletion and data export endpoints.

Web app token storage: refresh token in `localStorage` (SecureStore is native-only). Mitigations: no third-party scripts, short access-token lifetime, refresh rotation with reuse detection. A future hardening step is a same-site cookie BFF for the public web app, like the admin portal.

## Background jobs (`@nestjs/schedule`)

| Job | Schedule |
|---|---|
| Push delivery worker | every 5 s |
| Push receipt check | every 15 min |
| Subscription expiry, promotion start/end | hourly |
| Analytics raw-event pruning (90 d), search-event pruning (180 d) | nightly |
| Abandoned upload cleanup, expired tokens/invitations, old deliveries | nightly |
