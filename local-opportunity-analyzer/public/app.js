// SPA sin dependencias. El contenido dinámico se inserta con nodos DOM y textContent (nunca HTML en cadena)
// para evitar XSS con datos provenientes de sitios rastreados.
const $app = document.getElementById('app');
const state = { user: null, view: 'prospects', prospectId: null, tab: 'resumen', auditId: null, editing: false };
const ES = { calificado: 'Calificado', no_calificado: 'No calificado', revision_manual: 'Revisión manual necesaria', pendiente: 'Pendiente', completado: 'Completado', parcial: 'Parcial', en_proceso: 'En proceso', fallido: 'Fallido',
  quick_win: 'Quick Win', prioridad_alta: 'Prioridad alta', crecimiento_estrategico: 'Crecimiento estratégico', informativo: 'Informativo', critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja', info: 'Info' };

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value') el.value = v;
    else if (k === 'selected' || k === 'checked' || k === 'disabled') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const badge = (v, cls) => h('span', { class: `badge b-${cls || v}` }, ES[v] || v);
const fmt = d => (d ? new Date(d).toLocaleString('es-US', { dateStyle: 'medium', timeStyle: 'short' }) : '');
async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: { 'X-Requested-With': 'vip-analyzer' }, credentials: 'same-origin' };
  if (opts.body instanceof Blob) { o.body = opts.body; o.headers['Content-Type'] = opts.body.type; }
  else if (opts.body) { o.body = JSON.stringify(opts.body); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch('/api' + path, o);
  if (opts.raw) { if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => ({}))).error || 'Error'), { status: r.status }); return r; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Error'), { status: r.status, code: j.code, estUsd: j.estUsd });
  return j;
}
const toast = (root, msg, cls = 'err') => { const e = h('div', { class: cls }, msg); root.prepend(e); setTimeout(() => e.remove(), 9000); };
const confirmCost = async fn => {
  try { return await fn(false); }
  catch (e) { if (e.code === 'confirmation_required' && confirm(`${e.message}\n\n¿Autoriza este gasto?`)) return fn(true); throw e; }
};

// ---------------- Layout ----------------
async function boot() { const { user } = await api('/me'); state.user = user; render(); }
function render() { $app.replaceChildren(); $app.append(state.user ? shell() : loginView()); }
function shell() {
  const logo = h('img', { src: '/api/brand/logo', alt: '', onerror: ev => ev.target.remove() });
  const nav = (v, t) => h('button', { class: 'nav' + (state.view === v ? ' on' : ''), onclick: () => { state.view = v; state.prospectId = null; render(); } }, t);
  const main = h('main');
  const top = h('header', { class: 'top' }, h('div', { class: 'brand' }, logo, 'VIP Tech Local Opportunity Analyzer'),
    h('nav', {}, nav('prospects', 'Prospectos'), state.user.role !== 'ejecutivo' && nav('users', 'Usuarios'), nav('costs', 'Proveedores y costos'), state.user.role === 'admin' && nav('brand', 'Marca')),
    h('span', { class: 'who' }, `${state.user.name} · ${state.user.role}`),
    h('button', { class: 'sec', onclick: async () => { await api('/logout', { method: 'POST' }); state.user = null; render(); } }, 'Salir'));
  const wrap = h('div', {}, top, main, h('div', { class: 'foot' }, 'Powered by VIP Tech Consulting'));
  const views = { prospects: prospectsView, users: usersView, costs: costsView, brand: brandView };
  (state.prospectId ? prospectView : views[state.view])(main);
  return wrap;
}
function loginView() {
  const err = h('div'); const email = h('input', { type: 'email', autocomplete: 'username' }); const pw = h('input', { type: 'password', autocomplete: 'current-password' });
  const go = async () => { try { const { user } = await api('/login', { method: 'POST', body: { email: email.value, password: pw.value } }); state.user = user; render(); } catch (er) { err.replaceChildren(h('div', { class: 'err' }, er.message)); } };
  pw.addEventListener('keydown', ev => { if (ev.code === 'Enter') go(); });
  return h('div', { class: 'login card' }, h('img', { src: '/api/brand/logo', alt: '', style: 'height:44px', onerror: ev => ev.target.remove() }),
    h('h2', {}, 'VIP Tech Local Opportunity Analyzer'), h('p', { class: 'muted' }, 'Acceso para el equipo comercial'), err,
    h('label', {}, 'Email'), email, h('label', {}, 'Contraseña'), pw, h('p'), h('button', { onclick: go }, 'Ingresar'));
}

