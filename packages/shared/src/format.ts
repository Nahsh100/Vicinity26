import type { PriceType } from './enums';

export function formatMoney(amount: number, currency = 'ZMW'): string {
  const rounded = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
  return `${currency} ${rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function formatPrice(p: {
  priceType: PriceType;
  price: number | null;
  priceMax?: number | null;
  currency: string;
  unit?: string | null;
}): string {
  const { priceType, price, priceMax, currency, unit } = p;
  switch (priceType) {
    case 'NEGOTIABLE':
      return price != null ? `${formatMoney(price, currency)} (negotiable)` : 'Negotiable';
    case 'QUOTE':
      return 'Request a quote';
    case 'RANGE':
      return price != null && priceMax != null
        ? `${formatMoney(price, currency)} – ${formatMoney(priceMax, currency).replace(`${currency} `, '')}`
        : 'Price on request';
    case 'STARTING_FROM':
      return price != null ? `From ${formatMoney(price, currency)}` : 'Price on request';
    case 'HOURLY':
      return price != null ? `${formatMoney(price, currency)} / hr` : 'Price on request';
    case 'PER_UNIT':
      return price != null ? `${formatMoney(price, currency)} / ${unit || 'unit'}` : 'Price on request';
    case 'FIXED':
    default:
      return price != null ? formatMoney(price, currency) : 'Price on request';
  }
}

export function formatDistance(meters: number | null | undefined): string | null {
  if (meters == null) return null;
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  const w = Math.round(d / 7);
  if (d < 30) return `${w} week${w === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-ZM', { day: 'numeric', month: 'short', year: 'numeric' });
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayName = (d: number) => DAYS[d] ?? '';

/** True when `now` (in Africa/Lusaka, UTC+2, no DST) falls inside one of the day's slots. */
export function isOpenNow(hours: { day: number; open: string; close: string }[], now: Date = new Date()): boolean {
  const lusaka = new Date(now.getTime() + 2 * 3600 * 1000);
  const day = lusaka.getUTCDay();
  const mins = lusaka.getUTCHours() * 60 + lusaka.getUTCMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return hours.some((h) => h.day === day && mins >= toMin(h.open) && mins < toMin(h.close));
}
