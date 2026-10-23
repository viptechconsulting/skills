#!/usr/bin/env python3
"""
caption_es.py - revisa un caption de Instagram en español y muestra
exactamente lo que el feed enseña antes del "... más".

Port al español de caption.py (Jake Schincariol, MIT). Instagram muestra
unas 125 caracteres del caption en el feed y esconde el resto tras un toque.
Ese corte es una aproximación: cambia con el dispositivo, la fuente y los
saltos de línea. Ajusta con --truncate.

Cambios respecto al original: hashtags con acentos y ñ (#diseño), CTAs en
español, link en bio como "enlace/link en bio", el CTA "comenta PALABRA"
exige la palabra clave en MAYÚSCULAS (el original aceptaba cualquier palabra
tras "comment"), y hashtags genéricos en español.

LÍMITE DE HASHTAGS: el original afirma que Instagram lo bajó de 30 a 5 el
18-dic-2025. No lo verifiqué; confírmalo en Instagram antes de depender de
ese número (constante HASHTAG_LIMIT).

Uso
  python3 caption_es.py caption.txt --keywords "software de contratos,pymes"
  python3 caption_es.py caption.txt --json
"""

import argparse
import json
import re
import sys
import textwrap

LIMIT = 2200
TRUNCATE = 125
HASHTAG_LIMIT = 5

HASHTAG_RE = re.compile(r"(?:^|\s)(#\w+)")
MENTION_RE = re.compile(r"(?:^|\s)(@[\w.]+)")
LINK_RE = re.compile(r"https?://\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|io|net|org|ai|app|es|mx)(?:/\S*)?",
                     re.IGNORECASE)
EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF☀-➿←-⇿️]")
CONCRETE_RE = re.compile(
    r"[$€£]\s?\d|\b\d[\d.,]*\b"
    r"|(?<![.!?¿¡]\s)(?<![¿¡])(?<!^)\b[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{2,}\b", re.MULTILINE)

ASKS = [
    (re.compile(r"(?i:\bcomenta)\s+(?:(?i:la palabra)\s+)?[\"“]?[A-ZÁÉÍÓÚÑ0-9]{2,}\b"), "comentar una palabra clave"),
    (re.compile(r"(?i)\b(?:escr[ií]beme|m[aá]ndame (?:un )?(?:dm|mensaje)|(?:dm|mensaje directo) (?:a mí|conmigo))\b|\bdm me\b"), "escríbeme por DM"),
    (re.compile(r"(?i)\bguarda (?:esto|este|esta|el post|el reel)\b"), "guardar"),
    (re.compile(r"(?i)\bcomparte (?:esto|este|esta|con)\b"), "compartir"),
    (re.compile(r"(?i)\bs[ií]gueme\b|\bsigue (?:mi|la cuenta)\b"), "seguir"),
    (re.compile(r"(?i)\b(?:link|enlace) en (?:mi )?bio\b"), "link en bio"),
    (re.compile(r"(?i)\b(?:desliza|toca)\b"), "deslizar o tocar"),
    (re.compile(r"(?i)\bcu[eé]ntame\b|\bdime\b|\bqu[eé] har[ií]as\b|\bcu[aá]l prefieres\b"), "responder una pregunta"),
]

FILLER_TAGS = {"#viral", "#fyp", "#parati", "#paratii", "#explora", "#explore",
               "#explorepage", "#instagood", "#amor", "#love", "#follow", "#seguidores",
               "#like4like", "#follow4follow", "#reels", "#reelsinstagram", "#viralreels",
               "#instadaily", "#tendencia", "#trending", "#foryou"}


def visible_window(text, cut):
    flat = text.strip()
    return flat if len(flat) <= cut else flat[:cut]


def render_box(window, truncated, out=sys.stdout, width=52):
    print("\n  LO QUE MUESTRA EL FEED", file=out)
    print("  +" + "-" * (width + 2) + "+", file=out)
    lines = []
    for raw in window.split("\n"):
        lines.extend(textwrap.wrap(raw, width) or [""])
    for line in lines[:8]:
        print(f"  | {line:<{width}} |", file=out)
    tail = "... más" if truncated else "(cabe completo)"
    print("  +" + "-" * (width + 2 - len(tail) - 2) + f" {tail} " + "+", file=out)


