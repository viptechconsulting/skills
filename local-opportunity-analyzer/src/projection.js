// Proyección de tiempos (ver docs/SCORING.md). Dos cosas separadas:
//  1) Tiempo de IMPLEMENTACIÓN: horas estimadas por esfuerzo ÷ ritmo semanal (supuestos explícitos y editables).
//  2) VENTANA DE MEJORA: solo si hay evidencia suficiente (≥5 keywords con posición+dificultad y ≥3 competidores).
//     En ese caso es una heurística interna orientativa, NO validada empíricamente.
export const HOURS_BY_EFFORT = { 1: 2, 2: 6, 3: 16, 4: 40, 5: 80 };
export const PACE_HOURS_PER_WEEK = { conservador: 6, base: 12, favorable: 24 };
export const MILESTONE_DAYS = [30, 60, 90, 180];
export const UNAVAILABLE = 'Proyección no disponible por evidencia insuficiente';

export function projectImplementation(findings) {
  const tasks = findings.filter(f => f.category !== 'informativo').sort((a, b) => Number(b.score) - Number(a.score))
    .map(f => ({ code: f.code, title: f.title, hours: HOURS_BY_EFFORT[f.effort], score: Number(f.score) }));
  const totalHours = tasks.reduce((s, t) => s + t.hours, 0);
  const scenarios = {};
  for (const [name, pace] of Object.entries(PACE_HOURS_PER_WEEK)) {
    const milestones = MILESTONE_DAYS.map(days => {
      const cap = pace * days / 7; let used = 0, done = 0;
      for (const t of tasks) { if (used + t.hours <= cap) { used += t.hours; done++; } else break; }
      return { days, tasksDone: done, tasksTotal: tasks.length, hoursDone: used, pctHours: totalHours ? Math.round(100 * used / totalHours) : 100 };
    });
    scenarios[name] = { hoursPerWeek: pace, weeksToComplete: totalHours ? Math.ceil(totalHours / pace) : 0, milestones };
  }
  return { totalHours, taskCount: tasks.length, scenarios,
    assumptions: ['Horas por nivel de esfuerzo (1→2h, 2→6h, 3→16h, 4→40h, 5→80h) son estimaciones internas editables en src/projection.js.',
      'Las tareas se ejecutan en orden de puntaje de oportunidad, de mayor a menor, y de forma secuencial.',
      'Ritmo: conservador 6 h/sem, base 12 h/sem, favorable 24 h/sem; depende de los recursos reales del cliente y del equipo.',
      'Es tiempo de implementación; no predice cuándo Google reflejará mejoras ni garantiza posiciones, llamadas o ingresos.'] };
}

export function projectImprovement({ keywords = [], competitors = [] }, implementation) {
  const withData = keywords.filter(k => k.position != null && k.difficulty != null);
  if (withData.length < 5 || competitors.length < 3) return { available: false, message: UNAVAILABLE,
    missing: [withData.length < 5 ? `Keywords con posición y dificultad: ${withData.length}/5` : null, competitors.length < 3 ? `Competidores comparables: ${competitors.length}/3` : null].filter(Boolean) };
  const avgDiff = withData.reduce((s, k) => s + k.difficulty, 0) / withData.length;
  const baseWeeks = Math.round(6 + (avgDiff / 100) * 10);
  const out = {};
  for (const [name, factor] of [['conservador', 1.5], ['base', 1], ['favorable', 0.7]]) {
    const impl = implementation.scenarios[name].weeksToComplete;
    out[name] = { implementationWeeks: impl, afterImplementationWeeks: Math.round(baseWeeks * factor), windowEndWeeks: impl + Math.round(baseWeeks * factor) };
  }
  return { available: true, heuristic: true, avgDifficulty: Math.round(avgDiff), scenarios: out,
    assumptions: ['Heurística interna orientativa (6 + dificultad media/100×10 semanas tras implementar; ×1.5 conservador, ×0.7 favorable). No validada empíricamente.',
      'Depende de competencia, autoridad del dominio, calidad de ejecución y cambios de algoritmo. No se garantizan posiciones, llamadas ni ingresos.'] };
}
