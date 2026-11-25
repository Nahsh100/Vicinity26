import { addListing, auth, categoryId, createApp, type Ctx, KALINGALINGA, makeProvider, MASS_MEDIA, MATERO, publish, WOODLANDS } from './harness';

/** Search combinations from the spec, against real PostGIS + full-text queries. */
describe('Search', () => {
  let ctx: Ctx;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createApp();
    const plumbing = await categoryId(ctx, 'Plumbing');
    const nails = await categoryId(ctx, 'Nail Care');
    const meat = await categoryId(ctx, 'Meat Suppliers');
    const design = await categoryId(ctx, 'Graphic Design');

    const plumber = await makeProvider(ctx, { name: 'QuickFix Plumbing', ...WOODLANDS, area: 'Woodlands', type: 'BUSINESS' });
    ids.plumbing = await addListing(ctx, plumber.token, { type: 'SERVICE', title: 'Emergency leak repair', categoryId: plumbing, priceType: 'STARTING_FROM', price: 150, description: 'Burst pipes fixed' });
    await publish(ctx, plumber.token);

    const nailTech = await makeProvider(ctx, { name: 'Mutale Nails', ...MASS_MEDIA, area: 'Mass Media' });
    ids.gel = await addListing(ctx, nailTech.token, { type: 'SERVICE', title: 'Gel manicure', categoryId: nails, priceType: 'FIXED', price: 150 });
    ids.acrylic = await addListing(ctx, nailTech.token, { type: 'SERVICE', title: 'Acrylic full set', categoryId: nails, priceType: 'FIXED', price: 280 });
    await publish(ctx, nailTech.token);

    const butcher = await makeProvider(ctx, { name: 'Kalingalinga Fresh Meats', ...KALINGALINGA, area: 'Kalingalinga' });
    ids.beef = await addListing(ctx, butcher.token, { type: 'PRODUCT', title: 'Fresh beef', categoryId: meat, priceType: 'PER_UNIT', price: 95, unit: 'kg' });
    await publish(ctx, butcher.token);

    // Far away (~9 km) but travels 15 km to customers.
    const mobilePlumber = await makeProvider(ctx, { name: 'Matero Mobile Plumber', ...MATERO, area: 'Matero', serviceRadiusKm: 15 });
    ids.mobilePlumbing = await addListing(ctx, mobilePlumber.token, { type: 'SERVICE', title: 'Plumbing callouts', categoryId: plumbing, priceType: 'HOURLY', price: 100 });
    await publish(ctx, mobilePlumber.token);

    const designer = await makeProvider(ctx, { name: 'Chanda Designs', ...MATERO, area: 'Matero' });
    ids.logo = await addListing(ctx, designer.token, { type: 'SERVICE', title: 'Logo design', categoryId: design, priceType: 'FIXED', price: 500 });
    await publish(ctx, designer.token);

    // A rated provider for rating filters.
    await ctx.prisma.provider.update({ where: { id: nailTech.providerId }, data: { ratingAverage: 4.8, ratingCount: 12 } });
  }, 120_000);
  afterAll(async () => ctx.app.close());

  const search = async (q: Record<string, string | number | boolean>) => {
    const r = await ctx.http.get('/api/v1/search').query(q).expect(200);
    return { ids: r.body.data.map((l: { id: string }) => l.id) as string[], body: r.body };
  };

  it('keyword + location + radius: plumbers within 5 km of Woodlands (incl. mobile provider covering Woodlands)', async () => {
    const r = await search({ q: 'plumber', lat: WOODLANDS.lat, lng: WOODLANDS.lng, radiusKm: 5 });
    expect(r.ids).toContain(ids.plumbing);
    // Matero is ~9 km away but its 15 km service area covers Woodlands.
    expect(r.ids).toContain(ids.mobilePlumbing);
    expect(r.ids).not.toContain(ids.gel);
    expect(r.body.meta.matchedCategories.map((c: { name: string }) => c.name)).toContain('Plumbing');
    expect(r.body.data[0].distanceMeters).toBeLessThan(1000);
  });

  it('synonyms + manual area + price: nail techs in Mass Media under ZMW 200 without GPS', async () => {
    const r = await search({ q: 'nail tech', area: 'Mass Media', maxPrice: 200 });
    expect(r.ids).toEqual([ids.gel]);
    expect(r.body.meta.origin.label).toBe('Mass Media');
  });

  it('product + location: meat within 2 km of Kalingalinga', async () => {
    const r = await search({ q: 'meat', area: 'Kalingalinga', radiusKm: 2, listingType: 'PRODUCT' });
    expect(r.ids).toEqual([ids.beef]);
  });

  it('category + price range', async () => {
    const nails = await categoryId(ctx, 'Nail Care');
    const r = await search({ categoryId: nails, minPrice: 200, maxPrice: 300 });
    expect(r.ids).toEqual([ids.acrylic]);
  });

  it('parent category includes its subcategories', async () => {
    const parent = await ctx.prisma.category.findFirstOrThrow({ where: { name: 'Personal Care' } });
    const r = await search({ categoryId: parent.id });
    expect(r.ids.sort()).toEqual([ids.gel, ids.acrylic].sort());
  });

  it('service + minimum rating', async () => {
    const r = await search({ listingType: 'SERVICE', minRating: 4.5 });
    expect(r.ids.sort()).toEqual([ids.gel, ids.acrylic].sort());
  });

  it('fuzzy matching tolerates typos', async () => {
    const r = await search({ q: 'plumbr' });
    expect(r.ids).toContain(ids.plumbing);
  });

  it('graphic designers within Lusaka (town-level area search)', async () => {
    const r = await search({ q: 'graphic designer', area: 'Lusaka CBD', radiusKm: 20 });
    expect(r.ids).toContain(ids.logo);
  });

  it('sorts by distance and paginates with a stable cursor', async () => {
    const first = await ctx.http.get('/api/v1/search').query({ lat: WOODLANDS.lat, lng: WOODLANDS.lng, radiusKm: 50, sort: 'distance', limit: 2 }).expect(200);
    expect(first.body.meta.hasMore).toBe(true);
    const d = first.body.data.map((x: { distanceMeters: number }) => x.distanceMeters);
    expect(d[0]).toBeLessThanOrEqual(d[1]);
    const second = await ctx.http.get('/api/v1/search').query({ lat: WOODLANDS.lat, lng: WOODLANDS.lng, radiusKm: 50, sort: 'distance', limit: 2, cursor: first.body.meta.nextCursor }).expect(200);
    const overlap = second.body.data.filter((x: { id: string }) => first.body.data.some((y: { id: string }) => y.id === x.id));
    expect(overlap).toHaveLength(0);
    expect(second.body.data[0].distanceMeters).toBeGreaterThanOrEqual(d[1]);
  });

  it('returns empty results cleanly', async () => {
    const r = await search({ q: 'submarine repairs', area: 'Woodlands', radiusKm: 1 });
    expect(r.ids).toEqual([]);
    expect(r.body.meta.total).toBe(0);
  });

  it('rejects invalid coordinates and half-specified locations', async () => {
    await ctx.http.get('/api/v1/search').query({ lat: 123, lng: 28 }).expect(400);
    await ctx.http.get('/api/v1/search').query({ lat: -15.4 }).expect(400);
    await ctx.http.get('/api/v1/search').query({ minPrice: 300, maxPrice: 100 }).expect(400);
    const r = await ctx.http.get('/api/v1/search').query({ area: 'Atlantis' }).expect(400);
    expect(r.body.error.code).toBe('UNKNOWN_AREA');
  });

  it('labels sponsored placements separately without changing organic order', async () => {
    const organic = await search({ q: 'nails', area: 'Mass Media' });
    const listing = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: ids.acrylic } });
    await ctx.prisma.listingPromotion.create({
      data: { listingId: listing.id, providerId: listing.providerId, status: 'ACTIVE', startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 86400_000) },
    });
    const r = await search({ q: 'nails', area: 'Mass Media' });
    expect(r.body.meta.sponsored.map((s: { id: string; isSponsored: boolean }) => [s.id, s.isSponsored])).toEqual([[ids.acrylic, true]]);
    expect(r.ids).toEqual(organic.ids);
  });

  it('counts search appearances for provider analytics', async () => {
    await search({ q: 'logo' });
    await new Promise((r) => setTimeout(r, 200));
    const p = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: ids.logo } });
    const day = await ctx.prisma.providerAnalyticsDaily.findFirst({ where: { providerId: p.providerId } });
    expect(day?.searchAppearances).toBeGreaterThan(0);
  });

  it('suggests categories from synonyms', async () => {
    const r = await ctx.http.get('/api/v1/search/suggest').query({ q: 'manicure' }).expect(200);
    expect(r.body.data.categories.map((c: { name: string }) => c.name)).toContain('Nail Care');
    void auth;
  });
});
