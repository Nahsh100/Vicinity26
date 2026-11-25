'use client';
import { useState } from 'react';
import { can, useSession } from '@/components/Shell';
import { Badge, Button, ErrorBox, fmtDate, Input, LoadMore, Modal, PageHeader, Table, Td, TextArea } from '@/components/ui';
import { adminApi, qs, usePaged } from '@/lib/client';

interface Row {
  id: string;
  name: string;
  type: string;
  status: string;
  isPrivate: boolean;
  owner: { fullName: string; email: string };
  counts: { memberships: number; groups: number; listings: number };
  openReports: number;
  createdAt: string;
}

export default function OrganizationsPage() {
  const s = useSession();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const list = usePaged<Row>(`admin/organizations${qs({ q: search })}`);
  const [suspending, setSuspending] = useState<Row | null>(null);
  const [reason, setReason] = useState('');

  const act = async (id: string, path: 'suspend' | 'reactivate', body: unknown) => {
    try {
      await adminApi(`admin/organizations/${id}/${path}`, { method: 'POST', body });
      setSuspending(null);
      setReason('');
      await list.reload();
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader title="Organizations" subtitle="Churches, companies, schools, clubs and community groups" />
      <form className="mb-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
        <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
      </form>
      <ErrorBox error={list.error} onRetry={() => void list.reload()} />
      <Table head={['Organization', 'Owner', 'Members / groups / listings', 'Reports', 'Created', '']} empty={!list.loading && !list.items.length}>
        {list.items.map((o) => (
          <tr key={o.id}>
            <Td>
              <p className="font-semibold">{o.name}</p>
              <div className="mt-1 flex gap-1"><Badge tone="navy">{o.type.toLowerCase()}</Badge>{o.isPrivate ? <Badge>private</Badge> : null}{o.status === 'SUSPENDED' ? <Badge tone="error">suspended</Badge> : null}</div>
            </Td>
            <Td className="text-xs">{o.owner.fullName}<br /><span className="text-muted">{o.owner.email}</span></Td>
            <Td>{o.counts.memberships} / {o.counts.groups} / {o.counts.listings}</Td>
            <Td>{o.openReports ? <Badge tone="error">{o.openReports}</Badge> : '—'}</Td>
            <Td className="text-xs text-muted">{fmtDate(o.createdAt)}</Td>
            <Td>
              {can(s, 'organizations.manage') ? (o.status === 'SUSPENDED' ? <Button size="sm" kind="secondary" onClick={() => void act(o.id, 'reactivate', {})}>Reactivate</Button> : <Button size="sm" kind="danger" onClick={() => setSuspending(o)}>Suspend</Button>) : null}
            </Td>
          </tr>
        ))}
      </Table>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={() => void list.loadMore()} />
      <Modal open={!!suspending} title="Suspend organization" onClose={() => setSuspending(null)}>
        <p className="text-sm text-muted">A suspended organization is hidden from discovery and its members-only content stops appearing in searches.</p>
        <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button kind="danger" disabled={reason.trim().length < 3} onClick={() => suspending && void act(suspending.id, 'suspend', { reason })}>Suspend</Button>
      </Modal>
    </>
  );
}
