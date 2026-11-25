# Database

PostgreSQL 17 with **PostGIS 3.5**, **pg_trgm**, **unaccent**, **pgcrypto**. Schema: `apps/api/prisma/schema.prisma`. All primary keys are UUIDs (`gen_random_uuid()`), every table has `createdAt`/`updatedAt` where it changes, money is `numeric(12,2)`.

## Entities

| Area | Tables |
|---|---|
| Identity | `User` (profile fields included; `email`/`passwordHash` null for phone sign-in accounts; a verified phone is unique via a partial index; a check keeps an email or verified phone on every account), `RefreshToken` (hashed, family), `EmailToken` (verify/reset, hashed), `OtpChallenge` (SMS codes, HMAC only, attempt-limited) + `OtpDelivery`, `DeviceToken` |
| Administration | `AdminRole`, `AdminPermission`, `AdminRolePermission`, `UserAdminRole`, `ModerationReport` (all report types incl. reviews), `AuditLog` |
| Media | `Media` (one row per stored object; `isPrivate` for credentials) |
| Catalogue | `Category` (two levels via `parentId`), `CategoryAlias` |
| Providers | `Provider` (1:1 with User), `ProviderLocation` (`location` private, `publicLocation` public), `ServiceArea` (centre + radius), `ProviderAvailability`, `ProviderMedia` (gallery), `ProviderCredential` |
| Listings | `Listing`, `ServiceDetails`, `ProductDetails`, `ListingMedia` |
| Portfolio | `PortfolioProject`, `PortfolioMedia` |
| Reviews | `Review` (unique per author+provider), `ReviewResponse`, `ReviewMedia` |
| Community | `Organization`, `OrganizationMembership`, `Group` (nullable `organizationId` = standalone), `GroupMembership`, `OrganizationInvitation` |
| Bookings & messaging | `Booking` (status machine REQUESTED → CONFIRMED/DECLINED/CANCELLED/COMPLETED, plus RESCHEDULE_PROPOSED; checks on duration 15–1440 min and address for home visits; optimistic concurrency on `updatedAt`), `Conversation` (unique per customer+provider, per-side read markers, last-message preview), `Message` (TEXT/IMAGE/SYSTEM) |
| Engagement | `FavoriteProvider`, `FavoriteListing`, `Enquiry`, `ContactEvent`, `SearchEvent` |
| Notifications | `Notification` (dedupe key), `NotificationDelivery` (outbox), `NotificationPreference` |
| Analytics | `AnalyticsEvent` (raw, pruned), `ProviderAnalyticsDaily` |
| Monetization | `SubscriptionPlan`, `ProviderSubscription`, `Entitlement`, `ListingPromotion`, `Payment` (gateway collection; one PENDING per provider via a partial unique index; `appliedAt` makes application exactly-once), `PaymentEvent` (verified webhooks, unique per gateway + event id) |

Logical entities from the brief that are merged: *UserProfile* → columns on `User`; *ReviewReport* → `ModerationReport` with `targetType = REVIEW`; *ProviderAvailability* stores weekly hours.

## Spatial design

- `geography(Point, 4326)` for `ProviderLocation.location/publicLocation`, `ServiceArea.center`, `Organization.location`, each with a **GiST** index.
- Radius filter: `ST_DWithin(publicLocation, origin, radius_m)` **or** the searcher is inside a provider's service area (`ST_DWithin(center, origin, radiusKm*1000)`) **or** a product's delivery radius covers the searcher.
- Distance: `ST_Distance(publicLocation, origin)` in metres, always on the public point.
- Public point = exact when `showExactLocation`, otherwise rounded to 0.005° (~500 m).

## Full-text design

`Listing.searchVector` (`tsvector`, GIN index) is maintained by a trigger from weighted parts:
A — title (english + simple), B — keywords + category and parent names + aliases, C — provider name, D — description. Triggers re-index listings when a category name/alias or provider name changes. Trigram GIN indexes on listing title, provider name, category name and alias support fuzzy matching (`%`, `similarity`). `vicinity_unaccent()` is an immutable wrapper so it can be indexed.

## Integrity constraints (beyond Prisma)

- `Listing_visibility_scope`: PUBLIC ⇒ no group; ORGANIZATION ⇒ org set, no group; GROUP ⇒ both set.
- `Listing_group_in_organization`: composite FK `(groupId, organizationId) → Group(id, organizationId)`.
- Price non-negative; `priceMax ≥ price`; rating 1–5; hours `HH:MM` with end > start; one primary location per provider (partial unique index).

## Migrations

Migrations live in `apps/api/prisma/migrations` and are applied with `prisma migrate deploy` (never `migrate dev`, which would try to "fix" PostGIS's `spatial_ref_sys` table and hand-written objects). Create a new migration with:

```powershell
pnpm --filter @vicinity/api db:migration:new <name>
```

Review the generated SQL, add raw SQL for indexes/triggers Prisma cannot express, then `pnpm --filter @vicinity/api db:migrate`.

## Performance

`pnpm --filter @vicinity/api explain:search` prints `EXPLAIN (ANALYZE, BUFFERS)` for radius, full-text, fuzzy and nearby-provider queries. On the dev dataset the planner uses `ProviderLocation_publicLocation_gist` and `Listing_title_trgm`; re-check on production-sized data. Keyset pagination avoids `OFFSET`. The Prisma pg adapter uses a pool of 20 connections per instance.
