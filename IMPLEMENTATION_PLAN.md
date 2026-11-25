# Implementation plan & progress

Status as of 2026-11-24. ✅ done and tested · 🟡 done, partly verified · ⬜ not started.

## Starting point

The repository was empty. The visual source is the Stitch project **"Vicinity Local Services Marketplace"** (design system "Vicinity Design System"): 8 mobile screens, 5 desktop web screens and 1 reference image. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for how each Stitch screen maps to the app.

## Phase 1 — Core marketplace ✅

| Feature | Status | Notes |
|---|---|---|
| Auth: register, login, logout, refresh rotation with reuse detection, email verification, password reset, change password, sign-out-everywhere | ✅ | e2e: `auth.e2e.spec.ts` |
| User profile, data export, account deletion | ✅ | |
| Provider registration (11-step guided onboarding with saved progress), profile, locations (private exact + public approximate), service areas, hours, gallery, credentials (private docs) | ✅ | Wizard verified in the web app up to step 3; the rest is covered by API tests |
| Listings: services & products, 7 price types, numeric prices, stock/delivery, media, keywords, availability, pause/archive/delete | ✅ | |
| Dynamic two-level categories with aliases (132 seeded) | ✅ | Admin-managed |
| Media uploads: signed URLs, type/size validation, private media | ✅ | Local driver tested; **R2 driver untested without credentials** |
| Geospatial + full-text search with all filters combined | ✅ | e2e: `search.e2e.spec.ts`; EXPLAIN script |
| Manual location (gazetteer of Lusaka neighbourhoods + towns) and GPS | ✅ | Works with GPS denied |
| Provider profile, call/WhatsApp contact with tracking, in-app enquiries | ✅ | |
| Favourites (providers & listings) | ✅ | |
| Reviews: one per customer, verified-interaction flag, responses, reports, auto-hide | ✅ | |
| Notifications: in-app centre, preferences, quiet hours, daily limit, push outbox with retry & receipts | 🟡 | Worker tested with a fake sender; **real push not tested on a device** (needs EAS projectId) |
| Mobile navigation (Home, Search, Saved, Alerts, Profile) + web layout | ✅ | Web verified in browser; **native iOS/Android builds not run yet** |

## Phase 2 — Community & discovery ✅

| Feature | Status |
|---|---|
| Organizations, groups (in-org and standalone), roles (owner/admin/member, group admin), invitations (code or email, multi-use), join/leave, ownership transfer | ✅ |
| Explicit listing visibility (public / organization / group) enforced in SQL and on detail endpoints; group-belongs-to-org enforced by a composite FK | ✅ |
| Organization- and group-scoped search | ✅ |
| Portfolio projects with photos/video, gallery, credentials | ✅ |
| Weighted relevance ranking (text, distance, rating, quality, recency, availability) | ✅ |
| Personalised discovery | 🟡 Location-based home feed, saved-provider updates and recent searches. Search events are stored (rounded location) as the base for recommendations; no recommendation model yet. |

## Phase 3 — Provider growth tools ✅

Analytics events + daily aggregates (views, search appearances, calls, WhatsApp taps, enquiries, favourites, reviews), dashboard with stat tiles and charts, enquiry inbox, review replies, availability management, verification updates as notifications.

⬜ Scheduled "weekly performance summary" and "incomplete profile reminder" notifications.

## Phase 4 — Monetization ✅ (plan purchases live via Lenco)

Plans, entitlements (enforced listing/gallery/location limits), provider subscriptions, admin grants, sponsored placements (labelled, shown separately from organic results), payment records table.

✅ **Plan purchases with Lenco mobile money** (MTN/Airtel/Zamtel USSD), ported from the TUMA integration: gateway boundary + Lenco adapter + simulator, signed webhooks with an idempotent event store, status-polling backstop, expiry, exactly-once application to `ProviderSubscription` (extend / upgrade with carried-over value). ⬜ Not yet: automated refunds/payouts, paid listing promotions (schema ready: `ListingPromotion.paymentId`), card payments.

## Phase 5 — Advanced marketplace 🟡

- ✅ **Bookings:** requests against the provider's weekly hours (30-minute slots, Africa/Lusaka), plus clash protection. Bookings support home visits or appointments at the provider, accept/decline, reschedule proposals from either side, cancellation with a reason, and completion. A completed booking counts as a verified interaction for reviews. There's no payment and no booking fee.
- ✅ **In-app messaging:** one conversation per customer and provider, with text and photo messages, unread counts, polling every 4 s while open, booking events as system messages, and notifications deduped per 5 minutes.
- ✅ **Stitch redesign pass** across home, search, provider, categories, notifications, bookings and chat, with desktop layouts at ≥1024 px.
- ✅ **Payments:** plan purchases via Lenco mobile money (see Phase 4).
- ⬜ Orders, checkout and delivery tracking for products.

## Admin portal ✅

Dashboard, users (suspend/reactivate, roles), providers (verification, suspension, private credential review, plan grants), listings (remove/restore), categories (CRUD + aliases), organizations (suspend), reports (resolve with action), plans & sponsored placements, audit log. Role-based permissions are enforced by the API on every request.

## Known issues and follow-ups

1. Native builds: run `npx expo run:android` / an EAS development build and test GPS, image picker and push on devices.
2. Configure an EAS `projectId` (in `app.json` → `extra.eas.projectId`) to enable push tokens.
3. Server-side image resizing/thumbnails: the app compresses to max 1600 px before upload; production should add Cloudflare Images or an image-resizing worker in front of R2.
4. Mobile automated tests cover stores only; add component tests (jest-expo + React Native Testing Library) and an end-to-end runner (Maestro/Detox).
5. ESLint is not configured; `pnpm lint` runs TypeScript checks.
6. Email change and phone-number verification are not implemented.
7. The places gazetteer (`apps/api/src/locations/places.ts`) is a starter list with approximate coordinates; replace or extend it with a geocoder for national coverage.
8. Prisma 7.10 warns that Node 26 is unsupported; run production on Node 22 LTS (the Dockerfile does).
