// Exportación PDF (pdfkit): reporte comercial y reporte técnico. Marca VIP Tech, ejecutivo, "Powered by VIP Tech Consulting".
import PDFDocument from 'pdfkit';

const ORANGE = '#FF5011', BLACK = '#17191B', GRAY = '#6B7075', LIGHT = '#F2F3F4';
const SEV = { critica: '#B91C1C', alta: '#FF5011', media: '#D99A00', baja: '#6B7075', info: '#9CA3AF' };
const SEV_LABEL = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja', info: 'Info' };
const CAT_LABEL = { quick_win: 'Quick Win', prioridad_alta: 'Prioridad alta', crecimiento_estrategico: 'Crecimiento estratégico', informativo: 'Informativo' };
const clean = s => String(s ?? '').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/[^\u0009\u000a -~ -ÿ–—‘’“”•…]/g, '');
const fmtDate = d => new Date(d).toLocaleDateString('es-US', { year: 'numeric', month: 'long', day: 'numeric' });
const ev = e => { try { const s = JSON.stringify(e); return s.length > 380 ? s.slice(0, 380) + '…' : s; } catch { return ''; } };

export function generateReport(kind, data) {
  const { prospect, audit, findings, competitors = [], keywords = [], owner, logo, prospectLogo, includeProspectLogo } = data;
  const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true, info: { Title: `Diagnóstico ${kind} — ${clean(prospect.company)}`, Author: 'VIP Tech Consulting', Creator: 'VIP Tech Local Opportunity Analyzer' } });
  const chunks = []; doc.on('data', c => chunks.push(c));
  const done = new Promise(r => doc.on('end', () => r(Buffer.concat(chunks))));
  const W = doc.page.width - 100;
  const sum = audit.summary || {};
  const brandLogo = (x, y, h) => { if (logo) { try { doc.image(logo, x, y, { height: h }); return true; } catch {} } return false; };

  // Portada
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(BLACK);
  doc.rect(0, 0, 14, doc.page.height).fill(ORANGE);
  if (!brandLogo(60, 60, 50)) doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22).text('VIP Tech Consulting', 60, 70);
  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(12).text(kind === 'comercial' ? 'DIAGNÓSTICO COMERCIAL · MÉTODO L.E.D. LOCAL' : 'REPORTE TÉCNICO · MÉTODO L.E.D. LOCAL', 60, 250);
  doc.fillColor('#fff').fontSize(34).text(clean(prospect.company), 60, 275, { width: W - 20 });
  doc.font('Helvetica').fontSize(13).fillColor('#D1D5DB');
  const y0 = doc.y + 18;
  doc.text(clean([prospect.website, [prospect.city, prospect.state].filter(Boolean).join(', ')].filter(Boolean).join('  ·  ')), 60, y0, { width: W - 20 });
  doc.moveDown(2);
  doc.fillColor('#fff').fontSize(11).text(`Ejecutivo responsable: ${clean(owner.name)}`, 60).text(`Fecha del diagnóstico: ${fmtDate(audit.finished_at || audit.created_at)}`);
  if (audit.status === 'parcial') doc.fillColor(ORANGE).text('Resultados parciales: ver notas del reporte.');
  if (prospect.is_demo) doc.fillColor(ORANGE).font('Helvetica-Bold').text('DEMO — datos de demostración');
  if (includeProspectLogo && prospectLogo) { try { doc.image(prospectLogo, 60, 620, { fit: [140, 60] }); } catch {} }
  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(11).text('Powered by VIP Tech Consulting', 60, 700);

  const h1 = t => { if (doc.y > 560) doc.addPage(); doc.moveDown(0.6); doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(15).text(clean(t), 50, doc.y); doc.rect(50, doc.y + 2, 40, 3).fill(ORANGE); doc.moveDown(0.8); doc.fillColor(BLACK).font('Helvetica').fontSize(10); };
  const p = (t, o = {}) => doc.fillColor(o.color || BLACK).font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size || 10).text(clean(t), 50, doc.y, { width: W, ...o });
  const note = t => p(t, { color: GRAY, size: 8.5 });

  doc.addPage();
  // Resumen ejecutivo
  h1('Resumen ejecutivo');
  const kpis = [['Salud técnica del sitio', sum.health != null ? `${sum.health}/100` : 'n/d'], ['Páginas rastreadas', `${sum.pagesCrawled ?? 'n/d'}`], ['Hallazgos', `${findings.length}`], ['Quick Wins', `${findings.filter(f => f.category === 'quick_win').length}`]];
  let x = 50; const bw = (W - 30) / 4; const ky = doc.y;
  for (const [k, v] of kpis) { doc.roundedRect(x, ky, bw, 52, 4).fill(LIGHT); doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(18).text(v, x + 8, ky + 8, { width: bw - 16 }); doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(k, x + 8, ky + 34, { width: bw - 16 }); x += bw + 10; }
  doc.y = ky + 66;
  p(`Elegibilidad: ${({ calificado: 'Calificado', no_calificado: 'No calificado', revision_manual: 'Revisión manual necesaria', pendiente: 'Pendiente' })[prospect.eligibility_status]}. ${prospect.eligibility_reason || ''}`);
  doc.moveDown(0.5);
  // Gráfico de barras por severidad
  const sev = ['critica', 'alta', 'media', 'baja', 'info']; const counts = sev.map(s => findings.filter(f => f.severity === s).length); const max = Math.max(1, ...counts);
  p('Hallazgos por severidad', { bold: true }); let by = doc.y + 4;
  sev.forEach((s, i) => { doc.fillColor(BLACK).font('Helvetica').fontSize(9).text(SEV_LABEL[s], 50, by + 2, { width: 60 }); const bwid = (W - 140) * counts[i] / max; doc.rect(115, by, Math.max(bwid, counts[i] ? 2 : 0), 12).fill(SEV[s]); doc.fillColor(BLACK).text(String(counts[i]), 120 + bwid, by + 2); by += 19; });
  doc.y = by + 6;
  note('Fuentes: ' + (sum.sources || []).join('; ') + '. Los hallazgos son observaciones a la fecha del diagnóstico.');
  for (const n of sum.notes || []) note('• ' + n);

  const topList = (cats, title, limit) => {
    const groups = new Map();
    for (const f of findings.filter(f => cats.includes(f.category)).sort((a, b) => b.score - a.score)) { const g = groups.get(f.code); if (g) g.n++; else groups.set(f.code, { ...f, n: 1 }); }
    const list = [...groups.values()].slice(0, limit);
    h1(title); if (!list.length) { p('Sin elementos en esta categoría con la evidencia disponible.', { color: GRAY }); return; }
    for (const f of list) {
      if (doc.y > 650) doc.addPage();
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10.5).text(clean(f.title + (f.n > 1 ? `  (${f.n} páginas/URLs)` : '')), 50, doc.y, { width: W });
      doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(clean(`Acción: ${f.action}`), { width: W });
      if (f.benefit) doc.fillColor(GRAY).text(clean(`Beneficio posible: ${f.benefit}`), { width: W });
      doc.fillColor(GRAY).fontSize(8).text(clean(`Impacto ${f.impact}/5 · Esfuerzo ${f.effort}/5 · Confianza ${Math.round(f.confidence * 100)}% · Puntaje ${f.score} · Fuente: ${f.source}`), { width: W }); doc.moveDown(0.5);
    }
  };

  if (kind === 'comercial') {
    topList(['quick_win'], 'Quick Wins', 8);
    topList(['prioridad_alta'], 'Oportunidades de prioridad alta', 8);
    topList(['crecimiento_estrategico'], 'Crecimiento estratégico', 6);

    h1('Competidores locales');
    if (!competitors.length) p('Sin competidores registrados: la comparación competitiva no está disponible en este diagnóstico.', { color: GRAY });
    else {
      const cols = [190, 60, 60, 190]; const hdr = ['Competidor', 'Rating', 'Reseñas', 'Categoría principal'];
      let cx = 50; doc.rect(50, doc.y, W, 16).fill(BLACK); hdr.forEach((h, i) => { doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8.5).text(h, cx + 4, doc.y - 12, { width: cols[i] - 8 }); cx += cols[i]; });
      doc.y += 4;
      for (const c of competitors) { const ry = doc.y; cx = 50; [c.name, c.rating ?? 'n/d', c.reviews ?? 'n/d', c.primary_category || 'n/d'].forEach((v, i) => { doc.fillColor(BLACK).font('Helvetica').fontSize(9).text(clean(v), cx + 4, ry, { width: cols[i] - 8, lineBreak: false, ellipsis: true }); cx += cols[i]; }); doc.y = ry + 15; }
      note('Fuente: ' + [...new Set(competitors.map(c => c.source))].join(', ') + '. Fecha: ' + fmtDate(competitors[0].fetched_at));
    }

    h1('Proyección de implementación y escenarios');
    const impl = sum.projection?.implementation;
    if (!impl || !impl.taskCount) p('Proyección no disponible por evidencia insuficiente', { color: GRAY });
    else {
      p(`Trabajo estimado: ${impl.totalHours} horas en ${impl.taskCount} acciones.`);
      const hdr = ['Escenario', 'Ritmo', '30 días', '60 días', '90 días', '180 días', 'Completar']; const cw = [80, 60, 65, 65, 65, 65, 60];
      let cx = 50; doc.rect(50, doc.y, W, 16).fill(BLACK); hdr.forEach((h, i) => { doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(h, cx + 4, doc.y - 12, { width: cw[i] - 6 }); cx += cw[i]; }); doc.y += 4;
      for (const [name, s] of Object.entries(impl.scenarios)) { const ry = doc.y; cx = 50; [name[0].toUpperCase() + name.slice(1), `${s.hoursPerWeek} h/sem`, ...s.milestones.map(m => `${m.pctHours}%`), `${s.weeksToComplete} sem`].forEach((v, i) => { doc.fillColor(BLACK).font('Helvetica').fontSize(9).text(clean(v), cx + 4, ry, { width: cw[i] - 6, lineBreak: false }); cx += cw[i]; }); doc.y = ry + 15; }
      note('Porcentaje del trabajo de implementación completado en cada hito orientativo.'); doc.moveDown(0.3);
      for (const a of impl.assumptions) note('• ' + a);
    }
    const impr = sum.projection?.improvement;
    doc.moveDown(0.4); p('Ventana de mejora en resultados', { bold: true });
    if (!impr?.available) { p('Proyección no disponible por evidencia insuficiente' + (impr?.missing?.length ? ` (${impr.missing.join('; ')})` : ''), { color: GRAY }); }
    else { for (const [n, s] of Object.entries(impr.scenarios)) p(`${n}: ${s.afterImplementationWeeks} semanas tras implementar (≈ semana ${s.windowEndWeeks} desde el inicio).`); for (const a of impr.assumptions) note('• ' + a); }
    note('Ninguna proyección constituye garantía de posiciones, llamadas ni ingresos.');

    h1('Siguiente paso: Método L.E.D. Local');
    p('L — Localizable: que Google y Maps lo encuentren en las búsquedas locales correctas.\nE — Elegible: que el prospecto confíe y decida contratarlo.\nD — Dominante: presencia local sostenida en el tiempo.', {});
    doc.moveDown(0.5);
    doc.roundedRect(50, doc.y, W, 56, 6).fill(ORANGE); doc.fillColor('#fff').font('Helvetica-Bold').fontSize(13).text('Agenda una reunión con ' + clean(owner.name) + ' para priorizar este plan.', 62, doc.y - 46, { width: W - 24 });
    doc.font('Helvetica').fontSize(10).text(clean([owner.email].filter(Boolean).join('  ·  ')), 62, doc.y + 2, { width: W - 24 });
    doc.y += 34;
  } else {
    h1('Hallazgos técnicos detallados');
    const order = { critica: 0, alta: 1, media: 2, baja: 3, info: 4 };
    for (const f of [...findings].sort((a, b) => order[a.severity] - order[b.severity] || b.score - a.score)) {
      if (doc.y > 600) doc.addPage();
      const top = doc.y; doc.rect(50, top, 4, 62).fill(SEV[f.severity]);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text(clean(`[${SEV_LABEL[f.severity]}] ${f.title}`), 60, top, { width: W - 10 });
      doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(clean(f.explanation), 60, doc.y, { width: W - 10 });
      if (f.url) doc.fillColor('#1D4ED8').text(clean(f.url), 60, doc.y, { width: W - 10, link: /^https?:/.test(f.url) ? f.url : undefined, underline: true });
      doc.fillColor(GRAY).text(clean('Evidencia: ' + ev(f.evidence)), 60, doc.y, { width: W - 10 });
      doc.fillColor(BLACK).text(clean('Acción: ' + f.action), 60, doc.y, { width: W - 10 });
      doc.fillColor(GRAY).fontSize(8).text(clean(`${CAT_LABEL[f.category]} · Impacto ${f.impact}/5 · Esfuerzo ${f.effort}/5 · Confianza ${Math.round(f.confidence * 100)}% · Puntaje ${f.score} · Fuente: ${f.source} · ${fmtDate(f.observed_at)}`), 60, doc.y, { width: W - 10 });
      doc.moveDown(0.7);
    }
    h1('Keywords y brechas');
    if (!keywords.length) p('Sin keywords registradas. La falta de datos no implica ausencia de ranking.', { color: GRAY });
    else for (const k of keywords) { if (doc.y > 700) doc.addPage(); p(`${k.keyword} · intención: ${k.intent || 'n/d'} · volumen: ${k.volume ?? 'n/d'} · dificultad: ${k.difficulty ?? 'n/d'} · posición: ${k.position != null ? k.position + ' (' + k.position_kind + ')' : 'sin dato'} · fuente: ${k.source}`, { size: 8.5 }); }
    h1('Páginas rastreadas');
    for (const pg of data.pages || []) { if (doc.y > 710) doc.addPage(); doc.fillColor(BLACK).font('Helvetica').fontSize(8).text(clean(`${pg.status ?? 'ERR'}  ${pg.url}`), 50, doc.y, { width: W, link: /^https?:/.test(pg.url) ? pg.url : undefined }); }
    h1('Metodología y fuentes');
    note('Puntaje de oportunidad: S = 100 × (0.35·I/5 + 0.20·R/5 + 0.20·C + 0.25·(6−E)/5) × D. I=impacto, R=relevancia comercial, C=confianza, E=esfuerzo, D=dependencia.');
    note('Fuentes: ' + (sum.sources || []).join('; '));
    for (const n of sum.notes || []) note('• ' + n);
  }

  // Encabezado/pie con paginación
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0;   // evita que el pie provoque una página nueva
    doc.rect(0, 0, doc.page.width, 6).fill(ORANGE);
    doc.rect(50, doc.page.height - 44, W, 0.5).fill('#D1D5DB');
    doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(clean(`${prospect.company} · Ejecutivo: ${owner.name}`), 50, doc.page.height - 36, { width: W / 2, lineBreak: false });
    doc.fillColor(ORANGE).font('Helvetica-Bold').text('Powered by VIP Tech Consulting', 50, doc.page.height - 36, { width: W, align: 'center', lineBreak: false });
    doc.fillColor(GRAY).font('Helvetica').text(`Pág. ${i + 1} de ${range.count}`, 50, doc.page.height - 36, { width: W, align: 'right', lineBreak: false });
    doc.page.margins.bottom = mb;
  }
  doc.end();
  return done;
}
