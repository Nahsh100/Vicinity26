/**
 * Seeds reference data (admin roles & permissions, categories, plans) and the bootstrap admin.
 * Idempotent: safe to run repeatedly. With SEED_DEMO_DATA=true it also creates clearly-labelled
 * demo accounts, providers and listings around Lusaka for local testing of search and flows.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import { ROLE_DEFINITIONS, ALL_PERMISSIONS } from '../src/admin/permissions';
import { slugify } from '../src/common/util';
import { CATEGORIES } from './categories';
import { seedDemo } from './demo';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const ARGON = { type: argon2.argon2id as 0 | 1 | 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function seedAdminRoles() {
  for (const code of [...ALL_PERMISSIONS, '*']) {
    await prisma.adminPermission.upsert({ where: { code }, create: { code }, update: {} });
  }
  for (const [code, def] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await prisma.adminRole.upsert({
      where: { code },
      create: { code, name: def.name, description: def.description },
      update: { name: def.name, description: def.description },
    });
    const perms = await prisma.adminPermission.findMany({ where: { code: { in: def.permissions } } });
    await prisma.adminRolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.adminRolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }
}

async function seedCategories() {
  const used = new Set<string>();
  const slugFor = (name: string, parentSlug?: string) => {
    let s = slugify(name);
    if (used.has(s) && parentSlug) s = `${parentSlug}-${s}`;
    used.add(s);
    return s;
  };
  for (const [i, parent] of CATEGORIES.entries()) {
    const pSlug = slugFor(parent.name);
    const p = await prisma.category.upsert({
      where: { slug: pSlug },
      create: { slug: pSlug, name: parent.name, icon: parent.icon, sortOrder: i },
      update: { name: parent.name, icon: parent.icon, sortOrder: i },
    });
    for (const alias of parent.aliases ?? []) {
      await prisma.categoryAlias.upsert({ where: { categoryId_alias: { categoryId: p.id, alias } }, create: { categoryId: p.id, alias }, update: {} });
    }
    for (const [j, child] of parent.children.entries()) {
      const [name, aliases] = typeof child === 'string' ? [child, [] as string[]] : child;
      const cSlug = slugFor(name, pSlug);
      const c = await prisma.category.upsert({
        where: { slug: cSlug },
        create: { slug: cSlug, name, icon: parent.icon, parentId: p.id, sortOrder: j },
        update: { name, parentId: p.id, sortOrder: j },
      });
      for (const alias of aliases) {
        await prisma.categoryAlias.upsert({ where: { categoryId_alias: { categoryId: c.id, alias } }, create: { categoryId: c.id, alias }, update: {} });
      }
    }
  }
}

async function seedPlans() {
  const plans = [
    { code: 'FREE', name: 'Free', priceMonthly: 0, sortOrder: 0, entitlements: { maxListings: 10, maxPortfolioProjects: 12, maxGalleryMedia: 24, maxLocations: 2, advancedAnalytics: false } },
    { code: 'PRO', name: 'Pro', priceMonthly: 150, sortOrder: 1, entitlements: { maxListings: 50, maxPortfolioProjects: 60, maxGalleryMedia: 120, maxLocations: 5, advancedAnalytics: true } },
    { code: 'BUSINESS', name: 'Business', priceMonthly: 450, sortOrder: 2, entitlements: { maxListings: 300, maxPortfolioProjects: 300, maxGalleryMedia: 600, maxLocations: 20, advancedAnalytics: true } },
  ];
  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({ where: { code: p.code }, create: p, update: { name: p.name, entitlements: p.entitlements, sortOrder: p.sortOrder } });
  }
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: skipping bootstrap admin');
    return;
  }
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
  const existing = await prisma.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email,
        fullName: 'Vicinity Admin',
        passwordHash: await argon2.hash(password, ARGON),
        emailVerifiedAt: new Date(),
        notificationPreference: { create: {} },
      },
    }));
  await prisma.userAdminRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} });
  console.log(`Bootstrap admin: ${email}${existing ? ' (existing)' : ' (created)'}`);
}

async function main() {
  await seedAdminRoles();
  await seedCategories();
  await seedPlans();
  await seedAdmin();
  if (process.env.SEED_DEMO_DATA === 'true') {
    // Demo accounts share a published password: never create them in production.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_DATA_IN_PRODUCTION !== 'true') {
      console.warn('SEED_DEMO_DATA ignored: NODE_ENV=production');
    } else {
      await seedDemo(prisma, ARGON);
    }
  }
  const [cats, users] = await Promise.all([prisma.category.count(), prisma.user.count()]);
  console.log(`Seed complete: ${cats} categories, ${users} users`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
