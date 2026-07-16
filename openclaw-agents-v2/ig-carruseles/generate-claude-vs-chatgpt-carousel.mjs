import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const OUTPUT_DIR = './carousel-images-claude-vs-chatgpt';
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
HERRAMIENTAS DE IA · 2026

Main headline (white, extra bold, very large, centered, 3 lines):
¿Claude.ai
o ChatGPT
Work?

Subtext (gray, medium, centered, 2 lines):
Depende de cómo trabajas,
no de cuál es "mejor".

Small bottom line (gray, small, centered):
Desliza para saber cuál te conviene.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Two abstract glowing orbs side by side — one warm green (left), one neutral blue-gray (right) — connected by a thin dividing line. Very dark background, cinematic, minimal.`
  },
  {
    filename: 's2-diferencia.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Slide number top-left (bright green, small): 01

Headline (white, extra bold, large, centered, 2 lines):
No es un versus.
Es una diferencia estructural.

Left card (dark surface, rounded):
  Label (bright green, small caps): CLAUDE.AI
  Body text (white, medium):
    Colaborador continuo.
    Construyes contexto una vez
    y lo reutilizas en cada chat.
  Tag (bright green, small): Trabaja contigo

Right card (dark surface, rounded):
  Label (gray, small caps): CHATGPT WORK
  Body text (white, medium):
    Delegado de tareas discretas.
    Le das un objetivo,
    regresa con el entregable listo.
  Tag (gray, small): Trabaja por ti

Small text bottom (gray, small, centered):
Ninguno es superior. Son herramientas distintas
para formas distintas de trabajar.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Two abstract visual metaphors — left side shows continuous flow/collaboration nodes, right side shows a completed task output. Dark, minimal, premium.`
  },
  {
    filename: 's3-cuando-claude.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Slide number top-left (bright green, small): 02

Headline (white, extra bold, large, centered, 2 lines):
Usa Claude.ai
cuando...

Dark card (centered, rounded, dark surface) with 4 bullet points — each bullet is a small green dot:
  · Necesitas que la IA "sepa" tu negocio sin repetir contexto cada vez
  · Iteras en vivo sobre documentos, código, propuestas o estrategia
  · La calidad de escritura y el matiz del tono importan mucho
  · Quieres construir un sistema de conocimiento que crece con el tiempo

Bottom line (bright green, bold, centered):
Trabajas CON la IA,
todos los días, en cosas que evolucionan.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Abstract continuous flow — nodes connected in a loop, representing ongoing collaboration. Green glow, very dark background.`
  },
  {
    filename: 's4-cuando-chatgpt.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Slide number top-left (bright green, small): 03

Headline (white, extra bold, large, centered, 2 lines):
Usa ChatGPT Work
cuando...

Dark card (centered, rounded, dark surface) with 3 bullet points — each bullet is a small gray dot:
  · Quieres delegar un objetivo completo y recibir el entregable terminado
  · Tienes flujos conectados a Microsoft, Google u otras apps y quieres que jale datos de ahí solo
  · No necesitas iterar en vivo — revisas el resultado al final

Bottom line (white, bold, centered):
Le das una tarea,
te vas, y vuelves con el trabajo hecho.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Abstract single arrow from input to output — task in, deliverable out. Neutral blue-gray tones, very dark background, minimal.`
  },
  {
    filename: 's5-regla.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Slide number top-left (bright green, small): 04

Headline (white, extra bold, large, centered, 2 lines):
La regla rápida
para decidir.

Dark card left (rounded, dark surface):
  Label (bright green, small caps): CLAUDE.AI
  Body text (white, medium):
    Vuelves todos los días
    a trabajar CON la IA
    en cosas que evolucionan.

Dark card right (rounded, dark surface):
  Label (gray, small caps): CHATGPT WORK
  Body text (white, medium):
    Aprietas un botón
    una vez por semana
    y recibes un documento terminado.

Small text bottom (gray, small, centered):
Marketing · estrategia · contenido · decisiones → Claude.ai
Reportes · resúmenes · tareas puntuales → ChatGPT Work

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Two paths diverging from a central point — one looping back (left, green), one going straight to an endpoint (right, gray). Dark, clean, premium.`
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
  · No tienes que elegir uno — puedes usar los dos para cosas distintas
  · Elegir mal la herramienta no arruina el trabajo, pero sí te cuesta tiempo
  · La ventaja real está en entender para qué es cada una
  · La IA más útil no es la más inteligente, es la que encaja con tu flujo

Bottom line (bright green, bold, centered):
La herramienta correcta
para el trabajo correcto.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Abstract business workflow nodes — some looping, some linear — each in the right lane. Premium, dark, reassuring.`
  },
  {
    filename: 's7-cta.jpg',
    prompt: `${DS}

Design a premium dark Instagram carousel CTA slide (1080x1080px).

VISIBLE TEXT ONLY — render exactly this, nothing else:

Headline (white, extra bold, large, centered, 3 lines):
Hay más herramientas
de IA de las que
puedes revisar solo.

Body text (gray, medium, centered, 3 lines):
Todos los días publicamos
qué usar, cuándo usarlo,
y cómo aplicarlo en tu negocio.

Thin horizontal divider line (very subtle, dark gray)

Bottom call to action (white, bold, centered, 2 lines):
Sigue la cuenta
para no perderte nada.

Small tagline (gray, small, centered):
Contenido práctico para dueños de negocio.

Handle bottom-right (gray, very small): @lynkroio

VISUAL ATMOSPHERE: Large soft green glow from center, expansive and calm. Minimal dark background, cinematic, premium.`
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
