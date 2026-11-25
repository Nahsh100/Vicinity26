# Deployment: Railway + Vercel

| Part | Host | Config in repo |
|---|---|---|
| PostgreSQL + PostGIS | Railway (PostGIS template / `postgis/postgis` image) | — |
| API (NestJS) | Railway, built from `apps/api/Dockerfile` | `railway.json` (repo root) |
| Web app (Expo web export) | Vercel project, root `apps/mobile` | `apps/mobile/vercel.json` |
| Admin portal (Next.js) | Vercel project, root `apps/admin` | `apps/admin/vercel.json` |
| Media | Cloudflare R2 | — |

Every value you must fill in is listed in the checklist at the end, and in [ENVIRONMENT.md](ENVIRONMENT.md).

## 1. Database (Railway)

Railway's default PostgreSQL image does **not** include PostGIS. In your Railway project:

1. **New → Database → search "PostGIS"** and deploy the PostGIS template. If no template is available, use **New → Docker Image** `postgis/postgis:17-3.5`, attach a volume at `/var/lib/postgresql/data`, and set `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`.
2. Leave it on the private network. The API reaches it through `${{<db-service>.DATABASE_URL}}`.
3. You don't need to create extensions yourself. The first migration runs `CREATE EXTENSION postgis, pg_trgm, unaccent, pgcrypto`; the template's user is a superuser.
4. Turn on backups in the service settings.

## 2. API (Railway)

1. **New → GitHub repo**, and select this repository. Leave the root directory empty (the repo root): the Docker build needs `packages/shared` and the lockfile.
2. Railway reads `railway.json`:
   - It builds with the Dockerfile and health-checks `/api/v1/health`.
   - The container runs `apps/api/scripts/start.sh`. This runs `prisma migrate deploy`, then the idempotent seed (admin roles, categories, plans, and the bootstrap admin), then the server.
3. Add the API variables from the checklist below. `PORT` is injected by Railway; don't set it.
4. **Settings → Networking → Generate domain** (or add a custom domain, e.g. `api.vicinity.co.zm`). Use this URL as `API_PUBLIC_URL`, and in both Vercel projects.
5. Deploy. In the logs, expect to see `Seed complete: … categories` and then the server's listen line.

To skip the seed on later deploys, set `RUN_SEED_ON_START=false`. The seed is safe to repeat either way.

Keep `numReplicas` at 1 unless you move migrations to a separate release step. Background jobs are already safe across replicas.

## 3. Media (Cloudflare R2)

1. Create a bucket (e.g. `vicinity-media`) and an **R2 API token** with *Object Read & Write* on that bucket. You'll get the account ID, access key ID and secret.
2. **Bucket → Settings → CORS policy.** Browsers upload straight to R2, so allow the web app origin:

```json
[{ "AllowedOrigins": ["https://<your-web-domain>"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
```

3. Optional: connect a custom domain (or enable r2.dev) for public images, and set `R2_PUBLIC_BASE_URL`. Without it, every image is served through presigned URLs, which also works.

## 4. Web app (Vercel)

1. **Add New → Project →** this repo. Set **Root Directory** to `apps/mobile` and leave "Include files outside the root directory" on.
2. `apps/mobile/vercel.json` sets the install and build commands:
   - The build exports to `dist`.
   - It adds a single-page-app rewrite to `index.html` and long-term caching for hashed assets.
3. **Environment variable:** `EXPO_PUBLIC_API_URL=https://<api-domain>`, with no trailing slash and no `/api/v1`. This value is baked in at build time, so redeploy after changing it.
4. Deploy, and note the domain. It goes into the API's `CORS_ORIGINS` and `APP_PUBLIC_URL` and into the R2 CORS policy.

## 5. Admin portal (Vercel)

1. Create a second Vercel project from the same repo, with **Root Directory** `apps/admin`. The framework is detected as Next.js; `apps/admin/vercel.json` builds the shared package first.
2. **Environment variable:** `VICINITY_API_URL=https://<api-domain>`. It is only used server-side, and the browser never talks to the API directly.
3. Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, then change the password.
4. Recommended: protect the deployment with Vercel's password or SSO protection, or put it on a private domain.

## Payments (Lenco mobile money)

Providers buy Pro/Business plans with MTN, Airtel or Zamtel mobile money. The integration is ported from the TUMA platform's Lenco adapter.

