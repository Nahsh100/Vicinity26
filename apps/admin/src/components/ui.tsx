'use client';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { AdminApiError } from '@/lib/client';

export function Button({ kind = 'primary', size = 'md', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' }) {
  const k = {
    primary: 'bg-primary text-white hover:bg-primary-dark',
    secondary: 'bg-surface-low text-ink hover:bg-surface-container',
    danger: 'bg-error-soft text-error hover:bg-error hover:text-white',
    ghost: 'text-primary-dark hover:bg-primary-soft',
  }[kind];
  const s = size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-5 text-sm';
  return <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition disabled:opacity-50 ${k} ${s} ${className}`} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'teal' | 'amber' | 'neutral' | 'error' | 'navy' }) {
  const t = { teal: 'bg-primary-soft text-primary-dark', amber: 'bg-amber-soft text-amber-800', neutral: 'bg-surface-container text-ink-muted', error: 'bg-error-soft text-error', navy: 'bg-secondary-fixed text-navy' }[tone];
  return <span className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-bold ${t}`}>{children}</span>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-white p-4 shadow-[0_2px_8px_-2px_rgba(15,36,56,0.05)] ${className}`}>{children}</div>;
}

export function Input({ label, className = '', ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-semibold text-ink-muted ${className}`}>
      {label}
      <input {...p} className="h-10 rounded-xl border border-line bg-white px-3 text-sm font-normal text-ink outline-none focus:border-primary" />
    </label>
  );
}

export function TextArea({ label, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
      {label}
      <textarea {...p} className="min-h-20 rounded-xl border border-line bg-white p-3 text-sm font-normal text-ink outline-none focus:border-primary" />
    </label>
  );
}

export function Select({ label, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
      {label}
      <select {...p} className="h-10 rounded-xl border border-line bg-white px-3 text-sm font-normal text-ink outline-none focus:border-primary">
        {children}
      </select>
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-low text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty ? <p className="p-8 text-center text-sm text-muted">Nothing to show.</p> : null}
    </div>
  );
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

export function Loading() {
  return <div className="animate-pulse rounded-card bg-surface-container p-8 text-sm text-muted">Loading…</div>;
}

export function ErrorBox({ error, onRetry }: { error?: AdminApiError | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-card bg-error-soft p-4 text-sm text-error">
      <span>{error.status === 403 ? 'You do not have permission for this section.' : error.message}</span>
      {onRetry && error.status !== 403 ? <Button size="sm" kind="danger" onClick={onRetry}>Retry</Button> : null}
    </div>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="mt-3 flex justify-center">
      <Button kind="secondary" size="sm" disabled={loading} onClick={onClick}>{loading ? 'Loading…' : 'Load more'}</Button>
    </div>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" role="dialog" aria-modal aria-label={title} onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-navy">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="h-8 w-8 rounded-full bg-surface-low">✕</button>
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-ZM', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Private media is only reachable through the portal proxy (it needs the admin's session). */
export const proxied = (url: string | null | undefined) => {
  if (!url) return null;
  const m = url.match(/\/api\/v1\/(media\/[0-9a-f-]{36}\/raw)$/);
  return m ? `/api/proxy/${m[1]}` : url;
};
