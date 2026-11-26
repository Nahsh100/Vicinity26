/**
 * PHOTOS FOR BULK TEST LISTINGS: gives a share of the bulk providers' listings (see bulk-providers.ts)
 * real photos, so the app can be judged with a realistic mix of listings with and without images.
 *
 *   npx tsx prisma/bulk-images.ts               # photos on ~60% of bulk listings
 *   npx tsx prisma/bulk-images.ts --share 0.4   # a different share
 *   npx tsx prisma/bulk-images.ts --remove      # delete these photos (bulk-providers --remove also does)
 *
 * Photos come from Openverse (openly licensed images, mostly Flickr), searched per category. Each is
 * downloaded once and stored like a normal upload (R2 in production, ./storage locally), then shared
 * by many listings in that category. They are owned by a bulk test account, so removing the bulk
 * providers removes them too. Openly licensed but not attributed: test data only, never for launch.
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { env } from '../src/config/env';
import { LocalStorageDriver, R2StorageDriver, type StorageDriver } from '../src/media/storage';

const DOMAIN = '@bulk.vicinity.local';
const KEY_PREFIX = 'bulk-test/';
const PER_CATEGORY = 6;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const e = env();
const driver: StorageDriver = e.STORAGE_DRIVER === 'r2' ? new R2StorageDriver(e) : new LocalStorageDriver(e);

/** Search terms per category: specific enough to return photos of the work or goods. */
const QUERIES: Record<string, string> = {
  'Legal Services': 'lawyer office desk documents',
  Accounting: 'accountant calculator financial documents',
  'Business Consulting': 'business meeting office team',
  'Software Development': 'programmer laptop code',
  'Web Development': 'web designer laptop website',
  'Graphic Design': 'graphic designer drawing tablet',
  Photography: 'photographer camera portrait',
  Videography: 'video camera filming',
  Physiotherapy: 'physiotherapy treatment',
  'Veterinary Services': 'veterinarian dog examination',
  'Agricultural Consultancy': 'farmer maize field',
  'Digital Marketing': 'social media marketing smartphone',
  'Social Media Management': 'smartphone social media',
  'Solar Installation': 'solar panels roof installation',
  Boreholes: 'water well drilling rig',
  Plumbing: 'plumber repairing pipe',
  Electrical: 'electrician wiring',
  Painting: 'painter painting wall roller',
  Carpentry: 'carpenter woodworking furniture',
  'Appliance Repair': 'refrigerator repair technician',
  Mechanics: 'car mechanic engine repair',
  'Panel Beating': 'car body repair spray paint',
  'Tyre Services': 'tyre change wheel',
  Welding: 'welder welding sparks',
  Bricklaying: 'bricklayer building wall',
  Roofing: 'roofer roof repair',
  Tiling: 'tiling floor tiles',
  'Phone Repair': 'smartphone screen repair',
  'Computer Repair': 'laptop repair technician',
  'Electronics Repair': 'electronics repair soldering',
  Tailoring: 'tailor sewing machine',
  Hairdressing: 'braids hairstyle african',
  Barbering: 'barber haircut',
  Makeup: 'makeup artist',
  Massage: 'massage therapy spa',
  'Personal Training': 'personal trainer gym workout',
  Catering: 'buffet catering food',
  Cakes: 'birthday cake decorated',
  DJs: 'dj mixer party',
  MCs: 'microphone event host stage',
  'Event Decoration': 'wedding decoration tables',
  'Tents and Chairs': 'event tent chairs',
  'Driving Lessons': 'driving lesson car',
  'Academic Tutors': 'tutor student homework',
  'Music Lessons': 'piano lesson',
  'Pet Grooming': 'dog grooming',
  'Pest Control': 'pest control spraying',
  'Deep Cleaning': 'house cleaning mop',
  'Office Cleaning': 'office cleaning',
  'Moving Services': 'moving boxes truck',
  'Car Hire': 'car rental toyota',
  'Home Care': 'nurse elderly care home',
  Cleaning: 'cleaning kitchen',
  'Laundry and Ironing': 'ironing clothes laundry',
  'Gardening and Yard Work': 'gardener mowing lawn',
  'House Helpers': 'housekeeping cleaning home',
  Babysitting: 'babysitter playing children',
  Nannies: 'nanny child',
  'Home-Cooked Meals': 'african food plate',
  Baking: 'fresh bread buns bakery',
  'Motorcycle Delivery': 'motorcycle delivery',
  Taxi: 'taxi car city',
  'Truck Hire': 'truck transport cargo',
  'Shoe Repair': 'cobbler shoe repair',
  'Bicycle Repair': 'bicycle repair',
  'Mobile Money Agents': 'mobile money kiosk africa',
  'Farm Workers': 'farm workers field harvest',
  'Garbage Collection': 'garbage collection truck',
  Assistants: 'office assistant typing',
  'CV Writing': 'resume writing laptop',
  'Vegetables and Groceries': 'vegetables market stall',
  Charcoal: 'charcoal bags',
  Poultry: 'chickens poultry farm',
  'Meat Suppliers': 'butcher meat',
  'Construction Materials': 'cement bags hardware',
  'Clothing Sales': 'clothes shop rack',
  'Animal Feed': 'animal feed sacks',
  'Household Essentials': 'grocery shop shelves',
};

interface Found {
  url: string;
  width?: number;
  height?: number;
}

