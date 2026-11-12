// Validación de elegibilidad: website activo + GBP existente con correspondencia verificable + actividad local.
// Estados: calificado | no_calificado | revision_manual. Siempre devuelve el motivo y la evidencia.
import { safeFetch } from './http.js';
import { UrlError, normalizeUrl } from './ssrf.js';
import { extractPage } from './crawler.js';
import { placesConfigured, findProspectPlace } from './providers/places.js';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
const GBP_HOSTS = [/^(www\.)?google\.[a-z.]+$/, /^maps\.google\.[a-z.]+$/, /^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.page$/, /^share\.google$/, /^business\.google\.com$/, /^g\.co$/];

export function isGbpUrl(raw) {
  let u; try { u = normalizeUrl(raw); } catch { return false; }
  const h = u.hostname.toLowerCase();
  if (!GBP_HOSTS.some(r => r.test(h))) return false;
  if (/^(www\.)?google\.[a-z.]+$/.test(h)) return /^\/maps/.test(u.pathname) || /[?&](cid|kgmid)=/.test(u.search) || /^\/search/.test(u.pathname) && /kgmid|ludocid/.test(u.search);
  if (h === 'goo.gl') return /^\/maps/.test(u.pathname);
  return true;
}

const result = (status, reason, evidence) => ({ status, reason, evidence, checkedAt: new Date().toISOString() });

