import { startFixtureSite, pdfText, pdfPages, sleep } from './helpers.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, q } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { config } from '../src/config.js';
import { whenIdle } from '../src/audit.js';
import { guardSpend } from '../src/providers/cost.js';

let base, srv, site; const PW = 'Clave-Segura-123';
const jar = {};
async function call(who, method, path, body, extra = {}) {
  const headers = { 'X-Requested-With': 'vip-analyzer', ...(jar[who] ? { cookie: jar[who] } : {}), ...(extra.headers || {}) };
  let payload; if (body instanceof Buffer) payload = body; else if (body) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  const res = await fetch(base + path, { method, headers, body: payload });
  const sc = res.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}
const mkUser = async (email, name, role, sup) => (await q('INSERT INTO users(email,name,role,supervisor_id,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id', [email, name, role, sup || null, await hashPassword(PW)])).rows[0].id;
const login = async (who, email) => { const r = await call(who, 'POST', '/api/login', { email, password: PW }); assert.equal(r.status, 200, 'login ' + email); return r.data.user; };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const prospectBody = o => ({ company: 'Acme Plumbing', website: site.url + '/', gbp_url: 'https://maps.app.goo.gl/abc123', city: 'Miami', state: 'FL', category: 'Plomero', services: 'Destapes, Plomería de emergencia', contact_phone: '(305) 555-0142', ...o });

before(async () => {
  await migrate();
  await q('TRUNCATE users, prospects, brand_assets, provider_cache, provider_usage, settings RESTART IDENTITY CASCADE');
  site = await startFixtureSite();
  srv = createApp().listen(0); base = `http://127.0.0.1:${srv.address().port}`;
  const admin = await mkUser('admin@t.test', 'Admin', 'admin');
  const sup = await mkUser('sup@t.test', 'Super', 'supervisor');
  const sup2 = await mkUser('sup2@t.test', 'Super Dos', 'supervisor');
  await mkUser('ana@t.test', 'Ana Ejecutiva', 'ejecutivo', sup);
  await mkUser('beto@t.test', 'Beto Ejecutivo', 'ejecutivo', sup);
  await mkUser('carla@t.test', 'Carla Otro Equipo', 'ejecutivo', sup2);
});
after(async () => { await whenIdle(); srv.close(); await site.close(); await pool.end(); });

