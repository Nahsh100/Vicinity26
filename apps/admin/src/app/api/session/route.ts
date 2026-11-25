import { NextResponse, type NextRequest } from 'next/server';
import { API, clearSession, getTokens, setSession } from '@/lib/server';

/** Sign in: verifies credentials with the API and only opens a session for administrators. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '' },
    body: JSON.stringify({ email: body.email, password: body.password }),
    cache: 'no-store',
  });
  const json = await r.json();
  if (!r.ok) return NextResponse.json(json, { status: r.status });
  const { tokens, user } = json.data as { tokens: { accessToken: string; refreshToken: string }; user: { isAdmin: boolean } };
  if (!user.isAdmin) {
    // Do not keep a session for non-admins: revoke the tokens we were just given.
    await fetch(`${API}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    }).catch(() => undefined);
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'This account does not have administrator access.' } }, { status: 403 });
  }
  await setSession(tokens);
  return NextResponse.json({ data: { ok: true } });
}

export async function DELETE() {
  const { access, refresh } = await getTokens();
  if (access) {
    await fetch(`${API}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ refreshToken: refresh ?? undefined }),
    }).catch(() => undefined);
  }
  await clearSession();
  return NextResponse.json({ data: { ok: true } });
}
