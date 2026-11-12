// Google Places API (New) — datos públicos de Maps/GBP. Requiere GOOGLE_PLACES_API_KEY y es FACTURABLE.
// Implementado según la documentación pública; no probado con credenciales reales en este entorno.
import { config } from '../config.js';
import { cacheKey, getCached, setCached, logUsage, guardSpend } from './cost.js';

const FIELDS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber', 'places.websiteUri', 'places.rating',
  'places.userRatingCount', 'places.primaryType', 'places.primaryTypeDisplayName', 'places.types', 'places.regularOpeningHours', 'places.googleMapsUri',
  'places.businessStatus', 'places.photos', 'places.reviews', 'places.location'].join(',');

export const placesConfigured = () => !!config.providers.googlePlacesKey;

async function textSearch(query, { userId, prospectId, auditId, confirmed, max = 5 }) {
  if (!placesConfigured()) throw Object.assign(new Error('Google Places no configurado (GOOGLE_PLACES_API_KEY)'), { status: 501 });
  const key = cacheKey('google_places', 'searchText', { query, max });
  const c = await getCached(key);
  if (c) { await logUsage({ provider: 'google_places', operation: 'searchText', userId, prospectId, auditId, cached: true }); return { places: c.response.places || [], fetchedAt: c.fetched_at, cached: true }; }
  await guardSpend({ provider: 'google_places', userId, confirmed });
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': config.providers.googlePlacesKey, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery: query, maxResultCount: max }) });
  if (!res.ok) throw Object.assign(new Error(`Google Places respondió ${res.status}`), { status: 502 });
  const j = await res.json();
  await setCached(key, 'google_places', j); await logUsage({ provider: 'google_places', operation: 'searchText', userId, prospectId, auditId, cached: false });
  return { places: j.places || [], fetchedAt: new Date().toISOString(), cached: false };
}

const hostOf = u => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return null; } };
const digits = s => String(s || '').replace(/\D/g, '').slice(-10);

export function simplifyPlace(p) {
  return { placeId: p.id, name: p.displayName?.text, address: p.formattedAddress, phone: p.nationalPhoneNumber, website: p.websiteUri, rating: p.rating ?? null, reviews: p.userRatingCount ?? null,
    primaryType: p.primaryType, primaryCategory: p.primaryTypeDisplayName?.text, types: p.types || [], hasHours: !!p.regularOpeningHours, photosVisible: (p.photos || []).length,
    recentReviewsVisible: (p.reviews || []).map(r => ({ publishTime: r.publishTime, rating: r.rating })), mapsUrl: p.googleMapsUri, status: p.businessStatus, location: p.location };
}

export function matchScore(place, prospect) {
  const reasons = [];
  if (place.website && prospect.website && hostOf(place.website) === hostOf(prospect.website)) reasons.push('website coincide');
  if (place.phone && prospect.contact_phone && digits(place.phone) === digits(prospect.contact_phone)) reasons.push('teléfono coincide');
  return reasons;
}

export async function findProspectPlace(prospect, ctx) {
  const query = [prospect.company, prospect.city, prospect.state].filter(Boolean).join(' ');
  const r = await textSearch(query, { ...ctx, max: 5 });
  const cands = r.places.map(simplifyPlace).map(p => ({ ...p, matchReasons: matchScore(p, prospect) }));
  const best = cands.find(c => c.matchReasons.length) || null;
  return { query, best, candidates: cands, fetchedAt: r.fetchedAt, cached: r.cached, source: 'Google Places API (New)' };
}

export async function findCompetitors(prospect, ownPlaceId, ctx, n = 3) {
  const query = [prospect.category || (prospect.services || [])[0], 'en', prospect.city, prospect.state].filter(Boolean).join(' ');
  const r = await textSearch(query, { ...ctx, max: n + 3 });
  return { query, competitors: r.places.map(simplifyPlace).filter(p => p.placeId !== ownPlaceId).slice(0, n), fetchedAt: r.fetchedAt, source: 'Google Places API (New)' };
}
