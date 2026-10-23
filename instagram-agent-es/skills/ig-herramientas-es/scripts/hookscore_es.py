#!/usr/bin/env python3
"""
hookscore_es.py - puntúa la primera línea de un Reel en español en cinco
propiedades y rankea varias opciones entre sí.

Port al español de hookscore.py (Jake Schincariol, MIT). Cambios respecto al
original: regex con soporte Unicode (acentos, ñ), números hablados y dinero
en español, formato 18.000 / 3,5, apertura y dealbreakers en español, y el
penalizador de aperturas débiles compara palabras completas (el original
comparaba por prefijo: "so" penalizaba "something", aquí "so" no penalizaría
"solo").

QUÉ ES: cinco heurísticas locales sobre el texto. Detecta hooks flojos
(saludos, preámbulos, nada concreto, demasiado largos).
QUÉ NO ES: un predictor de vistas. El original, con 74 hooks reales en
inglés, separaba hooks buenos de hooks mal escritos a propósito (AUC 0.83)
pero NO elegía ganadores entre hooks decentes (AUC 0.56, casi azar).
Los umbrales de esta versión en español NO están calibrados con datos reales:
son los del original ajustados por longitud típica del español. Úsalo para
descartar hooks malos; confía en tu gráfica de retención para el resto.

Uso
  python3 hookscore_es.py hooks.txt           # un hook por línea, rankeados
  python3 hookscore_es.py --hook "Perdí 18.000 dólares por una cláusula."
  python3 hookscore_es.py hooks.txt --json
"""

import argparse
import json
import re
import statistics
import sys

WORD_RE = re.compile(r"[\w$€%'’-]+")
NUMBER_RE = re.compile(
    r"[$€£]\s?\d[\d.,]*"
    r"|\b\d[\d.,]*\s?"
    r"(?:%|k\b|x\b|h\b|horas?\b|mins?\b|minutos?\b|d[ií]as?\b|semanas?\b"
    r"|mes(?:es)?\b|a[nñ]os?\b|€|usd\b|euros?\b|d[oó]lares\b|pesos\b)?",
    re.IGNORECASE)
PROPER_RE = re.compile(r"(?<![.!?¿¡]\s)(?<![¿¡])(?<!^)\b[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{2,}\b",
                       re.MULTILINE)
HASHTAG_RE = re.compile(r"(?:^|\s)#\w+")
EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF☀-➿]")

# "cero dólares" y "veinte mil" son tan concretos como "$0" y "$20.000".
# "uno/una" y "primero" quedan fuera a propósito: casi siempre son relleno.
SPOKEN_NUMBERS = {
    "cero", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
    "diez", "once", "doce", "quince", "veinte", "treinta", "cuarenta",
    "cincuenta", "sesenta", "setenta", "ochenta", "noventa", "cien", "ciento",
    "cientos", "mil", "miles", "millón", "millones", "docena", "mitad",
    "doble", "triple",
}
MONEY_WORDS = {
    "dólares", "dólar", "pesos", "euros", "euro", "plata", "lana", "billete",
    "billetes", "centavos", "porcentaje", "millonario", "ingresos", "ganancia",
    "ganancias", "sueldo", "salario", "renta", "facturación", "ventas",
}

# Palabras que ponen algo en juego. Sin ninguna, el hook es una afirmación.
STAKES = {
    "nunca", "jamás", "error", "errores", "equivocado", "equivocada", "mal",
    "perdí", "perder", "pierdes", "pierde", "perdiste", "costó", "cuesta",
    "costar", "rompió", "fracaso", "fracasé", "fallé", "fallo", "nadie", "no",
    "ni", "sin", "deja", "dejes", "dejé", "dejar", "despedido", "despidieron",
    "borré", "borrar", "mata", "matar", "reemplaza", "reemplazar", "gratis",
    "pagué", "pagar", "pagan", "cobré", "cobrar", "cobras", "contraté",
    "ahorré", "prohibido", "ilegal", "peor", "odio", "desperdicio", "estafa",
    "mentira", "mintieron", "verdad", "secreto", "oculto", "escondido",
    "robó", "antes", "hasta", "pero", "excepto", "salvo", "problema",
    "riesgo", "peligro", "cuidado", "arrepiento", "ojalá", "debería",
    "todavía", "ya", "solo", "sólo", "solamente", "versus", "vs", "realmente",
    "primero", "primera", "cancelé", "cancelaron", "quebré", "quebró",
}

# Aperturas que gastan el primer segundo sin decir nada (palabras completas).
WEAK_OPENERS = [
    "bueno", "ok", "okay", "hola", "chicos", "chicas", "amigos", "oye",
    "bienvenidos", "bienvenidas", "hoy", "básicamente", "honestamente", "mira",
    "escucha", "eh", "este", "vamos", "quiero", "quería", "uno de", "una de",
    "alguna vez", "sabías que", "sabes que", "en este", "en el video",
    "lo que", "hay", "esto es", "como", "cuando", "ya sabes", "o sea",
    "entonces", "pues", "bien",
]

