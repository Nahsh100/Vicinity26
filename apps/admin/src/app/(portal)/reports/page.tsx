'use client';
import { useState } from 'react';
import { can, useSession } from '@/components/Shell';
import { Badge, Button, Card, ErrorBox, fmtDate, LoadMore, Loading, Modal, PageHeader, Select, TextArea } from '@/components/ui';
import { adminApi, qs, usePaged } from '@/lib/client';

interface Report {
  id: string;
  targetType: string;
  targetId: string;
  target: { label: string; detail?: string | null } | null;
  reason: string;
  details: string | null;
  status: string;
  resolutionNote: string | null;
  reporter: { fullName: string; email: string } | null;
  resolvedBy: { fullName: string } | null;
  createdAt: string;
  resolvedAt: string | null;
}

const ACTION: Record<string, string> = {
  REVIEW: 'Hide the review',
  LISTING: 'Remove the listing',
  PROVIDER: 'Suspend the provider',
  ORGANIZATION: 'Suspend the organization',
  USER: 'Suspend the user',
};

export default function ReportsPage() {
  const s = useSession();
  const [status, setStatus] = useState('OPEN');
  const [type, setType] = useState('');
  const list = usePaged<Report>(`admin/reports${qs({ status, targetType: type })}`);
  const [active, setActive] = useState<Report | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resolve = async (outcome: 'RESOLVED' | 'DISMISSED', actOnTarget: boolean) => {
    if (!active) return;
    setBusy(true);
    setErr(null);
    try {
      await adminApi(`admin/reports/${active.id}/resolve`, { method: 'POST', body: { outcome, note, actOnTarget } });
      setActive(null);
      setNote('');
      await list.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Content reported by users. Resolving closes every open report about the same item."
        actions={
          <>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option></Select>
            <Select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{Object.keys(ACTION).map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}</Select>
          </>
        }
      />
      <ErrorBox error={list.error} onRetry={() => void list.reload()} />
      {list.loading && !list.items.length ? <Loading /> : null}
      {!list.loading && !list.items.length && !list.error ? <Card><p className="text-sm text-muted">No reports here. 🎉</p></Card> : null}
      <div className="flex flex-col gap-3">
        {list.items.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="navy">{r.targetType.toLowerCase()}</Badge>
                <Badge tone="error">{r.reason.toLowerCase()}</Badge>
                <span className="text-xs text-muted">{fmtDate(r.createdAt)} · by {r.reporter?.fullName ?? 'deleted user'}</span>
              </div>
              <p className="mt-2 font-semibold">{r.target?.label ?? 'Item no longer exists'}</p>
              {r.target?.detail ? <p className="line-clamp-3 text-sm text-ink-muted">{r.target.detail}</p> : null}
              {r.details ? <p className="mt-2 rounded-xl bg-surface-low p-2 text-sm">“{r.details}”</p> : null}
              {r.status !== 'OPEN' ? <p className="mt-2 text-xs text-muted">{r.status.toLowerCase()} by {r.resolvedBy?.fullName ?? '—'} {fmtDate(r.resolvedAt)}{r.resolutionNote ? ` · ${r.resolutionNote}` : ''}</p> : null}
            </div>
            {r.status === 'OPEN' && can(s, 'reports.resolve') ? <Button size="sm" onClick={() => setActive(r)}>Review</Button> : null}
          </Card>
        ))}
      </div>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={() => void list.loadMore()} />

      <Modal open={!!active} title="Resolve report" onClose={() => setActive(null)}>
        <p className="text-sm">{active?.target?.label}</p>
        <TextArea label="Note (internal, not shown to users)" value={note} onChange={(e) => setNote(e.target.value)} />
        {err ? <p className="text-sm text-error">{err}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button kind="danger" disabled={busy} onClick={() => void resolve('RESOLVED', true)}>{active ? ACTION[active.targetType] : ''}</Button>
          <Button kind="secondary" disabled={busy} onClick={() => void resolve('RESOLVED', false)}>Resolve without action</Button>
          <Button kind="ghost" disabled={busy} onClick={() => void resolve('DISMISSED', false)}>Dismiss</Button>
        </div>
      </Modal>
    </>
  );
}
