import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const OUTPUT_DIR = './carousel-images-fable5-v2';
const MODEL = 'gemini-3.1-flash-image-preview';

// DESIGN SYSTEM — NEVER render any of this as visible text in the image
const DS = `
DESIGN SYSTEM (visual instructions only — render ZERO of this as text):
Canvas: 1080x1080px square. Background: very dark near-black #080a0e with subtle grain.
Dark cards: #111520 background, thin border #1a1e2a, rounded corners.
Green accent: bright #00e87a — used for labels, bullets, highlighted words.
Primary text: white. Secondary text: medium gray.
Font style: bold heavy sans-serif headlines, regular sans-serif body.
Footer: handle @lynkroio very small, bottom-right corner, gray.
NO emojis. NO italics. NO white backgrounds.
CRITICAL: Do not render hex codes, font names, CSS, or any design instruction as visible text.
`;

const slides = [
  {
    filename: 's1-cover.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel cover slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Top small label (bright green, small caps, centered, wide letter-spacing):
ANTHROPIC · JUNIO 2026

Product name (bright green, large bold, centered):
Claude Fable 5

Main headline (white, extra bold, very large, centered, 3 lines):
El modelo de IA
más poderoso
del mundo.

Subtext (gray, medium, centered):
Con los controles de seguridad
más rigurosos de la historia.

Small bottom line (gray, small, centered):
Desliza para entender qué significa esto.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Abstract glowing neural network nodes connected by bright green lines, very dark background, cinematic.`
  },
  {
    filename: 's2-dos-modelos.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Slide number top-left (bright green, small): 01

Headline (white, extra bold, large, centered, 2 lines):
No es un modelo.
Son dos.

Left card (dark surface, rounded):
  Label (bright green, small caps): FABLE 5
  Body text (white, medium):
    Para uso general.
    Filtros de seguridad
    los más rigurosos de la historia.
  Tag (bright green, small): Disponible para todos

Right card (dark surface, rounded):
  Label (gray, small caps): MYTHOS 5
  Body text (white, medium):
    Capacidades avanzadas
    de ciberseguridad.
    Solo para socios de defensa.
  Tag (gray, small): Acceso muy restringido

Small text bottom (gray, small, centered):
Anthropic separó poder de acceso.
Una decisión sin precedentes.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Two abstract orbs side by side — one green glowing (accessible), one larger with subtle lock (restricted). Very dark background.`
  },
  {
    filename: 's3-incidente.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Slide number top-left (bright green, small): 02

Headline (white, extra bold, large, centered, 2 lines):
Lo que pasó
al lanzar Fable 5.

Dark card (centered, rounded, dark surface) with 3 timeline events:

  Event 1:
    Date label (bright green, small): 9 JUN
    Text (white, medium): Anthropic lanza Fable 5 con los filtros
    de seguridad más rigurosos jamás aplicados.

  Event 2:
    Date label (gray, small): 12 JUN
    Text (white, medium): El gobierno detecta una técnica para
    eludir los filtros. Se emite una directiva de control.

  Event 3:
    Date label (bright green, small): 2 SEMANAS DESPUÉS
    Text (white, medium): Nuevo sistema entrenado. El problema
    bloqueado en más del 99% de los casos.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Faint timeline line in background, atmospheric dark feel.`
  },
  {
    filename: 's4-capacidades.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Slide number top-left (bright green, small): 03

Headline (white, extra bold, large, centered, 2 lines):
¿Por qué Fable 5
es diferente?

Subtext (gray, medium, centered):
No es solo más inteligente.
Es fundamentalmente más autónomo.

Dark card (centered, rounded, dark surface) with 4 bullet points — each bullet is a small green dot:
  · Planifica y ejecuta tareas complejas de múltiples pasos
  · Opera navegadores y sistemas sin supervisión constante
  · Completa proyectos enteros de forma autónoma
  · Capacidades de ciberseguridad sin paralelo entre modelos comerciales

Bottom line (white, bold, centered):
Por eso necesitaba los controles
más rigurosos de la historia.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Abstract expanding network nodes, powerful data flows, green glow, very dark background.`
  },
  {
    filename: 's5-seguridad.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Slide number top-left (bright green, small): 04

Headline (white, extra bold, large, centered, 3 lines):
La seguridad
más avanzada
de la industria.

Dark card (centered, rounded, dark surface):
  Label (bright green, small caps): DEFENSA EN CAPAS

  3 bullet points — each bullet is a small green dot:
  · El modelo rechaza solicitudes peligrosas por entrenamiento
  · Clasificadores en tiempo real detectan y bloquean abusos
  · Análisis retroactivo de patrones de uso

Small text below card (gray, small, centered):
Si una capa falla, las otras compensan.
El sistema más robusto hasta ahora.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Abstract concentric shield rings glowing softly in green. Defense in depth visual. Dark premium feel.`
  },
  {
    filename: 's6-impacto.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Slide number top-left (bright green, small): 05

Headline (white, extra bold, large, centered, 3 lines):
¿Qué significa esto
para tu negocio?

Dark card (centered, rounded, dark surface) with 4 bullet points — each bullet is a small green dot:
  · El modelo más poderoso llega con controles reales, no promesas
  · Los gobiernos revisan los modelos antes del lanzamiento
  · La industria tiene un estándar para medir riesgos por primera vez
  · Usar IA en tu operación es cada vez más seguro y regulado

Bottom line (bright green, bold, centered):
El poder de la IA y la responsabilidad
ya no son contradictorios.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Abstract business workflow nodes protected by a soft green shield glow. Reassuring, premium, dark.`
  },
  {
    filename: 's7-cta.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel CTA slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Headline (white, extra bold, large, centered, 3 lines):
El modelo más poderoso
del mundo ya existe.

Body text (gray, medium, centered, 3 lines):
Con controles de seguridad reales.
Con supervisión gubernamental.
Con acceso disponible para tu negocio.

Thin horizontal divider line (very subtle, dark gray)

Bottom call to action (white, bold, centered, 2 lines):
Sigue la cuenta para saber
cómo aprovecharlo.

Small tagline (gray, small, centered):
Todos los días, contenido práctico para dueños de negocio.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Large soft green glow from center, powerful and expansive. Cinematic, premium, minimal dark background.`
  }
];

async function generateSlide(slide) {
  console.log('Generando', slide.filename, '...');
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: slide.prompt }] }],
    config: { responseModalities: ['TEXT', 'IMAGE'] }
  });

  for (const part of res.candidates[0].content.parts) {
    if (part.inlineData) {
      const buf = Buffer.from(part.inlineData.data, 'base64');
      await fs.writeFile(`${OUTPUT_DIR}/${slide.filename}`, buf);
      console.log('  ✓', slide.filename, Math.round(buf.length / 1024) + 'KB');
      return;
    }
  }
  console.log('  ✗ No se generó imagen para', slide.filename);
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });

for (let i = 0; i < slides.length; i++) {
  await generateSlide(slides[i]);
  if (i < slides.length - 1) await new Promise(r => setTimeout(r, 2000));
}

console.log('\nListo.');
