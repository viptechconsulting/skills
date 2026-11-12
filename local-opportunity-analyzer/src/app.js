import express from 'express';
import { fileURLToPath } from 'node:url';
import { one, many, q } from './db.js';
import { config } from './config.js';
import * as auth from './auth.js';
import { checkEligibility } from './eligibility.js';
import { enqueueAudit } from './audit.js';
import { normalizeUrl, UrlError } from './ssrf.js';
import { generateReport } from './pdf.js';
import { PROVIDER_COSTS, monthSpend, guardSpend } from './providers/cost.js';
import { findProspectPlace, findCompetitors, placesConfigured } from './providers/places.js';

const PIPELINE = ['Nuevo', 'Calificado', 'No calificado', 'Diagnóstico realizado', 'Contactado', 'Reunión agendada', 'Propuesta enviada', 'Ganado', 'Perdido'];
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const str = (v, max = 500) => (v == null ? null : String(v).trim().slice(0, max) || null);
const uuid = s => /^[0-9a-f-]{36}$/i.test(String(s));
const history = (prospectId, userId, kind, detail, from = null, to = null) => q('INSERT INTO prospect_history(prospect_id,user_id,kind,detail,from_value,to_value) VALUES($1,$2,$3,$4,$5,$6)', [prospectId, userId, kind, detail, from, to]);

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'" });
    next();
  });
  app.use(express.json({ limit: '200kb' }));
  app.use(express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' }));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

  // sesión + CSRF (SameSite=Strict + cabecera obligatoria en métodos que modifican)
  app.use(wrap(async (req, res, next) => {
    req.token = auth.parseCookies(req.headers.cookie).sid;
    req.user = await auth.userFromToken(req.token);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path.startsWith('/api/') && req.headers['x-requested-with'] !== 'vip-analyzer') throw bad('Solicitud no permitida', 403);
    next();
  }));
  const need = (...roles) => (req, res, next) => { if (!req.user) return next(bad('No autenticado', 401)); if (roles.length && !roles.includes(req.user.role)) return next(bad('Sin permiso', 403)); next(); };

  // ---------- Auth ----------
  app.post('/api/login', wrap(async (req, res) => {
    const { token, user } = await auth.login(req.body.email, req.body.password, req.ip);
    res.set('Set-Cookie', `sid=${token}; ${auth.cookieOpts()}`).json({ user });
  }));
  app.post('/api/logout', wrap(async (req, res) => { if (req.token) await auth.logout(req.token); res.set('Set-Cookie', 'sid=; Path=/; Max-Age=0').json({ ok: true }); }));
  app.get('/api/me', (req, res) => res.json({ user: req.user }));

  // ---------- Usuarios ----------
  app.get('/api/users', need('admin', 'supervisor'), wrap(async (req, res) => {
    const rows = req.user.role === 'admin' ? await many('SELECT id,email,name,role,supervisor_id,active,monthly_cost_limit_usd FROM users ORDER BY name')
      : await many('SELECT id,email,name,role,supervisor_id,active,monthly_cost_limit_usd FROM users WHERE id=$1 OR supervisor_id=$1 ORDER BY name', [req.user.id]);
    res.json({ users: rows });
  }));
  app.get('/api/assignable-users', need(), wrap(async (req, res) => res.json({ users: await auth.assignableUsers(req.user) })));
  app.post('/api/users', need('admin'), wrap(async (req, res) => {
    const { email, name, role, supervisor_id, password, monthly_cost_limit_usd } = req.body;
    if (!/^\S+@\S+\.\S+$/.test(email || '')) throw bad('Email inválido');
    if (!name) throw bad('Nombre requerido'); if (!['admin', 'supervisor', 'ejecutivo'].includes(role)) throw bad('Rol inválido');
    const pw = auth.passwordProblem(password); if (pw) throw bad(pw);
    if (supervisor_id && !(await one(`SELECT 1 FROM users WHERE id=$1 AND role IN ('supervisor','admin')`, [supervisor_id]))) throw bad('Supervisor inválido');
    try {
      const u = await one(`INSERT INTO users(email,name,role,supervisor_id,password_hash,monthly_cost_limit_usd) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,name,role,supervisor_id`, [email.toLowerCase(), name, role, supervisor_id || null, await auth.hashPassword(password), monthly_cost_limit_usd ?? null]);
      res.status(201).json({ user: u });
    } catch (e) { if (e.code === '23505') throw bad('Ya existe un usuario con ese email', 409); throw e; }
  }));
  app.patch('/api/users/:id', need('admin'), wrap(async (req, res) => {
    if (!uuid(req.params.id)) throw bad('ID inválido');
    const b = req.body, sets = [], vals = [req.params.id];
    const add = (c, v) => { vals.push(v); sets.push(`${c}=$${vals.length}`); };
    if (b.name) add('name', str(b.name, 120)); if (b.role) { if (!['admin', 'supervisor', 'ejecutivo'].includes(b.role)) throw bad('Rol inválido'); add('role', b.role); }
    if ('supervisor_id' in b) add('supervisor_id', b.supervisor_id || null); if ('active' in b) add('active', !!b.active);
    if ('monthly_cost_limit_usd' in b) add('monthly_cost_limit_usd', b.monthly_cost_limit_usd);
    if (b.password) { const pw = auth.passwordProblem(b.password); if (pw) throw bad(pw); add('password_hash', await auth.hashPassword(b.password)); }
    if (!sets.length) throw bad('Nada que actualizar');
    const u = await one(`UPDATE users SET ${sets.join(',')} WHERE id=$1 RETURNING id,email,name,role,supervisor_id,active`, vals);
    if (!u) throw bad('No encontrado', 404);
    if (b.active === false) await q('DELETE FROM sessions WHERE user_id=$1', [u.id]);
    res.json({ user: u });
  }));

  // ---------- Prospectos ----------
  const SELECT_LIST = `p.id,p.company,p.website,p.city,p.state,p.category,p.pipeline_status,p.eligibility_status,p.next_action,p.next_action_at,p.is_demo,p.updated_at,p.owner_id,u.name AS owner_name,
    (SELECT summary->>'health' FROM audits a WHERE a.prospect_id=p.id AND a.status IN ('completado','parcial') ORDER BY a.created_at DESC LIMIT 1) AS health`;
  app.get('/api/prospects', need(), wrap(async (req, res) => {
    const [cond, params] = auth.visibleProspects(req.user, 'p', 1);
    const extra = []; const vals = [...params];
    if (req.query.status && PIPELINE.includes(req.query.status)) { vals.push(req.query.status); extra.push(`p.pipeline_status=$${vals.length}`); }
    if (req.query.q) { vals.push('%' + String(req.query.q).slice(0, 80) + '%'); extra.push(`(p.company ILIKE $${vals.length} OR p.website ILIKE $${vals.length})`); }
    if (req.query.owner && uuid(req.query.owner)) { vals.push(req.query.owner); extra.push(`p.owner_id=$${vals.length}`); }
    const rows = await many(`SELECT ${SELECT_LIST} FROM prospects p JOIN users u ON u.id=p.owner_id WHERE ${cond} ${extra.length ? 'AND ' + extra.join(' AND ') : ''} ORDER BY p.updated_at DESC LIMIT 500`, vals);
    res.json({ prospects: rows, pipeline: PIPELINE });
  }));

  function readProspectBody(b, partial = false) {
    const o = {};
    const set = (k, v) => { if (!partial || k in b) o[k] = v; };
    set('company', str(b.company, 200)); if (!partial && !o.company) throw bad('El nombre de la empresa es requerido');
    for (const k of ['website', 'gbp_url']) if (!partial || k in b) { const v = str(b[k], 500); if (v) { try { o[k] = normalizeUrl(v).toString(); } catch (e) { throw bad(`${k === 'website' ? 'Website' : 'URL de GBP'} inválido: ${e.message}`); } } else o[k] = null; }
    for (const k of ['city', 'state', 'address', 'service_area', 'category', 'contact_name', 'contact_email', 'contact_phone']) set(k, str(b[k], 200));
    set('notes', str(b.notes, 4000));
    if (!partial || 'services' in b) o.services = (Array.isArray(b.services) ? b.services : String(b.services || '').split(/[,\n]/)).map(s => String(s).trim()).filter(Boolean).slice(0, 30);
    set('next_action', str(b.next_action, 300)); if ('next_action_at' in b) o.next_action_at = b.next_action_at || null;
    return o;
  }

  app.post('/api/prospects', need(), wrap(async (req, res) => {
    const o = readProspectBody(req.body);
    let owner = req.user.id;
    if (req.body.owner_id && req.body.owner_id !== req.user.id) { const allowed = await auth.assignableUsers(req.user); if (!allowed.some(u => u.id === req.body.owner_id)) throw bad('No puede asignar a ese usuario', 403); owner = req.body.owner_id; }
    const cols = Object.keys(o); const vals = cols.map(c => o[c]);
    const p = await one(`INSERT INTO prospects(owner_id,${cols.join(',')}) VALUES($1,${cols.map((_, i) => '$' + (i + 2)).join(',')}) RETURNING id`, [owner, ...vals]);
    await history(p.id, req.user.id, 'edit', 'Prospecto registrado');
    res.status(201).json({ id: p.id });
  }));

  const PROSPECT_COLS = 'p.id,p.owner_id,p.company,p.website,p.gbp_url,p.city,p.state,p.address,p.service_area,p.category,p.services,p.contact_name,p.contact_email,p.contact_phone,p.notes,p.pipeline_status,p.next_action,p.next_action_at,p.eligibility_status,p.eligibility_reason,p.eligibility_evidence,p.eligibility_checked_at,p.is_demo,p.created_at,p.updated_at,(p.logo_data IS NOT NULL) AS has_logo';
  async function loadProspect(req) {
    const p = await auth.getVisibleProspect(req.user, req.params.id, PROSPECT_COLS);
    if (!p) throw bad('Prospecto no encontrado', 404);
    return p;
  }
  app.get('/api/prospects/:id', need(), wrap(async (req, res) => {
    const p = await loadProspect(req);
    const owner = await one('SELECT id,name,email FROM users WHERE id=$1', [p.owner_id]);
    const [audits, competitors, keywords, gbp, reports, hist] = await Promise.all([
      many(`SELECT id,status,progress,error,created_at,finished_at,summary->>'health' AS health FROM audits WHERE prospect_id=$1 ORDER BY created_at DESC LIMIT 20`, [p.id]),
      many('SELECT id,name,website,gbp_url,rating,reviews,primary_category,source,fetched_at FROM competitors WHERE prospect_id=$1 ORDER BY id', [p.id]),
      many('SELECT * FROM keywords WHERE prospect_id=$1 ORDER BY id', [p.id]),
      one('SELECT id,source,fetched_at,data FROM gbp_snapshots WHERE prospect_id=$1 ORDER BY fetched_at DESC LIMIT 1', [p.id]),
      many('SELECT id,audit_id,kind,include_prospect_logo,created_at FROM reports WHERE prospect_id=$1 ORDER BY created_at DESC', [p.id]),
      many('SELECT h.*,u.name AS user_name FROM prospect_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.prospect_id=$1 ORDER BY h.created_at DESC LIMIT 200', [p.id])]);
    res.json({ prospect: p, owner, audits, competitors, keywords, gbp, reports, history: hist, pipeline: PIPELINE });
  }));
  app.patch('/api/prospects/:id', need(), wrap(async (req, res) => {
    const p = await loadProspect(req); const o = readProspectBody(req.body, true);
    const cols = Object.keys(o); if (!cols.length) throw bad('Nada que actualizar');
    await q(`UPDATE prospects SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1`, [p.id, ...cols.map(c => o[c])]);
    const websiteChanged = ('website' in o && o.website !== p.website) || ('gbp_url' in o && o.gbp_url !== p.gbp_url);
    if (websiteChanged) await q(`UPDATE prospects SET eligibility_status='pendiente', eligibility_reason='Datos modificados: revalidar elegibilidad' WHERE id=$1`, [p.id]);
    await history(p.id, req.user.id, 'edit', 'Datos del prospecto actualizados: ' + cols.join(', '));
    res.json({ ok: true });
  }));
  app.post('/api/prospects/:id/reassign', need('admin', 'supervisor'), wrap(async (req, res) => {
    const p = await loadProspect(req); const allowed = await auth.assignableUsers(req.user);
    const target = allowed.find(u => u.id === req.body.owner_id); if (!target) throw bad('Reasignación no autorizada', 403);
    const prev = await one('SELECT name FROM users WHERE id=$1', [p.owner_id]);
    await q('UPDATE prospects SET owner_id=$2, updated_at=now() WHERE id=$1', [p.id, target.id]);
    await history(p.id, req.user.id, 'reassign', `Reasignado de ${prev.name} a ${target.name}`, prev.name, target.name);
    res.json({ ok: true });
  }));
  app.post('/api/prospects/:id/status', need(), wrap(async (req, res) => {
    const p = await loadProspect(req); const to = req.body.status;
    if (!PIPELINE.includes(to)) throw bad('Estado inválido');
    if (to === 'Calificado' && p.eligibility_status !== 'calificado') throw bad('Solo puede marcarse Calificado si la validación de elegibilidad lo confirma');
    await q('UPDATE prospects SET pipeline_status=$2, next_action=COALESCE($3,next_action), next_action_at=COALESCE($4,next_action_at), updated_at=now() WHERE id=$1', [p.id, to, str(req.body.next_action, 300), req.body.next_action_at || null]);
    await history(p.id, req.user.id, 'status_change', str(req.body.note, 1000) || `Estado: ${p.pipeline_status} → ${to}`, p.pipeline_status, to);
    res.json({ ok: true });
  }));
  app.post('/api/prospects/:id/notes', need(), wrap(async (req, res) => { const p = await loadProspect(req); const n = str(req.body.note, 4000); if (!n) throw bad('Nota vacía'); await history(p.id, req.user.id, 'note', n); res.json({ ok: true }); }));
  app.post('/api/prospects/:id/logo', need(), wrap(async (req, res) => {
    const p = await loadProspect(req); if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('Envíe PNG o JPEG (Content-Type image/png|image/jpeg)');
    await q('UPDATE prospects SET logo_mime=$2, logo_data=$3 WHERE id=$1', [p.id, req.headers['content-type'], req.body]); await history(p.id, req.user.id, 'edit', 'Logo del prospecto cargado'); res.json({ ok: true });
  }));
  app.get('/api/prospects/:id/logo', need(), wrap(async (req, res) => { await loadProspect(req); const r = await one('SELECT logo_mime,logo_data FROM prospects WHERE id=$1', [req.params.id]); if (!r?.logo_data) throw bad('Sin logo', 404); res.type(r.logo_mime).send(r.logo_data); }));

  // ---------- Elegibilidad ----------
  app.post('/api/prospects/:id/eligibility', need(), wrap(async (req, res) => {
    const p = await loadProspect(req);
    const full = await one('SELECT * FROM prospects WHERE id=$1', [p.id]);
    const r = await checkEligibility(full, { userId: req.user.id, prospectId: p.id, usePlaces: !!req.body.usePlaces, confirmed: !!req.body.confirmed });
    await q('UPDATE prospects SET eligibility_status=$2, eligibility_reason=$3, eligibility_evidence=$4, eligibility_checked_at=now(), updated_at=now() WHERE id=$1', [p.id, r.status, r.reason, r.evidence]);
    const newPipe = r.status === 'calificado' ? 'Calificado' : r.status === 'no_calificado' ? 'No calificado' : null;
    if (newPipe && ['Nuevo', 'Calificado', 'No calificado'].includes(p.pipeline_status) && p.pipeline_status !== newPipe) { await q('UPDATE prospects SET pipeline_status=$2 WHERE id=$1', [p.id, newPipe]); await history(p.id, req.user.id, 'status_change', `Estado: ${p.pipeline_status} → ${newPipe} (elegibilidad)`, p.pipeline_status, newPipe); }
    await history(p.id, req.user.id, 'eligibility', `Elegibilidad: ${r.status}. ${r.reason}`);
    res.json(r);
  }));

  // ---------- Auditoría ----------
  app.post('/api/prospects/:id/audit', need(), wrap(async (req, res) => {
    const p = await loadProspect(req);
    if (p.eligibility_status === 'pendiente') throw bad('Valide primero la elegibilidad del prospecto', 409);
    if (p.eligibility_status === 'no_calificado') throw bad(`Prospecto no calificado: ${p.eligibility_reason}. La auditoría completa está detenida.`, 409);
    if (p.eligibility_status === 'revision_manual') {
      if (!(req.body.manualOverride && ['admin', 'supervisor'].includes(req.user.role) && str(req.body.overrideReason))) throw bad('Revisión manual necesaria: un administrador/supervisor debe aprobarla indicando el motivo (manualOverride + overrideReason).', 409);
      await history(p.id, req.user.id, 'eligibility', 'Revisión manual aprobada: ' + str(req.body.overrideReason, 500));
    }
    const active = await one(`SELECT id FROM audits WHERE prospect_id=$1 AND status IN ('pendiente','en_proceso')`, [p.id]);
    if (active) throw bad('Ya hay una auditoría en curso para este prospecto', 409);
    const recent = await one(`SELECT id FROM audits WHERE prospect_id=$1 AND status IN ('completado','parcial') AND created_at>now()-interval '6 hours'`, [p.id]);
    if (recent && !req.body.force) throw bad('Existe una auditoría de las últimas 6 horas (evita duplicar análisis). Envíe force:true para repetirla.', 409);
    const cfg = {}; if (req.body.crawl) for (const k of ['maxPages', 'maxDepth']) if (Number.isInteger(req.body.crawl[k])) cfg[k] = Math.min(req.body.crawl[k], k === 'maxPages' ? 60 : 3);
    const a = await one(`INSERT INTO audits(prospect_id,requested_by,config) VALUES($1,$2,$3) RETURNING id`, [p.id, req.user.id, { crawl: cfg }]);
    await enqueueAudit(a.id); res.status(202).json({ auditId: a.id, status: 'pendiente' });
  }));
  async function loadAudit(req) {
    if (!uuid(req.params.id)) throw bad('ID inválido');
    const [cond, params] = auth.visibleProspects(req.user, 'p', 2);
    const a = await one(`SELECT a.* FROM audits a JOIN prospects p ON p.id=a.prospect_id WHERE a.id=$1 AND ${cond}`, [req.params.id, ...params]);
    if (!a) throw bad('Auditoría no encontrada', 404); return a;
  }
  app.get('/api/audits/:id', need(), wrap(async (req, res) => {
    const a = await loadAudit(req);
    const findings = await many(`SELECT * FROM findings WHERE audit_id=$1 ORDER BY score DESC NULLS LAST`, [a.id]);
    const pages = await many('SELECT url,status,final_url,depth,data FROM audit_pages WHERE audit_id=$1 ORDER BY id', [a.id]);
    res.json({ audit: a, findings, pages });
  }));
  app.get('/api/prospects/:id/compare', need(), wrap(async (req, res) => {
    const p = await loadProspect(req); const { a, b } = req.query;
    if (!uuid(a) || !uuid(b)) throw bad('Indique dos auditorías (a, b)');
    const get = async id => { const au = await one(`SELECT id,created_at,summary->>'health' AS health FROM audits WHERE id=$1 AND prospect_id=$2`, [id, p.id]); if (!au) throw bad('Auditoría no encontrada', 404); au.findings = await many('SELECT code,url,title,severity FROM findings WHERE audit_id=$1', [id]); return au; };
    const [A, B] = await Promise.all([get(a), get(b)]);
    const key = f => f.code + '|' + (f.url || ''); const ka = new Set(A.findings.map(key)), kb = new Set(B.findings.map(key));
    res.json({ a: { id: A.id, created_at: A.created_at, health: A.health, total: A.findings.length }, b: { id: B.id, created_at: B.created_at, health: B.health, total: B.findings.length },
      resolved: A.findings.filter(f => !kb.has(key(f))), new: B.findings.filter(f => !ka.has(key(f))), persisting: B.findings.filter(f => ka.has(key(f))).length });
  }));

  // ---------- GBP, competidores, keywords ----------
  app.get('/api/providers', need(), wrap(async (req, res) => {
    res.json({ providers: [
      { id: 'pagespeed', ...PROVIDER_COSTS.pagespeed, configured: config.providers.pagespeedEnabled, note: config.providers.pagespeedKey ? 'Con clave' : 'Sin clave (cuota anónima limitada)' },
      { id: 'google_places', ...PROVIDER_COSTS.google_places, configured: placesConfigured() },
      { id: 'dataforseo', ...PROVIDER_COSTS.dataforseo, configured: false, note: 'Integración pendiente (keywords/rankings). Carga manual disponible.' },
      { id: 'google_business_profile_api', paid: false, configured: false, label: 'Business Profile API (datos privados)', note: 'Pendiente: requiere acceso aprobado por Google y autorización del propietario.' },
      { id: 'search_console', paid: false, configured: false, label: 'Search Console', note: 'Pendiente: requiere OAuth del propietario del sitio.' }],
      monthSpendUsd: await monthSpend(req.user.id), monthlyLimitUsd: config.defaultMonthlyCostLimitUsd });
  }));
  app.post('/api/prospects/:id/gbp/fetch', need(), wrap(async (req, res) => {
    const p = await loadProspect(req); const full = await one('SELECT * FROM prospects WHERE id=$1', [p.id]);
    const ctx = { userId: req.user.id, prospectId: p.id, confirmed: !!req.body.confirmed };
    const r = await findProspectPlace(full, ctx);
    if (!r.best) return res.status(404).json({ error: 'Google Places no devolvió un perfil que coincida por website o teléfono. No se guardó nada.', candidates: r.candidates.map(c => ({ name: c.name, address: c.address, website: c.website })) });
    await q('INSERT INTO gbp_snapshots(prospect_id,source,data,fetched_at) VALUES($1,$2,$3,$4)', [p.id, 'google_places', r.best, r.fetchedAt]);
    await history(p.id, req.user.id, 'edit', `Datos públicos de GBP obtenidos (${r.source})`); res.json({ gbp: r.best, cached: r.cached, fetchedAt: r.fetchedAt });
  }));
  app.post('/api/prospects/:id/competitors/discover', need(), wrap(async (req, res) => {
    const p = await loadProspect(req); const full = await one('SELECT * FROM prospects WHERE id=$1', [p.id]);
    const snap = await one('SELECT data FROM gbp_snapshots WHERE prospect_id=$1 ORDER BY fetched_at DESC LIMIT 1', [p.id]);
    const r = await findCompetitors(full, snap?.data?.placeId, { userId: req.user.id, prospectId: p.id, confirmed: !!req.body.confirmed }, Math.min(Number(req.body.count) || 3, 10));
    for (const c of r.competitors) await q('INSERT INTO competitors(prospect_id,name,website,gbp_url,place_id,rating,reviews,primary_category,source,fetched_at,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [p.id, c.name, c.website, c.mapsUrl, c.placeId, c.rating, c.reviews, c.primaryCategory, 'google_places', r.fetchedAt, c]);
    res.json({ added: r.competitors.length, query: r.query });
  }));
  app.post('/api/prospects/:id/competitors', need(), wrap(async (req, res) => {
    const p = await loadProspect(req); const b = req.body; if (!str(b.name)) throw bad('Nombre requerido');
    const num = (v, int) => v === '' || v == null ? null : int ? parseInt(v, 10) : Number(v);
    await q('INSERT INTO competitors(prospect_id,name,website,gbp_url,rating,reviews,primary_category,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [p.id, str(b.name, 200), str(b.website), str(b.gbp_url), num(b.rating), num(b.reviews, true), str(b.primary_category, 120), 'manual']);
    res.status(201).json({ ok: true });
  }));
  app.delete('/api/prospects/:id/competitors/:cid', need(), wrap(async (req, res) => { const p = await loadProspect(req); await q('DELETE FROM competitors WHERE id=$1 AND prospect_id=$2', [parseInt(req.params.cid, 10) || 0, p.id]); res.json({ ok: true }); }));
  app.post('/api/prospects/:id/keywords', need(), wrap(async (req, res) => {
    const p = await loadProspect(req); const b = req.body; if (!str(b.keyword)) throw bad('Keyword requerida');
    const num = v => v === '' || v == null ? null : parseInt(v, 10);
    const pos = num(b.position);
    await q('INSERT INTO keywords(prospect_id,keyword,intent,volume,difficulty,position,position_kind,url,location,priority,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [p.id, str(b.keyword, 200), str(b.intent, 60), num(b.volume), num(b.difficulty), pos, pos != null ? (b.position_kind === 'estimada' ? 'estimada' : 'observada') : null, str(b.url), str(b.location, 120), str(b.priority, 30), 'manual']);
    res.status(201).json({ ok: true });
  }));
  app.delete('/api/prospects/:id/keywords/:kid', need(), wrap(async (req, res) => { const p = await loadProspect(req); await q('DELETE FROM keywords WHERE id=$1 AND prospect_id=$2', [parseInt(req.params.kid, 10) || 0, p.id]); res.json({ ok: true }); }));

  // ---------- Reportes PDF ----------
  app.post('/api/audits/:id/report', need(), wrap(async (req, res) => {
    const a = await loadAudit(req); if (!['completado', 'parcial'].includes(a.status)) throw bad('La auditoría aún no está completa', 409);
    const kind = req.body.kind === 'tecnico' ? 'tecnico' : 'comercial';
    const prospect = await one('SELECT * FROM prospects WHERE id=$1', [a.prospect_id]);
    const owner = await one('SELECT name,email FROM users WHERE id=$1', [prospect.owner_id]);
    const logoRow = await one(`SELECT data FROM brand_assets WHERE key='logo'`);
    const includeProspectLogo = !!req.body.includeProspectLogo && !!prospect.logo_data;
    const findings = (await many('SELECT * FROM findings WHERE audit_id=$1 ORDER BY score DESC', [a.id])).map(f => ({ ...f, confidence: Number(f.confidence), score: Number(f.score) }));
    const pages = await many('SELECT url,status FROM audit_pages WHERE audit_id=$1 ORDER BY id', [a.id]);
    const competitors = await many('SELECT * FROM competitors WHERE prospect_id=$1 ORDER BY id', [prospect.id]);
    const keywords = await many('SELECT * FROM keywords WHERE prospect_id=$1 ORDER BY id', [prospect.id]);
    const pdf = await generateReport(kind, { prospect, audit: a, findings, competitors, keywords, owner, pages, logo: logoRow?.data, prospectLogo: prospect.logo_data, includeProspectLogo });
    const r = await one('INSERT INTO reports(prospect_id,audit_id,kind,generated_by,include_prospect_logo,pdf) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [prospect.id, a.id, kind, req.user.id, includeProspectLogo, pdf]);
    await history(prospect.id, req.user.id, 'report', `Reporte ${kind} generado`);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="diagnostico-${kind}.pdf"`, 'X-Report-Id': r.id }).send(pdf);
  }));
  app.get('/api/reports/:id', need(), wrap(async (req, res) => {
    if (!uuid(req.params.id)) throw bad('ID inválido');
    const [cond, params] = auth.visibleProspects(req.user, 'p', 2);
    const r = await one(`SELECT r.pdf,r.kind FROM reports r JOIN prospects p ON p.id=r.prospect_id WHERE r.id=$1 AND ${cond}`, [req.params.id, ...params]);
    if (!r) throw bad('Reporte no encontrado', 404);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="diagnostico-${r.kind}.pdf"` }).send(r.pdf);
  }));

  // ---------- Marca y costos ----------
  app.post('/api/admin/logo', need('admin'), wrap(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('Envíe el logotipo oficial como PNG o JPEG');
    await q(`INSERT INTO brand_assets(key,mime,data,updated_by) VALUES('logo',$1,$2,$3) ON CONFLICT (key) DO UPDATE SET mime=$1,data=$2,updated_by=$3,updated_at=now()`, [req.headers['content-type'], req.body, req.user.id]);
    res.json({ ok: true });
  }));
  app.get('/api/brand/logo', wrap(async (req, res) => { const r = await one(`SELECT mime,data FROM brand_assets WHERE key='logo'`); if (!r) return res.status(404).end(); res.type(r.mime).send(r.data); }));
  app.get('/api/admin/costs', need('admin', 'supervisor'), wrap(async (req, res) => {
    const where = req.user.role === 'admin' ? 'TRUE' : '(u.id=$1 OR u.supervisor_id=$1)'; const params = req.user.role === 'admin' ? [] : [req.user.id];
    res.json({ byProvider: await many(`SELECT pu.provider, count(*)::int AS calls, count(*) FILTER (WHERE pu.cached)::int AS cached_calls, COALESCE(sum(pu.est_cost_usd),0)::float AS est_cost_usd FROM provider_usage pu JOIN users u ON u.id=pu.user_id WHERE ${where} AND pu.created_at>=date_trunc('month',now()) GROUP BY pu.provider`, params),
      byUser: await many(`SELECT u.name, COALESCE(sum(pu.est_cost_usd),0)::float AS est_cost_usd, count(pu.id)::int AS calls FROM users u LEFT JOIN provider_usage pu ON pu.user_id=u.id AND pu.created_at>=date_trunc('month',now()) WHERE ${where} GROUP BY u.name ORDER BY 2 DESC`, params) });
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
  app.use((err, req, res, next) => {
    const status = err.status || (err instanceof UrlError ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno' : err.message, code: err.code, estUsd: err.estUsd });
  });
  return app;
}
