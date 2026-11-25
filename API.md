# API

Base URL `/api/v1`. Interactive docs (Swagger UI) at `/api/docs`, JSON at `/api/docs.json`.

## Conventions

- Auth: `Authorization: Bearer <accessToken>`. Access tokens last 15 min; refresh with `POST /auth/refresh` (rotating, single-use).
- Success: `{ "data": ... }`; lists add `"meta": { "nextCursor", "hasMore", ... }`. Pass `cursor` back for the next page.
- Errors: `{ "error": { "code", "message", "details?" } }` — `details` maps field paths to messages for `VALIDATION_FAILED`.
- Rate limits: 120 req/min per client by default; 10/min on login/register/reset; 429 `RATE_LIMITED`.

## Endpoints

**Auth** — `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`; `GET /auth/me`

**Users** — `PATCH /users/me`, `GET|DELETE /users/me/recent-searches`, `GET /users/me/export`, `DELETE /users/me`

**Locations** — `GET /locations/places?q=`, `GET /locations/reverse?lat&lng`

**Categories** — `GET /categories`, `GET /categories/suggest?q=`, `GET /categories/:idOrSlug`

**Search** — `GET /search`, `GET /search/suggest?q=`, `GET /discover/home?lat&lng`

`GET /search` parameters (all combinable): `q`, `lat`+`lng` *or* `area` (neighbourhood/town), `radiusKm` (default 10 with coordinates, 5 for a neighbourhood, 20 for a town), `categoryId` (parent includes children), `listingType` (`SERVICE|PRODUCT`), `minPrice`, `maxPrice`, `organizationId`, `groupId`, `minRating`, `verified`, `availableOnly`, `providerType`, `sort` (`relevance|distance|rating|price_asc|price_desc|newest`), `cursor`, `limit` (≤50). First page `meta` includes `total`, `origin`, `appliedRadiusKm`, `sponsored[]` and `matchedCategories[]`.

**Providers** — `POST /providers`; `GET|PATCH /providers/me`; `PUT /providers/me/onboarding`; `POST /providers/me/publish|pause|resume`; `POST|PATCH|DELETE /providers/me/locations[/:id]`; `POST|DELETE /providers/me/service-areas[/:id]`; `PUT /providers/me/availability`; `PUT /providers/me/gallery`; `POST|DELETE /providers/me/credentials[/:id]`; `GET|POST|PATCH|DELETE /providers/me/portfolio[/:id]`; `GET /providers/me/analytics?days=`. Public: `GET /providers/:idOrSlug`, `/providers/:id/gallery`, `/credentials`, `/portfolio[/:projectId]`, `/listings`, `/reviews`, `/reviews/summary`.

**Listings** — `POST /listings`, `GET /listings/mine`, `GET|PATCH|DELETE /listings/:id`, `POST /listings/:id/status`

**Media** — `POST /media/uploads` → `{ mediaId, upload: { url, method, headers } }`; PUT the bytes to `upload.url`; then `POST /media/:id/complete`. `GET /media/:id/raw` serves (or redirects to) the file; private files only for the owner and verifying admins.

**Engagement** — `GET|PUT|DELETE /favorites/providers[/:id]`, `GET|PUT|DELETE /favorites/listings[/:id]`, `POST /providers/:id/contact` (`PHONE|WHATSAPP|EMAIL`), `POST /providers/:id/enquiries`, `GET /enquiries/received`, `PATCH /enquiries/received/:id`, `GET /enquiries/sent`