test('autenticación: login, CSRF, sesión y credenciales inválidas', async () => {
  assert.equal((await call('x', 'POST', '/api/login', { email: 'admin@t.test', password: 'mala' })).status, 401);
  assert.equal((await call('x', 'GET', '/api/prospects')).status, 401);
  const noHdr = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@t.test', password: PW }) });
  assert.equal(noHdr.status, 403);                                           // sin cabecera anti-CSRF
  const u = await login('admin', 'admin@t.test'); assert.equal(u.role, 'admin');
  assert.equal((await call('admin', 'GET', '/api/me')).data.user.email, 'admin@t.test');
  const sc = (await fetch(base + '/api/login', { method: 'POST', headers: { 'X-Requested-With': 'vip-analyzer', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@t.test', password: PW }) })).headers.get('set-cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
});

test('roles: solo admin gestiona usuarios; contraseñas débiles rechazadas', async () => {
  await login('ana', 'ana@t.test'); await login('sup', 'sup@t.test'); await login('beto', 'beto@t.test'); await login('carla', 'carla@t.test'); await login('sup2', 'sup2@t.test');
  assert.equal((await call('ana', 'POST', '/api/users', { email: 'x@t.test', name: 'X', role: 'admin', password: PW })).status, 403);
  assert.equal((await call('sup', 'POST', '/api/users', { email: 'x@t.test', name: 'X', role: 'admin', password: PW })).status, 403);
  assert.equal((await call('ana', 'GET', '/api/users')).status, 403);
  assert.equal((await call('admin', 'POST', '/api/users', { email: 'x@t.test', name: 'X', role: 'ejecutivo', password: 'corta' })).status, 400);
  assert.equal((await call('admin', 'POST', '/api/users', { email: 'nuevo@t.test', name: 'Nuevo', role: 'ejecutivo', password: PW })).status, 201);
  assert.equal((await call('admin', 'POST', '/api/users', { email: 'nuevo@t.test', name: 'Nuevo', role: 'ejecutivo', password: PW })).status, 409);
});

let anaProspect, betoProspect, carlaProspect;
test('aislamiento de datos: ejecutivo solo ve lo suyo; supervisor su equipo; admin todo', async () => {
  anaProspect = (await call('ana', 'POST', '/api/prospects', prospectBody({}))).data.id;
  betoProspect = (await call('beto', 'POST', '/api/prospects', prospectBody({ company: 'Beto Co' }))).data.id;
  carlaProspect = (await call('carla', 'POST', '/api/prospects', prospectBody({ company: 'Carla Co' }))).data.id;
  assert.ok(anaProspect && betoProspect && carlaProspect);
  const names = async who => (await call(who, 'GET', '/api/prospects')).data.prospects.map(p => p.company).sort();
  assert.deepEqual(await names('ana'), ['Acme Plumbing']);
  assert.deepEqual(await names('sup'), ['Acme Plumbing', 'Beto Co']);
  assert.deepEqual(await names('sup2'), ['Carla Co']);
  assert.equal((await names('admin')).length, 3);
  // acceso directo por ID
  for (const [who, id] of [['ana', betoProspect], ['ana', carlaProspect], ['sup', carlaProspect], ['sup2', anaProspect]]) {
    assert.equal((await call(who, 'GET', `/api/prospects/${id}`)).status, 404, `${who} no debe ver ${id}`);
    assert.equal((await call(who, 'PATCH', `/api/prospects/${id}`, { notes: 'hack' })).status, 404);
    assert.equal((await call(who, 'POST', `/api/prospects/${id}/audit`, {})).status, 404);
    assert.equal((await call(who, 'POST', `/api/prospects/${id}/status`, { status: 'Contactado' })).status, 404);
    assert.equal((await call(who, 'POST', `/api/prospects/${id}/keywords`, { keyword: 'x' })).status, 404);
  }
  assert.equal((await call('ana', 'GET', `/api/prospects/${anaProspect}`)).data.owner.name, 'Ana Ejecutiva');
  assert.equal((await call('ana', 'POST', '/api/prospects', prospectBody({ owner_id: (await call('admin', 'GET', '/api/users')).data.users.find(u => u.email === 'beto@t.test').id }))).status, 403);
});

test('reasignación: ejecutivo no puede; supervisor solo dentro de su equipo; queda en historial', async () => {
  const users = (await call('admin', 'GET', '/api/users')).data.users; const id = e => users.find(u => u.email === e).id;
  assert.equal((await call('ana', 'POST', `/api/prospects/${anaProspect}/reassign`, { owner_id: id('beto@t.test') })).status, 403);
  assert.equal((await call('sup', 'POST', `/api/prospects/${betoProspect}/reassign`, { owner_id: id('carla@t.test') })).status, 403);   // fuera de su equipo
  assert.equal((await call('sup', 'POST', `/api/prospects/${betoProspect}/reassign`, { owner_id: id('ana@t.test') })).status, 200);
  assert.equal((await call('beto', 'GET', `/api/prospects/${betoProspect}`)).status, 404);                                               // ya no es suyo
  const d = (await call('ana', 'GET', `/api/prospects/${betoProspect}`)).data;
  assert.equal(d.owner.name, 'Ana Ejecutiva'); assert.ok(d.history.some(h => h.kind === 'reassign' && /Beto/.test(h.detail)));
  await call('sup', 'POST', `/api/prospects/${betoProspect}/reassign`, { owner_id: id('beto@t.test') });
});

test('elegibilidad: faltantes, URL de GBP inválida, 404, SSRF, temporal y calificado', async () => {
  const elig = async (who, id) => (await call(who, 'POST', `/api/prospects/${id}/eligibility`, {})).data;
  const mk = async body => (await call('admin', 'POST', '/api/prospects', prospectBody(body))).data.id;
  let r = await elig('admin', await mk({ website: '' })); assert.equal(r.status, 'no_calificado'); assert.match(r.reason, /Falta website/);
  r = await elig('admin', await mk({ gbp_url: '' })); assert.equal(r.status, 'no_calificado'); assert.match(r.reason, /Business Profile/);
  r = await elig('admin', await mk({ gbp_url: 'https://facebook.com/acme' })); assert.equal(r.status, 'no_calificado'); assert.match(r.reason, /Google Maps/);
  r = await elig('admin', await mk({ website: site.url + '/no-existe' })); assert.equal(r.status, 'no_calificado'); assert.match(r.reason, /404/);
  config.allowPrivateTargets = false;                                                                  // SSRF real: metadata de nube
  try { r = await elig('admin', await mk({ website: 'http://169.254.169.254/latest/meta-data' })); } finally { config.allowPrivateTargets = true; }
  assert.equal(r.status, 'no_calificado'); assert.match(r.reason, /IP privada|no permitid/i);
  r = await elig('admin', await mk({ website: 'http://127.0.0.1:1/' })); assert.equal(r.status, 'revision_manual'); assert.match(r.reason, /temporal/);
  r = await elig('admin', await mk({ company: 'Otra Empresa Distinta', contact_phone: '', gbp_url: 'https://www.google.com/maps/place/zzz' })); assert.equal(r.status, 'revision_manual'); assert.match(r.reason, /mismo negocio/);
  r = await elig('ana', anaProspect);
  assert.equal(r.status, 'calificado', r.reason); assert.ok(r.evidence.correspondence.sitioEnlazaAGoogleMaps || r.evidence.correspondence.telefonoCoincide);
  assert.match(r.reason, /no verificada directamente/);                                               // honesto: sin Places no verifica existencia
  assert.equal((await call('ana', 'GET', `/api/prospects/${anaProspect}`)).data.prospect.pipeline_status, 'Calificado');
});

test('auditoría bloqueada si no calificado / revisión manual requiere aprobación', async () => {
  const noCal = (await call('admin', 'POST', '/api/prospects', prospectBody({ website: '' }))).data.id; await call('admin', 'POST', `/api/prospects/${noCal}/eligibility`, {});
  const r = await call('admin', 'POST', `/api/prospects/${noCal}/audit`, {}); assert.equal(r.status, 409); assert.match(r.data.error, /no calificado/i);
  const rev = (await call('admin', 'POST', '/api/prospects', prospectBody({ website: 'http://127.0.0.1:1/' }))).data.id; await call('admin', 'POST', `/api/prospects/${rev}/eligibility`, {});
  assert.equal((await call('admin', 'POST', `/api/prospects/${rev}/audit`, {})).status, 409);
  assert.equal((await call('ana', 'POST', `/api/prospects/${anaProspect}/status`, { status: 'Calificado' })).status, 200);
  const pend = (await call('ana', 'POST', '/api/prospects', prospectBody({}))).data.id;
  assert.equal((await call('ana', 'POST', `/api/prospects/${pend}/status`, { status: 'Calificado' })).status, 400);   // no se puede forzar sin validar
});

let auditId;
test('auditoría completa sobre URLs reales: hallazgos con evidencia, puntaje, proyección e historial', async () => {
  const kw = await call('ana', 'POST', `/api/prospects/${anaProspect}/keywords`, { keyword: 'plomero miami', volume: '', position: '' }); assert.equal(kw.status, 201);
  const r = await call('ana', 'POST', `/api/prospects/${anaProspect}/audit`, { crawl: { maxPages: 12 } }); assert.equal(r.status, 202); auditId = r.data.auditId;
  assert.equal((await call('ana', 'POST', `/api/prospects/${anaProspect}/audit`, {})).status, 409);            // ya hay una en curso / evita duplicados
  await whenIdle();
  const { data } = await call('ana', 'GET', `/api/audits/${auditId}`);
  assert.ok(['completado', 'parcial'].includes(data.audit.status), data.audit.error);
  assert.ok(data.pages.length >= 4 && data.findings.length >= 8);
  const f = data.findings; const codes = f.map(x => x.code);
  for (const c of ['HTTP_4XX', 'NO_VIEWPORT', 'SERVICE_PAGE_MISSING', 'SCHEMA_LOCALBUSINESS_MISSING']) assert.ok(codes.includes(c), c);
  assert.ok(f.every(x => x.score != null && x.category && x.source && x.action && x.explanation));
  assert.ok(f.some(x => x.category === 'quick_win') && f.some(x => x.category === 'prioridad_alta'));
  assert.ok(data.audit.summary.health < 100 && data.audit.summary.projection.implementation.taskCount > 0);
  assert.equal(data.audit.summary.projection.improvement.available, false);                                  // sin keywords/competidores: no inventa
  assert.ok(data.audit.summary.notes.some(n => /Google Business Profile/.test(n)));
  assert.equal((await call('carla', 'GET', `/api/audits/${auditId}`)).status, 404);                          // aislamiento de la auditoría
  const d = (await call('ana', 'GET', `/api/prospects/${anaProspect}`)).data;
  assert.equal(d.prospect.pipeline_status, 'Diagnóstico realizado'); assert.ok(d.history.some(h => h.kind === 'audit'));
});

test('PDF comercial y técnico: marca, ejecutivo, paginación; logo del prospecto opcional; aislamiento', async () => {
  assert.equal((await call('ana', 'POST', '/api/admin/logo', png, { headers: { 'content-type': 'image/png' } })).status, 403);
  assert.equal((await call('admin', 'POST', '/api/admin/logo', png, { headers: { 'content-type': 'image/png' } })).status, 200);   // logo oficial cargado por admin
  assert.equal((await call('ana', 'POST', `/api/prospects/${anaProspect}/logo`, png, { headers: { 'content-type': 'image/png' } })).status, 200);
  for (const kind of ['comercial', 'tecnico']) {
    const r = await call('ana', 'POST', `/api/audits/${auditId}/report`, { kind, includeProspectLogo: true });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
    const buf = r.data; assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    const txt = pdfText(buf); assert.ok(pdfPages(buf) >= 3, 'paginación');
    const brand = (txt.match(/Powered by VIP Tech Consulting/g) || []).length; assert.ok(brand >= pdfPages(buf), `pie de marca en cada página: ${brand}/${pdfPages(buf)}`); assert.match(txt, /P.g\. 2 de/); assert.match(txt, /Ana Ejecutiva/); assert.match(txt, /Acme Plumbing/);
    if (kind === 'comercial') { assert.match(txt, /Quick Wins/); assert.match(txt, /Proyecci/); assert.match(txt, /Proyecci.n no disponible por evidencia insuficiente/); assert.match(txt, /L\.E\.D\./); }
    else { assert.match(txt, /Evidencia/); assert.match(txt, /Fuente/); assert.match(txt, /Metodolog/); }
  }
  const d = (await call('ana', 'GET', `/api/prospects/${anaProspect}`)).data; assert.equal(d.reports.length, 2);
  assert.equal((await call('ana', 'GET', `/api/reports/${d.reports[0].id}`)).status, 200);
  assert.equal((await call('carla', 'GET', `/api/reports/${d.reports[0].id}`)).status, 404);
  assert.equal((await call('carla', 'POST', `/api/audits/${auditId}/report`, { kind: 'comercial' })).status, 404);
});

test('seguimiento: estados, historial y comparación entre diagnósticos', async () => {
  assert.equal((await call('ana', 'POST', `/api/prospects/${anaProspect}/status`, { status: 'Inválido' })).status, 400);
  assert.equal((await call('ana', 'POST', `/api/prospects/${anaProspect}/status`, { status: 'Contactado', next_action: 'Llamar el lunes', note: 'Primer contacto' })).status, 200);
  await call('ana', 'POST', `/api/prospects/${anaProspect}/notes`, { note: 'Interesado en destapes' });
  await q(`UPDATE audits SET created_at=now()-interval '7 hours' WHERE id=$1`, [auditId]);
  assert.equal((await call('ana', 'POST', `/api/prospects/${anaProspect}/competitors`, { name: 'Rival 1', rating: '4.5', reviews: '120' })).status, 201);
  const r2 = await call('ana', 'POST', `/api/prospects/${anaProspect}/audit`, { crawl: { maxPages: 12 } }); assert.equal(r2.status, 202); await whenIdle();
  const cmp = await call('ana', 'GET', `/api/prospects/${anaProspect}/compare?a=${auditId}&b=${r2.data.auditId}`); assert.equal(cmp.status, 200);
  assert.ok(cmp.data.persisting > 0 && cmp.data.a.total === cmp.data.b.total);
  const d = (await call('ana', 'GET', `/api/prospects/${anaProspect}`)).data;
  assert.equal(d.prospect.next_action, 'Llamar el lunes');
  assert.ok(d.history.some(h => h.kind === 'status_change' && h.to_value === 'Contactado' && h.user_name === 'Ana Ejecutiva'));
  assert.ok(d.history.some(h => h.kind === 'note'));
});

test('costos: proveedores de pago exigen confirmación y respetan el límite mensual; Places sin credenciales → 501', async () => {
  const ana = (await call('admin', 'GET', '/api/users')).data.users.find(u => u.email === 'ana@t.test');
  await assert.rejects(() => guardSpend({ provider: 'google_places', userId: ana.id, confirmed: false }), e => e.status === 409 && e.code === 'confirmation_required');
  await guardSpend({ provider: 'google_places', userId: ana.id, confirmed: true });
  await q('UPDATE users SET monthly_cost_limit_usd=0.01 WHERE id=$1', [ana.id]);
  await assert.rejects(() => guardSpend({ provider: 'google_places', userId: ana.id, confirmed: true }), e => e.status === 402);
  await guardSpend({ provider: 'pagespeed', userId: ana.id, confirmed: false });                           // gratis: no exige nada
  const r = await call('ana', 'POST', `/api/prospects/${anaProspect}/gbp/fetch`, { confirmed: true }); assert.equal(r.status, 501);
  const costs = await call('admin', 'GET', '/api/admin/costs'); assert.equal(costs.status, 200);
  assert.equal((await call('ana', 'GET', '/api/admin/costs')).status, 403);
  assert.equal((await call('ana', 'GET', '/api/providers')).data.providers.find(p => p.id === 'dataforseo').configured, false);
});

test('XSS: el frontend no usa innerHTML y la CSP bloquea scripts inline', async () => {
  const fs = await import('node:fs'); const js = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js));
  const r = await fetch(base + '/'); assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
});
