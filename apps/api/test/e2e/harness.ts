import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/mail/mail.service';
import { configureApp } from '../../src/main';
import { PrismaService } from '../../src/prisma/prisma.service';

const root = resolve(__dirname, '../..');
let prepared = false;

/** Migrates the test database once per run and loads reference data (roles, categories, plans; no demo data). */
export function prepareDatabase() {
  if (prepared) return;
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL!, SEED_DEMO_DATA: 'false', SEED_ADMIN_EMAIL: 'root@test.local', SEED_ADMIN_PASSWORD: 'RootPass123' };
  execSync('npx prisma migrate deploy', { cwd: root, env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd: root, env, stdio: 'pipe' });
  prepared = true;
}

export interface Ctx {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  mail: MailService;
}

export async function createApp(): Promise<Ctx> {
  prepareDatabase();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: false });
  await configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await resetData(prisma);
  return { app, http: request(app.getHttpServer()), prisma, mail: app.get(MailService) };
}

/** Clears everything except reference data and the bootstrap admin. */
export async function resetData(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "Message", "Booking", "Conversation", "NotificationDelivery", "Notification", "DeviceToken", "AnalyticsEvent", "ProviderAnalyticsDaily",
      "ContactEvent", "SearchEvent", "Enquiry", "FavoriteProvider", "FavoriteListing", "ReviewMedia", "ReviewResponse",
      "Review", "ListingPromotion", "ListingMedia", "ServiceDetails", "ProductDetails", "Listing", "PortfolioMedia",
      "PortfolioProject", "ProviderMedia", "ProviderCredential", "ProviderAvailability", "ServiceArea", "ProviderLocation",
      "ProviderSubscription", "Entitlement", "PaymentEvent", "Payment", "Provider", "OrganizationInvitation", "GroupMembership", "Group",
      "OrganizationMembership", "Organization", "ModerationReport", "AuditLog", "EmailToken", "RefreshToken", "OtpDelivery", "OtpChallenge"
    CASCADE`);
  // Media is not truncated: User references it, and TRUNCATE CASCADE would wipe the admin too.
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE "email" IS DISTINCT FROM 'root@test.local'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Media"`);
}

let counter = 0;

export async function signUp(ctx: Ctx, opts: { verified?: boolean; name?: string } = {}) {
  counter++;
  const email = `user${counter}-${Date.now()}@test.local`;
  const r = await ctx.http.post('/api/v1/auth/register').send({ fullName: opts.name ?? `User ${counter}`, email, password: 'Passw0rd!x' }).expect(201);
  if (opts.verified !== false) await ctx.prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  return { email, token: r.body.data.tokens.accessToken as string, refreshToken: r.body.data.tokens.refreshToken as string, userId: r.body.data.user.id as string };
}

export async function adminToken(ctx: Ctx) {
  const r = await ctx.http.post('/api/v1/auth/login').send({ email: 'root@test.local', password: 'RootPass123' }).expect(200);
  return r.body.data.tokens.accessToken as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function categoryId(ctx: Ctx, name: string) {
  const c = await ctx.prisma.category.findFirstOrThrow({ where: { name, parentId: { not: null } } });
  return c.id;
}

/** Creates a published provider with a location and returns ids. */
export async function makeProvider(
  ctx: Ctx,
  opts: { name: string; lat: number; lng: number; area: string; serviceRadiusKm?: number; type?: 'INDIVIDUAL' | 'BUSINESS' },
) {
  const u = await signUp(ctx, { name: `${opts.name} Owner` });
  await ctx.http
    .post('/api/v1/providers')
    .set(auth(u.token))
    .send({ type: opts.type ?? 'INDIVIDUAL', displayName: opts.name, phone: '0971234567', serviceMode: opts.serviceRadiusKm ? 'MOBILE' : 'AT_LOCATION' })
    .expect(201);
  // AuthGuard caches the user for 30 s; a fresh login token is not needed because providerId is re-read below.
  const provider = await ctx.prisma.provider.findUniqueOrThrow({ where: { userId: u.userId } });
  const token = await relogin(ctx, u.email);
  await ctx.http
    .post('/api/v1/providers/me/locations')
    .set(auth(token))
    .send({ label: 'Main', area: opts.area, city: 'Lusaka', lat: opts.lat, lng: opts.lng, isPrimary: true })
    .expect(201);
  if (opts.serviceRadiusKm) {
    await ctx.http.post('/api/v1/providers/me/service-areas').set(auth(token)).send({ name: opts.area, lat: opts.lat, lng: opts.lng, radiusKm: opts.serviceRadiusKm }).expect(201);
  }
  return { ...u, token, providerId: provider.id };
}

export async function relogin(ctx: Ctx, email: string) {
  const { AuthGuard } = await import('../../src/common/auth');
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
  ctx.app.get(AuthGuard).invalidate(user.id);
  const r = await ctx.http.post('/api/v1/auth/login').send({ email, password: 'Passw0rd!x' }).expect(200);
  return r.body.data.tokens.accessToken as string;
}

export async function addListing(ctx: Ctx, token: string, body: Record<string, unknown>) {
  const r = await ctx.http.post('/api/v1/listings').set(auth(token)).send(body);
  if (r.status !== 201) throw new Error(`addListing ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.data.id as string;
}

export async function publish(ctx: Ctx, token: string) {
  await ctx.http.post('/api/v1/providers/me/publish').set(auth(token)).expect(200);
}

// Reference points (approximate neighbourhood centroids in Lusaka).
export const WOODLANDS = { lat: -15.429, lng: 28.317 };
export const KALINGALINGA = { lat: -15.414, lng: 28.327 };
export const MASS_MEDIA = { lat: -15.402, lng: 28.308 };
export const MATERO = { lat: -15.372, lng: 28.255 };
