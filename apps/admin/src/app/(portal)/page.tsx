'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { useAdmin } from '@/lib/client';

interface Dashboard {
  totals: { users: number; providers: number; listings: number; activeListings: number; organizations: number; groups: number };
  newRegistrations: { last7Days: number; last30Days: number };
  openReports: number;
  pendingVerification: number;
  signups: { date: string; users: number; providers: number }[];
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <Card className="h-full">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-navy">{value.toLocaleString()}</p>
    </Card>
  );
  return href ? <Link href={href} className="hover:opacity-90">{body}</Link> : body;
}

/** Daily signups, one measure (users). Bars in the darker brand teal for contrast; hover shows exact values. */
function SignupChart({ data }: { data: Dashboard['signups'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.users));
  const total = data.reduce((s, d) => s + d.users, 0);
  const h = hover !== null ? data[hover] : null;
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">New users per day (30 days)</p>
        <p className="text-2xl font-bold text-navy">{total}</p>
      </div>
      <p className="h-5 text-xs text-muted">{h ? `${h.date}: ${h.users} users, ${h.providers} new providers` : 'Hover a bar for details'}</p>
      <div className="mt-2 flex h-36 items-end gap-[2px] border-b border-line" onMouseLeave={() => setHover(null)} role="img" aria-label={`New users per day, ${total} in 30 days`}>
        {data.map((d, i) => (
          <div key={d.date} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div className="w-full rounded-t" style={{ height: `${Math.max(d.users ? 3 : 0, (d.users / max) * 100)}%`, background: '#006B5F', opacity: hover === null || hover === i ? 1 : 0.45 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{data[0]?.date}</span>
        <span>max {max}/day</span>
        <span>today</span>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full">
          <tbody>{data.map((d) => <tr key={d.date}><td>{d.date}</td><td className="text-right">{d.users}</td><td className="text-right">{d.providers}</td></tr>)}</tbody>
        </table>
      </details>
    </Card>
  );
}

export default function DashboardPage() {
  const q = useAdmin<Dashboard>('admin/dashboard');
  const d = q.data;
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Platform health at a glance" />
      <ErrorBox error={q.error} onRetry={() => void q.reload()} />
      {q.loading && !d ? <Loading /> : null}
      {d ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Users" value={d.totals.users} href="/users" />
            <Stat label="Providers" value={d.totals.providers} href="/providers" />
            <Stat label="Listings (active)" value={d.totals.activeListings} href="/listings" />
            <Stat label="All listings" value={d.totals.listings} />
            <Stat label="Organizations" value={d.totals.organizations} href="/organizations" />
            <Stat label="Groups" value={d.totals.groups} />
            <Stat label="New users (7 days)" value={d.newRegistrations.last7Days} />
            <Stat label="New users (30 days)" value={d.newRegistrations.last30Days} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Link href="/reports"><Card className={d.openReports ? 'border-error' : ''}><p className="text-xs font-semibold text-muted">Open reports</p><p className="text-3xl font-bold text-navy">{d.openReports}</p><p className="text-xs text-primary-dark">Review →</p></Card></Link>
            <Link href="/providers?verification=PENDING"><Card><p className="text-xs font-semibold text-muted">Awaiting verification</p><p className="text-3xl font-bold text-navy">{d.pendingVerification}</p><p className="text-xs text-primary-dark">Review →</p></Card></Link>
          </div>
          <SignupChart data={d.signups} />
        </div>
      ) : null}
    </>
  );
}
