/**
 * Starter gazetteer for manual location selection without GPS or a paid geocoder.
 * Coordinates are approximate neighbourhood/town centroids. Extend as coverage grows,
 * or replace with a geocoding provider behind LocationsService.
 */
export interface Place {
  name: string;
  city: string;
  kind: 'neighbourhood' | 'town';
  lat: number;
  lng: number;
}

const lusaka = (name: string, lat: number, lng: number): Place => ({ name, city: 'Lusaka', kind: 'neighbourhood', lat, lng });
const town = (name: string, lat: number, lng: number): Place => ({ name, city: name, kind: 'town', lat, lng });

export const PLACES: Place[] = [
  lusaka('Lusaka CBD', -15.4167, 28.2833),
  lusaka('Woodlands', -15.429, 28.317),
  lusaka('Kalingalinga', -15.414, 28.327),
  lusaka('Mass Media', -15.402, 28.308),
  lusaka('Rhodes Park', -15.411, 28.302),
  lusaka('Longacres', -15.408, 28.305),
  lusaka('Kabulonga', -15.417, 28.342),
  lusaka('Roma', -15.379, 28.32),
  lusaka('Olympia', -15.397, 28.318),
  lusaka('Kalundu', -15.382, 28.327),
  lusaka('Chelston', -15.368, 28.383),
  lusaka('Avondale', -15.388, 28.36),
  lusaka('Mtendere', -15.408, 28.36),
  lusaka('Bauleni', -15.43, 28.35),
  lusaka('Ibex Hill', -15.439, 28.353),
  lusaka('Kabwata', -15.438, 28.295),
  lusaka('Kamwala', -15.433, 28.285),
  lusaka('Chilenje', -15.447, 28.308),
  lusaka('Libala', -15.452, 28.315),
  lusaka('Northmead', -15.401, 28.295),
  lusaka('Emmasdale', -15.388, 28.272),
  lusaka('Garden', -15.387, 28.265),
  lusaka('Matero', -15.372, 28.255),
  lusaka('Chawama', -15.458, 28.273),
  lusaka('Makeni', -15.465, 28.255),
  lusaka('PHI', -15.385, 28.34),
  lusaka('Chamba Valley', -15.353, 28.333),
  lusaka('Meanwood', -15.35, 28.35),
  town('Chilanga', -15.56, 28.27),
  town('Kafue', -15.769, 28.1814),
  town('Ndola', -12.9587, 28.6366),
  town('Kitwe', -12.8024, 28.2132),
  town('Livingstone', -17.8419, 25.8543),
  town('Kabwe', -14.4469, 28.4464),
  town('Chingola', -12.529, 27.854),
  town('Mufulira', -12.5498, 28.2407),
  town('Chipata', -13.6333, 32.65),
  town('Kasama', -10.2129, 31.1808),
  town('Solwezi', -12.1733, 26.3894),
  town('Mansa', -11.1997, 28.8943),
  town('Mongu', -15.2484, 23.1274),
  town('Choma', -16.8065, 26.953),
  town('Mazabuka', -15.856, 27.748),
];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').trim();

export function findPlaces(q: string, limit = 8): Place[] {
  const n = norm(q);
  if (!n) return PLACES.filter((p) => p.kind === 'town' || p.name === 'Lusaka CBD').slice(0, limit);
  return PLACES.map((p) => {
    const name = norm(p.name);
    const score = name === n ? 3 : name.startsWith(n) ? 2 : name.includes(n) || norm(p.city).startsWith(n) ? 1 : 0;
    return { p, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}

export function resolvePlace(q: string): Place | null {
  const n = norm(q);
  return PLACES.find((p) => norm(p.name) === n) ?? findPlaces(q, 1)[0] ?? null;
}

/** Nearest known place to a coordinate (for labelling GPS positions). */
export function nearestPlace(lat: number, lng: number): Place {
  let best = PLACES[0]!;
  let bestD = Infinity;
  for (const p of PLACES) {
    const d = (p.lat - lat) ** 2 + ((p.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