// ---------------- Prospectos ----------------
async function prospectsView(root) {
  const list = h('div'); const status = h('select', {}, h('option', { value: '' }, 'Todos los estados')); const search = h('input', { placeholder: 'Buscar empresa o website' });
  const load = async () => {
    const qs = new URLSearchParams({ ...(status.value && { status: status.value }), ...(search.value && { q: search.value }) });
    const { prospects, pipeline } = await api(`/prospects?${qs}`);
    if (status.options.length === 1) pipeline.forEach(s => status.append(h('option', { value: s }, s)));
    list.replaceChildren(prospects.length
      ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Empresa', 'Ciudad', 'Ejecutivo', 'Estado', 'Elegibilidad', 'Salud técnica', 'Actualizado'].map(t => h('th', {}, t)))),
        h('tbody', {}, prospects.map(p => h('tr', { class: 'click', onclick: () => { state.prospectId = p.id; state.tab = 'resumen'; state.auditId = null; render(); } },
          h('td', {}, p.company, ' ', p.is_demo && h('span', { class: 'demo' }, 'DEMO')), h('td', {}, [p.city, p.state].filter(Boolean).join(', ')), h('td', {}, p.owner_name),
          h('td', {}, p.pipeline_status), h('td', {}, badge(p.eligibility_status)), h('td', {}, p.health != null ? `${p.health}/100` : '—'), h('td', {}, fmt(p.updated_at)))))))
      : h('p', { class: 'muted' }, 'No hay prospectos todavía.'));
  };
  status.addEventListener('change', load);
  search.addEventListener('input', () => { clearTimeout(search._t); search._t = setTimeout(load, 300); });
  root.append(h('div', { class: 'row' }, h('h2', {}, 'Prospectos'), h('span', { class: 'spacer' }), h('button', { onclick: () => { state.prospectId = 'new'; render(); } }, '+ Registrar prospecto')),
    h('div', { class: 'row' }, status, search), h('div', { class: 'card' }, list));
  await load();
}

function prospectForm(root, p, owners, onSave) {
  const f = {};
  const inp = (k, label, ph, type = 'text') => { f[k] = h('input', { type, placeholder: ph || '', value: Array.isArray(p?.[k]) ? p[k].join(', ') : (p?.[k] ?? '') }); return [h('label', {}, label), f[k]]; };
  const notes = h('textarea', { rows: 3 }, p?.notes || '');
  const ownerSel = owners?.length > 1 ? h('select', {}, owners.map(o => h('option', { value: o.id, selected: o.id === (p?.owner_id || state.user.id) }, `${o.name} (${o.role})`))) : null;
  const err = h('div');
  root.append(h('div', { class: 'card' }, h('h2', {}, p ? 'Editar prospecto' : 'Registrar prospecto'), err,
    h('div', { class: 'grid g2' },
      h('div', {}, inp('company', 'Empresa *'), inp('website', 'Website (requerido para calificar)', 'https://'), inp('gbp_url', 'URL de Google Business Profile / Maps (requerido)', 'https://maps.app.goo.gl/...'), inp('category', 'Categoría'), inp('services', 'Servicios (separados por coma)')),
      h('div', {}, inp('city', 'Ciudad'), inp('state', 'Estado'), inp('address', 'Dirección'), inp('service_area', 'Zona de servicio'), inp('contact_name', 'Contacto'), inp('contact_email', 'Email de contacto', '', 'email'), inp('contact_phone', 'Teléfono (NAP)'))),
    ownerSel && [h('label', {}, 'Ejecutivo responsable'), ownerSel], h('label', {}, 'Notas'), notes, h('p'),
    h('div', { class: 'row' },
      h('button', { onclick: async () => {
        const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value])); body.notes = notes.value; if (ownerSel) body.owner_id = ownerSel.value;
        try { await onSave(body); } catch (er) { err.replaceChildren(h('div', { class: 'err' }, er.message)); } } }, 'Guardar'),
      h('button', { class: 'sec', onclick: () => { if (!p) state.prospectId = null; render(); } }, 'Cancelar'))));
}

