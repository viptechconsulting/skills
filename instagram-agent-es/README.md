# instagram-agent-es

Cinco herramientas locales para escribir Reels y captions de Instagram **en español**, portadas de [`Jakeschincariol/instagram-agent-skill`](https://github.com/Jakeschincariol/instagram-agent-skill) (MIT). Solo librería estándar de Python, sin red, sin API keys.

| script | qué hace |
| --- | --- |
| `hookscore_es.py` | Puntúa y rankea hooks en 5 propiedades; detecta saludos, preámbulos y hooks sin nada concreto. |
| `beats_es.py` | Guion → hoja de beats con tiempos; marca hook largo, beats estáticos, falta de loop. |
| `caption_es.py` | Muestra el corte del feed ("... más") y revisa hashtags, CTA, links, emoji, términos de búsqueda. |
| `humanize_es.py` | Quita caracteres invisibles, tipografía de IA y frases de relleno en español; **marca** las estructuras sin reescribirlas. |
| `detect_es.py` | Panel de 5 chequeos para comparar un borrador antes/después. Heurística local, no un detector real. |

Uso y flujo: [`skills/ig-herramientas-es/SKILL.md`](skills/ig-herramientas-es/SKILL.md). Pruebas: `python3 -I tests/test_es.py`.

## Qué se cambió respecto al original

- Regex con soporte Unicode. El original usa `[A-Za-z]`: con acentos parte las palabras ("más" → "m", "s"), cuenta mal las palabras y los hashtags con ñ o tilde (`#diseño`).
- Números al estilo español: `18.000`, `3,5`, `€`, "veinte mil", "cero dólares".
- Stopwords, STAKES, imperativos, aperturas débiles, dealbreakers, CTAs, hashtags genéricos y estructuras ("No es solo X, es Y", "No se trata de X, sino de Y") reescritos para español.
- `slop_es.json`: 142 términos y 16 estructuras escritos desde cero. Los reemplazos listan género y número (innovador/a/es/as) para no romper la concordancia.
- Se corrigieron dos fallos del original: (1) la apertura débil se comparaba **por prefijo** (en inglés "so" penalizaba "something"); ahora compara palabras completas. (2) el CTA "comment X" aceptaba cualquier palabra tras "comment", incluida "below"; ahora exige la palabra clave en mayúsculas.
- En español el pronombre se omite: "Perdí…", "Cobré…" cuentan como primera persona por la terminación del verbo.
- Todo el texto de salida está en español.

## Límites (léelos antes de confiar)

- **Nada está calibrado con datos en español.** El original midió 74 hooks reales en inglés: separa hooks malos de buenos (AUC 0.83) pero no elige ganadores (AUC 0.56). Aquí los umbrales se ajustaron a mano por longitud típica del español (hook ideal 6-14 palabras, 180 ppm). Úsalo para descartar, no para predecir.
- `detect_es.py` compara versiones; su número absoluto no significa nada fuera de esta herramienta. No es GPTZero ni ningún detector, y no promete su veredicto. "Contracciones" se sustituyó por muletillas orales, una suposición.
- `slop_es.json` es una primera versión. Revisa siempre `--report` y lee el resultado: una eliminación puede dejar una frase rara.
- El tope de **5 hashtags** viene del original (afirma que Instagram lo bajó de 30 a 5 el 18-dic-2025). No lo verifiqué.
- No se portaron `swipe.py` ni `hooks.json` (26 fórmulas): sus regex de clasificación están calibrados con habla en inglés y portarlos bien exige un corpus en español.
- No publica nada en Instagram. Estas herramientas escriben y revisan texto; tú publicas.

## Auditoría de seguridad del original

Revisado el commit `d03c56b` de `instagram-agent-skill`: los seis scripts importan solo librería estándar (`argparse`, `json`, `re`, `statistics`, `unicodedata`, `textwrap`, `os`, `sys`); no hay red, `subprocess`, `eval`/`exec` ni escritura fuera de `-o/--out` (humanize) y `--out` (swipe). Los `SKILL.md` no contienen instrucciones ocultas. Copia sin cambios en [`../instagram-agent/`](../instagram-agent/).

## Licencia

MIT. © Jake Schincariol (original) y VIP Tech Consulting (adaptación al español).
