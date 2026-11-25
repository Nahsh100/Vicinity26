'use client';
import { useState } from 'react';
import { ErrorBox, fmtDate, Input, LoadMore, PageHeader, Table, Td } from '@/components/ui';
import { qs, usePaged } from '@/lib/client';

interface Row {
  id: string;
  action: string;
  actor: { fullName: string; email: string } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [applied, setApplied] = useState('');
  const list = usePaged<Row>(`admin/audit${qs({ action: applied })}`);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Sensitive actions by users and administrators" />
      <form className="mb-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(action); }}>
        <Input label="Action starts with" placeholder="e.g. admin. or auth." value={action} onChange={(e) => setAction(e.target.value)} className="w-72" />
      </form>
      <ErrorBox error={list.error} onRetry={() => void list.reload()} />
      <Table head={['When', 'Action', 'Actor', 'Target', 'Details']} empty={!list.loading && !list.items.length}>
        {list.items.map((a) => (
          <tr key={a.id}>
            <Td className="whitespace-nowrap text-xs text-muted">{fmtDate(a.createdAt)}</Td>
            <Td className="font-mono text-xs">{a.action}</Td>
            <Td className="text-xs">{a.actor ? `${a.actor.fullName} (${a.actor.email})` : 'system'}</Td>
            <Td className="text-xs text-muted">{a.targetType ? `${a.targetType} ${a.targetId?.slice(0, 8)}…` : '—'}</Td>
            <Td className="max-w-xs truncate font-mono text-[11px] text-muted" >{Object.keys(a.metadata ?? {}).length ? JSON.stringify(a.metadata) : ''}</Td>
          </tr>
        ))}
      </Table>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={() => void list.loadMore()} />
    </>
  );
}