IMPERATIVES = {
    "deja", "copia", "roba", "borra", "prueba", "mira", "lee", "guarda", "usa",
    "construye", "haz", "escribe", "envía", "toma", "empieza", "nunca",
    "siempre", "no", "pon", "corre", "revisa", "olvida", "imagina", "piensa",
    "evita", "cobra", "para", "deten", "detén", "cuenta", "dime",
}

DEALBREAKERS = [
    (re.compile(r"(?i)^\s*(?:deja de (?:hacer )?scroll(?:ear)?|no (?:hagas|sigas) (?:haciendo )?scroll|no deslices|no pases de largo)"),
     "Abre con \"deja de hacer scroll\". Pedir atención demuestra que no te la has ganado."),
    (re.compile(r"(?i)\b(?:en (?:este|el de hoy) (?:video|vídeo|reel)|en el (?:video|vídeo|reel) de hoy|hoy te voy a (?:mostrar|enseñar)|te voy a (?:mostrar|enseñar|explicar) c[oó]mo|voy a mostrarte)\b"),
     "Preámbulo de video. Bórralo y abre con lo importante."),
    (re.compile(r"(?i)^\s*(?:hola|buenas|qu[eé] tal|bienvenid[oa]s?|hey\b|oye\b)"),
     "Saludo. Nadie abre el feed para que lo saluden."),
    (HASHTAG_RE,
     "Hashtag en el hook. Los hashtags van al final del caption, si van."),
    (EMOJI_RE,
     "Emoji en el hook. A tamaño de hook cabe una palabra o un emoji, no ambos."),
]


def clamp(n):
    return max(0.0, min(100.0, n))


def norm_numbers(text):
    # "18.000" y "3,5" se dicen como una sola cifra, así que cuentan como una palabra.
    return re.sub(r"(?<=\d)[.,](?=\d)", "", text)


def words(text):
    return WORD_RE.findall(norm_numbers(text))


def stripq(w):
    return w.lower().strip("'’")


def check_length(text):
    """El hook tiene que aterrizar antes de que se mueva el pulgar."""
    n = len(words(text))
    secs = n / 3.0                       # ~180 palabras por minuto, hablado
    chars = len(text.strip())
    if 6 <= n <= 14:
        score = 100.0
    elif n < 6:
        score = clamp(100 - (6 - n) * 18)
    else:
        score = clamp(100 - (n - 14) * 10)
    if chars > 70:                       # dos líneas de texto grande en pantalla
        score -= 12
    return clamp(score), f"{n} palabras, {chars} caracteres, ~{secs:.1f}s hablado (ideal 6-14 palabras)"


def check_specificity(text):
    """Una cosa concreta vale más que tres abstractas."""
    nums = [n.strip() for n in NUMBER_RE.findall(text) if n.strip()]
    propers = set(PROPER_RE.findall(text))
    low = [stripq(w) for w in words(text)]
    spoken = [w for w in low if w in SPOKEN_NUMBERS or w in MONEY_WORDS]
    hits = len(nums) + len(propers) + len(spoken)
    score = 15.0 if hits == 0 else clamp(45 + hits * 30)
    found = ", ".join(nums[:2] + sorted(propers)[:2] + spoken[:2])
    return score, (f"{hits} marcador(es) concreto(s)" + (f": {found}" if found else
                   " - sin número, sin nombre, nada verificable"))


def check_stakes(text):
    """Tensión, costo, negación. Algo que el espectador puede perder."""
    hits = [x for x in (stripq(w) for w in words(text)) if x in STAKES]
    markers = sorted(set(hits))
    if re.search(r"[$€]\s?\d", text):
        markers.append("un precio")
    n = len(markers)
    score = {0: 20.0, 1: 70.0}.get(n, 100.0)
    detail = f"{n} marcador(es) de tensión" + (f": {', '.join(markers[:4])}" if markers else
                                              " - no hay nada en juego en esta línea")
    return clamp(score), detail


def check_frontload(text):
    """La palabra interesante no puede estar en la posición nueve."""
    w = words(text)
    if not w:
        return 0.0, "vacío"
    low = [stripq(x) for x in w]
    penalty, hit_opener = 0, None
    for weak in WEAK_OPENERS:
        parts = weak.split()
        if low[:len(parts)] == parts:
            penalty, hit_opener = 30, weak
            break
    payload = None
    for i, token in enumerate(low):
        if (token in STAKES or token in SPOKEN_NUMBERS or token in MONEY_WORDS
                or NUMBER_RE.match(w[i]) or (i and PROPER_RE.match(w[i]))):
            payload = i
            break
    if payload is None:
        base, where = 30.0, "ninguna palabra clave en toda la línea"
    elif payload <= 3:
        base, where = 100.0, f"lo importante está en la palabra {payload + 1}"
    elif payload <= 6:
        base, where = 70.0, f"lo importante está en la palabra {payload + 1}, se puede adelantar"
    else:
        base, where = 40.0, f"lo importante está en la palabra {payload + 1}, llega tarde"
    detail = where + (f"; apertura débil \"{hit_opener}\"" if hit_opener else "")
    return clamp(base - penalty), detail


