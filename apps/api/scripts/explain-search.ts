/**
 * Prints EXPLAIN (ANALYZE, BUFFERS) for representative search queries so index usage can be checked:
 *   pnpm --filter @vicinity/api explain:search
 * Expect GiST index scans on ProviderLocation.publicLocation for radius filters and the GIN index on
 * Listing.searchVector for text queries once tables are large enough for the planner to prefer them.
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CASES: { name: string; sql: string; params: unknown[] }[] = [
  {
    name: 'radius only (5 km around Woodlands)',
    sql: `SELECT l."id" FROM "Listing" l
            JOIN LATERAL (SELECT pl."publicLocation" FROM "ProviderLocation" pl WHERE pl."providerId" = l."providerId" ORDER BY pl."isPrimary" DESC LIMIT 1) loc ON true
           WHERE l."status" = 'ACTIVE' AND l."deletedAt" IS NULL
             AND ST_DWithin(loc."publicLocation", ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
           ORDER BY ST_Distance(loc."publicLocation", ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) LIMIT 20`,
    params: [28.317, -15.429, 5000],
  },
  {
    name: 'full-text "plumber"',
    sql: `SELECT l."id", ts_rank_cd(l."searchVector", q) AS r FROM "Listing" l, websearch_to_tsquery('english', $1) q
           WHERE l."status" = 'ACTIVE' AND l."searchVector" @@ q ORDER BY r DESC LIMIT 20`,
    params: ['plumber'],
  },
  {
    name: 'fuzzy title "plumbr"',
    sql: `SELECT l."id" FROM "Listing" l WHERE lower(vicinity_unaccent(l."title")) % $1 LIMIT 20`,
    params: ['plumbr'],
  },
  {
    name: 'nearby providers (GiST on publicLocation)',
    sql: `SELECT pl."providerId" FROM "ProviderLocation" pl
           WHERE ST_DWithin(pl."publicLocation", ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3) LIMIT 50`,
    params: [28.317, -15.429, 10000],
  },
];

async function main() {
  for (const c of CASES) {
    const r = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${c.sql}`, c.params);
    console.log(`\n=== ${c.name} ===`);
    for (const row of r.rows) console.log(row['QUERY PLAN']);
  }
  await pool.end();
}

void main();
