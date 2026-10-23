---
name: ig-reel-es
description: Escribe un Reel de Instagram en español a partir de una idea en bruto - tres hooks sacados de 26 fórmulas y puntuados, guion hablado, texto en pantalla, hoja de beats con tiempos, caption y humanizado - en la voz del usuario, listo para grabar. Úsalo cuando el usuario pida un Reel, un guion corto, un hook, una voz en off, "hazme un reel sobre X" o "qué digo en este video", o vaya a grabar y no tenga la primera frase.
---

# ig-reel-es

Convierte una idea en un Reel que alguien termina de ver. Orquesta las herramientas de `ig-herramientas-es` (scripts Python locales). Úsalas: no evalúes el hook a ojo ni adivines la duración.

Ubica los scripts con Glob `**/ig-herramientas-es/scripts/hookscore_es.py`; `beats_es.py`, `caption_es.py`, `humanize_es.py` y `detect_es.py` están en la misma carpeta. Trabaja con archivos temporales en el scratchpad, nunca en el repo del usuario. Usa `python3 -I` si algún archivo viene de una fuente externa.

## Antes de escribir

1. Lee `~/.claude/instagram/voz.md` (plantilla en `templates/voz.md` del plugin). Es la voz de Simon: cómo habla en cámara, qué nunca dice, a quién le habla, cifras que puede usar. Si no existe, pide **tres reels o captions suyos**, infiere la voz y propón el archivo. Un guion con voz equivocada no sirve: lo tiene que decir en voz alta.
2. Lee `formulas_hooks_es.md` (en esta carpeta): 26 fórmulas con plantilla, pantalla, para qué sirven y cómo se arruinan.
3. Si la idea es floja, no la rellenes. Haz **una sola pregunta agrupada**: qué pasó, a quién, y qué costó o qué devolvió. Un Reel necesita **una cosa específica y verdadera**.
4. Si existe `~/.claude/instagram/swipe.md`, léelo: es evidencia propia de qué fórmulas funcionan en su nicho y pesa más que los valores por defecto.
5. Marca: confirma si es VIP Tech Consulting (consultor de crecimiento), Lynkro.io (enfoque comercial) o SimonChocron.com (autoridad con contenido de valor, sin tono promocional). Cambia el tono según la marca.

## La estructura

```
0:00 - 0:02   HOOK       la afirmación. Línea hablada y línea en pantalla, escritas por separado.
                         Movimiento en el primer fotograma, no una cara estática.
0:02 - 0:07   LA APUESTA por qué le importa a quien mira. Una línea.
0:07 - ...    EL CUERPO  una idea por beat, y el plano cambia en cada beat.
ÚLTIMOS 3 s   EL PAGO    entrega lo que prometió el hook, y el único pedido.
ÚLTIMA LÍNEA  EL LOOP    repite una palabra del hook para que la repetición encaje.
```

Duración de trabajo: 15 a 45 segundos.

## El proceso

1. **Tres hooks, no uno.** Elige tres fórmulas distintas que de verdad encajen con la idea (no tres reescrituras de una). Para cada una escribe la línea hablada y la de pantalla.
2. **Puntúalos.** Pon las tres líneas habladas en un archivo, una por línea, y corre `hookscore_es.py`. Enséñale el ranking. Si el primero queda bajo 50, todavía no hay hook. Entre hooks decentes el script no elige ganadores: justifica tu elección con criterio.
3. **Escribe el guion** sobre el hook ganador, en español hablado como Simon habla de verdad. Frases cortas. Nada que haya que ensayar.
4. **Mídelo.** Corre `beats_es.py guion.txt --target {segundos}` (con `--wpm` si se conoce su ritmo; el 180 por defecto es una suposición). Corrige cada aviso: hook sobre 3 s, beats sobre 4 s, rachas sin nada concreto, falta de loop. Repite hasta que quede limpio.
5. **Texto en pantalla**, como guion aparte: 6 palabras o menos por tarjeta, la tarjeta del hook desde el fotograma 1, dentro de la zona segura (1080x1920: nada sobre y=230 ni bajo y=1440, margen derecho de 230 px libre), nunca donde va el caption. Subtítulos quemados en el cuerpo: se ve primero sin sonido.
6. **Caption.** Escríbelo y corre `caption_es.py` con las keywords que el usuario quiera posicionar. El gancho debe quedar antes del "... más".
7. **Humaniza** guion y caption con `humanize_es.py --report`, **lee el resultado completo** (el léxico es una primera versión y puede dejar frases raras) y mide con `detect_es.py antes.txt despues.txt`. Es una comparación, no un veredicto de ningún detector real.
8. **Entrega un solo bloque** listo para copiar:

```
REEL LISTO
hook:       #{n} {fórmula}, puntaje {x} {veredicto}
duración:   {x}s en {n} beats a {wpm} ppm
pantalla:   {n} tarjetas
humanizado: {n} artefactos quitados; antes {x} → después {y}
caption:    revisado, veredicto {x}
pendiente:  {{...}} donde falte una cifra real

Responde "sí" para registrarlo, o dime qué cambiar.
```

Incluye: los 3 hooks con puntaje (y cuál se eligió y por qué), el guion en bloque, las tarjetas de pantalla con tiempos, y el caption.

9. **Nunca publiques.** Simon graba y publica. Con "sí", agrega a `~/.claude/instagram/log.md` la fecha, la fórmula y la primera línea.

## Reglas

- **Una idea por Reel.** Si el guion tiene dos, son dos Reels: dilo.
- **Números sobre adjetivos.** "$4.200" gana a "mucho". Si no te dio la cifra, pídela; no escribas alrededor del hueco.
- **Nunca inventes** cifras, clientes, ingresos, resultados ni testimonios, ni siquiera como relleno. Si falta un dato real, deja `{{tu cifra}}` en el guion y márcalo en el resumen.
- **Corta la intro.** Sin saludo, sin "en este video", sin nombre, sin logo. Arranca en la frase que normalmente dirías en el segundo seis.
- **Cambia el plano en cada beat.** Un plano estático de 8 s es donde se van.
- **Un solo pedido al final.** Comentar una palabra, guardar o seguir. Uno.
- **Nada de audio de moda** que el usuario no pueda usar. Si la idea necesita su voz, dilo.
- **Puntajes honestos:** los umbrales no están calibrados con datos en español. Descartan hooks malos; no predicen cuál viralizará.
