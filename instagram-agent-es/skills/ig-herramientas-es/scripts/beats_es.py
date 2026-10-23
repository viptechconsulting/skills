#!/usr/bin/env python3
"""
beats_es.py - convierte el guion de un Reel en español en una hoja de beats
con tiempos, antes de grabar.

Port al español de beats.py (Jake Schincariol, MIT). Estima cuánto tarda cada
línea en decirse según palabras por minuto, apila los tiempos y avisa de lo
que mata un Reel en la edición: hook que pasa de 3 segundos, un beat tan largo
que el espectador se va, una racha de líneas sin nada concreto, y una duración
distinta a la que dijiste.

Los tiempos son estimaciones. El valor por defecto (180 ppm) es una suposición
para español hablado, no una medición: cronométrate leyendo un guion en voz
alta y pásalo con --wpm.

Uso
  python3 beats_es.py guion.txt --target 30
  python3 beats_es.py guion.txt --wpm 190 --target 45
  python3 beats_es.py guion.txt --json
"""

import argparse
import json
import re
import sys

WORD_RE = re.compile(r"[\w$€%'’-]+")
SENT_RE = re.compile(r"[^.!?]+[.!?]*")
CONCRETE_RE = re.compile(
    r"[$€£]\s?\d|\b\d[\d.,]*\b"
    r"|(?<![.!?¿¡]\s)(?<![¿¡])(?<!^)\b[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{2,}\b", re.MULTILINE)
STOPWORDS = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "pero",
    "si", "de", "del", "al", "a", "en", "por", "para", "con", "que", "esto",
    "eso", "es", "son", "era", "fue", "ser", "estar", "está", "tú", "tu",
    "tus", "yo", "mi", "mis", "me", "nos", "te", "se", "lo", "le", "les",
    "su", "sus", "ya", "no", "sí", "muy", "más", "como", "cómo", "qué",
    "todo", "todos", "he", "has", "ha", "hay", "tengo", "tiene",
}

HOOK_WINDOW = 3.0        # segundos. Pasado esto, el pulgar ya decidió.
MAX_BEAT = 4.0           # segundos en una idea sin cambio en pantalla.
ABSTRACT_RUN = 3         # beats seguidos sin nada verificable.


def words(text):
    return WORD_RE.findall(re.sub(r"(?<=\d)[.,](?=\d)", "", text))


def pretty(token):
    return re.sub(r"(\d)(?=(\d{3})+$)", r"\1.", token)


def tc(seconds):
    m, s = divmod(seconds, 60)
    return f"{int(m)}:{s:04.1f}"


def split_beats(raw, wps):
    """Una línea es un beat, salvo que sea demasiado larga para serlo."""
    beats = []
    for line in [l.strip() for l in raw.splitlines()]:
        if not line:
            continue
        if len(words(line)) / wps <= MAX_BEAT * 1.5:
            beats.append(line)
            continue
        parts = [p.strip() for p in SENT_RE.findall(line) if p.strip()]
        buf = ""
        for part in parts:
            candidate = (buf + " " + part).strip()
            if buf and len(words(candidate)) / wps > MAX_BEAT:
                beats.append(buf)
                buf = part
            else:
                buf = candidate
        if buf:
            beats.append(buf)
    return beats


