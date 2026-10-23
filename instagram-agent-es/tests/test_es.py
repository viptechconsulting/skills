"""Pruebas mínimas de los scripts en español. Ejecutar: python3 -I tests/test_es.py"""
import importlib.util
import json
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(HERE, "..", "skills", "ig-herramientas-es", "scripts")


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(S, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


hook, beats, cap, hum, det = (load(n) for n in
                              ("hookscore_es", "beats_es", "caption_es", "humanize_es", "detect_es"))
LEX = json.load(open(os.path.join(S, "slop_es.json"), encoding="utf-8"))


class Hook(unittest.TestCase):
    def test_accents_stay_one_word(self):
        self.assertEqual(hook.words("más allá de la información"), ["más", "allá", "de", "la", "información"])

    def test_thousands_and_decimals(self):
        self.assertEqual(hook.words("18.000 y 3,5"), ["18000", "y", "35"])

    def test_greeting_is_dealbreaker(self):
        _, _, v, flags = hook.run("Hola chicos, hoy quiero hablarles de contenido")
        self.assertTrue(flags)
        self.assertEqual(v, "DÉBIL")

    def test_concrete_hook_beats_vague(self):
        good = hook.run("Perdí 18.000 dólares por una cláusula que no leí.")[1]
        bad = hook.run("Quería hablar un poco sobre el marketing en general")[1]
        self.assertGreater(good, bad + 30)

    def test_solo_not_penalised_as_so(self):
        # El original comparaba por prefijo; aquí solo palabras completas.
        _, detail = hook.check_frontload("Soluciones que nadie te cuenta jamás")
        self.assertNotIn("apertura débil", detail)


class Caption(unittest.TestCase):
    def test_accented_hashtag_counted_whole(self):
        a = cap.analyse("Hola\n#diseño #año")
        self.assertEqual(a["hashtags"], ["#diseño", "#año"])

    def test_keyword_cta_needs_uppercase(self):
        self.assertIn("comentar una palabra clave", cap.analyse("Comenta GUIA y te la envío")["asks"])
        self.assertNotIn("comentar una palabra clave", cap.analyse("comenta abajo qué opinas")["asks"])

    def test_truncation(self):
        a = cap.analyse("x" * 300)
        self.assertTrue(a["truncated"])
        self.assertEqual(len(a["visible"]), 125)


class Beats(unittest.TestCase):
    def test_long_hook_flagged(self):
        a = beats.analyse("Esta es una frase de apertura demasiado larga que nadie debería decir en un hook de reel nunca jamás", target=30)
        self.assertTrue(a["beats"][0]["flags"])


class Humanize(unittest.TestCase):
    def test_removes_slop_and_zero_width(self):
        out, rep = hum.humanize("Sin lugar a dudas, sumérgete en esto.​", LEX)
        self.assertNotIn("​", out)
        self.assertNotIn("Sin lugar", out)

    def test_natural_spanish_untouched(self):
        txt = "Cobré tres mil euros por una landing. Además, me pagaron a los dos días.\n"
        out, rep = hum.humanize(txt, LEX)
        self.assertEqual(out, txt)

    def test_no_orphan_punctuation(self):
        out, _ = hum.humanize("¡Deja de hacer scroll! Esto sí funciona.", LEX)
        self.assertNotIn("¡!", out)

    def test_lexicon_regexes_compile(self):
        import re
        for s in LEX["structures"]:
            re.compile(s["regex"])

    def test_agreement_pairs_present(self):
        finds = {e["find"] for e in LEX["words"]}
        for pair in ("innovador", "innovadora", "innovadores", "innovadoras"):
            self.assertIn(pair, finds)


class Detect(unittest.TestCase):
    def test_cleaning_raises_score(self):
        bad = "Sin lugar a dudas, cabe destacar que esto lo cambió todo. Sígueme para más contenido.​ No es solo marketing, es una revolución."
        clean, _ = hum.humanize(bad, LEX)
        self.assertGreater(det.run(clean, LEX)[1], det.run(bad, LEX)[1])


if __name__ == "__main__":
    unittest.main()
