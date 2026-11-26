'use client';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, ErrorBox, fmtDate, Input, Loading, Modal, PageHeader, Select, Table, Td, TextArea } from '@/components/ui';
import { adminApi, qs, useAdmin } from '@/lib/client';

type Audience = 'ALL' | 'CUSTOMERS' | 'PROVIDERS' | 'USERS';
type Category = 'SYSTEM' | 'PROMOTION';

interface Broadcast {
  id: string;
  title: string;
  body: string;
  category: Category;
  audience: Audience;
  userCount: number;
  link: string | null;
  linkLabel: string | null;
  status: 'SENDING' | 'SENT' | 'FAILED';
  recipientCount: number;
  deliveredCount: number;
  error: string | null;
  createdAt: string;
  sentBy: string;
}
interface PickUser {
  id: string;
  email: string | null;
  fullName: string;
  phone: string | null;
}

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'CUSTOMERS', label: 'Customers (no storefront)' },
  { value: 'PROVIDERS', label: 'Providers' },
  { value: 'USERS', label: 'Specific users' },
];
/** Screens a notification can open. In-app paths only: the API refuses anything else. */
const LINKS: { value: string; label: string; button: string }[] = [
  { value: '', label: 'Alerts list (default)', button: '' },
  { value: '/', label: 'Home', button: 'Open Vicinity' },
  { value: '/search', label: 'Search', button: 'Search now' },
  { value: '/categories', label: 'Categories', button: 'Browse' },
  { value: '/bookings', label: 'My bookings', button: 'My bookings' },
  { value: '/messages', label: 'Messages', button: 'Open messages' },
  { value: '/dashboard', label: 'Provider dashboard', button: 'Open dashboard' },
  { value: '/dashboard/plan', label: 'Plan & billing', button: 'See plans' },
  { value: '/become-provider', label: 'Become a provider', button: 'Get started' },
  { value: '/settings/notifications', label: 'Notification settings', button: 'Settings' },
  { value: '/help', label: 'Help', button: 'Learn more' },
];
const AUDIENCE_LABEL: Record<Audience, string> = { ALL: 'Everyone', CUSTOMERS: 'Customers', PROVIDERS: 'Providers', USERS: 'Specific users' };

