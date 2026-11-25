'use client';
import { useState } from 'react';
import { can, useSession } from '@/components/Shell';
import { Badge, Button, ErrorBox, fmtDate, Input, LoadMore, Modal, PageHeader, Select, Table, Td, TextArea } from '@/components/ui';
import { adminApi, qs, usePaged } from '@/lib/client';

interface Row {
  id: string;
  title: string;
  type: string;
  status: string;
  visibility: string;
  price: number | null;
  priceType: string;
  currency: string;
  category: string;
  provider: { id: string; displayName: string };
  coverUrl: string | null;
  openReports: number;
  deleted: boolean;
  createdAt: string;
}

export default function ListingsPage() {
  const s = useSession();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [reported, setReported] = useState(false);
  const list = usePaged<Row>(`admin/listings${qs({ q: search, status, reported: reported ? 'true' : undefined })}`);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const act = async (id: string, path: 'remove' | 'restore', body: unknown) => {
    setErr(null);
    try {
      await adminApi(`admin/listings/${id}/${path}`, { method: 'POST', body });
      setRemoving(null);
      setReason('');
      await list.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader title="Listings" subtitle="Moderate products and services" />
      <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
        <Input label="Search" placeholder="Title or provider" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any</option>{['ACTIVE', 'DRAFT', 'PAUSED', 'ARCHIVED', 'REMOVED'].map((x) => <option key={x} value={x}>{x.toLowerCase()}</option>)}
        </Select>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={reported} onChange={(e) => setReported(e.target.checked)} /> Reported only</label>
      </form>
      {err ? <p className="mb-3 rounded-xl bg-error-soft p-3 text-sm text-error">{err}</p> : null}
      <ErrorBox error={list.error} onRetry={() => void list.reload()} />
      <Table head={['Listing', 'Provider', 'Status', 'Reports', 'Created', '']} empty={!list.loading && !list.items.length}>
        {list.items.map((l) => (
          <tr key={l.id} className="hover:bg-surface-low">
            <Td>
              <p className="font-semibold">{l.title}</p>
              <p className="text-xs text-muted">{l.type.toLowerCase()} · {l.category} · {l.price != null ? `${l.currency} ${l.price}` : l.priceType.toLowerCase()}{l.visibility !== 'PUBLIC' ? ` · ${l.visibility.toLowerCase()} only` : ''}</p>
            </Td>
            <Td><a href={`/providers/${l.provider.id}`} className="text-primary-dark hover:underline">{l.provider.displayName}</a></Td>
            <Td><Badge tone={l.status === 'ACTIVE' ? 'teal' : l.status === 'REMOVED' ? 'error' : 'neutral'}>{l.status.toLowerCase()}</Badge>{l.deleted ? <Badge>deleted</Badge> : null}</Td>
            <Td>{l.openReports ? <Badge tone="error">{l.openReports} open</Badge> : '—'}</Td>
            <Td className="text-xs text-muted">{fmtDate(l.createdAt)}</Td>
            <Td>
              {can(s, 'listings.moderate') ? (
                l.status === 'REMOVED' ? <Button size="sm" kind="secondary" onClick={() => void act(l.id, 'restore', {})}>Restore</Button> : <Button size="sm" kind="danger" onClick={() => setRemoving(l)}>Remove</Button>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={() => void list.loadMore()} />
      <Modal open={!!removing} title="Remove listing" onClose={() => setRemoving(null)}>
        <p className="text-sm">{removing?.title}</p>
        <TextArea label="Reason (sent to the provider)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button kind="danger" disabled={reason.trim().length < 3} onClick={() => removing && void act(removing.id, 'remove', { reason })}>Remove listing</Button>
      </Modal>
    </>
  );
}
