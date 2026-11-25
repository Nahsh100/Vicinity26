'use client';
import { useState } from 'react';
import type { Category } from '@vicinity/shared';
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, Select, TextArea } from '@/components/ui';
import { adminApi, useAdmin } from '@/lib/client';

interface Draft {
  id?: string;
  name: string;
  slug: string;
  parentId: string;
  icon: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
  aliases: string;
}

const empty: Draft = { name: '', slug: '', parentId: '', icon: '', description: '', sortOrder: '0', isActive: true, aliases: '' };

/** Category tree management. Categories live in the database; the apps never hardcode them. */
export default function CategoriesPage() {
  const q = useAdmin<Category[]>('admin/categories');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const save = async () => {
    if (!draft) return;
    setErr(null);
    const body = {
      name: draft.name,
      ...(draft.slug ? { slug: draft.slug } : {}),
      parentId: draft.parentId || null,
      icon: draft.icon || null,
      description: draft.description || null,
      sortOrder: Number(draft.sortOrder) || 0,
      isActive: draft.isActive,
      aliases: draft.aliases.split(',').map((a) => a.trim()).filter(Boolean),
    };
    try {
      if (draft.id) await adminApi(`admin/categories/${draft.id}`, { method: 'PATCH', body });
      else await adminApi('admin/categories', { method: 'POST', body });
      setDraft(null);
      await q.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const remove = async (c: Category) => {
    if (!window.confirm(`Delete "${c.name}"? Categories in use cannot be deleted — deactivate them instead.`)) return;
    try {
      await adminApi(`admin/categories/${c.id}`, { method: 'DELETE' });
      await q.reload();
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  const edit = (c: Category) =>
    setDraft({ id: c.id, name: c.name, slug: c.slug, parentId: c.parentId ?? '', icon: c.icon ?? '', description: c.description ?? '', sortOrder: String(c.sortOrder), isActive: c.isActive, aliases: (c.aliases ?? []).join(', ') });

  const f = filter.toLowerCase();
  const parents = (q.data ?? []).filter((p) => !f || p.name.toLowerCase().includes(f) || p.children?.some((c) => c.name.toLowerCase().includes(f) || c.aliases?.some((a) => a.includes(f))));

  return (
    <>
      <PageHeader title="Categories" subtitle="Two levels: categories and subcategories. Aliases power search synonyms." actions={<Button onClick={() => setDraft({ ...empty })}>New category</Button>} />
      <Input placeholder="Filter categories or aliases" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-4 max-w-sm" />
      <ErrorBox error={q.error} onRetry={() => void q.reload()} />
      {q.loading && !q.data ? <Loading /> : null}
      <div className="flex flex-col gap-3">
        {parents.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-navy">{p.name} {!p.isActive ? <Badge tone="error">inactive</Badge> : null}</p>
                <p className="text-xs text-muted">{p.slug} · icon {p.icon ?? '—'} · order {p.sortOrder} · {p.listingCount ?? 0} listings</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" kind="secondary" onClick={() => setDraft({ ...empty, parentId: p.id })}>Add subcategory</Button>
                <Button size="sm" kind="ghost" onClick={() => edit(p)}>Edit</Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.children?.map((c) => (
                <span key={c.id} className={`group inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${c.isActive ? 'border-line' : 'border-error text-error'}`}>
                  <button onClick={() => edit(c)} className="font-semibold hover:underline" title={c.aliases?.join(', ')}>{c.name}</button>
                  <span className="text-muted">{c.listingCount ?? 0}</span>
                  <button aria-label={`Delete ${c.name}`} onClick={() => void remove(c)} className="text-muted hover:text-error">✕</button>
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Modal open={!!draft} title={draft?.id ? 'Edit category' : 'New category'} onClose={() => setDraft(null)}>
        {draft ? (
          <>
            <Input label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input label="Slug (optional)" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
            <Select label="Parent" value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}>
              <option value="">None (top-level)</option>
              {(q.data ?? []).filter((p) => p.id !== draft.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Input label="Icon (Material Symbols name)" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="e.g. content_cut" />
            <Input label="Sort order" type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
            <TextArea label="Search aliases (comma separated)" value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} placeholder="nail tech, manicure, nails" />
            <TextArea label="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
            {err ? <p className="text-sm text-error">{err}</p> : null}
            <Button onClick={() => void save()}>Save</Button>
          </>
        ) : null}
      </Modal>
    </>
  );
}
