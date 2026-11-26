# Environment

Never commit `.env` files. Templates: `apps/api/.env.example`, `apps/mobile/.env.example`, `apps/admin/.env.example`.

## API (`apps/api/.env`)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | | `development` / `test` / `production` |
| `PORT` | | Default 4000 |
| `DATABASE_URL` | ✅ | PostgreSQL with PostGIS, pg_trgm, unaccent |
| `TEST_DATABASE_URL` | tests | Separate database for integration tests |
| `JWT_ACCESS_SECRET` | ✅ | ≥32 random chars. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_ACCESS_TTL_SECONDS` | | Default 900 |
| `REFRESH_TOKEN_TTL_DAYS` | | Default 30 |
| `CORS_ORIGINS` | ✅ prod | Comma-separated origins (web app, admin) |
| `API_PUBLIC_URL` | ✅ | Public base URL of the API (media URLs) |
| `APP_PUBLIC_URL` | ✅ | Web app URL used in email links |
| `STORAGE_DRIVER` | | `local` (development only) or `r2` |
| `STORAGE_LOCAL_DIR` | | Local driver folder |
| `STORAGE_SIGNING_SECRET` | ✅ | Signs local upload URLs |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | r2 | Cloudflare R2 S3 credentials (API token with object read/write on the bucket) |
| `R2_PUBLIC_BASE_URL` | | Optional custom domain for public objects; otherwise presigned URLs |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | ✅ prod | Transactional email. Empty host in development prints emails to the log |
| `EXPO_ACCESS_TOKEN` | | Only if "enhanced push security" is enabled in Expo |
| `PUSH_ENABLED` | | `false` to stop the push worker |
| `THROTTLE_TTL_SECONDS`, `THROTTLE_LIMIT` | | Global rate limit |
| `PAYMENT_PROVIDER` | | `none` (default; payments off), `lenco`, or `simulator` (dev/test only; refused in production) |
| `LENCO_SEC_KEY` | lenco | Lenco API secret key (Bearer token) |
| `LENCO_WEBHOOK_SIGNATURE_KEY` | lenco prod | Webhook signing key from the Lenco dashboard; verifies `X-Lenco-Signature` |
| `LENCO_API_URL` | | Default `https://api.lenco.co/access/v2`; sandbox `https://sandbox.lenco.co/access/v2` |
| `SIMULATOR_WEBHOOK_SECRET` | simulator | 16+ chars; signs simulated webhooks |
| `PAYMENT_TTL_MINUTES` | | Default 15: time to approve the USSD prompt before the payment expires |
| `PHONE_OTP_AUTH` | | `true` turns on phone sign-in with SMS codes (default off: SMS costs money) |
| `OTP_PEPPER` | phone | 32+ random chars mixed into code hashes |
| `SMS_DRIVER` | | `zamtel` (required in production when phone sign-in is on), `dev` (code in the API log), `none` |
| `ZAMTEL_SMS_API_KEY` | zamtel | Zamtel Bulk SMS API key |
| `ZAMTEL_SMS_BASE_URL` | | Default `https://bulksms.zamtel.co.zm/api/v2.1/action/send` |
| `SMS_SENDER_ID` | | Sender id registered with Zamtel (max 11 chars). Default `Vicinity` |
| `SMS_APP_HASH` | | Optional Android SMS Retriever hash (11 chars) for code autofill |
| `GOOGLE_CLIENT_IDS` | google | Comma-separated Google OAuth client IDs accepted as the ID token audience (the Web client ID) |
| `APPLE_CLIENT_IDS` | apple | Accepted Apple audiences: the iOS bundle ID `zm.vicinity.app` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | seed | Bootstrap super admin created by `db:seed` |
| `SEED_DEMO_DATA` | seed | `true` adds demo providers (development only; ignored when `NODE_ENV=production`) |
| `RUN_SEED_ON_START` | | Container only. Default `true`: the idempotent seed runs after migrations on each start |
| `SHADOW_DATABASE_URL` | dev | Only for `db:migration:new` (defaults to the local `vicinity_shadow` database) |

For production values and where to set them (Railway/Vercel), see the checklist at the end of [DEPLOYMENT.md](DEPLOYMENT.md).

The API validates its configuration at startup and refuses to start on missing secrets, R2 selected without credentials, or the local storage driver in production.

## Mobile / web app (`apps/mobile/.env`)

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | API base URL. Phone on the same Wi-Fi: `http://<your-LAN-IP>:4000`; Android emulator: `http://10.0.2.2:4000` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google sign-in Web client ID (web button; phones use it as `webClientId`) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google sign-in iOS client ID (iOS builds; `app.config.js` derives the URL scheme) |
| `EXPO_PUBLIC_WEB_URL` | Public web address for shared links (default `https://vicinityzambia.com`) |
| `EXPO_PUBLIC_MAP_STYLE_URL` | Optional web map style. Default OpenFreeMap (no key). Any MapLibre style URL works (MapTiler, Stadia…); `off` = radar view |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Native Android builds only (EAS/`expo run`): Google Maps SDK for Android key, read by `app.config.js`. iOS needs none |

Push notifications additionally need an EAS project: set `expo.extra.eas.projectId` in `app.json` (run `npx eas-cli@latest init`), and on Android a Firebase (FCM v1) credential uploaded to EAS.

## Admin portal (`apps/admin/.env.local`)

| Variable | Description |
|---|---|
| `VICINITY_API_URL` | API base URL reachable from the admin server (never exposed to the browser) |

## External integrations

| Integration | Status |
|---|---|
| Cloudflare R2 | Implemented (presigned PUT/GET); not exercised without credentials |
| SMTP | Implemented via nodemailer; development fallback logs emails |
| SMS (sign-in codes) | **Zamtel Bulk SMS**, ported from TUMA (`SMS_DRIVER=zamtel`): GET send endpoint, Zambian numbers only, failures read from the 200 body, API key scrubbed from logs. Each delivery attempt is recorded in `OtpDelivery`. Delivery receipts are not integrated |
| Expo Push | Implemented with retries and receipts; needs EAS projectId + device |
| Payments | **Lenco mobile money** (MTN, Airtel, Zamtel) for plan purchases, ported from the TUMA integration: USSD collection, `X-Lenco-Signature` webhooks verified over the raw body, idempotent event store, status polling backstop. `simulator` for dev/tests. Refunds and payouts: manual in the Lenco dashboard |
| Maps | **Street maps.** Web: MapLibre GL with OpenFreeMap vector tiles (OpenStreetMap data, no key; swap via `EXPO_PUBLIC_MAP_STYLE_URL`). iOS: Apple Maps. Android: Google Maps (`react-native-maps`; key for store builds). Pins use public, approximate positions. Radar view remains as the fallback. Directions open Google Maps |
