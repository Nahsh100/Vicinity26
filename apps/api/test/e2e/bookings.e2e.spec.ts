import { addListing, auth, categoryId, createApp, type Ctx, makeProvider, publish, signUp, WOODLANDS } from './harness';

/** Next weekday (Mon–Fri) at the given Lusaka hour, at least 2 days away, as ISO. */
function nextWeekdayAt(hourLusaka: number, addDays = 2) {
  const d = new Date(Date.now() + addDays * 86400_000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hourLusaka - 2, 0, 0, 0);
  return d.toISOString();
}

describe('Bookings and messaging', () => {
  let ctx: Ctx;
  let provider: Awaited<ReturnType<typeof makeProvider>>;
  let listingId: string;

  beforeAll(async () => {
    ctx = await createApp();
    provider = await makeProvider(ctx, { name: 'Grace Hair', ...WOODLANDS, area: 'Woodlands' });
    await ctx.http.put('/api/v1/providers/me/availability').set(auth(provider.token)).send({ hours: [1, 2, 3, 4, 5].map((day) => ({ day, open: '08:00', close: '17:00' })) }).expect(200);
    listingId = await addListing(ctx, provider.token, { type: 'SERVICE', title: 'Box braids', categoryId: await categoryId(ctx, 'Hairdressing'), priceType: 'FIXED', price: 350, durationMinutes: 120 });
    await publish(ctx, provider.token);
  }, 60_000);
  afterAll(async () => ctx.app.close());

  it('lists bookable slots from working hours', async () => {
    const date = nextWeekdayAt(10).slice(0, 10);
    const r = await ctx.http.get(`/api/v1/providers/${provider.providerId}/slots`).query({ date, listingId }).expect(200);
    expect(r.body.data.durationMinutes).toBe(120);
    // 08:00..15:00 in 30-minute steps for a 2-hour service ending by 17:00.
    expect(r.body.data.slots).toHaveLength(15);
    expect(r.body.data.slots[0].start).toBe(`${date}T06:00:00.000Z`);
  });

  it('runs the full lifecycle: request → confirm → reschedule → accept → complete → verified review', async () => {
    const customer = await signUp(ctx);
    const at = nextWeekdayAt(10);
    const b = await ctx.http.post('/api/v1/bookings').set(auth(customer.token)).send({ providerId: provider.providerId, listingId, scheduledAt: at, note: 'Medium length please' }).expect(201);
    expect(b.body.data).toMatchObject({ status: 'REQUESTED', quotedPrice: 350, durationMinutes: 120, myRole: 'CUSTOMER' });
    const id = b.body.data.id;

    // The customer cannot confirm their own request.
    await ctx.http.post(`/api/v1/bookings/${id}/accept`).set(auth(customer.token)).expect(403);
    const confirmed = await ctx.http.post(`/api/v1/bookings/${id}/accept`).set(auth(provider.token)).expect(200);
    expect(confirmed.body.data.status).toBe('CONFIRMED');
    // The provider sees the customer's phone only while the booking is active.
    const providerView = await ctx.http.get(`/api/v1/bookings/${id}`).set(auth(provider.token)).expect(200);
    expect(providerView.body.data.myRole).toBe('PROVIDER');

    const later = nextWeekdayAt(14);
    const proposed = await ctx.http.post(`/api/v1/bookings/${id}/reschedule`).set(auth(provider.token)).send({ scheduledAt: later, reason: 'Morning is full' }).expect(200);
    expect(proposed.body.data).toMatchObject({ status: 'RESCHEDULE_PROPOSED', proposedByMe: true });
    await ctx.http.post(`/api/v1/bookings/${id}/accept`).set(auth(provider.token)).expect(400);
    const accepted = await ctx.http.post(`/api/v1/bookings/${id}/accept`).set(auth(customer.token)).expect(200);
    expect(accepted.body.data).toMatchObject({ status: 'CONFIRMED', scheduledAt: later });

    // Too early to complete; move the booking into the past to simulate the visit happening.
    await ctx.http.post(`/api/v1/bookings/${id}/complete`).set(auth(provider.token)).expect(400);
    await ctx.prisma.booking.update({ where: { id }, data: { scheduledAt: new Date(Date.now() - 3600_000) } });
    const done = await ctx.http.post(`/api/v1/bookings/${id}/complete`).set(auth(provider.token)).expect(200);
    expect(done.body.data.status).toBe('COMPLETED');
    const mine = await ctx.http.get(`/api/v1/bookings/${id}`).set(auth(customer.token)).expect(200);
    expect(mine.body.data.canReview).toBe(true);

    const review = await ctx.http.put(`/api/v1/providers/${provider.providerId}/reviews`).set(auth(customer.token)).send({ rating: 5, comment: 'Lovely braids' }).expect(200);
    expect(review.body.data.isVerifiedInteraction).toBe(true);

    // Every step was posted into the shared conversation and notified.
    const conv = await ctx.http.get('/api/v1/conversations').set(auth(customer.token)).expect(200);
    const msgs = await ctx.http.get(`/api/v1/conversations/${conv.body.data[0].id}/messages`).set(auth(customer.token)).expect(200);
    expect(msgs.body.data.filter((m: { kind: string }) => m.kind === 'SYSTEM').length).toBe(5);
    const providerNotes = await ctx.prisma.notification.count({ where: { userId: provider.userId, category: 'BOOKING' } });
    expect(providerNotes).toBeGreaterThanOrEqual(2);
  });

  it('prevents double-booking a confirmed slot and validates requests', async () => {
    const a = await signUp(ctx);
    const b = await signUp(ctx);
    const at = nextWeekdayAt(9, 5);
    const r1 = await ctx.http.post('/api/v1/bookings').set(auth(a.token)).send({ providerId: provider.providerId, listingId, scheduledAt: at }).expect(201);
    const r2 = await ctx.http.post('/api/v1/bookings').set(auth(b.token)).send({ providerId: provider.providerId, listingId, scheduledAt: at }).expect(201);
    await ctx.http.post(`/api/v1/bookings/${r1.body.data.id}/accept`).set(auth(provider.token)).expect(200);
    const clash = await ctx.http.post(`/api/v1/bookings/${r2.body.data.id}/accept`).set(auth(provider.token)).expect(409);
    expect(clash.body.error.code).toBe('SLOT_TAKEN');
    // The slot now shows as unavailable.
    const slots = await ctx.http.get(`/api/v1/providers/${provider.providerId}/slots`).query({ date: at.slice(0, 10), listingId }).expect(200);
    expect(slots.body.data.slots.find((s: { start: string }) => s.start === at).available).toBe(false);

    await ctx.http.post('/api/v1/bookings').set(auth(a.token)).send({ providerId: provider.providerId, scheduledAt: new Date(Date.now() + 60_000).toISOString() }).expect(400);
    await ctx.http.post('/api/v1/bookings').set(auth(a.token)).send({ providerId: provider.providerId, scheduledAt: at, location: 'AT_CUSTOMER' }).expect(400);
    await ctx.http.post('/api/v1/bookings').set(auth(provider.token)).send({ providerId: provider.providerId, scheduledAt: at }).expect(400);
  });

  it('lets either side cancel and keeps bookings private to the two parties', async () => {
    const c = await signUp(ctx);
    const stranger = await signUp(ctx);
    const r = await ctx.http.post('/api/v1/bookings').set(auth(c.token)).send({ providerId: provider.providerId, scheduledAt: nextWeekdayAt(11, 6) }).expect(201);
    await ctx.http.get(`/api/v1/bookings/${r.body.data.id}`).set(auth(stranger.token)).expect(404);
    await ctx.http.post(`/api/v1/bookings/${r.body.data.id}/cancel`).set(auth(stranger.token)).send({}).expect(404);
    const cancelled = await ctx.http.post(`/api/v1/bookings/${r.body.data.id}/cancel`).set(auth(c.token)).send({ reason: 'Plans changed' }).expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    await ctx.http.post(`/api/v1/bookings/${r.body.data.id}/accept`).set(auth(provider.token)).expect(400);

    const lists = await ctx.http.get('/api/v1/bookings').query({ role: 'customer', scope: 'past' }).set(auth(c.token)).expect(200);
    expect(lists.body.data.map((x: { id: string }) => x.id)).toContain(r.body.data.id);
    expect(lists.body.meta.counts).toMatchObject({ upcoming: 0, past: 1 });
  });

  it('messaging: open, send, unread counts, read receipts and participant-only access', async () => {
    const c = await signUp(ctx, { name: 'Mwamba' });
    const stranger = await signUp(ctx);
    const conv = await ctx.http.post('/api/v1/conversations').set(auth(c.token)).send({ providerId: provider.providerId }).expect(201);
    const id = conv.body.data.id;
    await ctx.http.post(`/api/v1/conversations/${id}/messages`).set(auth(c.token)).send({ body: 'Hi Grace, are you free Saturday?' }).expect(201);
    await ctx.http.post(`/api/v1/conversations/${id}/messages`).set(auth(c.token)).send({ body: '' }).expect(400);

    const unread = await ctx.http.get('/api/v1/conversations/unread-count').set(auth(provider.token)).expect(200);
    expect(unread.body.data.count).toBe(1);
    const list = await ctx.http.get('/api/v1/conversations').set(auth(provider.token)).expect(200);
    const row = list.body.data.find((x: { id: string }) => x.id === id);
    expect(row).toMatchObject({ myRole: 'PROVIDER', unreadCount: 1, counterpart: { name: 'Mwamba' } });

    await ctx.http.post(`/api/v1/conversations/${id}/messages`).set(auth(provider.token)).send({ body: 'Yes, from 9am!' }).expect(201);
    const after = await ctx.http.get('/api/v1/conversations/unread-count').set(auth(provider.token)).expect(200);
    expect(after.body.data.count).toBe(0);

    const msgs = await ctx.http.get(`/api/v1/conversations/${id}/messages`).set(auth(c.token)).expect(200);
    expect(msgs.body.data.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([
      ['Yes, from 9am!', false],
      ['Hi Grace, are you free Saturday?', true],
    ]);
    const poll = await ctx.http.get(`/api/v1/conversations/${id}/messages`).query({ after: msgs.body.data[0].createdAt }).set(auth(c.token)).expect(200);
    expect(poll.body.data).toHaveLength(0);

    await ctx.http.get(`/api/v1/conversations/${id}/messages`).set(auth(stranger.token)).expect(403);
    await ctx.http.post(`/api/v1/conversations/${id}/messages`).set(auth(stranger.token)).send({ body: 'spam' }).expect(403);
    const n = await ctx.prisma.notification.count({ where: { userId: provider.userId, category: 'MESSAGE' } });
    expect(n).toBe(1);
  });
});