async function prospectView(root) {
  if (state.prospectId === 'new') {
    const { users } = await api('/assignable-users');
    return prospectForm(root, null, users, async body => { const { id } = await api('/prospects', { method: 'POST', body }); state.prospectId = id; state.tab = 'resumen'; render(); });
  }
  let d;
  try { d = await api(`/prospects/${state.prospectId}`); }
  catch (er) { root.append(h('div', { class: 'err' }, er.message), h('button', { onclick: () => { state.prospectId = null; render(); } }, 'Volver')); return; }
  const p = d.prospect; const reload = () => render(); const msg = h('div');
  root.append(h('div', { class: 'row' }, h('button', { class: 'sec', onclick: () => { state.prospectId = null; render(); } }, '← Prospectos'), h('h2', {}, p.company), p.is_demo && h('span', { class: 'demo' }, 'DEMO'),
    badge(p.eligibility_status), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, 'Ejecutivo responsable: '), h('b', {}, d.owner.name)), msg);
  const tabs = [['resumen', 'Resumen y elegibilidad'], ['auditoria', 'Auditoría y dashboard'], ['competencia', 'GBP, competencia y keywords'], ['seguimiento', 'Seguimiento'], ['reportes', 'Reportes']];
  root.append(h('div', { class: 'tabs' }, tabs.map(([k, t]) => h('button', { class: state.tab === k ? 'on' : '', onclick: () => { state.tab = k; render(); } }, t))));
  const body = h('div'); root.append(body);
  ({ resumen: tabResumen, auditoria: tabAuditoria, competencia: tabCompetencia, seguimiento: tabSeguimiento, reportes: tabReportes })[state.tab](body, d, msg, reload);
}

const kv = rows => h('table', {}, h('tbody', {}, rows.filter(r => r[1]).map(([k, v]) => h('tr', {}, h('th', { style: 'width:170px' }, k), h('td', {}, v)))));

function tabResumen(root, d, msg, reload) {
  const p = d.prospect; const ev = p.eligibility_evidence;
  if (state.editing) { state.editing = false; return prospectForm(root, p, null, async body => { await api(`/prospects/${p.id}`, { method: 'PATCH', body }); reload(); }); }
  const usePlaces = h('input', { type: 'checkbox', style: 'width:auto' });
  root.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', {}, 'Ficha'), h('span', { class: 'spacer' }), h('button', { class: 'sec', onclick: () => { state.editing = true; reload(); } }, 'Editar')),
      kv([['Website', p.website], ['GBP / Maps', p.gbp_url], ['Ciudad / Estado', [p.city, p.state].filter(Boolean).join(', ')], ['Dirección', p.address], ['Zona de servicio', p.service_area], ['Categoría', p.category],
        ['Servicios', (p.services || []).join(', ')], ['Contacto', [p.contact_name, p.contact_email, p.contact_phone].filter(Boolean).join(' · ')], ['Estado comercial', p.pipeline_status], ['Notas', p.notes]])),
    h('div', { class: 'card' }, h('h3', {}, 'Elegibilidad'), h('p', {}, badge(p.eligibility_status), ' ', p.eligibility_reason || 'Aún no validada.'), p.eligibility_checked_at && h('p', { class: 'muted' }, 'Verificado: ' + fmt(p.eligibility_checked_at)),
      h('div', { class: 'row' },
        h('button', { onclick: async ev2 => { ev2.target.disabled = true; try { await confirmCost(c => api(`/prospects/${p.id}/eligibility`, { method: 'POST', body: { usePlaces: usePlaces.checked, confirmed: c } })); reload(); } catch (er) { toast(msg, er.message); ev2.target.disabled = false; } } }, 'Validar elegibilidad'),
        h('label', { style: 'margin:0' }, usePlaces, ' Verificar también con Google Places (costo)')),
      ev && h('details', { class: 'f' }, h('summary', {}, 'Ver evidencia'), h('pre', {}, JSON.stringify(ev, null, 2))))));
}

