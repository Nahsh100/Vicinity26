'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { can, useSession } from '@/components/Shell';
import { Badge, Button, Card, ErrorBox, fmtDate, Loading, Modal, PageHeader, TextArea } from '@/components/ui';
import { adminApi, useAdmin } from '@/lib/client';

interface UserDetail {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  suspendedReason: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  provider: { id: string; displayName: string; status: string } | null;
  adminRoles: string[];
  counts: { reviews: number; enquiries: number; organizations: number; reportsAgainst: number };
  activity: { id: string; action: string; targetType: string | null; createdAt: string; actorId: string | null }[];
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const s = useSession();
  const q = useAdmin<UserDetail>(`admin/users/${id}`);
  const roles = useAdmin<{ code: string; name: string }[]>(can(s, 'admins.manage') ? 'admin/roles' : null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const u = q.data;

  const act = async (path: string, body?: unknown) => {
    setErr(null);
    try {
      await adminApi(`admin/users/${id}/${path}`, { method: path === 'roles' ? 'PUT' : 'POST', body: body ?? {} });
      setSuspendOpen(false);
      await q.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (q.loading && !u) return <Loading />;
  if (!u) return <ErrorBox error={q.error} onRetry={() => void q.reload()} />;

  return (
    <>
      <PageHeader
        title={u.fullName}
        subtitle={u.email ?? u.phone ?? 'No email'}
        actions={
          can(s, 'users.manage') ? (
            u.status === 'ACTIVE' ? <Button kind="danger" onClick={() => setSuspendOpen(true)}>Suspend account</Button> : u.status === 'SUSPENDED' ? <Button onClick={() => void act('reactivate')}>Reactivate</Button> : null
          ) : null
        }
      />
      {err ? <p className="mb-3 rounded-xl bg-error-soft p-3 text-sm text-error">{err}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-muted">Status</dt><dd><Badge tone={u.status === 'ACTIVE' ? 'teal' : 'error'}>{u.status.toLowerCase()}</Badge>{u.suspendedReason ? <span className="ml-2 text-xs text-muted">{u.suspendedReason}</span> : null}</dd>
            <dt className="text-muted">Phone</dt><dd>{u.phone ?? '—'}</dd>
            <dt className="text-muted">Email verified</dt><dd>{u.emailVerified ? 'Yes' : 'No'}</dd>
            <dt className="text-muted">Joined</dt><dd>{fmtDate(u.createdAt)}</dd>
            <dt className="text-muted">Last login</dt><dd>{fmtDate(u.lastLoginAt)}</dd>
            <dt className="text-muted">Provider</dt><dd>{u.provider ? <a className="text-primary-dark underline" href={`/providers/${u.provider.id}`}>{u.provider.displayName}</a> : '—'}</dd>
            <dt className="text-muted">Reviews / enquiries</dt><dd>{u.counts.reviews} / {u.counts.enquiries}</dd>
            <dt className="text-muted">Organizations</dt><dd>{u.counts.organizations}</dd>
            <dt className="text-muted">Reports against</dt><dd>{u.counts.reportsAgainst}</dd>
          </dl>
        </Card>
        <Card>
          <p className="mb-2 text-sm font-semibold">Admin roles</p>
          {roles.data ? (
            <div className="flex flex-col gap-2">
              {roles.data.map((r) => (
                <label key={r.code} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={u.adminRoles.includes(r.code)}
                    onChange={(e) => void act('roles', { roles: e.target.checked ? [...u.adminRoles, r.code] : u.adminRoles.filter((x) => x !== r.code) })}
                  />
                  {r.name}
                </label>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">{u.adminRoles.length ? u.adminRoles.map((r) => <Badge key={r} tone="navy">{r}</Badge>) : <span className="text-sm text-muted">None</span>}</div>
          )}
        </Card>
      </div>
      <h2 className="mb-2 mt-6 font-bold text-navy">Account activity</h2>
      <Card>
        {u.activity.length ? (
          <ul className="divide-y divide-line text-sm">
            {u.activity.map((a) => (
              <li key={a.id} className="flex justify-between py-2"><span>{a.action}{a.actorId && a.actorId !== u.id ? ' (by admin)' : ''}</span><span className="text-xs text-muted">{fmtDate(a.createdAt)}</span></li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No recorded activity.</p>}
      </Card>
      <Modal open={suspendOpen} title="Suspend account" onClose={() => setSuspendOpen(false)}>
        <p className="text-sm text-muted">The user is signed out everywhere and cannot sign in until reactivated.</p>
        <TextArea label="Reason (shown to the user)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button kind="danger" disabled={reason.trim().length < 3} onClick={() => void act('suspend', { reason })}>Suspend</Button>
      </Modal>
    </>
  );
}