export async function checkEligibility(prospect, ctx = {}) {
  const ev = { website: {}, gbp: {}, correspondence: {}, local: {} };
  const missing = [];
  if (!prospect.website) missing.push('website'); if (!prospect.gbp_url) missing.push('URL de Google Business Profile/Maps');
  if (missing.length) return result('no_calificado', `Falta ${missing.join(' y ')}. Ambos son requisitos para calificar.`, ev);

  // 1) GBP: formato de URL
  if (!isGbpUrl(prospect.gbp_url)) { ev.gbp = { url: prospect.gbp_url, formatoValido: false }; return result('no_calificado', 'La URL registrada no corresponde a un perfil de Google Maps / Google Business Profile.', ev); }
  ev.gbp = { url: prospect.gbp_url, formatoValido: true };

  // 2) Website activo
  let home;
  try { home = await safeFetch(prospect.website); }
  catch (e) {
    ev.website = { url: prospect.website, error: e.message };
    const dnsGone = /ENOTFOUND/.test(String(e.cause?.code || '')) || e.message === 'No se pudo resolver el dominio' && !e.transient;
    if (e instanceof UrlError && !e.transient) return result('no_calificado', `El website no es válido o no es accesible de forma segura: ${e.message}.`, ev);
    if (dnsGone) return result('no_calificado', 'El dominio del website no existe (no resuelve).', ev);
    return result('revision_manual', `No se pudo verificar el website por un error temporal (${e.cause?.code || e.message}). Reintentar o revisar manualmente.`, ev);
  }
  ev.website = { url: prospect.website, finalUrl: home.finalUrl, status: home.status };
  if (home.status === 404 || home.status === 410) return result('no_calificado', `El website responde ${home.status}: no está activo.`, ev);
  if (home.status >= 500 || home.status === 403 || home.status === 429 || home.status === 401) return result('revision_manual', `El website respondió ${home.status} (puede ser un bloqueo temporal o a bots). Revisión manual necesaria.`, ev);
  if (home.status >= 400) return result('no_calificado', `El website responde ${home.status}.`, ev);
  if (!/html/i.test(home.contentType)) return result('no_calificado', 'La URL del website no devuelve una página HTML.', ev);
  const page = extractPage(home.body, home.finalUrl);
  ev.website.title = page.title;

  // 3) Correspondencia website ↔ GBP
  let level = 'ninguna'; const reasons = [];
  if (placesConfigured() && ctx.usePlaces) {
    try {
      const r = await findProspectPlace(prospect, ctx);
      ev.correspondence.places = { query: r.query, found: !!r.best, fetchedAt: r.fetchedAt, source: r.source, match: r.best ? { name: r.best.name, address: r.best.address, matchReasons: r.best.matchReasons } : null };
      if (r.best) { level = 'fuerte'; reasons.push(`Google Places confirma el perfil (${r.best.matchReasons.join(', ')})`); ev.places = r.best; }
    } catch (e) { ev.correspondence.placesError = e.message; if (e.status === 409 || e.status === 402) throw e; }
  }
  if (level !== 'fuerte') {
    const gbpKey = (() => { try { const u = normalizeUrl(prospect.gbp_url); return (u.search.match(/[?&]cid=(\d+)/) || [])[1] || u.pathname.split('/').filter(Boolean).pop(); } catch { return null; } })();
    const linksToGbp = page.links.some(l => !l.internal && (l.href === normalizeUrl(prospect.gbp_url).toString() || (gbpKey && l.href.includes(gbpKey)) || /(maps\.app\.goo\.gl|g\.page|google\.[a-z.]+\/maps)/.test(l.href)));
    const exactLink = page.links.some(l => !l.internal && normalizeUrl(prospect.gbp_url).toString().replace(/\/$/, '') === l.href.replace(/\/$/, ''));
    const phoneOk = prospect.contact_phone && page.phones.includes(digits(prospect.contact_phone));
    const nameTokens = norm(prospect.company).split(/[^a-z0-9]+/).filter(t => t.length > 2);
    const hay = norm(page.title + ' ' + page.h1.join(' ') + ' ' + page.textSample.slice(0, 3000));
    const nameOk = nameTokens.length > 0 && nameTokens.every(t => hay.includes(t));
    Object.assign(ev.correspondence, { sitioEnlazaPerfilExacto: exactLink, sitioEnlazaAGoogleMaps: linksToGbp, telefonoCoincide: !!phoneOk, nombreEnSitio: nameOk });
    if (exactLink) { level = 'fuerte'; reasons.push('El sitio enlaza exactamente al perfil de Google registrado'); }
    else if (phoneOk && nameOk) { level = 'media'; reasons.push('El teléfono registrado y el nombre aparecen en el sitio'); }
    else if (linksToGbp && nameOk) { level = 'media'; reasons.push('El sitio enlaza a un perfil de Google Maps y muestra el nombre del negocio'); }
  }
  ev.correspondence.nivel = level; ev.correspondence.motivos = reasons;
  ev.gbp.existenciaVerificada = level === 'fuerte' && !!ev.places ? 'google_places' : 'no verificada directamente (formato de URL + referencias cruzadas en el sitio)';

  // 4) Actividad local
  const hayAll = norm(page.textSample + ' ' + page.title);
  const cityOk = prospect.city && hayAll.includes(norm(prospect.city));
  const areaOk = prospect.service_area && norm(prospect.service_area).split(/[^a-z0-9]+/).filter(t => t.length > 3).some(t => hayAll.includes(t));
  const hasPhone = page.phones.length > 0;
  ev.local = { ciudadEnSitio: !!cityOk, zonaDeServicioEnSitio: !!areaOk, telefonoLocalDetectado: hasPhone };
  const localOk = cityOk || areaOk;

  if (level === 'ninguna') return result('revision_manual', 'El website está activo y la URL de GBP tiene formato válido, pero no se pudo verificar automáticamente que ambos pertenezcan al mismo negocio. Revisión manual necesaria (o configure Google Places para verificar).', ev);
  if (!localOk) return result('revision_manual', 'Hay correspondencia website–GBP, pero no se detectó actividad local (ciudad/zona de servicio) en el sitio. Revisión manual necesaria.', ev);
  return result('calificado', `Calificado: website activo (${home.status}), GBP con correspondencia ${level} (${reasons.join('; ')}) y actividad local detectada. Existencia del perfil: ${ev.gbp.existenciaVerificada}.`, ev);
}