function sevBars(findings) {
  const sev = ['critica', 'alta', 'media', 'baja', 'info']; const colors = { critica: 'var(--bad)', alta: 'var(--o)', media: 'var(--warn)', baja: 'var(--g)', info: '#9ca3af' };
  const counts = sev.map(s => findings.filter(f => f.severity === s).length); const max = Math.max(1, ...counts);
  return h('div', {}, sev.map((s, i) => h('div', { class: 'bar' }, h('span', { class: 'lbl' }, ES[s]), h('i', { style: `width:${Math.round(200 * counts[i] / max)}px;background:${colors[s]}` }), counts[i])));
}
function ring(v) {
  const r = 40; const c = 2 * Math.PI * r; const NS = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('class', 'ring');
  const mk = a => { const e = document.createElementNS(NS, 'circle'); for (const [k, x] of Object.entries(a)) e.setAttribute(k, x); return e; };
  s.append(mk({ cx: 50, cy: 50, r, fill: 'none', stroke: '#e2e4e6', 'stroke-width': 10 }), mk({ cx: 50, cy: 50, r, fill: 'none', stroke: '#FF5011', 'stroke-width': 10, 'stroke-dasharray': `${c * v / 100} ${c}`, transform: 'rotate(-90 50 50)' }));
  const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 50); t.setAttribute('y', 56); t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', 22); t.setAttribute('font-weight', 700); t.textContent = v; s.append(t);
  return s;
}
function findingNode(f) {
  return h('details', { class: 'f' },
    h('summary', {}, h('span', { class: `badge sev-${f.severity}` }, ES[f.severity]), ' ', h('b', {}, f.title), ' ', h('span', { class: 'muted' }, `· ${ES[f.category]} · puntaje ${f.score}`)),
    h('p', {}, f.explanation), f.url && h('p', {}, 'URL: ', /^https?:/.test(f.url) ? h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.url) : f.url),
    h('p', {}, h('b', {}, 'Acción: '), f.action), f.benefit && h('p', {}, h('b', {}, 'Beneficio posible: '), f.benefit),
    h('p', { class: 'muted' }, `Impacto ${f.impact}/5 · Esfuerzo ${f.effort}/5 · Relevancia ${f.relevance}/5 · Confianza ${Math.round(f.confidence * 100)}% · Fuente: ${f.source} · ${fmt(f.observed_at)}`),
    h('details', {}, h('summary', { class: 'muted' }, 'Evidencia y cálculo del puntaje'), h('pre', {}, JSON.stringify({ evidencia: f.evidence, puntaje: f.score_detail }, null, 2))));
}

