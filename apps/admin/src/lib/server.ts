import 'server-only';
import { cookies } from 'next/headers';

export const API = (process.env.VICINITY_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const AT = 'vz_admin_at';
const RT = 'vz_admin_rt';
const secure = process.env.NODE_ENV === 'production';

/**
 * Admin session lives in httpOnly, SameSite=Strict cookies set by this Next.js server.
 * Tokens are never readable by browser JavaScript; the browser only talks to /api/* on this origin.
 */
export async function setSession(t: { accessToken: string; refreshToken: string }) {
  const c = await cookies();
  c.set(AT, t.accessToken, { httpOnly: true, sameSite: 'strict', secure, path: '/', maxAge: 15 * 60 });
  c.set(RT, t.refreshToken, { httpOnly: true, sameSite: 'strict', secure, path: '/api', maxAge: 30 * 86400 });
}

export async function clearSession() {
  const c = await cookies();
  c.delete(AT);
  c.delete({ name: RT, path: '/api' });
}

export async function getTokens() {
  const c = await cookies();
  return { access: c.get(AT)?.value ?? null, refresh: c.get(RT)?.value ?? null };
}

/** Rotates the refresh token. Returns the new access token, or null if the session is over. */
export async function refresh(): Promise<string | null> {
  const { refresh: rt } = await getTokens();
  if (!rt) return null;
  const r = await fetch(`${API}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
    cache: 'no-store',
  });
  if (!r.ok) {
    await clearSession();
    return null;
  }
  const { data } = (await r.json()) as { data: { accessToken: string; refreshToken: string } };
  await setSession(data);
  return data.accessToken;
}
