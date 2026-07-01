import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const OUTPUT_DIR = './carousel-images-fable5';
const MODEL = 'gemini-3.1-flash-image-preview';

const STYLE = `
STYLE DNA (apply to every slide — never render these as text):
- Format: 1080x1080px square (Instagram carousel)
- Background: #080a0e ALWAYS — deep dark, subtle noise/grain texture
- Surface/cards: #111520 with border #1a1e2a
- Primary accent: #00e87a (bright green — highlights, key words)
- Text primary: #ffffff
- Text secondary: #8892a4
- Typography: Inter ExtraBold for headlines, Inter Regular for body
- Handle @lynkroio small footer bottom right, Inter Regular, #8892a4
- NO white backgrounds. NO light themes. ALWAYS dark #080a0e.
- NO emojis. NO italics.
- COPY: neutral Latin American Spanish. "tú/te/tienes/sigue". Never voseo.
- Style: premium dark magazine, clean, authoritative
`;

const slides = [
  {
    filename: 's1-cover.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel cover slide. Background #080a0e.

VISUAL: Abstract powerful neural network — large, complex, glowing nodes connected by bright green lines (#00e87a). Feels like the most advanced AI system ever built. Cinematic, powerful, dark.

SMALL LABEL TOP (small caps, #00e87a, centered):
"ANTHROPIC · JUNIO 2026"

PRODUCT NAME (Inter ExtraBold, #00e87a, large, centered):
"Claude Fable 5"

LARGE HEADLINE (Inter ExtraBold, white, centered, very large):
"El modelo de IA
más poderoso
del mundo."

BELOW (Inter Regular, #8892a4, medium, centered):
"Con los controles de seguridad
más estrictos de la historia."

SMALL BOTTOM (Inter Regular, #8892a4, small, centered):
"Desliza para entender qué significa esto."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's2-dos-modelos.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Two abstract orbs or nodes side by side — one large, glowing green (accessible), one larger with a subtle lock icon (restricted). Premium, minimal, clean.

SLIDE NUMBER: "01" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"No es un modelo.
Son dos."

TWO CARDS side by side (#111520, border #1a1e2a, rounded):

Left card:
LABEL (#00e87a, small caps): "FABLE 5"
TEXT (white, Inter Regular, medium):
"Para uso general.
Filtros de seguridad
más estrictos de la historia."
TAG (Inter ExtraBold, #00e87a, small): "Disponible para todos"

Right card:
LABEL (#8892a4, small caps): "MYTHOS 5"
TEXT (white, Inter Regular, medium):
"Capacidades ofensivas
únicas en ciberseguridad.
Solo para socios de defensa."
TAG (Inter ExtraBold, #8892a4, small): "Acceso muy restringido"

BELOW (Inter Regular, #8892a4, small, centered):
"Anthropic separó poder de acceso.
Una decisión sin precedentes."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's3-incidente.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Faint timeline with a brief disruption — a break in the line with a quick resolution. Atmospheric, dark.

SLIDE NUMBER: "02" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"Lo que pasó
al lanzar Fable 5."

DARK CARD (#111520, border #1a1e2a, rounded, centered):

TIMELINE STYLE — 3 events:

EVENT 1 (label #00e87a small): "9 JUN"
TEXT (white): "Anthropic lanza Fable 5 con los filtros de seguridad más fuertes jamás aplicados."

EVENT 2 (label #8892a4 small): "12 JUN"
TEXT (white): "El gobierno detecta una técnica para eludir los filtros. Se emite una directiva de control."

EVENT 3 (label #00e87a small): "2 SEMANAS DESPUÉS"
TEXT (white): "Nuevo clasificador entrenado. El problema bloqueado en más del 99% de los casos."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's4-capacidades.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract powerful capability visualization — expanding network, data flows, multiple task nodes running simultaneously. Powerful but controlled feel. Green glow.

SLIDE NUMBER: "03" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"¿Por qué Fable 5
es diferente?"

BODY (Inter Regular, #8892a4, medium, centered):
"No es solo más inteligente.
Es fundamentalmente más autónomo."

DARK CARD (#111520, border #1a1e2a, rounded, centered):

FOUR rows with green bullet (#00e87a):

• Planifica y ejecuta tareas complejas de múltiples pasos
• Opera navegadores, terminales y sistemas sin supervisión
• Completa proyectos enteros de forma autónoma
• Capacidades de ciberseguridad sin paralelo entre modelos comerciales

BELOW CARD (Inter ExtraBold, white, medium, centered):
"Por eso necesitaba los controles
más estrictos de la historia."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's5-seguridad.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract layered defense — multiple concentric shields or rings glowing in green, each layer slightly different. Defense in depth visual concept. Dark, premium.

SLIDE NUMBER: "04" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"La seguridad
más avanzada
de la industria."

DARK CARD (#111520, border #1a1e2a, rounded, centered):

LABEL (#00e87a, small caps): "DEFENSA EN CAPAS"

THREE rows with green bullet (#00e87a):

• El modelo rechaza solicitudes peligrosas por entrenamiento
• Clasificadores en tiempo real detectan y bloquean abusos
• Análisis retroactivo de patrones de uso

BELOW CARD (Inter Regular, #8892a4, small, centered):
"Si una capa falla, las otras compensan.
Ningún sistema es perfecto,
pero este es el más robusto hasta ahora."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's6-impacto.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract business operations protected by a green shield glow. Workflow nodes, business processes, all within a safe perimeter. Premium, reassuring.

SLIDE NUMBER: "05" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"¿Qué significa esto
para tu negocio?"

DARK CARD (#111520, border #1a1e2a, rounded, centered):

FOUR rows with green bullet (#00e87a), Inter Regular white:

• El modelo más poderoso llega con controles reales, no promesas
• Los gobiernos ahora revisan los modelos antes del lanzamiento
• La industria tiene por primera vez un estándar para medir riesgos
• Usar IA en tu operación es cada vez más seguro y regulado

BELOW CARD (Inter ExtraBold, #00e87a, medium, centered):
"El poder de la IA y la responsabilidad
ya no son contradictorios."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's7-cta.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel CTA slide. Background #080a0e.

VISUAL: Large green glow from center, powerful and expansive. Feels like the future arriving. Premium, minimal, cinematic.

HEADLINE (Inter ExtraBold, white, large, centered):
"El modelo más poderoso
del mundo ya existe."

BODY (Inter Regular, #8892a4, medium, centered):
"Con controles de seguridad reales."
"Con supervisión gubernamental."
"Con acceso disponible para tu negocio."

DIVIDER LINE (thin, #1a1e2a)

BELOW (Inter ExtraBold, white, medium, centered):
"Sigue la cuenta para saber
cómo aprovecharlo."

SMALL BOTTOM (Inter Regular, #8892a4, small, centered):
"Todos los días, contenido práctico para dueños de negocio."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
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
