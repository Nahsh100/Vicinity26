import { createApp, type Ctx } from './harness';

describe('Rate limiting', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    process.env.TEST_ENFORCE_THROTTLE = '1';
    ctx = await createApp();
  });
  afterAll(async () => {
    delete process.env.TEST_ENFORCE_THROTTLE;
    await ctx.app.close();
  });

  it('limits credential endpoints to 10 attempts per minute per client', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await ctx.http.post('/api/v1/auth/login').send({ email: 'x@test.local', password: 'wrong' });
      codes.push(r.status);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });
});
