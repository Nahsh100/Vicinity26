'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { can, useSession } from '@/components/Shell';
import { Badge, Button, Card, ErrorBox, fmtDate, Input, Loading, Modal, PageHeader, proxied, Select, TextArea } from '@/components/ui';
import { adminApi, useAdmin } from '@/lib/client';

interface ProviderDetail {
  id: string;
  slug: string;
  displayName: string;
  type: string;
  tagline: string | null;
  bio: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  status: string;
  verificationStatus: string;
  verificationNote: string | null;
  verifiedAt: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  logoUrl: string | null;
  owner: { id: string; email: string; fullName: string; status: string };
  category: string | null;
  counts: { listings: number; reviews: number; enquiries: number; portfolio: number };
  credentials: { id: string; title: string; issuer: string | null; isPublic: boolean; documentUrl: string | null }[];
  reports: { id: string; reason: string; details: string | null; status: string; createdAt: string }[];
  createdAt: string;
  publishedAt: string | null;
}

export default function ProviderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const s = useSession();
  const q = useAdmin<ProviderDetail>(`admin/providers/${id}`);
  const plans = useAdmin<{ code: string; name: string }[]>(can(s, 'monetization.manage') ? 'admin/plans' : null);
  const [modal, setModal] = useState<'verify' | 'suspend' | 'plan' | null>(null);
  const [vStatus, setVStatus] = useState('VERIFIED');
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState('PRO');
  const [months, setMonths] = useState('1');
  const [err, setErr] = useState<string | null>(null);
  const p = q.data;

  const call = async (path: string, body: unknown) => {
    setErr(null);
    try {
      await adminApi(`admin/providers/${id}/${path}`, { method: 'POST', body });
      setModal(null);
      setNote('');
      await q.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (q.loading && !p) return <Loading />;
  if (!p) return <ErrorBox error={q.error} onRetry={() => void q.reload()} />;

  return (
    <>
      <PageHeader
        title={p.displayName}
        subtitle={`${p.type.toLowerCase()} · ${p.category ?? 'no category'} · owner ${p.owner.fullName} (${p.owner.email})`}
        actions={
          <>
            {can(s, 'providers.verify') ? <Button onClick={() => setModal('verify')}>Verification</Button> : null}
            {can(s, 'monetization.manage') ? <Button kind="secondary" onClick={() => setModal('plan')}>Grant plan</Button> : null}
            {can(s, 'providers.manage') ? (p.status === 'SUSPENDED' ? <Button kind="secondary" onClick={() => void call('reactivate', {})}>Reactivate</Button> : <Button kind="danger" onClick={() => setModal('suspend')}>Suspend</Button>) : null}
          </>
        }
      />
      {err ? <p className="mb-3 rounded-xl bg-error-soft p-3 text-sm text-error">{err}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="mb-3 flex gap-2">
            <Badge tone={p.status === 'ACTIVE' ? 'teal' : p.status === 'SUSPENDED' ? 'error' : 'neutral'}>{p.status.toLowerCase()}</Badge>
            <Badge tone={p.verificationStatus === 'VERIFIED' ? 'teal' : p.verificationStatus === 'PENDING' ? 'amber' : 'neutral'}>{p.verificationStatus.toLowerCase()}</Badge>
          </div>
          {p.tagline ? <p className="font-semibold">{p.tagline}</p> : null}
          {p.bio ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{p.bio}</p> : null}
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Phone</dt><dd>{p.phone}</dd>
            <dt className="text-muted">WhatsApp</dt><dd>{p.whatsapp ?? '—'}</dd>
            <dt className="text-muted">Email</dt><dd>{p.email ?? '—'}</dd>
            <dt className="text-muted">Rating</dt><dd>{p.ratingCount ? `${p.ratingAverage?.toFixed(2)} from ${p.ratingCount}` : '—'}</dd>
            <dt className="text-muted">Listings / portfolio</dt><dd>{p.counts.listings} / {p.counts.portfolio}</dd>
            <dt className="text-muted">Enquiries</dt><dd>{p.counts.enquiries}</dd>
            <dt className="text-muted">Created / published</dt><dd>{fmtDate(p.createdAt)} / {fmtDate(p.publishedAt)}</dd>
            <dt className="text-muted">Verification note</dt><dd>{p.verificationNote ?? '—'} <span className="text-xs text-muted">(internal)</span></dd>
          </dl>
        </Card>
        <Card>
          <p className="mb-2 text-sm font-semibold">Credentials</p>
          {p.credentials.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {p.credentials.map((c) => (
                <li key={c.id}>
                  <p className="font-semibold">{c.title}</p>
                  <p className="text-xs text-muted">{c.issuer ?? '—'} · {c.isPublic ? 'public title' : 'private'}</p>
                  {c.documentUrl ? <a href={proxied(c.documentUrl)!} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary-dark underline">Open document (private)</a> : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">None uploaded.</p>}
        </Card>
      </div>
      <h2 className="mb-2 mt-6 font-bold text-navy">Reports about this provider</h2>
      <Card>
        {p.reports.length ? (
          <ul className="divide-y divide-line text-sm">{p.reports.map((r) => <li key={r.id} className="py-2"><Badge tone="error">{r.reason.toLowerCase()}</Badge> <span className="text-muted">{r.status.toLowerCase()} · {fmtDate(r.createdAt)}</span>{r.details ? <p className="mt-1">{r.details}</p> : null}</li>)}</ul>
        ) : <p className="text-sm text-muted">No reports.</p>}
      </Card>

      <Modal open={modal === 'verify'} title="Verification" onClose={() => setModal(null)}>
        <Select label="Status" value={vStatus} onChange={(e) => setVStatus(e.target.value)}>
          <option value="VERIFIED">Verified</option><option value="PENDING">Pending</option><option value="REJECTED">Rejected</option><option value="UNVERIFIED">Unverified</option>
        </Select>
        <TextArea label="Internal note" value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-xs text-muted">The provider is notified of the outcome.</p>
        <Button onClick={() => void call('verification', { status: vStatus, note: note || undefined })}>Save</Button>
      </Modal>
      <Modal open={modal === 'suspend'} title="Suspend provider" onClose={() => setModal(null)}>
        <p className="text-sm text-muted">The storefront and all listings disappear from search until reactivated.</p>
        <TextArea label="Reason (sent to the provider)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button kind="danger" disabled={note.trim().length < 3} onClick={() => void call('suspend', { reason: note })}>Suspend</Button>
      </Modal>
      <Modal open={modal === 'plan'} title="Grant a plan" onClose={() => setModal(null)}>
        <p className="text-sm text-muted">For partnerships or offline payments. No online payment is taken.</p>
        <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>{(plans.data ?? []).map((pl) => <option key={pl.code} value={pl.code}>{pl.name}</option>)}</Select>
        <Input label="Months" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} />
        <Button onClick={() => void call('subscription', { planCode: plan, months: Number(months) })}>Grant</Button>
      </Modal>
    </>
  );
}
