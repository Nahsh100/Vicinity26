'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Badge, ErrorBox, fmtDate, Input, LoadMore, PageHeader, Select, Table, Td } from '@/components/ui';
import { qs, usePaged } from '@/lib/client';

interface Row {
  id: string;
  displayName: string;
  type: string;
  status: string;
  verificationStatus: string;
  ratingAverage: number | null;
  ratingCount: number;
  listingCount: number;
  category: string | null;
  owner: { email: string; fullName: string };
  logoUrl: string | null;
  createdAt: string;
}

const VTONE = { VERIFIED: 'teal', PENDING: 'amber', REJECTED: 'error', UNVERIFIED: 'neutral' } as const;

function ProvidersInner() {
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [verification, setVerification] = useState(params.get('verification') ?? '');
  const list = usePaged<Row>(`admin/providers${qs({ q: search, status, verification })}`);

  return (
    <>
      <PageHeader title="Providers" subtitle="Storefronts, verification and suspensions" />
      <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
        <Input label="Search" placeholder="Name, phone or owner email" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any</option><option value="ACTIVE">Live</option><option value="DRAFT">Draft</option><option value="PAUSED">Paused</option><option value="SUSPENDED">Suspended</option>
        </Select>
        <Select label="Verification" value={verification} onChange={(e) => setVerification(e.target.value)}>
          <option value="">Any</option><option value="PENDING">Pending</option><option value="VERIFIED">Verified</option><option value="UNVERIFIED">Unverified</option><option value="REJECTED">Rejected</option>
        </Select>
      </form>
      <ErrorBox error={list.error} onRetry={() => void list.reload()} />
      <Table head={['Provider', 'Status', 'Verification', 'Rating', 'Listings', 'Created']} empty={!list.loading && !list.items.length}>
        {list.items.map((p) => (
          <tr key={p.id} className="hover:bg-surface-low">
            <Td>
              <Link href={`/providers/${p.id}`} className="font-semibold text-primary-dark hover:underline">{p.displayName}</Link>
              <p className="text-xs text-muted">{p.type.toLowerCase()} · {p.category ?? 'no category'} · {p.owner.email}</p>
            </Td>
            <Td><Badge tone={p.status === 'ACTIVE' ? 'teal' : p.status === 'SUSPENDED' ? 'error' : 'neutral'}>{p.status.toLowerCase()}</Badge></Td>
            <Td><Badge tone={VTONE[p.verificationStatus as keyof typeof VTONE]}>{p.verificationStatus.toLowerCase()}</Badge></Td>
            <Td>{p.ratingCount ? `${p.ratingAverage?.toFixed(1)} (${p.ratingCount})` : '—'}</Td>
            <Td>{p.listingCount}</Td>
            <Td className="text-xs text-muted">{fmtDate(p.createdAt)}</Td>
          </tr>
        ))}
      </Table>
      <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={() => void list.loadMore()} />
    </>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense>
      <ProvidersInner />
    </Suspense>
  );
}