def check_address(text):
    """Dirigido a un espectador, o flotando en el aire."""
    low = text.lower()
    w = [stripq(x) for x in words(text)]
    if re.search(r"\b(tú|tu|tus|ti|te|contigo|vos|usted|ustedes|tuyo|tuya)\b", low):
        return 100.0, "le habla al espectador"
    if w and w[0] in IMPERATIVES:
        return 90.0, f"abre con imperativo (\"{w[0]}\")"
    if re.search(r"\b(yo|mi|mis|mí|me|nosotros|nos|nuestro|nuestra)\b", low):
        return 70.0, "primera persona, sin nombrar al espectador"
    # El español omite el pronombre: "Perdí", "Cobré", "Aprendimos" ya son primera persona.
    if w and re.search(r"(?:é|í|amos|emos|imos)$", w[0]) and w[0] not in {"sí", "así", "aquí", "allí", "café"}:
        return 70.0, f"primera persona por el verbo (\"{w[0]}\"), sin nombrar al espectador"
    return 35.0, "tercera persona, no hay nadie en la sala"


CHECKS = ["LONGITUD", "ESPECIFICIDAD", "EN JUEGO", "FRENTE", "DIRIGIDO"]
FUNCS = [check_length, check_specificity, check_stakes, check_frontload, check_address]


def run(text):
    results = {name: fn(text) for name, fn in zip(CHECKS, FUNCS)}
    flags = [msg for pattern, msg in DEALBREAKERS if pattern.search(text)]
    scores = [results[c][0] for c in CHECKS]
    # La propiedad más débil limita al hook: con una mala basta para que siga el scroll.
    overall = clamp(statistics.mean(scores) * 0.6 + min(scores) * 0.4 - len(flags) * 15)
    verdict = "FUERTE" if overall >= 70 and min(scores) >= 55 and not flags else (
        "OK" if overall >= 50 else "DÉBIL")
    return results, overall, verdict, flags


def bar(score, width=24):
    filled = round(score / 100 * width)
    return "#" * filled + "." * (width - filled)


def render_one(text, results, overall, verdict, flags, out=sys.stdout):
    print("\nPUNTAJE DEL HOOK", file=out)
    print("=" * 62, file=out)
    print(f"  \"{text.strip()}\"\n", file=out)
    for name in CHECKS:
        score, detail = results[name]
        print(f"  {name:<14} {bar(score)} {score:5.1f}", file=out)
        print(f"  {'':<14} {detail}", file=out)
    print("-" * 62, file=out)
    print(f"  {'TOTAL':<14} {bar(overall)} {overall:5.1f}   {verdict}", file=out)
    for f in flags:
        print(f"\n  DEALBREAKER  {f}", file=out)
    if verdict != "FUERTE":
        weakest = min(CHECKS, key=lambda c: results[c][0])
        print(f"\n  Propiedad más débil: {weakest}. Arréglala y vuelve a correrlo.", file=out)
    print("", file=out)


def render_table(rows, out=sys.stdout):
    print("\nRANKING DE HOOKS\n" + "=" * 78, file=out)
    for i, r in enumerate(rows, 1):
        mark = "->" if i == 1 else "  "
        hook = r["hook"] if len(r["hook"]) <= 62 else r["hook"][:59] + "..."
        print(f"{mark} {r['score']:5.1f} {r['verdict']:<7} {hook}", file=out)
        print(f"        más débil: {r['weakest']} ({r['checks'][r['weakest']]['score']:.0f})", file=out)
        for f in r["flags"]:
            print(f"        dealbreaker: {f}", file=out)
    print("\nGraba el primero. Si el primero está bajo 50, ninguno es el hook.\n", file=out)


def main():
    ap = argparse.ArgumentParser(description="Puntúa un hook de Reel en cinco propiedades.")
    ap.add_argument("input", nargs="?", default="-", help="archivo con un hook por línea, o -")
    ap.add_argument("--hook", help="puntúa un solo hook dado en la línea de comandos")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.hook:
        lines = [args.hook]
    else:
        raw = sys.stdin.read() if args.input == "-" else open(args.input, encoding="utf-8").read()
        lines = [l.strip() for l in raw.splitlines() if l.strip()]
    if not lines:
        print("nada que puntuar", file=sys.stderr)
        sys.exit(2)

    payload = []
    for line in lines:
        results, overall, verdict, flags = run(line)
        payload.append({
            "hook": line,
            "checks": {k: {"score": round(v[0], 1), "detail": v[1]} for k, v in results.items()},
            "weakest": min(CHECKS, key=lambda c: results[c][0]),
            "flags": flags,
            "score": round(overall, 1),
            "verdict": verdict,
        })

    if args.json:
        print(json.dumps(payload if len(payload) > 1 else payload[0], indent=2, ensure_ascii=False))
        return
    if len(payload) == 1:
        results, overall, verdict, flags = run(lines[0])
        render_one(lines[0], results, overall, verdict, flags)
    else:
        render_table(sorted(payload, key=lambda r: -r["score"]))
    sys.exit(0 if max(p["score"] for p in payload) >= 70 else 1)


if __name__ == "__main__":
    main()