export default function NotificationsPage() {
  const [category, setCategory] = useState<Category>('SYSTEM');
  const [audience, setAudience] = useState<Audience>('ALL');
  const [picked, setPicked] = useState<PickUser[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  const userIds = picked.map((u) => u.id).join(',');
  const count = useAdmin<{ count: number }>(audience === 'USERS' && !picked.length ? null : `admin/notifications/audience${qs({ audience, userIds: audience === 'USERS' ? userIds : undefined })}`);
  const history = useAdmin<Broadcast[]>('admin/notifications/broadcasts');

  // Refresh history while anything is still sending.
  useEffect(() => {
    if (!history.data?.some((b) => b.status === 'SENDING')) return;
    const t = setTimeout(() => void history.reload(), 3000);
    return () => clearTimeout(t);
  }, [history]);

  const recipients = audience === 'USERS' && !picked.length ? 0 : (count.data?.count ?? 0);
  const valid = title.trim().length > 0 && body.trim().length > 0 && recipients > 0;
  const chosenLink = LINKS.find((l) => l.value === link);

  const submit = async () => {
    setSending(true);
    setErr(null);
    try {
      await adminApi('admin/notifications/broadcasts', {
        method: 'POST',
        body: { title, body, category, audience, userIds: audience === 'USERS' ? picked.map((u) => u.id) : [], link, linkLabel: link ? linkLabel || chosenLink?.button || '' : '' },
      });
      setSentMsg(`Sending to ${recipients.toLocaleString()} ${recipients === 1 ? 'person' : 'people'}…`);
      setTitle('');
      setBody('');
      setLink('');
      setLinkLabel('');
      setPicked([]);
      setPickerKey((k) => k + 1);
      setConfirm(false);
      await history.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Send announcements or promotions to everyone, a group, or specific people. They appear in the Alerts tab and as push notifications on phones." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-navy">Type</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice active={category === 'SYSTEM'} onClick={() => setCategory('SYSTEM')} title="Announcement" text="Service news, outages, policy changes. Reaches everyone in the audience, even if they turned promotions off." />
              <Choice active={category === 'PROMOTION'} onClick={() => setCategory('PROMOTION')} title="Promotion" text="Offers and marketing. Only reaches people who turned on promotional notifications." />
            </div>
          </div>

          <Select label="Send to" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
          {audience === 'USERS' ? <UserPicker key={pickerKey} picked={picked} onChange={setPicked} /> : null}

          <div>
            <Input label="Title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New: book services in the app" />
            <p className="mt-1 text-right text-xs text-muted">{title.length}/80</p>
          </div>
          <div>
            <TextArea label="Message" value={body} maxLength={300} onChange={(e) => setBody(e.target.value)} placeholder="Keep it short and useful. Phones show about two lines." />
            <p className="mt-1 text-right text-xs text-muted">{body.length}/300</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="When tapped, open" value={link} onChange={(e) => { setLink(e.target.value); setLinkLabel(''); }}>
              {LINKS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </Select>
            {link ? <Input label="Button label (Alerts tab)" value={linkLabel} maxLength={24} placeholder={chosenLink?.button} onChange={(e) => setLinkLabel(e.target.value)} /> : null}
          </div>

          {err ? <p className="text-sm text-error">{err}</p> : null}
          {sentMsg ? <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-dark">{sentMsg}</p> : null}
          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-muted">
              {count.loading && audience !== 'USERS' ? 'Counting…' : <><b className="text-navy">{recipients.toLocaleString()}</b> active {recipients === 1 ? 'user' : 'users'} in this audience{category === 'PROMOTION' ? ' (only those who opted in will get it)' : ''}</>}
            </p>
            <Button disabled={!valid} onClick={() => { setSentMsg(null); setConfirm(true); }}>Review & send</Button>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-navy">Preview</p>
          <PhonePreview title={title} body={body} />
          <p className="text-xs text-muted">Users can turn notification types off in their settings. Announcements always appear in the Alerts tab; push follows each user’s quiet hours and daily limit for promotions.</p>
        </div>
      </div>

      <h2 className="mb-3 mt-10 font-bold text-navy">Sent</h2>
      <ErrorBox error={history.error} onRetry={() => void history.reload()} />
      {history.loading && !history.data ? <Loading /> : null}
      <Table head={['Notification', 'Audience', 'Type', 'Delivered', 'Status', 'Sent']} empty={!history.loading && !history.data?.length}>
        {history.data?.map((b) => (
          <tr key={b.id}>
            <Td>
              <p className="font-semibold">{b.title}</p>
              <p className="max-w-md truncate text-xs text-muted">{b.body}</p>
              {b.link ? <p className="text-xs text-primary-dark">Opens {b.link}</p> : null}
            </Td>
            <Td className="text-xs">{AUDIENCE_LABEL[b.audience]}{b.audience === 'USERS' ? ` (${b.userCount})` : ''}</Td>
            <Td><Badge tone={b.category === 'PROMOTION' ? 'amber' : 'navy'}>{b.category === 'PROMOTION' ? 'promotion' : 'announcement'}</Badge></Td>
            <Td className="text-xs">{b.deliveredCount.toLocaleString()} / {b.recipientCount.toLocaleString()}</Td>
            <Td>
              <Badge tone={b.status === 'SENT' ? 'teal' : b.status === 'FAILED' ? 'error' : 'amber'}>{b.status.toLowerCase()}</Badge>
              {b.error ? <p className="mt-1 max-w-[200px] text-xs text-error">{b.error}</p> : null}
            </Td>
            <Td className="text-xs text-muted">{fmtDate(b.createdAt)}<br />{b.sentBy}</Td>
          </tr>
        ))}
      </Table>

      <Modal open={confirm} title="Send this notification?" onClose={() => setConfirm(false)}>
        <PhonePreview title={title} body={body} />
        <p className="text-sm">
          {category === 'PROMOTION' ? 'Promotion' : 'Announcement'} to <b>{AUDIENCE_LABEL[audience]}</b>: up to <b>{recipients.toLocaleString()}</b> {recipients === 1 ? 'person' : 'people'}.
          {link ? <> Tapping opens <b>{chosenLink?.label}</b>.</> : null}
        </p>
        <p className="text-xs text-muted">This can’t be undone once sent.</p>
        {err ? <p className="text-sm text-error">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <Button kind="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button disabled={sending} onClick={() => void submit()}>{sending ? 'Sending…' : 'Send now'}</Button>
        </div>
      </Modal>
    </>
  );
}

function Choice({ active, onClick, title, text }: { active: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-2xl border-2 p-3 text-left ${active ? 'border-primary bg-primary-soft' : 'border-line bg-white hover:bg-surface-low'}`}>
      <p className="font-semibold text-navy">{title}</p>
      <p className="mt-0.5 text-xs text-muted">{text}</p>
    </button>
  );
}

function PhonePreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-[#1F2937] p-3">
      <div className="flex gap-3 rounded-2xl bg-white/95 p-3 shadow">
        <img src="/brand/vicinity-symbol-small-light.svg" alt="" width={36} height={36} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span className="font-semibold uppercase tracking-wide">Vicinity</span>
            <span>now</span>
          </div>
          <p className="truncate text-sm font-semibold text-navy">{title || 'Notification title'}</p>
          <p className="line-clamp-2 text-sm text-ink">{body || 'Your message appears here.'}</p>
        </div>
      </div>
    </div>
  );
}

function UserPicker({ picked, onChange }: { picked: PickUser[]; onChange: (u: PickUser[]) => void }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const results = useAdmin<PickUser[]>(search.length >= 2 ? `admin/users${qs({ q: search, status: 'ACTIVE', limit: 8 })}` : null);
  const pickedIds = useMemo(() => new Set(picked.map((u) => u.id)), [picked]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface-low p-3">
      <Input label="Find users" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      {search.length >= 2 ? (
        <div className="flex flex-col gap-1">
          {results.loading ? <p className="text-xs text-muted">Searching…</p> : null}
          {results.data?.length === 0 ? <p className="text-xs text-muted">No active users match.</p> : null}
          {results.data?.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{u.fullName || '(no name)'}</p>
                <p className="truncate text-xs text-muted">{[u.email, u.phone].filter(Boolean).join(' · ')}</p>
              </div>
              <Button size="sm" kind={pickedIds.has(u.id) ? 'ghost' : 'secondary'} disabled={pickedIds.has(u.id)} onClick={() => onChange([...picked, u])}>
                {pickedIds.has(u.id) ? 'Added' : 'Add'}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {picked.length ? (
        <div className="flex flex-wrap gap-2">
          {picked.map((u) => (
            <span key={u.id} className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold">
              {u.fullName || u.email || u.phone}
              <button type="button" aria-label={`Remove ${u.fullName || u.email}`} className="text-muted hover:text-error" onClick={() => onChange(picked.filter((p) => p.id !== u.id))}>✕</button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No users chosen yet.</p>
      )}
    </div>
  );
}
