'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, ErrorBox, fmtDate, Input, LoadMore, PageHeader, Select, Table, Td } from '@/components/ui';
import { qs, usePaged } from '@/lib/client';

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  provider: { id: string; displayName: string } | null;
  adminRoles: string[];
}

export default function UsersPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const list = usePaged<AdminUser>(`admin/users${qs({ q: search, status })}`);

  return (
    <>
      <PageHeader title="Users" subtitle="Everyone with an account" />
      <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
        <Input label="Search" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="DELETED">Deleted</option>
        </Select>
      </form>
      <ErrorBox error={list.error} onRetry={() => void list.reload()} />
      <Table head={['User', 'Status', 'Provider', 'Joined', 'Last login']} empty={!list.loading && !list.items.length}>
        {list.items.map((u) => (
          <tr key={u.id} className="hover:bg-surface-low">
            <Td>
              <Link href={`/users/${u.id}`} className="font-semibold text-primary-dark hover:underline">{u.fullName}</Link>
              <p className="text-xs text-muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
              <div className="mt-1 flex gap-1">{u.adminRoles.map((r) => <Badge key={r} tone="navy">{r}</Badge>)}{!u.emailVerified ? <Badge tone="amber">unverified email</Badge> : null}</div>
            </Td>
            <Td><Badge tone={u.status === 'ACTIVE' ? 'teal' : u.status === 'SUSPENDED' ? 'error' : 'neutral'}>{u.status.toLowerCase()}</Badge></Td>
            <Td>{u.provider ? <Link href={`/providers/${u.provider.id}`} className="text-primary-dark hover:underline">{u.provider.displayName}</Link> : '—'}</Td>
            <Td className="text-xs text-muted">{fmtDate(u.createdAt)}</Td>
            <Td className="text-xs text-muted">{fmtDate(u.lastLoginAt)}</Td>
          </tr>
        ))}
      </Table>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={() => void list.loadMore()} />
    </>
  );
}