async function search(q: string): Promise<Found[]> {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20&category=photograph&mature=false&extension=jpg`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'VicinityTestSeed/1.0' } });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 15_000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: Found[] };
    // Landscape-ish photos of a decent size look best in cards.
    return (j.results ?? []).filter((x) => (x.width ?? 0) >= 640 && (x.height ?? 0) >= 400 && (x.width ?? 0) / (x.height ?? 1) <= 2);
  }
  return [];
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'VicinityTestSeed/1.0' }, signal: AbortSignal.timeout(20_000) });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !/^image\/jpe?g/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 20_000 && buf.length < 5_000_000 ? buf : null;
  } catch {
    return null;
  }
}

async function store(key: string, bytes: Buffer) {
  if (driver.name === 'local') {
    const p = resolve(join(e.STORAGE_LOCAL_DIR, key));
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.writeFile(p, bytes);
    return;
  }
  const target = await driver.createUpload(key, 'image/jpeg', bytes.length, '');
  const r = await fetch(target.url, { method: 'PUT', headers: target.headers, body: new Uint8Array(bytes) });
  if (!r.ok) throw new Error(`upload ${key}: HTTP ${r.status}`);
}

/** Deletes the stored files and media rows this script created. */
async function removeBulkImages(p: PrismaClient = prisma) {
  const media = await p.media.findMany({ where: { storageKey: { startsWith: KEY_PREFIX } }, select: { id: true, storageKey: true } });
  for (const m of media) await driver.remove(m.storageKey).catch(() => undefined);
  await p.media.deleteMany({ where: { id: { in: media.map((m) => m.id) } } });
  return media.length;
}

async function add(share: number) {
  const owner = await prisma.user.findFirst({ where: { email: `customer.1${DOMAIN}` } });
  if (!owner) throw new Error('No bulk providers: run prisma/bulk-providers.ts first');
  if (await prisma.media.findFirst({ where: { storageKey: { startsWith: KEY_PREFIX } } })) {
    console.log('Bulk photos already present: run with --remove first to redo them.');
    return;
  }
  const listings = await prisma.listing.findMany({
    where: { provider: { slug: { endsWith: '-bulk' } } },
    select: { id: true, providerId: true, category: { select: { name: true } } },
    orderBy: { id: 'asc' },
  });
  const cats = [...new Set(listings.map((l) => l.category.name))];
  console.log(`${listings.length} bulk listings in ${cats.length} categories`);

  const pools = new Map<string, string[]>();
  for (const cat of cats) {
    const base = QUERIES[cat] ?? cat;
    // Specific terms first, then broader ones until the pool is full.
    const queries = [...new Set([base, base.split(' ').slice(0, 2).join(' '), base.split(' ')[0]!, cat])];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const q of queries) {
      if (ids.length >= PER_CATEGORY) break;
      for (const f of await search(q)) {
        if (ids.length >= PER_CATEGORY) break;
        if (seen.has(f.url)) continue;
        seen.add(f.url);
        const bytes = await download(f.url);
        if (!bytes) continue;
        const key = `${KEY_PREFIX}${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${ids.length + 1}.jpg`;
        await store(key, bytes);
        const m = await prisma.media.create({
          data: { ownerId: owner.id, kind: 'IMAGE', purpose: 'LISTING', storageKey: key, mimeType: 'image/jpeg', sizeBytes: bytes.length, width: f.width, height: f.height, status: 'READY' },
        });
        ids.push(m.id);
      }
      await new Promise((res) => setTimeout(res, 1500)); // be gentle with the free API
    }
    pools.set(cat, ids);
    console.log(`  ${cat.padEnd(26)} ${ids.length} photos`);
  }

  // Deterministic choice so a rerun picks the same listings.
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  // Aim for `share` of ALL listings, even if a few categories found no photos.
  const eligible = listings.filter((l) => (pools.get(l.category.name) ?? []).length).length;
  const p = Math.min(1, (share * listings.length) / Math.max(1, eligible));
  let withPhotos = 0;
  const covered = new Map<string, string>();
  for (const l of listings) {
    const pool = pools.get(l.category.name) ?? [];
    if (!pool.length || rand() >= p) continue;
    const count = Math.min(pool.length, rand() < 0.3 ? 2 + Math.floor(rand() * 2) : 1);
    const start = Math.floor(rand() * pool.length);
    const chosen = Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]!);
    await prisma.listingMedia.createMany({ data: chosen.map((mediaId, sortOrder) => ({ listingId: l.id, mediaId, sortOrder })) });
    if (!covered.has(l.providerId)) covered.set(l.providerId, chosen[0]!);
    withPhotos++;
  }
  // The provider's cover photo is its first listing photo, so provider cards show it too.
  for (const [providerId, mediaId] of covered) {
    await prisma.provider.updateMany({ where: { id: providerId, coverMediaId: null }, data: { coverMediaId: mediaId } });
  }
  const photos = [...pools.values()].reduce((n, p) => n + p.length, 0);
  console.log(`Done: ${photos} photos stored; ${withPhotos}/${listings.length} listings (${Math.round((withPhotos / listings.length) * 100)}%) and ${covered.size} provider covers use them.`);
}

const args = process.argv.slice(2);
const shareArg = args.indexOf('--share');
const run = args.includes('--remove')
  ? removeBulkImages().then((n) => console.log(`Removed ${n} bulk photos.`))
  : add(shareArg >= 0 ? Number(args[shareArg + 1]) : 0.6);
run
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
