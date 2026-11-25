/**
 * DEMO DATA for local development only (SEED_DEMO_DATA=true). Every demo account uses an
 * @demo.vicinity.local email and the password "DemoPass123". Never enable in production.
 */
import * as argon2 from 'argon2';
import type { PrismaClient } from '../src/generated/prisma/client';
import { slugify } from '../src/common/util';
import { PLACES } from '../src/locations/places';

const DEMO_PASSWORD = 'DemoPass123';

interface DemoListing {
  type: 'SERVICE' | 'PRODUCT';
  title: string;
  description: string;
  category: string;
  priceType: 'FIXED' | 'STARTING_FROM' | 'RANGE' | 'HOURLY' | 'PER_UNIT' | 'NEGOTIABLE' | 'QUOTE';
  price?: number;
  priceMax?: number;
  unit?: string;
  keywords?: string[];
}

interface DemoProvider {
  name: string;
  owner: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  tagline: string;
  bio: string;
  area: string;
  phone: string;
  verified?: boolean;
  serviceMode?: 'AT_LOCATION' | 'MOBILE' | 'BOTH';
  serviceRadiusKm?: number;
  listings: DemoListing[];
}

const PROVIDERS: DemoProvider[] = [
  {
    name: 'QuickFix Plumbing', owner: 'Joseph Mwanza', type: 'BUSINESS', area: 'Woodlands', phone: '+260971000004', verified: true, serviceMode: 'MOBILE', serviceRadiusKm: 12,
    tagline: 'Repairs, installations and emergency leak fixes', bio: 'Licensed plumbing team serving Woodlands, Kabulonga and surrounding areas since 2015. Same-day callouts for burst pipes and blocked drains.',
    listings: [
      { type: 'SERVICE', title: 'Emergency leak repair', description: 'Burst pipes, leaking taps and toilets fixed fast. Callout within 2 hours in Woodlands.', category: 'Plumbing', priceType: 'STARTING_FROM', price: 150, keywords: ['leak', 'emergency'] },
      { type: 'SERVICE', title: 'Geyser installation and repair', description: 'Supply, install and service electric and solar geysers.', category: 'Plumbing', priceType: 'RANGE', price: 400, priceMax: 1500, keywords: ['geyser', 'hot water'] },
    ],
  },
  {
    name: "Grace's Hair Studio", owner: 'Grace Chileshe', type: 'BUSINESS', area: 'Rhodes Park', phone: '+260971000001', verified: true, serviceMode: 'BOTH', serviceRadiusKm: 8,
    tagline: 'Hairdressing & Afro styling specialist', bio: 'Gentle, tension-free braiding and natural hair care. In-studio or home visits within 8 km of Rhodes Park.',
    listings: [
      { type: 'SERVICE', title: 'Knotless box braids (medium)', description: 'Lightweight, tension-free technique. Includes wash and deep scalp oiling.', category: 'Hairdressing', priceType: 'FIXED', price: 350, keywords: ['braids', 'knotless'] },
      { type: 'SERVICE', title: "Men's fade and beard trim", description: 'Sharp hairline shaping, taper fade, hot towel and beard oil.', category: 'Barbering', priceType: 'FIXED', price: 120, keywords: ['fade', 'beard'] },
    ],
  },
  {
    name: 'Mutale Nails', owner: 'Mutale Banda', type: 'INDIVIDUAL', area: 'Mass Media', phone: '+260971000010', serviceMode: 'BOTH', serviceRadiusKm: 6,
    tagline: 'Gel, acrylics and pedicures', bio: 'Independent nail technician working from home in Mass Media. I also come to you.',
    listings: [
      { type: 'SERVICE', title: 'Gel manicure', description: 'Long-lasting gel colour with cuticle care.', category: 'Nail Care', priceType: 'FIXED', price: 150, keywords: ['gel', 'manicure'] },
      { type: 'SERVICE', title: 'Acrylic full set', description: 'Acrylic extensions with your choice of shape and design.', category: 'Nail Care', priceType: 'FIXED', price: 280, keywords: ['acrylics'] },
    ],
  },
  {
    name: 'Kalingalinga Fresh Meats', owner: 'Peter Zulu', type: 'BUSINESS', area: 'Kalingalinga', phone: '+260971000011',
    tagline: 'Fresh beef, goat and village chicken daily', bio: 'Family butchery supplying households and restaurants. Bulk orders welcome.',
    listings: [
      { type: 'PRODUCT', title: 'Fresh beef (mixed cuts)', description: 'Fresh beef, cut to order.', category: 'Meat Suppliers', priceType: 'PER_UNIT', price: 95, unit: 'kg', keywords: ['beef'] },
      { type: 'PRODUCT', title: 'Village chicken (whole)', description: 'Free-range village chickens, dressed.', category: 'Meat Suppliers', priceType: 'PER_UNIT', price: 180, unit: 'bird', keywords: ['chicken', 'village chicken'] },
    ],
  },
  {
    name: 'Bwalya Laundry & Ironing', owner: 'Bwalya Mulenga', type: 'INDIVIDUAL', area: 'Chilenje', phone: '+260971000012', serviceMode: 'MOBILE', serviceRadiusKm: 5,
    tagline: 'Wash, dry and iron — pickup in Chilenje & Libala', bio: 'Reliable laundry and ironing. Pickup and drop-off included within 5 km.',
    listings: [{ type: 'SERVICE', title: 'Wash, dry & iron', description: 'Per load of up to 5 kg. Pickup and drop-off included.', category: 'Laundry and Ironing', priceType: 'PER_UNIT', price: 80, unit: 'load', keywords: ['laundry', 'ironing'] }],
  },
  {
    name: 'Green Thumb Lusaka', owner: 'Daniel Phiri', type: 'INDIVIDUAL', area: 'Kabulonga', phone: '+260971000006', verified: true, serviceMode: 'MOBILE', serviceRadiusKm: 10,
    tagline: 'Gardening, lawns and yard clean-ups', bio: 'Weekly garden maintenance, hedge trimming and yard clean-ups.',
    listings: [{ type: 'SERVICE', title: 'Weekly garden maintenance', description: 'Grass cutting, weeding, hedge trimming.', category: 'Gardening and Yard Work', priceType: 'STARTING_FROM', price: 80, keywords: ['garden', 'lawn'] }],
  },
  {
    name: 'Sparkle Electrical', owner: 'Ruth Tembo', type: 'BUSINESS', area: 'Longacres', phone: '+260971000005', verified: true, serviceMode: 'MOBILE', serviceRadiusKm: 15,
    tagline: 'Certified electricians', bio: 'House wiring, fault finding, inverter and backup installations.',
    listings: [
      { type: 'SERVICE', title: 'Electrical fault finding', description: 'Trips, sparks, dead sockets diagnosed and fixed.', category: 'Electrical', priceType: 'STARTING_FROM', price: 120 },
      { type: 'SERVICE', title: 'Inverter & battery backup installation', description: 'Beat load shedding with a sized inverter system.', category: 'Solar Installation', priceType: 'QUOTE', keywords: ['load shedding', 'inverter'] },
    ],
  },
  {
    name: 'Reliable Auto Care', owner: 'Moses Lungu', type: 'BUSINESS', area: 'Emmasdale', phone: '+260971000002',
    tagline: 'Servicing, diagnostics and repairs', bio: 'Full-service mechanic workshop for Toyota, Nissan and Honda.',
    listings: [{ type: 'SERVICE', title: 'Minor service (oil & filters)', description: 'Oil, oil filter, air filter and 20-point check.', category: 'Mechanics', priceType: 'FIXED', price: 650, keywords: ['service', 'oil change'] }],
  },
  {
    name: 'Best Taste Catering', owner: 'Mary Sakala', type: 'BUSINESS', area: 'Olympia', phone: '+260971000003', verified: true,
    tagline: 'Weddings, kitchen parties and corporate events', bio: 'Zambian and continental menus for 20 to 500 guests.',
    listings: [{ type: 'SERVICE', title: 'Event catering (per guest)', description: 'Buffet with nshima, rice, two relishes, salads and drinks.', category: 'Catering', priceType: 'PER_UNIT', price: 120, unit: 'guest' }],
  },
  {
    name: 'Chanda Designs', owner: 'Chanda Kabwe', type: 'INDIVIDUAL', area: 'Roma', phone: '+260971000013',
    tagline: 'Logos, flyers and brand identity', bio: 'Freelance graphic designer helping small businesses look professional.',
    listings: [{ type: 'SERVICE', title: 'Logo design', description: 'Three concepts, two revisions, all file formats.', category: 'Graphic Design', priceType: 'FIXED', price: 500, keywords: ['logo', 'branding'] }],
  },
  {
    name: 'Mwila Money Booth', owner: 'Mwila Chola', type: 'INDIVIDUAL', area: 'Woodlands', phone: '+260971000014',
    tagline: 'Airtel Money, MTN MoMo & Zamtel Kwacha', bio: 'Deposits, withdrawals and airtime at Woodlands market, 07:00–19:00.',
    listings: [{ type: 'SERVICE', title: 'Mobile money deposits & withdrawals', description: 'All networks. Float available most of the day.', category: 'Mobile Money Agents', priceType: 'NEGOTIABLE', keywords: ['airtel money', 'mtn momo'] }],
  },
  {
    name: 'Phiri Phone Repairs', owner: 'Elijah Phiri', type: 'INDIVIDUAL', area: 'Kamwala', phone: '+260971000015',
    tagline: 'Screens, batteries and charging ports', bio: 'Most repairs done while you wait at Kamwala.',
    listings: [{ type: 'SERVICE', title: 'Screen replacement', description: 'Screens for Samsung, Tecno, Itel, iPhone.', category: 'Phone Repair', priceType: 'STARTING_FROM', price: 250 }],
  },
  {
    name: 'Banda Charcoal Supply', owner: 'Agnes Banda', type: 'INDIVIDUAL', area: 'Matero', phone: '+260971000016',
    tagline: 'Charcoal by the bag, delivered', bio: 'Good quality charcoal, delivered across Matero and Emmasdale.',
    listings: [{ type: 'PRODUCT', title: 'Charcoal (50 kg bag)', description: 'Dense, long-burning charcoal.', category: 'Charcoal', priceType: 'PER_UNIT', price: 220, unit: 'bag' }],
  },
  {
    name: 'Teacher Mercy Tutoring', owner: 'Mercy Mbewe', type: 'INDIVIDUAL', area: 'Chelston', phone: '+260971000017',
    tagline: 'Maths & science, grades 7–12', bio: 'Qualified teacher offering after-school tuition and exam preparation.',
    listings: [{ type: 'SERVICE', title: 'Maths tuition', description: 'One-on-one or small groups, ECZ exam preparation.', category: 'Academic Tutors', priceType: 'HOURLY', price: 100 }],
  },
];