async function tabAuditoria(root, d, msg, reload) {
  const p = d.prospect; const latest = d.audits[0];
  const startAudit = async ev2 => {
    ev2.target.disabled = true;
    try { await api(`/prospects/${p.id}/audit`, { method: 'POST', body: { force: false } }); state.auditId = null; reload(); }
    catch (er) {
      if (er.status === 409 && /6 horas/.test(er.message) && confirm(er.message)) { await api(`/prospects/${p.id}/audit`, { method: 'POST', body: { force: true } }); state.auditId = null; return reload(); }
      if (er.status === 409 && /Revisión manual/.test(er.message) && ['admin', 'supervisor'].includes(state.user.role)) {
        const reason = prompt('Revisión manual: indique el motivo para aprobar la auditoría');
        if (reason) { try { await api(`/prospects/${p.id}/audit`, { method: 'POST', body: { manualOverride: true, overrideReason: reason } }); state.auditId = null; return reload(); } catch (e2) { toast(msg, e2.message); } }
      } else toast(msg, er.message);
      ev2.target.disabled = false;
    }
  };
  root.append(h('div', { class: 'row' }, h('button', { onclick: startAudit }, latest ? 'Ejecutar nueva auditoría' : 'Ejecutar auditoría'), h('span', { class: 'muted' }, 'Rastreo acotado (≈25 páginas, profundidad 2) con pausas entre solicitudes.')));
  if (!latest) return root.append(h('p', { class: 'info' }, p.eligibility_status === 'calificado' ? 'Sin auditorías todavía.' : 'La auditoría completa requiere que el prospecto esté calificado (valide la elegibilidad primero).'));
  const aid = state.auditId && d.audits.some(a => a.id === state.auditId) ? state.auditId : latest.id;
  if (d.audits.length > 1) {
    const sel = h('select', {}, d.audits.map(a => h('option', { value: a.id, selected: a.id === aid }, `${fmt(a.created_at)} — ${ES[a.status]}${a.health ? ' — salud ' + a.health : ''}`)));
    sel.addEventListener('change', () => { state.auditId = sel.value; reload(); });
    root.append(h('div', { class: 'row' }, h('label', {}, 'Auditoría:'), sel,
      h('button', { class: 'sec', onclick: async () => { const r = await api(`/prospects/${p.id}/compare?a=${d.audits[1].id}&b=${d.audits[0].id}`); alert(`Comparación (anterior → última)\nSalud: ${r.a.health} → ${r.b.health}\nResueltos: ${r.resolved.length}\nNuevos: ${r.new.length}\nPersisten: ${r.persisting}`); } }, 'Comparar las 2 últimas')));
  }
  const box = h('div'); root.append(box);
  const load = async () => {
    const { audit, findings } = await api(`/audits/${aid}`);
    if (['pendiente', 'en_proceso'].includes(audit.status)) { box.replaceChildren(h('div', { class: 'info' }, `Auditoría ${ES[audit.status].toLowerCase()}… ${audit.progress || ''}`)); setTimeout(() => { if (document.body.contains(box)) load(); }, 2500); return; }
    if (audit.status === 'fallido') return box.replaceChildren(h('div', { class: 'err' }, 'Auditoría fallida: ' + audit.error));
    const s = audit.summary || {}; const psi = s.pagespeed || {}; const cats = ['quick_win', 'prioridad_alta', 'crecimiento_estrategico'];
    const impl = s.projection?.implementation; const impr = s.projection?.improvement;
    box.replaceChildren(h('div', {},
      audit.status === 'parcial' && h('div', { class: 'info' }, 'Resultados parciales.'),
      h('div', { class: 'grid g4' }, h('div', { class: 'kpi' }, ring(s.health ?? 0), h('span', {}, 'Salud técnica del sitio (0–100)')), h('div', { class: 'kpi' }, h('b', {}, s.pagesCrawled), h('span', {}, `Páginas rastreadas (${s.pagesBroken} con error)`)),
        h('div', { class: 'kpi' }, h('b', {}, s.byCategory?.quick_win || 0), h('span', {}, 'Quick Wins')), h('div', { class: 'kpi' }, h('b', {}, psi.performanceScore ?? 'n/d'), h('span', {}, 'PageSpeed móvil (laboratorio)'))),
      h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h3', {}, 'Problemas por severidad'), sevBars(findings)),
        h('div', { class: 'card' }, h('h3', {}, 'Fuentes y notas'), h('p', { class: 'muted' }, 'Fuentes: ' + (s.sources || []).join('; ')), (s.notes || []).map(n => h('p', { class: 'muted' }, '• ' + n)), h('p', { class: 'muted' }, 'Fecha: ' + fmt(audit.finished_at)))),
      cats.map(c => h('div', { class: 'card' }, h('h3', {}, ES[c] + ` (${findings.filter(f => f.category === c).length})`), findings.filter(f => f.category === c).map(findingNode))),
      h('div', { class: 'card' }, h('h3', {}, 'Proyección de tiempos'),
        impl && impl.taskCount
          ? h('div', {}, h('p', {}, `Trabajo estimado: ${impl.totalHours} h en ${impl.taskCount} acciones.`),
            h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Escenario', 'Ritmo', '30 d', '60 d', '90 d', '180 d', 'Completar'].map(t => h('th', {}, t)))),
              h('tbody', {}, Object.entries(impl.scenarios).map(([n, sc]) => h('tr', {}, h('td', {}, n), h('td', {}, sc.hoursPerWeek + ' h/sem'), sc.milestones.map(m => h('td', {}, `${m.pctHours}% (${m.tasksDone}/${m.tasksTotal})`)), h('td', {}, sc.weeksToComplete + ' sem')))))),
            h('details', {}, h('summary', { class: 'muted' }, 'Supuestos y límites'), impl.assumptions.map(a => h('p', { class: 'muted' }, '• ' + a))))
          : h('p', { class: 'muted' }, 'Proyección no disponible por evidencia insuficiente'),
        h('h3', {}, 'Ventana de mejora en resultados'),
        impr?.available ? h('div', {}, Object.entries(impr.scenarios).map(([n, x]) => h('p', {}, `${n}: ${x.afterImplementationWeeks} semanas tras implementar`)), impr.assumptions.map(a => h('p', { class: 'muted' }, '• ' + a)))
          : h('p', { class: 'muted' }, 'Proyección no disponible por evidencia insuficiente' + (impr?.missing?.length ? ` — ${impr.missing.join('; ')}` : ''))),
      h('div', { class: 'card' }, h('h3', {}, 'Informativos'), findings.filter(f => f.category === 'informativo').map(findingNode)),
      h('div', { class: 'row' }, ['comercial', 'tecnico'].map(k => h('button', { onclick: () => genReport(audit.id, k, d.prospect.has_logo, msg) }, `Exportar PDF ${k}`)))));
  };
  await load();
}
async function genReport(auditId, kind, hasLogo, msg) {
  const incl = hasLogo && confirm('¿Incluir el logo del prospecto en el reporte? (No sustituye la marca de VIP Tech)');
  try {
    const r = await api(`/audits/${auditId}/report`, { method: 'POST', body: { kind, includeProspectLogo: incl }, raw: true }); const blob = await r.blob();
    const a = h('a', { href: URL.createObjectURL(blob), download: `diagnostico-${kind}.pdf` }); document.body.append(a); a.click(); a.remove(); toast(msg, 'Reporte generado y guardado en el historial.', 'info');
  } catch (er) { toast(msg, er.message); }
}

