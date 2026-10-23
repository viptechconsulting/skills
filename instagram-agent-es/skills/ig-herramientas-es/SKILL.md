---
name: ig-herramientas-es
description: Puntúa hooks de Reels en español, arma la hoja de beats con tiempos, revisa captions de Instagram (vista previa del corte "... más", hashtags, CTA) y limpia borradores de frases de relleno de IA. Úsalo cuando el usuario escriba o revise guiones, hooks, captions o textos de Instagram en español, o pida "humanizar" un texto en español.
---

# Herramientas de Instagram en español

Cinco scripts Python locales (solo librería estándar, sin red, nada se sube). Viven en `scripts/` junto a este archivo. Corre siempre sobre archivos temporales en el scratchpad, no sobre el repo.

Antes de escribir cualquier cosa para Simon, lee su voz: `templates/voz.md` del plugin, o el `~/.claude/instagram/voz.md` si existe. Si falta un dato (cifra, cliente, resultado), deja `{{tu cifra}}` y avísalo. Nunca inventes métricas ni testimonios.

## Flujo para un Reel

1. Escribe 3 a 5 hooks distintos, uno por línea, en `hooks.txt`.
2. `python3 scripts/hookscore_es.py hooks.txt` → rankea. Descarta lo que salga DÉBIL o con dealbreaker. Entre hooks decentes no elige ganadores (el original midió AUC 0.56 en inglés): decide por criterio y por tu gráfica de retención.
3. Escribe el guion, una línea por beat, en `guion.txt`.
4. `python3 scripts/beats_es.py guion.txt --target 30` → tiempos, hook sobre 3 s, beats largos, loop. `--wpm` con el ritmo real de Simon si se conoce.
5. Humaniza: `python3 scripts/humanize_es.py guion.txt --report -o limpio.txt`.
6. Mide el antes/después: `python3 scripts/detect_es.py guion.txt limpio.txt`. Sirve para comparar versiones, no como nota absoluta ni como veredicto de un detector real.

## Flujo para un caption

`python3 scripts/caption_es.py caption.txt --keywords "término 1,término 2"`. Muestra lo que el feed enseña antes del "... más" (125 caracteres por defecto, aproximado). Reescribe la primera línea si el gancho queda cortado.

## Reglas

- Las estructuras que `humanize_es.py` solo marca ("No es solo X, es Y", tríadas, muro de hashtags, viñetas de emoji) se reescriben a mano con criterio; no se parchean con regex.
- Revisa `--report`: el lexicón (`scripts/slop_es.json`) es una primera versión sin validar y puede dejar frases raras tras una eliminación. Lee el resultado antes de entregarlo.
- Límite de hashtags (5) viene del original y no está verificado. Confírmalo en Instagram antes de afirmarlo a un cliente.
- Nada se publica sin que Simon lo apruebe. Estos scripts escriben texto; él publica.
