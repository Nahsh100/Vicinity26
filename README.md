# Vicinity Zambia

**Find. Connect. Support Local.** A location-based marketplace for discovering products, services and skilled people nearby — from registered businesses to the nail technician in Mass Media or the meat supplier in Kalingalinga.

| Part | Path | Stack |
|---|---|---|
| API | `apps/api` | NestJS 12, Prisma 7, PostgreSQL 17 + PostGIS 3.5, Swagger |
| Mobile + web app | `apps/mobile` | Expo SDK 58, Expo Router, NativeWind, TanStack Query, Zustand, React Hook Form + Zod |
| Admin portal | `apps/admin` | Next.js 16 (server-side session proxy), Tailwind 4 |
| Shared | `packages/shared` | Zod schemas, API types, design tokens, formatters |

The same Expo codebase ships the iOS/Android app and the **web version** (responsive: bottom tabs on phones, top navigation on desktop, following the Stitch web designs).

## Quick start (development)

Prerequisites: Node 22+, pnpm 9, Docker.

```powershell
pnpm install
```

```powershell
docker compose up -d db
```

```powershell
Copy-Item apps/api/.env.example apps/api/.env; Copy-Item apps/mobile/.env.example apps/mobile/.env; Copy-Item apps/admin/.env.example apps/admin/.env.local
```

Set `JWT_ACCESS_SECRET` and `STORAGE_SIGNING_SECRET` in `apps/api/.env` (see ENVIRONMENT.md), then:

```powershell
pnpm --filter @vicinity/shared build; pnpm --filter @vicinity/api prisma:generate; pnpm --filter @vicinity/api db:migrate; pnpm --filter @vicinity/api db:seed
```

Run the three apps (separate terminals):

```powershell
pnpm --filter @vicinity/api dev
```

```powershell
pnpm --filter @vicinity/mobile web
```

```powershell
pnpm --filter @vicinity/admin dev
```

- API: http://localhost:4000/api/v1 — Swagger at http://localhost:4000/api/docs
- Web app: http://localhost:8081 (phones: `pnpm --filter @vicinity/mobile start`, set `EXPO_PUBLIC_API_URL` to your LAN IP)
- Admin: http://localhost:3001 — sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `apps/api/.env`

With `SEED_DEMO_DATA=true` the seed adds 14 demo providers around Lusaka, demo customers and a demo church organization (accounts end in `@demo.vicinity.local`, password `DemoPass123`). Never enable demo data in production.

In development, emails (verification, password reset) are printed to the API log instead of being sent.

## Checks

```powershell
pnpm typecheck
```

```powershell
pnpm test
```

API tests run against the `vicinity_test` database created by `infrastructure/db/init.sql` (real PostGIS, no mocks).

## Documentation

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — phases, progress, known gaps
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and decisions
- [DATABASE.md](DATABASE.md) — schema, spatial/full-text design, migrations
- [API.md](API.md) — endpoints and conventions
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — tokens, components, Stitch screen mapping
- [ENVIRONMENT.md](ENVIRONMENT.md) — environment variables and integrations
- [DEPLOYMENT.md](DEPLOYMENT.md) — production setup