function tabCompetencia(root, d, msg, reload) {
  const p = d.prospect; const g = d.gbp?.data;
  root.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', {}, 'Google Business Profile (datos públicos)'), h('span', { class: 'spacer' }),
    h('button', { class: 'sec', onclick: async ev2 => { ev2.target.disabled = true; try { await confirmCost(c => api(`/prospects/${p.id}/gbp/fetch`, { method: 'POST', body: { confirmed: c } })); reload(); } catch (er) { toast(msg, er.status === 501 ? 'Google Places no está configurado en este servidor (GOOGLE_PLACES_API_KEY). Pendiente de credenciales.' : er.message); ev2.target.disabled = false; } } }, 'Consultar con Google Places')),
    g ? h('div', {}, kv([['Nombre', g.name], ['Categoría principal', g.primaryCategory], ['Dirección', g.address], ['Teléfono', g.phone], ['Website', g.website], ['Rating / reseñas', `${g.rating ?? 'n/d'} / ${g.reviews ?? 'n/d'}`], ['Horarios visibles', g.hasHours ? 'Sí' : 'No visibles'], ['Fuente', `${d.gbp.source} — ${fmt(d.gbp.fetched_at)}`]]),
      h('p', { class: 'muted' }, 'Descripción, servicios, atributos, respuestas del propietario e insights no están en la API pública: requieren Business Profile API autorizada.'))
      : h('p', { class: 'muted' }, 'Sin datos de GBP. No se muestran valores inventados: consulte Google Places (requiere credenciales y confirmación de costo).')));
  const cf = {}; const ci = (k, ph) => (cf[k] = h('input', { placeholder: ph }));
  root.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', {}, `Competidores (${d.competitors.length})`), h('span', { class: 'spacer' }),
    h('button', { class: 'sec', onclick: async ev2 => { ev2.target.disabled = true; try { await confirmCost(c => api(`/prospects/${p.id}/competitors/discover`, { method: 'POST', body: { confirmed: c, count: 3 } })); reload(); } catch (er) { toast(msg, er.status === 501 ? 'Google Places no está configurado. Agregue competidores manualmente.' : er.message); ev2.target.disabled = false; } } }, 'Descubrir 3 con Google Places')),
    d.competitors.length
      ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Nombre', 'Rating', 'Reseñas', 'Categoría', 'Fuente', ''].map(t => h('th', {}, t)))),
        h('tbody', {}, d.competitors.map(c => h('tr', {}, h('td', {}, c.name), h('td', {}, c.rating ?? 'n/d'), h('td', {}, c.reviews ?? 'n/d'), h('td', {}, c.primary_category || 'n/d'), h('td', {}, `${c.source} · ${fmt(c.fetched_at)}`),
          h('td', {}, h('button', { class: 'sec', onclick: async () => { await api(`/prospects/${p.id}/competitors/${c.id}`, { method: 'DELETE' }); reload(); } }, 'Quitar')))))))
      : h('p', { class: 'muted' }, 'Sin competidores. Se recomienda comenzar con tres comparables por servicio y ciudad.'),
    h('div', { class: 'grid g4' }, ci('name', 'Nombre'), ci('website', 'Website'), ci('rating', 'Rating'), ci('reviews', 'Reseñas'), ci('primary_category', 'Categoría')), h('p'),
    h('button', { class: 'sec', onclick: async () => { try { await api(`/prospects/${p.id}/competitors`, { method: 'POST', body: Object.fromEntries(Object.entries(cf).map(([k, v]) => [k, v.value])) }); reload(); } catch (er) { toast(msg, er.message); } } }, '+ Añadir competidor (manual)')));
  const kf = {}; const ki = (k, ph) => (kf[k] = h('input', { placeholder: ph })); const kind = h('select', {}, h('option', { value: 'observada' }, 'observada'), h('option', { value: 'estimada' }, 'estimada'));
  root.append(h('div', { class: 'card' }, h('h3', {}, `Keywords (${d.keywords.length})`),
    h('p', { class: 'muted' }, 'Carga manual por ahora. Una posición vacía significa SIN DATO, no que no posicione. Integración con DataForSEO/Search Console pendiente.'),
    d.keywords.length
      ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Keyword', 'Intención', 'Volumen', 'Dificultad', 'Posición', 'URL', 'Fuente', ''].map(t => h('th', {}, t)))),
        h('tbody', {}, d.keywords.map(k => h('tr', {}, h('td', {}, k.keyword), h('td', {}, k.intent || 'n/d'), h('td', {}, k.volume ?? 'n/d'), h('td', {}, k.difficulty ?? 'n/d'), h('td', {}, k.position != null ? `${k.position} (${k.position_kind})` : 'sin dato'), h('td', {}, k.url || ''), h('td', {}, k.source),
          h('td', {}, h('button', { class: 'sec', onclick: async () => { await api(`/prospects/${p.id}/keywords/${k.id}`, { method: 'DELETE' }); reload(); } }, 'Quitar')))))))
      : null,
    h('div', { class: 'grid g4' }, ki('keyword', 'Keyword'), ki('intent', 'Intención'), ki('volume', 'Volumen'), ki('difficulty', 'Dificultad 0-100'), ki('position', 'Posición'), kind, ki('url', 'URL'), ki('location', 'Ubicación')), h('p'),
    h('button', { class: 'sec', onclick: async () => { try { const b = Object.fromEntries(Object.entries(kf).map(([k, v]) => [k, v.value])); b.position_kind = kind.value; await api(`/prospects/${p.id}/keywords`, { method: 'POST', body: b }); reload(); } catch (er) { toast(msg, er.message); } } }, '+ Añadir keyword')));
}

