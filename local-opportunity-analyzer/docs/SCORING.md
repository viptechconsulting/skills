# Puntuación y proyección

**Puntaje de oportunidad** `S = 100 × (0.35·I/5 + 0.20·R/5 + 0.20·C + 0.25·(6−E)/5) × D`
I impacto 1–5 · R relevancia comercial 1–5 · C confianza de evidencia 0–1 · E esfuerzo 1–5 · D = 0.85 si depende de otra acción abierta, si no 1. Cada hallazgo guarda `score_detail` con sus insumos.

**Categorías:** Quick Win (E≤2, I≥3, C≥0.70) · Prioridad alta (severidad crítica/alta o S≥65) · Crecimiento estratégico (resto con I≥2) · Informativo (severidad info o I<2).

**Salud técnica (0–100):** 100 − penalizaciones por severidad (crítica 20, alta 8, media 3, baja 1); repeticiones del mismo código suman 25 % cada una (máx. 4).

**Pesos, umbrales, impacto/esfuerzo por hallazgo y horas por esfuerzo son criterios internos, no estándares de la industria: revíselos y ajústelos con su experiencia.**

**Proyección:** (1) implementación = horas por esfuerzo (2/6/16/40/80) ÷ ritmo (6/12/24 h/sem), hitos 30/60/90/180 días; (2) ventana de mejora solo con ≥5 keywords con posición y dificultad y ≥3 competidores: heurística `6 + dificultad/100×10` semanas tras implementar (×1.5 conservador, ×0.7 favorable), **no validada empíricamente**. Sin esos datos: «Proyección no disponible por evidencia insuficiente». Nunca garantiza rankings, llamadas ni ingresos.
