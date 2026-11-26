'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vicinity-admin': '1' }, body: JSON.stringify({ email, password }) });
    const json = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(json?.error?.message ?? 'Sign in failed');
    router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/');
  };

  return (
    <form onSubmit={submit} className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-8 shadow-lg">
      <div className="flex items-center gap-2">
        <img src="/brand/vicinity-symbol-small-light.svg" alt="" width={40} height={40} />
        <div>
          <h1 className="text-lg font-bold tracking-[0.14em] text-[#06332E]">VICINITY</h1>
          <p className="text-xs text-muted">Admin · authorised staff only</p>
        </div>
      </div>
      <Input label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      {error ? <p role="alert" className="rounded-xl bg-error-soft p-3 text-sm text-error">{error}</p> : null}
      <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