**Bookings** — `POST /bookings` (`{ providerId, listingId?, scheduledAt, location: AT_PROVIDER|AT_CUSTOMER, address?, note? }`; 30 min–90 days ahead, must fit the provider's hours and not clash: `409 SLOT_TAKEN`), `GET /bookings?role=customer|provider&scope=upcoming|past` (`meta.counts`), `GET /bookings/:id`, `POST /bookings/:id/accept|decline|reschedule|cancel|complete`; public `GET /providers/:id/slots?date=YYYY-MM-DD&listingId=` (30-minute steps, Africa/Lusaka). Status changes post a system message in the conversation and notify the other side. A completed booking counts as a verified interaction for reviews. No payment is taken.

**Messaging** — `POST /conversations` (`{ providerId }`, opens or reuses), `GET /conversations?filter=all|unread|bookings`, `GET /conversations/unread-count`, `GET /conversations/:id`, `GET /conversations/:id/messages?cursor=|after=` (newest first; `after` for polling), `POST /conversations/:id/messages` (`{ body?, mediaId? }`, 30/min), `POST /conversations/:id/read`. Participants only.

**Discovery stats** — `GET /discover/stats` (live counts for the web home: providers, verified providers, listings, categories, average rating, reviews; cached 5 min)
**Reviews** — `PUT /providers/:id/reviews` (create or update yours), `GET /providers/:id/reviews/mine`, `DELETE /reviews/:id`, `POST /reviews/:id/response`

**Reports** — `POST /reports` (`REVIEW|PROVIDER|LISTING|ORGANIZATION|USER`)

**Organizations & groups** — `GET|POST /organizations`, `GET|PATCH|DELETE /organizations/:id`, `POST /organizations/:id/join|leave|transfer`, `GET /organizations/:id/members`, `PATCH|DELETE /organizations/:id/members/:userId`, `GET|POST /organizations/:id/invitations`, `DELETE /organizations/:id/invitations/:invId`, `GET /organizations/invitations/mine`, `GET /organizations/invitations/:code`, `POST /organizations/invitations/:code/accept`, `GET|POST /organizations/:id/groups`; `POST /groups` (standalone), `GET /groups/mine`, `GET|PATCH|DELETE /groups/:id`, `POST /groups/:id/join|leave`, `GET|POST /groups/:id/members`, `PATCH|DELETE /groups/:id/members/:userId`

**Notifications** — `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET|PUT /notifications/preferences`, `POST /notifications/devices`, `DELETE /notifications/devices/:token`

**Subscriptions** — `GET /subscriptions/plans`, `GET /subscriptions/me`


**Phone sign-in** (SMS codes; off unless `PHONE_OTP_AUTH=true`; ported from TUMA). Endpoints:

- `GET /auth/methods` returns `{ email, phone, codeLength, resendSeconds }`.
- `POST /auth/phone/start` with `{ phone }` sends a 6-digit code to a Zambian mobile number.
  - The response is the same whether or not the number has an account.
  - A 30-second wait applies between codes, with at most 5 codes per number and 15 per IP address in 15 minutes (`429 OTP_COOLDOWN` / `OTP_RATE_LIMITED`).
  - Returns `503 DELIVERY_FAILED` if the SMS could not be sent, in which case the code is cancelled.
- `POST /auth/phone/verify` with `{ phone, code }` returns `{ tokens, user, isNewUser }`.
  - The first sign-in with a number creates the account, which has no name yet; the app asks for it next.
  - Errors are `422 OTP_INVALID` (with attempts left), `OTP_EXPIRED`, `OTP_LOCKED` or `OTP_NOT_FOUND`.
- Signed in:
  - `POST /auth/phone/link/start` and `POST /auth/phone/link/verify` add or change the account's sign-in number (`409 PHONE_TAKEN`).
  - `POST /auth/email` with `{ email }` adds an email to a phone-only account.

How codes work:

- A code lasts 5 minutes and allows 5 attempts.
- It is stored only as an HMAC (keyed with `OTP_PEPPER`) and can be used once.
- Requesting a new code cancels the previous one.
**Payments** (plan purchases, Lenco mobile money). Endpoints:

- `POST /payments/subscriptions` takes `{ planCode, months: 1|3|6|12, phone }` and sends a USSD prompt to the phone.
  - The amount is `priceMonthly × months`, computed on the server.
  - Only one pending payment is allowed per provider (`409 PAYMENT_IN_PROGRESS`).
  - Downgrades are refused while a higher plan is active (`DOWNGRADE_NOT_ALLOWED`).
- `GET /payments/mine`.
- `GET /payments/:id`: poll this. A pending payment triggers a rate-limited status lookup at the gateway.
- `POST /payments/:id/cancel`.
- `POST /webhooks/payments/:gateway`: public. It verifies the signature over the raw body, stores each event once, and always returns 200 once the event is authentic.
- `GET /admin/payments?status=` and `POST /admin/payments/:id/refresh` (`monetization.manage`).
- Simulator only: `POST /payments/:id/simulate` with `{ outcome }`.

How outcomes are applied:

- Success comes only from a verified webhook or a status lookup, and is applied exactly once.
- Same plan: the period is extended. Upgrade: the unused value of the old plan becomes extra days on the new one.
- A late success after expiry or cancellation is still honoured.
- An amount mismatch is stored as "needs review" and not applied.

**Admin** (permission per route) — `GET /admin/session`, `/admin/dashboard`, `/admin/users[/:id]` (+ `suspend`, `reactivate`, `PUT roles`), `/admin/roles`, `/admin/providers[/:id]` (+ `verification`, `suspend`, `reactivate`, `subscription`), `/admin/listings` (+ `remove`, `restore`), `/admin/reviews/:id/hide|publish`, `/admin/categories` CRUD, `/admin/organizations` (+ `suspend`, `reactivate`), `/admin/reports` (+ `resolve`), `/admin/plans`, `/admin/promotions` (+ `cancel`), `/admin/audit`

**Health** — `GET /health` (checks the database and PostGIS)
