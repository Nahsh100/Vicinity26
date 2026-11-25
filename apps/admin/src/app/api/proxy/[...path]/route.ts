import { NextResponse, type NextRequest } from 'next/server';
import { API, getTokens, refresh } from '@/lib/server';

/** Only these API areas are reachable through the portal. Authorization itself is enforced by the API. */
const ALLOWED = [/^admin(\/|$)/, /^categories(\/|$)/, /^auth\/me$/, /^media\/[0-9a-f-]{36}\/raw$/];

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = path.join('/');
  if (!ALLOWED.some((r) => r.test(target))) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }
  // CSRF defence in depth (cookies are already SameSite=Strict): mutations must carry a header a cross-site form cannot set.
  if (req.method !== 'GET' && req.headers.get('x-vicinity-admin') !== '1') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Missing request header' } }, { status: 403 });
  }

  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
  const url = `${API}/api/v1/${target}${req.nextUrl.search}`;
  const send = (token: string | null) =>
    fetch(url, {
      method: req.method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body,
      cache: 'no-store',
      redirect: 'manual',
    });

  let { access } = await getTokens();
  if (!access) access = await refresh();
  if (!access) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue' } }, { status: 401 });

  let r = await send(access);
  if (r.status === 401) {
    const next = await refresh();
    if (!next) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Your session has expired' } }, { status: 401 });
    r = await send(next);
  }
  if (r.status === 302 && r.headers.get('location')) return NextResponse.redirect(r.headers.get('location')!);
  const headers = new Headers({ 'content-type': r.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
  return new NextResponse(r.body, { status: r.status, headers });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
