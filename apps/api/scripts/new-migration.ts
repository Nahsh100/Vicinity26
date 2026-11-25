/**
 * Creates a new migration from schema changes without letting Prisma "fix" drift caused by PostGIS
 * system tables (spatial_ref_sys) or hand-written SQL objects:
 *   pnpm --filter @vicinity/api db:migration:new add_something
 * It diffs the migrations folder against schema.prisma using a throwaway shadow database, writes the
 * SQL to prisma/migrations/<timestamp>_<name>/migration.sql, and leaves it for you to review
 * (add raw SQL for indexes/triggers Prisma cannot express) before `pnpm db:migrate`.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const name = (process.argv[2] ?? '').replace(/[^a-z0-9_]/gi, '_').toLowerCase();
if (!name) {
  console.error('Usage: db:migration:new <name>');
  process.exit(1);
}
const shadow = process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/[^/?]+(\?|$)/, '/vicinity_shadow$1');
const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const dir = join(__dirname, '..', 'prisma', 'migrations', `${ts}_${name}`);

const rawSql = execSync(`npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`, {
  cwd: join(__dirname, '..'),
  encoding: 'utf8',
  env: { ...process.env, SHADOW_DATABASE_URL: shadow },
});
/** Objects created by hand-written SQL that Prisma's diff would otherwise try to drop. */
const HAND_WRITTEN = /"(\w+_(gist|gin|trgm)|Group_id_organizationId_key|Listing_group_in_organization|ProviderLocation_one_primary|Listing_searchable_idx|ListingPromotion_active_idx|Payment_one_pending_per_provider|User_verified_phone_key|User_has_login|\w+_(range|scope|format|positive|nonnegative|address))"/;
const sql = rawSql
  .split(/\n(?=-- )/)
  .filter((block) => !(/DROP (INDEX|CONSTRAINT)/.test(block) && HAND_WRITTEN.test(block)) && !/spatial_ref_sys/.test(block))
  .join('\n');
if (!sql.trim() || /This is an empty migration/.test(sql)) {
  console.log('No schema changes.');
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), `-- Review before applying. Remove any statement touching spatial_ref_sys or hand-written objects.\n${sql}`);
console.log(`Wrote ${dir}/migration.sql`);
