'use client';
import { useState } from 'react';
import { Badge, Button, Card, ErrorBox, fmtDate, Input, LoadMore, Loading, Modal, PageHeader, Select, Table, Td, TextArea } from '@/components/ui';
import { adminApi, useAdmin, usePaged } from '@/lib/client';

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  currency: string;
  entitlements: Record<string, number | boolean>;
  isActive: boolean;
  sortOrder: number;
  activeSubscriptions: number;
}

interface Promo {
  id: string;
  listing: { id: string; title: string };
  provider: { displayName: string };
  placement: string;
  status: string;
  startsAt: string;
  endsAt: string;
}


interface AdminPayment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  simulated: boolean;
  plan: { code: string; name: string } | null;
  months: number | null;
  payerPhone: string | null;
  failureReason: string | null;
  createdAt: string;
  applied: boolean;
  provider: { id: string; displayName: string };
}
/** Plans, plan payments (Lenco mobile money), entitlements and sponsored placements. */
export default function MonetizationPage() {
  const plans = useAdmin<Plan[]>('admin/plans');
  const promos = usePaged<Promo>('admin/promotions');
  const [plan, setPlan] = useState<{ code: string; name: string; description: string; priceMonthly: string; entitlements: string; isActive: boolean; sortOrder: string } | null>(null);
  const [promo, setPromo] = useState<{ listingId: string; placement: string; startsAt: string; endsAt: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [payStatus, setPayStatus] = useState('');
  const payments = useAdmin<AdminPayment[]>(`admin/payments${payStatus ? `?status=${payStatus}` : ''}`);
  const refresh = async (id: string) => {
    await adminApi(`admin/payments/${id}/refresh`, { method: 'POST', body: {} });
    await payments.reload();
  };

  const savePlan = async () => {
    if (!plan) return;
    setErr(null);
    try {
      await adminApi('admin/plans', {
        method: 'PUT',
        body: { code: plan.code, name: plan.name, description: plan.description || null, priceMonthly: Number(plan.priceMonthly), entitlements: JSON.parse(plan.entitlements || '{}'), isActive: plan.isActive, sortOrder: Number(plan.sortOrder) || 0 },
      });
      setPlan(null);
      await plans.reload();
    } catch (e) {
      setErr(e instanceof SyntaxError ? 'Entitlements must be valid JSON' : (e as Error).message);
    }
  };

  const savePromo = async () => {
    if (!promo) return;
    setErr(null);
    try {
      await adminApi('admin/promotions', { method: 'POST', body: { listingId: promo.listingId.trim(), placement: promo.placement, startsAt: new Date(promo.startsAt).toISOString(), endsAt: new Date(promo.endsAt).toISOString() } });
      setPromo(null);
      await promos.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const cancel = async (id: string) => {
    await adminApi(`admin/promotions/${id}/cancel`, { method: 'POST', body: {} });
    await promos.reload();
  };

  return (
    <>
      <PageHeader title="Plans & promotions" subtitle="Basic discovery is always free. Providers buy plans with mobile money; you can also grant plans from a provider's page." />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-navy">Subscription plans</h2>
        <Button size="sm" onClick={() => setPlan({ code: '', name: '', description: '', priceMonthly: '0', entitlements: '{"maxListings": 10}', isActive: true, sortOrder: '0' })}>New plan</Button>
      </div>
      <ErrorBox error={plans.error} onRetry={() => void plans.reload()} />
      {plans.loading && !plans.data ? <Loading /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        {plans.data?.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-navy">{p.name}</p>
              {p.isActive ? <Badge tone="teal">active</Badge> : <Badge>inactive</Badge>}
            </div>
            <p className="text-2xl font-bold">{p.currency} {p.priceMonthly}<span className="text-sm font-normal text-muted">/month</span></p>
            <ul className="mt-2 text-xs text-muted">{Object.entries(p.entitlements).map(([k, v]) => <li key={k}>{k}: <b>{String(v)}</b></li>)}</ul>
            <p className="mt-2 text-xs text-muted">{p.activeSubscriptions} active subscriptions</p>
            <Button size="sm" kind="ghost" className="mt-2" onClick={() => setPlan({ code: p.code, name: p.name, description: p.description ?? '', priceMonthly: String(p.priceMonthly), entitlements: JSON.stringify(p.entitlements, null, 2), isActive: p.isActive, sortOrder: String(p.sortOrder) })}>Edit</Button>
          </Card>
        ))}
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="font-bold text-navy">Featured (sponsored) placements</h2>
        <Button size="sm" onClick={() => setPromo({ listingId: '', placement: 'SEARCH', startsAt: new Date().toISOString().slice(0, 16), endsAt: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16) })}>New placement</Button>
      </div>
      <p className="mb-3 text-xs text-muted">Sponsored listings appear in a separate, labelled "Sponsored" block. They never change organic ranking.</p>
      <ErrorBox error={promos.error} onRetry={() => void promos.reload()} />
      <Table head={['Listing', 'Placement', 'Status', 'Runs', '']} empty={!promos.loading && !promos.items.length}>
        {promos.items.map((p) => (
          <tr key={p.id}>
            <Td><p className="font-semibold">{p.listing.title}</p><p className="text-xs text-muted">{p.provider.displayName}</p></Td>
            <Td>{p.placement.toLowerCase()}</Td>
            <Td><Badge tone={p.status === 'ACTIVE' ? 'teal' : p.status === 'SCHEDULED' ? 'amber' : 'neutral'}>{p.status.toLowerCase()}</Badge></Td>
            <Td className="text-xs text-muted">{fmtDate(p.startsAt)} → {fmtDate(p.endsAt)}</Td>
            <Td>{p.status === 'ACTIVE' || p.status === 'SCHEDULED' ? <Button size="sm" kind="ghost" onClick={() => void cancel(p.id)}>Cancel</Button> : null}</Td>
          </tr>
        ))}
      </Table>
      <LoadMore hasMore={promos.hasMore} loading={promos.loading} onClick={() => void promos.loadMore()} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="font-bold text-navy">Plan payments (mobile money)</h2>
        <Select label="" value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </Select>
      </div>
      <p className="mb-3 text-xs text-muted">Status changes only from verified gateway webhooks or status lookups. Refunds are done in the Lenco dashboard. A row flagged “needs review” was paid with an unexpected amount and was not applied.</p>
      <ErrorBox error={payments.error} onRetry={() => void payments.reload()} />
      <Table head={['Provider', 'Plan', 'Amount', 'Status', 'Phone', 'Created', '']} empty={!payments.loading && !payments.data?.length}>
        {payments.data?.map((p) => (
          <tr key={p.id}>
            <Td><a className="font-semibold text-primary-dark hover:underline" href={`/providers/${p.provider.id}`}>{p.provider.displayName}</a></Td>
            <Td>{p.plan?.name ?? '—'} × {p.months}</Td>
            <Td>{p.currency} {p.amount}{p.simulated ? <span className="ml-1 text-xs text-muted">(test)</span> : null}</Td>
            <Td>
              <Badge tone={p.status === 'SUCCEEDED' ? (p.applied ? 'teal' : 'error') : p.status === 'PENDING' ? 'amber' : 'neutral'}>{p.status === 'SUCCEEDED' && !p.applied ? 'needs review' : p.status.toLowerCase()}</Badge>
              {p.failureReason ? <p className="mt-1 max-w-[220px] text-xs text-muted">{p.failureReason}</p> : null}
            </Td>
            <Td className="text-xs">{p.payerPhone}</Td>
            <Td className="text-xs text-muted">{fmtDate(p.createdAt)}</Td>
            <Td>{p.status !== 'SUCCEEDED' && p.status !== 'REFUNDED' ? <Button size="sm" kind="ghost" onClick={() => void refresh(p.id)}>Re-check</Button> : null}</Td>
          </tr>
        ))}
      </Table>

      <Modal open={!!plan} title={plan?.code ? `Plan ${plan.code}` : 'New plan'} onClose={() => setPlan(null)}>
        {plan ? (
          <>
            <Input label="Code (A–Z, 0–9, _)" value={plan.code} onChange={(e) => setPlan({ ...plan, code: e.target.value.toUpperCase() })} />
            <Input label="Name" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
            <Input label="Price per month (ZMW)" type="number" value={plan.priceMonthly} onChange={(e) => setPlan({ ...plan, priceMonthly: e.target.value })} />
            <TextArea label="Entitlements (JSON)" value={plan.entitlements} onChange={(e) => setPlan({ ...plan, entitlements: e.target.value })} />
            <Input label="Sort order" type="number" value={plan.sortOrder} onChange={(e) => setPlan({ ...plan, sortOrder: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan.isActive} onChange={(e) => setPlan({ ...plan, isActive: e.target.checked })} /> Active</label>
            {err ? <p className="text-sm text-error">{err}</p> : null}
            <Button onClick={() => void savePlan()}>Save plan</Button>
          </>
        ) : null}
      </Modal>
      <Modal open={!!promo} title="New sponsored placement" onClose={() => setPromo(null)}>
        {promo ? (
          <>
            <Input label="Listing ID" value={promo.listingId} onChange={(e) => setPromo({ ...promo, listingId: e.target.value })} placeholder="UUID from the Listings page" />
            <Select label="Placement" value={promo.placement} onChange={(e) => setPromo({ ...promo, placement: e.target.value })}><option value="SEARCH">Search & home</option></Select>
            <Input label="Starts" type="datetime-local" value={promo.startsAt} onChange={(e) => setPromo({ ...promo, startsAt: e.target.value })} />
            <Input label="Ends" type="datetime-local" value={promo.endsAt} onChange={(e) => setPromo({ ...promo, endsAt: e.target.value })} />
            {err ? <p className="text-sm text-error">{err}</p> : null}
            <Button onClick={() => void savePromo()}>Create placement</Button>
          </>
        ) : null}
      </Modal>
    </>
  );
}