def analyse(text, cut=TRUNCATE, keywords=None):
    stripped = text.rstrip().strip()
    chars = len(stripped)
    lines = stripped.split("\n")
    first_line = lines[0].strip() if lines else ""
    tags = HASHTAG_RE.findall(stripped)
    mentions = MENTION_RE.findall(stripped)
    links = LINK_RE.findall(stripped)
    emoji = EMOJI_RE.findall(stripped)
    window = visible_window(stripped, cut)
    truncated = chars > cut
    asks = [name for pattern, name in ASKS if pattern.search(stripped)]
    filler = [t for t in tags if t.lower() in FILLER_TAGS]
    keywords = [k.strip() for k in (keywords or []) if k.strip()]

    checks = []

    def add(name, status, detail):
        checks.append({"check": name, "status": status, "detail": detail})

    add("LONGITUD", "FAIL" if chars > LIMIT else "PASS",
        f"{chars} / {LIMIT} caracteres" + (f", {chars - LIMIT} de más" if chars > LIMIT else ""))

    if not first_line:
        add("PRIMERA LÍNEA", "FAIL", "el caption abre con una línea en blanco")
    elif first_line.startswith("#") or first_line.startswith("@"):
        add("PRIMERA LÍNEA", "FAIL", "abre con hashtag o mención, la única posición que merece una frase")
    elif len(first_line) > cut:
        add("PRIMERA LÍNEA", "WARN",
            f"{len(first_line)} caracteres, se corta en {cut} a media idea. "
            "Bien si el corte es un suspenso, mal si es una subordinada")
    else:
        add("PRIMERA LÍNEA", "PASS", f"{len(first_line)} caracteres, aterriza completa")

    ok = bool(CONCRETE_RE.search(window))
    add("HOOK CONCRETO", "PASS" if ok else "WARN",
        f"{len(CONCRETE_RE.findall(window))} número(s) o nombre(s) en la ventana visible"
        + ("" if ok else " - nada verificable antes del toque"))

    if len(tags) > HASHTAG_LIMIT:
        add("HASHTAGS", "FAIL", f"{len(tags)} hashtags, sobre el tope de {HASHTAG_LIMIT} "
                                "(constante a confirmar). Usa menos y más específicos")
    elif len(tags) == HASHTAG_LIMIT and filler:
        add("HASHTAGS", "WARN", f"{len(tags)} hashtags, en el tope, {len(filler)} genéricos. Gasta los cinco en temas")
    elif filler:
        add("HASHTAGS", "WARN", f"{len(tags)} hashtags, {len(filler)} genéricos "
                                f"({', '.join(filler[:3])}). No describen nada")
    else:
        add("HASHTAGS", "PASS", f"{len(tags)} hashtag(s)" + (f": {' '.join(tags)}" if tags else ""))

    if not tags:
        add("POSICIÓN HASHTAGS", "PASS", "no hay hashtags que ubicar")
    elif any(re.search(r"(?:^|\s)" + re.escape(t) + r"\b", window) for t in tags):
        add("POSICIÓN HASHTAGS", "WARN", "hay un hashtag en la ventana visible, gastando espacio en una etiqueta")
    else:
        add("POSICIÓN HASHTAGS", "PASS", "los hashtags quedan bajo el corte")

    add("LINKS", "WARN" if links else "PASS",
        (f"{len(links)} link(s) en el caption y los captions no son clicables. "
         "Muévelo a la bio o al DM") if links else "sin links muertos en el cuerpo")

    if len(asks) == 1:
        add("UN SOLO PEDIDO", "PASS", f"un llamado a la acción: {asks[0]}")
    elif not asks:
        add("UN SOLO PEDIDO", "WARN", "sin llamado a la acción. Decide para qué es este post")
    else:
        add("UN SOLO PEDIDO", "WARN", f"{len(asks)} pedidos ({', '.join(asks)}). Dos pedidos equivalen a ninguno")

    density = len(emoji) * 100 / max(chars, 1)
    add("EMOJI", "WARN" if density > 4 else "PASS",
        f"{len(emoji)} emoji, {density:.1f} por cada 100 caracteres"
        + (" - se lee como decoración" if density > 4 else ""))

    if keywords:
        low = stripped.lower()
        found = [k for k in keywords if k.lower() in low]
        missing = [k for k in keywords if k.lower() not in low]
        in_window = [k for k in found if k.lower() in window.lower()]
        status = "PASS" if not missing else ("WARN" if found else "FAIL")
        add("TÉRMINOS DE BÚSQUEDA", status,
            f"{len(found)}/{len(keywords)} presentes"
            + (f", {len(in_window)} en la ventana visible" if found else "")
            + (f". Faltan: {', '.join(missing)}" if missing else ""))

    fails = sum(1 for c in checks if c["status"] == "FAIL")
    warns = sum(1 for c in checks if c["status"] == "WARN")
    verdict = "ARREGLAR" if fails else ("REVISAR" if warns else "LISTO")
    return {"characters": chars, "limit": LIMIT, "truncate_at": cut, "visible": window,
            "truncated": truncated, "first_line_chars": len(first_line),
            "hashtags": tags, "mentions": mentions, "links": links,
            "emoji": len(emoji), "asks": asks, "checks": checks, "verdict": verdict}


def render(a, out=sys.stdout):
    head = (f"REVISIÓN DE CAPTION  ·  {a['characters']} / {a['limit']} caracteres  ·  "
            f"{len(a['hashtags'])} hashtags  ·  {len(a['asks'])} pedido(s)")
    print("\n" + head, file=out)
    print("=" * max(len(head), 62), file=out)
    render_box(a["visible"], a["truncated"], out=out)
    print("", file=out)
    for c in a["checks"]:
        print(f"  {c['status']:<5} {c['check']:<21} {c['detail']}", file=out)
    print("-" * max(len(head), 62), file=out)
    print(f"  VEREDICTO  {a['verdict']}\n", file=out)


def main():
    ap = argparse.ArgumentParser(description="Revisa un caption de Instagram en español.")
    ap.add_argument("input", nargs="?", default="-", help="archivo del caption, o - para stdin")
    ap.add_argument("--truncate", type=int, default=TRUNCATE, help=f"caracteres antes de '... más' (default {TRUNCATE})")
    ap.add_argument("--keywords", default="", help="términos separados por coma por los que quieres que te encuentren")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    raw = sys.stdin.read() if args.input == "-" else open(args.input, encoding="utf-8").read()
    a = analyse(raw, cut=args.truncate, keywords=args.keywords.split(","))
    if args.json:
        print(json.dumps(a, indent=2, ensure_ascii=False))
    else:
        render(a)
    sys.exit(0 if a["verdict"] == "LISTO" else 1)


if __name__ == "__main__":
    main()