async function tabSeguimiento(root, d, msg, reload) {
  const p = d.prospect;
  const st = h('select', {}, d.pipeline.map(s => h('option', { value: s, selected: s === p.pipeline_status }, s)));
  const na = h('input', { placeholder: 'Siguiente acción', value: p.next_action || '' }); const nd = h('input', { type: 'date', value: p.next_action_at ? String(p.next_action_at).slice(0, 10) : '' }); const note = h('textarea', { rows: 2, placeholder: 'Nota' });
  root.append(h('div', { class: 'card' }, h('div', { class: 'grid g4' }, h('div', {}, h('label', {}, 'Estado'), st), h('div', {}, h('label', {}, 'Siguiente acción'), na), h('div', {}, h('label', {}, 'Fecha'), nd)),
    h('label', {}, 'Nota del cambio'), note, h('p'),
    h('div', { class: 'row' },
      h('button', { onclick: async () => { try { await api(`/prospects/${p.id}/status`, { method: 'POST', body: { status: st.value, next_action: na.value, next_action_at: nd.value, note: note.value } }); reload(); } catch (er) { toast(msg, er.message); } } }, 'Actualizar estado'),
      h('button', { class: 'sec', onclick: async () => { if (!note.value) return; await api(`/prospects/${p.id}/notes`, { method: 'POST', body: { note: note.value } }); reload(); } }, 'Solo guardar nota'))));
  if (state.user.role !== 'ejecutivo') {
    const { users } = await api('/assignable-users');
    const sel = h('select', {}, users.map(u => h('option', { value: u.id, selected: u.id === p.owner_id }, `${u.name} (${u.role})`)));
    root.append(h('div', { class: 'card' }, h('h3', {}, 'Reasignar ejecutivo'), h('div', { class: 'row' }, sel, h('button', { class: 'sec', onclick: async () => { try { await api(`/prospects/${p.id}/reassign`, { method: 'POST', body: { owner_id: sel.value } }); reload(); } catch (er) { toast(msg, er.message); } } }, 'Reasignar'))));
  }
  root.append(h('div', { class: 'card' }, h('h3', {}, 'Historial'), h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Fecha', 'Usuario', 'Tipo', 'Detalle'].map(t => h('th', {}, t)))),
    h('tbody', {}, d.history.map(x => h('tr', {}, h('td', {}, fmt(x.created_at)), h('td', {}, x.user_name || 'sistema'), h('td', {}, x.kind), h('td', {}, x.detail))))))));
}
function tabReportes(root, d) {
  root.append(h('div', { class: 'card' }, h('h3', {}, 'Reportes generados'),
    d.reports.length
      ? h('table', {}, h('tbody', {}, d.reports.map(r => h('tr', {}, h('td', {}, fmt(r.created_at)), h('td', {}, r.kind), h('td', {}, r.include_prospect_logo ? 'con logo del prospecto' : ''), h('td', {}, h('a', { href: `/api/reports/${r.id}`, download: '' }, 'Descargar PDF'))))))
      : h('p', { class: 'muted' }, 'Aún no hay reportes. Genérelos desde la pestaña Auditoría.'),
    !d.prospect.has_logo
      ? h('div', {}, h('label', {}, 'Logo del prospecto (opcional, PNG/JPEG — no sustituye la marca VIP Tech)'), h('input', { type: 'file', accept: 'image/png,image/jpeg', onchange: async ev2 => { const f = ev2.target.files[0]; if (f) { await api(`/prospects/${d.prospect.id}/logo`, { method: 'POST', body: f }); render(); } } }))
      : h('p', { class: 'muted' }, 'Logo del prospecto cargado.')));
}

