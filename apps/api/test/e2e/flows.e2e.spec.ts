import { PushWorker } from '../../src/notifications/push.worker';
import { addListing, adminToken, auth, categoryId, createApp, type Ctx, makeProvider, publish, signUp, WOODLANDS } from './harness';

/** Acceptance flows 1–6 and the security requirements. */
describe('End-to-end flows', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await createApp();
  }, 60_000);
  afterAll(async () => ctx.app.close());

  it('Flow 1 + 2: provider onboards and publishes; a customer discovers, views and contacts them', async () => {
    const gardening = await categoryId(ctx, 'Gardening and Yard Work');
    const provider = await makeProvider(ctx, { name: 'Green Thumb', ...WOODLANDS, area: 'Woodlands' });

    const listingId = await addListing(ctx, provider.token, { type: 'SERVICE', title: 'Weekly garden maintenance', categoryId: gardening, priceType: 'STARTING_FROM', price: 80 });
    // Not searchable before publishing.
    let r = await ctx.http.get('/api/v1/search').query({ q: 'garden' }).expect(200);
    expect(r.body.data).toHaveLength(0);
    // Publishing requires a listing + location (both present) and makes drafts live.
    await publish(ctx, provider.token);

    const customer = await signUp(ctx);
    r = await ctx.http.get('/api/v1/search').query({ q: 'gardener', lat: WOODLANDS.lat, lng: WOODLANDS.lng, radiusKm: 5 }).set(auth(customer.token)).expect(200);
    expect(r.body.data.map((l: { id: string }) => l.id)).toEqual([listingId]);

    const profile = await ctx.http.get(`/api/v1/providers/${provider.providerId}`).set(auth(customer.token)).expect(200);
    expect(profile.body.data.sections.services).toBe(1);
    // The approximate public location never equals the exact private one.
    expect(profile.body.data.locations[0].isApproximate).toBe(true);

    await ctx.http.post(`/api/v1/providers/${provider.providerId}/contact`).set(auth(customer.token)).send({ channel: 'WHATSAPP', listingId }).expect(200);
    await ctx.http.post(`/api/v1/providers/${provider.providerId}/enquiries`).set(auth(customer.token)).send({ message: 'Can you come on Saturday?', listingId }).expect(201);

    const stats = await ctx.http.get('/api/v1/providers/me/analytics').set(auth(provider.token)).expect(200);
    expect(stats.body.data.totals).toMatchObject({ profileViews: 1, whatsappClicks: 1, enquiries: 1 });
    const enquiries = await ctx.http.get('/api/v1/enquiries/received').set(auth(provider.token)).expect(200);
    expect(enquiries.body.data[0].message).toBe('Can you come on Saturday?');
  });

  it('Flow 3: portfolio project with uploaded media appears on the public profile', async () => {
    const provider = await makeProvider(ctx, { name: 'Tile Pro', ...WOODLANDS, area: 'Woodlands' });
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const up = await ctx.http.post('/api/v1/media/uploads').set(auth(provider.token)).send({ kind: 'IMAGE', purpose: 'PORTFOLIO', mimeType: 'image/png', sizeBytes: png.length }).expect(201);
    const url = new URL(up.body.data.upload.url);
    await ctx.http.put(url.pathname + url.search).set('content-type', 'image/png').send(png).expect(204);
    await ctx.http.post(`/api/v1/media/${up.body.data.mediaId}/complete`).set(auth(provider.token)).expect(201);

    await ctx.http.post('/api/v1/providers/me/portfolio').set(auth(provider.token)).send({ title: 'Kitchen tiling', mediaIds: [up.body.data.mediaId] }).expect(201);
    const pub = await ctx.http.get(`/api/v1/providers/${provider.providerId}/portfolio`).expect(200);
    expect(pub.body.data[0]).toMatchObject({ title: 'Kitchen tiling' });
    const raw = await ctx.http.get(`/api/v1/media/${up.body.data.mediaId}/raw`).expect(200);
    expect(raw.headers['content-type']).toBe('image/png');
  });

  it('Flow 4: organization + group scoped listings are visible to members only', async () => {
    const tutoring = await categoryId(ctx, 'Homework Assistance');
    const owner = await signUp(ctx);
    const org = await ctx.http.post('/api/v1/organizations').set(auth(owner.token)).send({ name: 'Northmead Assembly', type: 'CHURCH', isPrivate: true }).expect(201);
    const orgId = org.body.data.id;
    const group = await ctx.http.post(`/api/v1/organizations/${orgId}/groups`).set(auth(owner.token)).send({ name: 'Youth Fellowship', isPrivate: true }).expect(201);
    const groupId = group.body.data.id;

    const provider = await makeProvider(ctx, { name: 'Teacher Mercy', ...WOODLANDS, area: 'Woodlands' });
    const member = await signUp(ctx);
    const outsider = await signUp(ctx);

    // Invitations: provider joins org + group with a shareable code; member via a group invite.
    const inv = await ctx.http.post(`/api/v1/organizations/${orgId}/invitations`).set(auth(owner.token)).send({ groupId, maxUses: 5 }).expect(201);
    await ctx.http.post(`/api/v1/organizations/invitations/${inv.body.data.code}/accept`).set(auth(provider.token)).expect(200);
    await ctx.http.post(`/api/v1/organizations/invitations/${inv.body.data.code}/accept`).set(auth(member.token)).expect(200);

    // Visibility is explicit per listing, never inferred from membership.
    const publicId = await addListing(ctx, provider.token, { type: 'SERVICE', title: 'Maths homework help', categoryId: tutoring, priceType: 'FIXED', price: 50, organizationId: orgId, visibility: 'PUBLIC' });
    const groupOnly = await addListing(ctx, provider.token, { type: 'SERVICE', title: 'Youth homework club', categoryId: tutoring, priceType: 'FIXED', price: 0, visibility: 'GROUP', organizationId: orgId, groupId });
    await publish(ctx, provider.token);

    const asMember = await ctx.http.get('/api/v1/search').query({ q: 'homework' }).set(auth(member.token)).expect(200);
    expect(asMember.body.data.map((l: { id: string }) => l.id).sort()).toEqual([publicId, groupOnly].sort());
    const scoped = await ctx.http.get('/api/v1/search').query({ organizationId: orgId, groupId }).set(auth(member.token)).expect(200);
    expect(scoped.body.data.map((l: { id: string }) => l.id)).toEqual([groupOnly]);

    const asOutsider = await ctx.http.get('/api/v1/search').query({ q: 'homework' }).set(auth(outsider.token)).expect(200);
    expect(asOutsider.body.data.map((l: { id: string }) => l.id)).toEqual([publicId]);
    await ctx.http.get(`/api/v1/listings/${groupOnly}`).set(auth(outsider.token)).expect(404);
    await ctx.http.get(`/api/v1/listings/${groupOnly}`).expect(404);
    await ctx.http.get(`/api/v1/listings/${groupOnly}`).set(auth(member.token)).expect(200);
    // Private org: outsiders cannot even search within it.
    await ctx.http.get('/api/v1/search').query({ organizationId: orgId }).set(auth(outsider.token)).expect(403);

    // A group that does not belong to the organization is rejected.
    const other = await ctx.http.post('/api/v1/organizations').set(auth(owner.token)).send({ name: 'Other Org', type: 'CLUB' }).expect(201);
    const r = await ctx.http.get('/api/v1/search').query({ organizationId: other.body.data.id, groupId }).set(auth(owner.token)).expect(400);
    expect(r.body.error.code).toBe('GROUP_ORG_MISMATCH');
    const bad = await ctx.http.post('/api/v1/listings').set(auth(provider.token)).send({ type: 'SERVICE', title: 'Wrong scope', categoryId: tutoring, priceType: 'QUOTE', visibility: 'GROUP', organizationId: other.body.data.id, groupId });
    expect(bad.status).toBe(403);
  });

  it('Flow 5: notifications are stored, pushed to registered devices with retry, and can be marked read', async () => {
    const provider = await makeProvider(ctx, { name: 'Push Test', ...WOODLANDS, area: 'Woodlands' });
    await addListing(ctx, provider.token, { type: 'SERVICE', title: 'Anything', categoryId: await categoryId(ctx, 'Cleaning'), priceType: 'QUOTE' });
    await publish(ctx, provider.token);
    await ctx.http.post('/api/v1/notifications/devices').set(auth(provider.token)).send({ token: 'ExponentPushToken[test-device-1]', platform: 'ANDROID' }).expect(201);

    const customer = await signUp(ctx);
    await ctx.http.post(`/api/v1/providers/${provider.providerId}/enquiries`).set(auth(customer.token)).send({ message: 'Hello there, are you free?' }).expect(201);

    const unread = await ctx.http.get('/api/v1/notifications/unread-count').set(auth(provider.token)).expect(200);
    expect(unread.body.data.count).toBe(1);

    const worker = ctx.app.get(PushWorker);
    // First attempt fails (network), second succeeds.
    let calls = 0;
    const sender = async (msgs: { to: string | string[] }[]) => {
      calls++;
      if (calls === 1) throw new Error('network down');
      return msgs.map(() => ({ status: 'ok' as const, id: 'ticket-1' }));
    };
    expect(await worker.processBatch(sender as never)).toBe(1);
    let d = await ctx.prisma.notificationDelivery.findFirstOrThrow();
    expect(d).toMatchObject({ status: 'PENDING', attempts: 1 });
    await ctx.prisma.notificationDelivery.update({ where: { id: d.id }, data: { nextAttemptAt: new Date() } });
    await worker.processBatch(sender as never);
    d = await ctx.prisma.notificationDelivery.findFirstOrThrow();
    expect(d).toMatchObject({ status: 'SENT', ticketId: 'ticket-1', attempts: 2 });

    const list = await ctx.http.get('/api/v1/notifications').set(auth(provider.token)).expect(200);
    await ctx.http.post(`/api/v1/notifications/${list.body.data[0].id}/read`).set(auth(provider.token)).expect(200);
    const after = await ctx.http.get('/api/v1/notifications/unread-count').set(auth(provider.token)).expect(200);
    expect(after.body.data.count).toBe(0);

    // Opting out of a category stops new notifications of that kind.
    await ctx.http.put('/api/v1/notifications/preferences').set(auth(provider.token)).send({ categories: { ENQUIRY: false } }).expect(200);
    await ctx.http.post(`/api/v1/providers/${provider.providerId}/enquiries`).set(auth(customer.token)).send({ message: 'Second message here' }).expect(201);
    const final = await ctx.http.get('/api/v1/notifications/unread-count').set(auth(provider.token)).expect(200);
    expect(final.body.data.count).toBe(0);
  });

  it('Flow 6: reviews update the rating summary, are one per customer, and notify the provider', async () => {
    const provider = await makeProvider(ctx, { name: 'Rated Pro', ...WOODLANDS, area: 'Woodlands' });
    await addListing(ctx, provider.token, { type: 'SERVICE', title: 'Service', categoryId: await categoryId(ctx, 'Painting'), priceType: 'QUOTE' });
    await publish(ctx, provider.token);
    const a = await signUp(ctx);
    const b = await signUp(ctx);
    const unverified = await signUp(ctx, { verified: false });

    await ctx.http.post(`/api/v1/providers/${provider.providerId}/contact`).set(auth(a.token)).send({ channel: 'PHONE' }).expect(200);
    const ra = await ctx.http.put(`/api/v1/providers/${provider.providerId}/reviews`).set(auth(a.token)).send({ rating: 5, comment: 'Great job' }).expect(200);
    expect(ra.body.data.isVerifiedInteraction).toBe(true);
    const rb = await ctx.http.put(`/api/v1/providers/${provider.providerId}/reviews`).set(auth(b.token)).send({ rating: 3 }).expect(200);
    expect(rb.body.data.isVerifiedInteraction).toBe(false);
    // Same customer again updates instead of duplicating.
    await ctx.http.put(`/api/v1/providers/${provider.providerId}/reviews`).set(auth(b.token)).send({ rating: 4 }).expect(200);
    await ctx.http.put(`/api/v1/providers/${provider.providerId}/reviews`).set(auth(unverified.token)).send({ rating: 1 }).expect(403);
    await ctx.http.put(`/api/v1/providers/${provider.providerId}/reviews`).set(auth(provider.token)).send({ rating: 5 }).expect(403);

    const summary = await ctx.http.get(`/api/v1/providers/${provider.providerId}/reviews/summary`).expect(200);
    expect(summary.body.data).toMatchObject({ average: 4.5, count: 2 });
    const p = await ctx.prisma.provider.findUniqueOrThrow({ where: { id: provider.providerId } });
    expect(Number(p.ratingAverage)).toBe(4.5);
    expect(p.ratingCount).toBe(2);

    await ctx.http.post(`/api/v1/reviews/${ra.body.data.id}/response`).set(auth(provider.token)).send({ body: 'Thank you!' }).expect(201);
    const n = await ctx.prisma.notification.count({ where: { userId: provider.userId, category: 'REVIEW' } });
    expect(n).toBe(2);

    // Three reports auto-hide a review and the rating is recalculated.
    for (const u of [a, await signUp(ctx), await signUp(ctx)]) {
      await ctx.http.post('/api/v1/reports').set(auth(u.token)).send({ targetType: 'REVIEW', targetId: rb.body.data.id, reason: 'FAKE' }).expect(201);
    }
    const p2 = await ctx.prisma.provider.findUniqueOrThrow({ where: { id: provider.providerId } });
    expect(p2.ratingCount).toBe(1);
  });

  describe('security', () => {
    it("cannot edit another provider's listing", async () => {
      const owner = await makeProvider(ctx, { name: 'Owner Co', ...WOODLANDS, area: 'Woodlands' });
      const attacker = await makeProvider(ctx, { name: 'Attacker Co', ...WOODLANDS, area: 'Woodlands' });
      const id = await addListing(ctx, owner.token, { type: 'SERVICE', title: 'Mine', categoryId: await categoryId(ctx, 'Plumbing'), priceType: 'QUOTE' });
      await ctx.http.patch(`/api/v1/listings/${id}`).set(auth(attacker.token)).send({ title: 'Stolen' }).expect(404);
      await ctx.http.delete(`/api/v1/listings/${id}`).set(auth(attacker.token)).expect(404);
      await ctx.http.post(`/api/v1/listings/${id}/status`).set(auth(attacker.token)).send({ status: 'PAUSED' }).expect(404);
      const l = await ctx.prisma.listing.findUniqueOrThrow({ where: { id } });
      expect(l.title).toBe('Mine');
    });

    it('group admins cannot manage unrelated groups', async () => {
      const owner = await signUp(ctx);
      const org = await ctx.http.post('/api/v1/organizations').set(auth(owner.token)).send({ name: 'Company', type: 'COMPANY' }).expect(201);
      const g1 = await ctx.http.post(`/api/v1/organizations/${org.body.data.id}/groups`).set(auth(owner.token)).send({ name: 'Finance' }).expect(201);
      const g2 = await ctx.http.post(`/api/v1/organizations/${org.body.data.id}/groups`).set(auth(owner.token)).send({ name: 'IT' }).expect(201);
      const lead = await signUp(ctx);
      await ctx.http.post(`/api/v1/organizations/${org.body.data.id}/join`).set(auth(lead.token)).expect(200);
      await ctx.http.post(`/api/v1/groups/${g1.body.data.id}/join`).set(auth(lead.token)).expect(200);
      await ctx.http.patch(`/api/v1/groups/${g1.body.data.id}/members/${lead.userId}`).set(auth(owner.token)).send({ role: 'ADMIN' }).expect(200);

      await ctx.http.patch(`/api/v1/groups/${g1.body.data.id}`).set(auth(lead.token)).send({ description: 'ok' }).expect(200);
      await ctx.http.patch(`/api/v1/groups/${g2.body.data.id}`).set(auth(lead.token)).send({ description: 'nope' }).expect(403);
      await ctx.http.delete(`/api/v1/groups/${g2.body.data.id}`).set(auth(lead.token)).expect(403);
      // Organization admins rank: a plain member cannot remove others.
      await ctx.http.delete(`/api/v1/organizations/${org.body.data.id}/members/${owner.userId}`).set(auth(lead.token)).expect(403);
    });

    it('regular users cannot use admin endpoints; admins can', async () => {
      const u = await signUp(ctx);
      await ctx.http.get('/api/v1/admin/dashboard').set(auth(u.token)).expect(403);
      await ctx.http.get('/api/v1/admin/users').set(auth(u.token)).expect(403);
      await ctx.http.post('/api/v1/admin/categories').set(auth(u.token)).send({ name: 'Hack' }).expect(403);
      await ctx.http.get('/api/v1/admin/dashboard').expect(401);
      const admin = await adminToken(ctx);
      const d = await ctx.http.get('/api/v1/admin/dashboard').set(auth(admin)).expect(200);
      expect(d.body.data.totals.users).toBeGreaterThan(0);
    });

    it('private media (credentials) cannot be fetched publicly', async () => {
      const p = await makeProvider(ctx, { name: 'Certified', ...WOODLANDS, area: 'Woodlands' });
      const pdf = Buffer.from('%PDF-1.4 test');
      const up = await ctx.http.post('/api/v1/media/uploads').set(auth(p.token)).send({ kind: 'DOCUMENT', purpose: 'CREDENTIAL', mimeType: 'application/pdf', sizeBytes: pdf.length }).expect(201);
      const url = new URL(up.body.data.upload.url);
      await ctx.http.put(url.pathname + url.search).set('content-type', 'application/pdf').send(pdf).expect(204);
      await ctx.http.post(`/api/v1/media/${up.body.data.mediaId}/complete`).set(auth(p.token)).expect(201);
      const stranger = await signUp(ctx);
      await ctx.http.get(`/api/v1/media/${up.body.data.mediaId}/raw`).expect(404);
      await ctx.http.get(`/api/v1/media/${up.body.data.mediaId}/raw`).set(auth(stranger.token)).expect(404);
      await ctx.http.get(`/api/v1/media/${up.body.data.mediaId}/raw`).set(auth(p.token)).expect(200);
      await ctx.http.get(`/api/v1/media/${up.body.data.mediaId}/raw`).set(auth(await adminToken(ctx))).expect(200);
      // Tampered upload signatures are rejected.
      await ctx.http.put(url.pathname + url.search.replace(/sig=[^&]+/, 'sig=forged')).set('content-type', 'application/pdf').send(pdf).expect(403);
    });

    it('rejects disallowed upload types and sizes', async () => {
      const u = await signUp(ctx);
      await ctx.http.post('/api/v1/media/uploads').set(auth(u.token)).send({ kind: 'IMAGE', purpose: 'AVATAR', mimeType: 'application/x-msdownload', sizeBytes: 100 }).expect(400);
      await ctx.http.post('/api/v1/media/uploads').set(auth(u.token)).send({ kind: 'IMAGE', purpose: 'AVATAR', mimeType: 'image/png', sizeBytes: 50 * 1024 * 1024 }).expect(400);
    });

    it('never exposes private addresses, password hashes or moderation notes', async () => {
      const p = await makeProvider(ctx, { name: 'Home Worker', lat: -15.4211, lng: 28.3333, area: 'Kabulonga' });
      await ctx.prisma.provider.update({ where: { id: p.providerId }, data: { verificationNote: 'internal: id checked', status: 'ACTIVE' } });
      const r = await ctx.http.get(`/api/v1/providers/${p.providerId}`).expect(200);
      const text = JSON.stringify(r.body);
      expect(text).not.toContain('-15.4211');
      expect(text).not.toContain('internal: id checked');
      expect(text).not.toContain('passwordHash');
    });
  });
});