1. In the Lenco dashboard, create API keys and copy the **secret key** (`LENCO_SEC_KEY`) and the **webhook signing key** (`LENCO_WEBHOOK_SIGNATURE_KEY`).
2. Set the webhook URL to `https://<api-domain>/api/v1/webhooks/payments/lenco`.
3. Set `PAYMENT_PROVIDER=lenco` on the API and redeploy. To try it first, set `LENCO_API_URL=https://sandbox.lenco.co/access/v2` with sandbox keys.
4. Test it: from a provider account, open **Dashboard → Plan & billing**, buy one month of Pro, and approve the prompt on your phone.
   - The screen settles on its own (status polling).
   - The API log should show `Lenco webhook signature verified using …`.
   - The admin portal's **Plans & promotions** page lists the payment.
5. After the first live webhook, narrow `SIGNATURE_SCHEMES` in `apps/api/src/payments/lenco.gateway.ts` to the construction named in that log line.

Refunds and payouts are not automated. Refund in the Lenco dashboard, then adjust the provider's plan from their page in the admin portal.

## 6. Wire the URLs together

After the first deploys:

- On the API, set `CORS_ORIGINS=https://<web-domain>,https://<admin-domain>`, `APP_PUBLIC_URL=https://<web-domain>`, and `API_PUBLIC_URL=https://<api-domain>`. Redeploy the API.
- Smoke test:
  - `curl https://<api-domain>/api/v1/health` should return `database: ok` and a `postgis` version.
  - Open the web app: register, confirm your email via the SMTP message, create a provider, add a listing with a photo (tests R2), and book it from a second account.
  - Chat about the booking, accept it as the provider, and check notifications.

## Mobile apps (later)

Use EAS: `npx eas-cli@latest init`, then `eas build --platform android|ios` and `eas submit`. Set `EXPO_PUBLIC_API_URL` per build profile in `eas.json`. For push notifications, upload the FCM v1 key (Android) and let EAS manage the APNs key (iOS). For Android maps, create a Google Maps SDK for Android key (restricted to `zm.vicinity.app` and your signing SHA-1) and set it as the EAS secret `GOOGLE_MAPS_ANDROID_API_KEY`; iOS uses Apple Maps.

## CI

`.github/workflows/ci.yml` runs typecheck, all tests against a PostGIS service container, and production builds.

---

## Env checklist: values you must provide

### Railway: API service

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{<postgis-service>.DATABASE_URL}}` (Railway reference) |
| `JWT_ACCESS_SECRET` | 48+ random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `STORAGE_SIGNING_SECRET` | another random value (same command) |
| `API_PUBLIC_URL` | `https://<api-domain>` |
| `APP_PUBLIC_URL` | `https://<web-domain>` |
| `CORS_ORIGINS` | `https://<web-domain>,https://<admin-domain>` |
| `STORAGE_DRIVER` | `r2` (the local driver is refused in production) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | from Cloudflare |
| `R2_PUBLIC_BASE_URL` | optional |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | **required in production** (the API refuses to start without `SMTP_HOST`). Any SMTP provider: Resend, Postmark, Brevo, SES, Mailgun |
| `MAIL_FROM` | e.g. `Vicinity <no-reply@your-domain>`, a sender your provider has verified |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | your first super admin (strong password) |
| `SEED_DEMO_DATA` | leave unset; ignored in production |
| `EXPO_ACCESS_TOKEN` | optional |
| `PHONE_OTP_AUTH` | `true` to offer phone sign-in (SMS codes) |
| `OTP_PEPPER` | 32+ random chars (same command as the JWT secret) |
| `SMS_DRIVER` | `zamtel` |
| `ZAMTEL_SMS_API_KEY` | from Zamtel Bulk SMS |
| `SMS_SENDER_ID` | your sender id **registered with Zamtel** (e.g. `Vicinity`) |
| `PAYMENT_PROVIDER` | `lenco` (or leave unset to launch without online payments) |
| `LENCO_SEC_KEY` | Lenco dashboard → API keys (secret key) |
| `LENCO_WEBHOOK_SIGNATURE_KEY` | Lenco dashboard → webhook signing key (required in production) |
| `LENCO_API_URL` | leave default for live; `https://sandbox.lenco.co/access/v2` to test with Lenco's sandbox |

### Vercel: web app (`apps/mobile`)

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://<api-domain>` |
| `EXPO_PUBLIC_MAP_STYLE_URL` | optional: leave empty for the free OpenFreeMap street map, or a MapTiler/Stadia style URL with your key |

### Vercel: admin (`apps/admin`)

| Variable | Value |
|---|---|
| `VICINITY_API_URL` | `https://<api-domain>` |

Payments are optional: with `PAYMENT_PROVIDER` unset the app works and plan purchase is simply unavailable.