// ---------------- Admin ----------------
async function usersView(root) {
  const { users } = await api('/users'); const err = h('div');
  root.append(h('h2', {}, 'Usuarios'), h('div', { class: 'card table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Nombre', 'Email', 'Rol', 'Activo', 'Límite USD/mes', ''].map(t => h('th', {}, t)))),
    h('tbody', {}, users.map(u => h('tr', {}, h('td', {}, u.name), h('td', {}, u.email), h('td', {}, u.role), h('td', {}, u.active ? 'Sí' : 'No'), h('td', {}, u.monthly_cost_limit_usd ?? 'por defecto'),
      h('td', {}, state.user.role === 'admin' && h('button', { class: 'sec', onclick: async () => { await api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); render(); } }, u.active ? 'Desactivar' : 'Activar'))))))));
  if (state.user.role === 'admin') {
    const f = { name: h('input'), email: h('input', { type: 'email' }), password: h('input', { type: 'password', placeholder: '12+ caracteres, mayús/minús/número' }),
      role: h('select', {}, ['ejecutivo', 'supervisor', 'admin'].map(r => h('option', { value: r }, r))),
      supervisor_id: h('select', {}, h('option', { value: '' }, '— sin supervisor —'), users.filter(u => ['supervisor', 'admin'].includes(u.role)).map(u => h('option', { value: u.id }, u.name))) };
    root.append(h('div', { class: 'card' }, h('h3', {}, 'Nuevo usuario'), err,
      h('div', { class: 'grid g4' }, ...Object.entries({ name: 'Nombre', email: 'Email', password: 'Contraseña', role: 'Rol', supervisor_id: 'Supervisor (equipo)' }).map(([k, l]) => h('div', {}, h('label', {}, l), f[k]))), h('p'),
      h('button', { onclick: async () => { try { await api('/users', { method: 'POST', body: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value])) }); render(); } catch (er) { err.replaceChildren(h('div', { class: 'err' }, er.message)); } } }, 'Crear usuario')));
  }
}
async function costsView(root) {
  const { providers, monthSpendUsd, monthlyLimitUsd } = await api('/providers'); const costs = state.user.role !== 'ejecutivo' ? await api('/admin/costs') : null;
  root.append(h('h2', {}, 'Proveedores y costos'), h('div', { class: 'card' },
    h('p', {}, `Consumo estimado propio este mes: USD ${monthSpendUsd.toFixed(2)} de ${monthlyLimitUsd.toFixed(2)}. Las operaciones facturables piden confirmación y se cachean para evitar análisis duplicados.`),
    h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Proveedor', 'Estado', 'Costo estimado por consulta', 'Notas'].map(t => h('th', {}, t)))),
      h('tbody', {}, providers.map(p => h('tr', {}, h('td', {}, p.label || p.id), h('td', {}, p.configured ? 'Configurado' : 'Pendiente'), h('td', {}, p.paid ? `USD ${p.estUsd ?? '—'} (estimado; verificar tarifa vigente)` : 'Gratis / cuota'), h('td', {}, p.note || ''))))))));
  if (costs) {
    root.append(h('div', { class: 'card' }, h('h3', {}, 'Consumo del mes'),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Proveedor', 'Llamadas', 'En caché', 'Costo est. USD'].map(t => h('th', {}, t)))), h('tbody', {}, costs.byProvider.map(c => h('tr', {}, h('td', {}, c.provider), h('td', {}, c.calls), h('td', {}, c.cached_calls), h('td', {}, c.est_cost_usd.toFixed(3))))))),
      h('h3', {}, 'Por usuario'), h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, costs.byUser.map(c => h('tr', {}, h('td', {}, c.name), h('td', {}, c.calls), h('td', {}, c.est_cost_usd.toFixed(3)))))))));
  }
}
function brandView(root) {
  const msg = h('div');
  root.append(h('h2', {}, 'Marca'), msg, h('div', { class: 'card' },
    h('p', {}, 'Cargue el logotipo OFICIAL de VIP Tech (PNG o JPEG). Se usa en el encabezado y en todos los PDF. Mientras no exista, los reportes muestran solo el nombre en texto.'),
    h('img', { src: '/api/brand/logo?' + Date.now(), alt: '', style: 'height:60px;background:#17191B;padding:6px', onerror: ev => ev.target.remove() }), h('p'),
    h('input', { type: 'file', accept: 'image/png,image/jpeg', onchange: async ev2 => { const f = ev2.target.files[0]; if (!f) return; try { await api('/admin/logo', { method: 'POST', body: f }); render(); } catch (er) { toast(msg, er.message); } } })));
}
boot();