def analyse(raw, wpm=180, target=None):
    wps = wpm / 60.0
    beats = split_beats(raw, wps)
    if not beats:
        return None

    rows, clock = [], 0.0
    for i, text in enumerate(beats):
        n = len(words(text))
        dur = n / wps
        rows.append({"n": i + 1, "start": round(clock, 2), "dur": round(dur, 2),
                     "words": n, "text": text,
                     "concrete": len(CONCRETE_RE.findall(text)), "label": "", "flags": []})
        clock += dur
    total = clock

    for r in rows:
        if r["n"] == 1 or r["start"] + r["dur"] <= HOOK_WINDOW:
            r["label"] = "HOOK"
    rows[-1]["label"] = "CTA" if rows[-1]["label"] != "HOOK" else "HOOK/CTA"
    half = total / 2
    for r in rows:
        if not r["label"] and r["start"] <= half < r["start"] + r["dur"]:
            r["label"] = "MEDIO"

    notes = []
    if rows[0]["dur"] > HOOK_WINDOW:
        rows[0]["flags"].append(f"el hook dura {rows[0]['dur']:.1f}s, pasa de {HOOK_WINDOW:.0f}s")
        notes.append(f"El beat 1 tarda {rows[0]['dur']:.1f}s en decirse. Recórtalo a "
                     f"{int(HOOK_WINDOW * wps)} palabras o menos, o el hook llega cuando "
                     "la decisión ya está tomada.")
    if rows[0]["concrete"] == 0:
        notes.append("El beat 1 no tiene número ni nombre. Los hooks sin algo verificable "
                     "son los que se saltan.")

    for r in rows:
        if r["dur"] > MAX_BEAT:
            r["flags"].append(f"{r['dur']:.1f}s en un solo beat")
    long_beats = [r["n"] for r in rows if r["dur"] > MAX_BEAT]
    if long_beats:
        notes.append(f"Beat(s) {', '.join(map(str, long_beats))} pasan de {MAX_BEAT:.0f}s. "
                     "Divide la línea o cambia lo que hay en pantalla dentro de ella. "
                     "Un plano estático es donde la gente se va.")

    run, start = 0, None
    for r in rows:
        if r["concrete"] == 0:
            run += 1
            start = start if start is not None else r["n"]
            if run == ABSTRACT_RUN:
                notes.append(f"Beats {start}-{r['n']} no tienen nada concreto. "
                             "Pon un número, un nombre o un precio en uno de ellos.")
        else:
            run, start = 0, None

    first = {w.lower() for w in words(rows[0]["text"]) if w.lower() not in STOPWORDS}
    last = {w.lower() for w in words(rows[-1]["text"]) if w.lower() not in STOPWORDS}
    loop = sorted(pretty(w) for w in first & last)
    if loop:
        notes.append(f"Hace loop: el último beat repite \"{', '.join(loop[:3])}\" del hook. "
                     "Las segundas vistas son alcance gratis.")
    else:
        notes.append("Sin loop. El último beat no comparte ninguna palabra con el hook, "
                     "así que el video termina plano. Repetir una palabra del beat 1 es la "
                     "forma más barata de provocar una segunda vista.")

    if target:
        delta = total - target
        if abs(delta) <= target * 0.1:
            notes.append(f"Duración en el objetivo ({total:.1f}s frente a {target}s).")
        elif delta > 0:
            notes.append(f"{delta:.1f}s por encima del objetivo. Recorta unas {int(delta * wps)} palabras.")
        else:
            notes.append(f"{-delta:.1f}s por debajo del objetivo. Agrega {int(-delta * wps)} palabras "
                         "o grábalo corto. Corto casi siempre es lo correcto.")

    return {"wpm": wpm, "target": target, "total_seconds": round(total, 2),
            "total_words": sum(r["words"] for r in rows), "beats": rows, "notes": notes}


def render(a, out=sys.stdout):
    head = (f"HOJA DE BEATS  ·  {a['total_words']} palabras  ·  ~{a['total_seconds']:.1f}s "
            f"a {a['wpm']} ppm" + (f"  ·  objetivo {a['target']}s" if a["target"] else ""))
    print("\n" + head, file=out)
    print("=" * max(len(head), 72), file=out)
    for r in a["beats"]:
        label = f"{r['label']:<8}" if r["label"] else " " * 8
        print(f"  {tc(r['start'])}  {r['dur']:4.1f}s  {label}{r['text']}", file=out)
        for f in r["flags"]:
            print(f"  {'':>6}  {'':>5}  {'':<8}^ {f}", file=out)
    print("-" * max(len(head), 72), file=out)
    for n in a["notes"]:
        print(f"  - {n}", file=out)
    print("", file=out)


def main():
    ap = argparse.ArgumentParser(description="Convierte un guion de Reel en hoja de beats.")
    ap.add_argument("input", nargs="?", default="-", help="archivo del guion, o - para stdin")
    ap.add_argument("--wpm", type=float, default=180, help="palabras por minuto (default 180)")
    ap.add_argument("--target", type=float, help="duración objetivo en segundos")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    raw = sys.stdin.read() if args.input == "-" else open(args.input, encoding="utf-8").read()
    a = analyse(raw, wpm=args.wpm, target=args.target)
    if not a:
        print("guion vacío", file=sys.stderr)
        sys.exit(2)
    if args.json:
        print(json.dumps(a, indent=2, ensure_ascii=False))
    else:
        render(a)


if __name__ == "__main__":
    main()