const CUSTOMERS = ['Natasha Mulenga', 'Kondwani Mwale', 'Thandiwe Banda', 'Chipo Nkandu'];
const COMMENTS = ['Excellent work, on time and fair price.', 'Very professional. Will use again.', 'Good service, a bit late but quality was great.', 'Highly recommend!'];

export async function seedDemo(prisma: PrismaClient, argonOpts: Parameters<typeof argon2.hash>[1]) {
  if (await prisma.user.findFirst({ where: { email: { endsWith: '@demo.vicinity.local' } } })) {
    console.log('Demo data already present: skipping');
    return;
  }
  const passwordHash: string = await argon2.hash(DEMO_PASSWORD, { ...(argonOpts as object), raw: false });
  const cats = new Map((await prisma.category.findMany({ where: { parentId: { not: null } } })).map((c) => [c.name, c.id]));
  const email = (name: string) => `${slugify(name).replace(/-/g, '.')}@demo.vicinity.local`;

  const customers = [];
  for (const name of CUSTOMERS) {
    customers.push(await prisma.user.create({ data: { email: email(name), fullName: name, passwordHash, emailVerifiedAt: new Date(), notificationPreference: { create: {} } } }));
  }

  let n = 0;
  const providerIds: string[] = [];
  for (const d of PROVIDERS) {
    const place = PLACES.find((p) => p.name === d.area)!;
    // Spread providers a little around the neighbourhood centroid.
    const jitter = () => (Math.random() - 0.5) * 0.01;
    const lat = place.lat + jitter();
    const lng = place.lng + jitter();
    const user = await prisma.user.create({
      data: { email: email(d.owner), fullName: d.owner, passwordHash, emailVerifiedAt: new Date(), phone: d.phone, notificationPreference: { create: {} } },
    });
    const provider = await prisma.provider.create({
      data: {
        userId: user.id,
        slug: `${slugify(d.name)}-demo`,
        type: d.type,
        displayName: d.name,
        tagline: d.tagline,
        bio: d.bio,
        phone: d.phone,
        whatsapp: d.phone,
        serviceMode: d.serviceMode ?? 'AT_LOCATION',
        serviceRadiusKm: d.serviceRadiusKm,
        status: 'ACTIVE',
        onboardingStep: 11,
        publishedAt: new Date(),
        verificationStatus: d.verified ? 'VERIFIED' : 'UNVERIFIED',
        verifiedAt: d.verified ? new Date() : null,
        primaryCategoryId: cats.get(d.listings[0]!.category),
        availability: {
          create: [1, 2, 3, 4, 5, 6].map((day) => ({ dayOfWeek: day, startTime: '08:00', endTime: day === 6 ? '13:00' : '17:30' })),
        },
      },
    });
    providerIds.push(provider.id);
    await prisma.$executeRaw`
      INSERT INTO "ProviderLocation" ("providerId", "label", "area", "city", "location", "publicLocation", "showExactLocation", "isPrimary")
      VALUES (${provider.id}::uuid, 'Main', ${d.area}, ${place.city},
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ST_SetSRID(ST_MakePoint(${Math.round(lng * 200) / 200}, ${Math.round(lat * 200) / 200}), 4326)::geography,
              false, true)`;
    if (d.serviceMode === 'MOBILE' || d.serviceMode === 'BOTH') {
      await prisma.$executeRaw`
        INSERT INTO "ServiceArea" ("providerId", "name", "center", "radiusKm")
        VALUES (${provider.id}::uuid, ${`${d.area} and surrounds`}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${d.serviceRadiusKm ?? 5})`;
    }
    for (const l of d.listings) {
      const categoryId = cats.get(l.category);
      if (!categoryId) throw new Error(`Unknown demo category ${l.category}`);
      await prisma.listing.create({
        data: {
          providerId: provider.id,
          type: l.type,
          title: l.title,
          description: l.description,
          categoryId,
          priceType: l.priceType,
          price: l.priceType === 'QUOTE' ? null : (l.price ?? null),
          priceMax: l.priceMax ?? null,
          unit: l.unit ?? null,
          keywords: l.keywords ?? [],
          status: 'ACTIVE',
          publishedAt: new Date(Date.now() - n * 3600_000),
          qualityScore: 55,
          ...(l.type === 'SERVICE' ? { serviceDetails: { create: {} } } : { productDetails: { create: { deliveryAvailable: true, deliveryRadiusKm: 8 } } }),
        },
      });
      n++;
    }
    // Reviews from demo customers (deterministic, not every provider).
    const reviewers = customers.slice(0, (PROVIDERS.indexOf(d) % 4) + 1);
    for (const [i, c] of reviewers.entries()) {
      await prisma.contactEvent.create({ data: { providerId: provider.id, userId: c.id, channel: 'WHATSAPP' } });
      await prisma.review.create({
        data: { providerId: provider.id, authorId: c.id, rating: 5 - ((i + PROVIDERS.indexOf(d)) % 2), comment: COMMENTS[i % COMMENTS.length], isVerifiedInteraction: true },
      });
    }
    await prisma.$executeRaw`
      UPDATE "Provider" p SET
        "ratingAverage" = coalesce((SELECT round(avg("rating")::numeric, 2) FROM "Review" WHERE "providerId" = p."id" AND "status" = 'PUBLISHED'), 0),
        "ratingCount" = (SELECT count(*) FROM "Review" WHERE "providerId" = p."id" AND "status" = 'PUBLISHED')
      WHERE p."id" = ${provider.id}::uuid`;
  }

  // A church organization with a private group and a group-only listing, for visibility testing.
  const pastor = customers[0]!;
  const org = await prisma.organization.create({
    data: {
      slug: 'northmead-assembly-demo',
      name: 'Northmead Assembly (demo)',
      type: 'CHURCH',
      description: 'Demo church organization for testing organization- and group-scoped discovery.',
      locationName: 'Northmead, Lusaka',
      ownerId: pastor.id,
      memberships: { create: [{ userId: pastor.id, role: 'OWNER' }] },
    },
  });
  const group = await prisma.group.create({
    data: { organizationId: org.id, name: 'Youth Fellowship', description: 'Youth members', isPrivate: true, createdById: pastor.id, memberships: { create: [{ userId: pastor.id, role: 'ADMIN' }] } },
  });
  const tutor = await prisma.provider.findFirstOrThrow({ where: { displayName: 'Teacher Mercy Tutoring' } });
  await prisma.organizationMembership.create({ data: { organizationId: org.id, userId: tutor.userId } });
  await prisma.groupMembership.create({ data: { groupId: group.id, userId: tutor.userId } });
  await prisma.listing.create({
    data: {
      providerId: tutor.id,
      type: 'SERVICE',
      title: 'Free homework club for Youth Fellowship',
      description: 'Saturday homework help, members only.',
      categoryId: cats.get('Homework Assistance')!,
      priceType: 'FIXED',
      price: 0,
      status: 'ACTIVE',
      publishedAt: new Date(),
      visibility: 'GROUP',
      organizationId: org.id,
      groupId: group.id,
      serviceDetails: { create: {} },
    },
  });

  console.log(`Demo data: ${PROVIDERS.length} providers, ${n + 1} listings, ${CUSTOMERS.length} customers. Password for all demo accounts: ${DEMO_PASSWORD}`);
}
