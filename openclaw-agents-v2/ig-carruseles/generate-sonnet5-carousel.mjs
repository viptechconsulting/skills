import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const OUTPUT_DIR = './carousel-images-sonnet5';
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

VISUAL: Abstract neural network or circuit pattern barely visible in the background, dark and atmospheric. A subtle green glow (#00e87a) radiating from center bottom.

SMALL LABEL TOP (small caps, #00e87a, centered):
"ANTHROPIC · JULIO 2026"

LARGE HEADLINE (Inter ExtraBold, white, centered, very large):
"La IA que mueve
tu negocio acaba
de mejorar."

BELOW (Inter Regular, #8892a4, medium, centered):
"Y se volvió mucho
más accesible."

SMALL BOTTOM (Inter Regular, #8892a4, small, centered):
"Desliza para entender qué significa esto para ti."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's2-que-es.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Faint abstract "upgrade" arrow or version comparison visual barely visible in background. Atmospheric.

SLIDE NUMBER: "01" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"Anthropic lanzó
Claude Sonnet 5."

BODY (Inter Regular, white, medium, centered):
"No es una actualización menor."

DARK CARD (#111520, border #1a1e2a, rounded, centered):

THREE rows with green bullet (#00e87a):

• Rinde casi igual que el modelo más potente del mercado
• Cuesta significativamente menos
• Disponible hoy para todos — desde planes gratuitos hasta empresas

BELOW CARD (Inter Regular, #8892a4, small, centered):
"El punto de inflexión que
muchos estaban esperando."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's3-autonomia.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract connected workflow nodes — browser, terminal, database — connected by thin glowing lines (#00e87a). Minimal, tech, dark. Feels like autonomous processes running.

SLIDE NUMBER: "02" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"Ya no solo responde."

BELOW HEADLINE (Inter ExtraBold, #00e87a, large, centered):
"Ahora ejecuta."

BODY (Inter Regular, #8892a4, medium, centered):
"Le das un objetivo complejo
y lo trabaja solo:"

DARK CARD (#111520, border #1a1e2a, rounded, centered):

THREE rows with green bullet (#00e87a):

• Navega, busca y procesa información
• Escribe y ejecuta código
• Completa proyectos de múltiples pasos sin supervisión

BELOW CARD (Inter Regular, #8892a4, small, centered):
"Lo que antes requería modelos premium,
ahora lo hace este."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's4-precio.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Two abstract shapes or bars — one large/expensive (faded), one smaller/efficient (glowing green). Visual contrast of value. Clean, minimal, data-driven.

SLIDE NUMBER: "03" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"Rendimiento premium.
Precio de gama media."

TWO COMPARISON CARDS side by side (#111520, border #1a1e2a, rounded):

Left card — LABEL (#8892a4, small): "ANTES"
TEXT (white, medium): "Necesitabas el modelo más caro para resultados serios"

Right card — LABEL (#00e87a, small): "AHORA"
TEXT (white, medium): "Sonnet 5 se acerca a ese nivel a una fracción del costo"

BELOW (Inter ExtraBold, white, medium, centered):
"Más automatización."

BELOW (Inter Regular, #8892a4, medium, centered):
"Con el mismo presupuesto."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's5-impacto.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract business workflow — calendar, chat bubble, document, chart — connected by green lines. Feels like automated processes running across different business areas. Dark, minimal, premium.

SLIDE NUMBER: "04" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"¿Qué significa esto
para tu negocio?"

DARK CARD (#111520, border #1a1e2a, rounded, centered):

FOUR rows with green bullet (#00e87a), Inter Regular white:

• Agentes que trabajan sin parar, a menor costo
• Automatizaciones más complejas sin gastar más
• Flujos de trabajo que antes solo grandes empresas podían pagar
• Más herramientas de IA accesibles para negocios medianos

BELOW CARD (Inter ExtraBold, #00e87a, medium, centered):
"La barrera de entrada
acaba de bajar."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's6-seguridad.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract shield or security pattern glowing softly in #00e87a. Dark, premium, trustworthy feel.

SLIDE NUMBER: "05" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"¿Y la seguridad?"

BODY (Inter Regular, #8892a4, medium, centered):
"Darle acceso a la IA a tus sistemas
sin controles es un riesgo real."

DARK CARD (#111520, border #1a1e2a, rounded, centered):

TEXT (Inter Regular, white, medium):
"Sonnet 5 incorpora las mismas
salvaguardas de seguridad que
antes eran exclusivas del modelo
más avanzado de Anthropic."

DIVIDER LINE (thin, #1a1e2a)

TEXT (Inter Regular, #8892a4, small):
"Rechaza solicitudes no seguras.
Menos comportamientos inesperados.
Diseñado para entornos empresariales."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's7-cta.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel CTA slide. Background #080a0e.

VISUAL: Abstract green glow from center, soft and atmospheric. Premium, minimal.

HEADLINE (Inter ExtraBold, white, large, centered):
"El momento de automatizar
tu negocio es ahora."

BODY (Inter Regular, #8892a4, medium, centered):
"Los modelos son más potentes."
"Los costos son menores."
"Las herramientas ya existen."

DIVIDER LINE (thin, #1a1e2a)

BELOW (Inter ExtraBold, white, medium, centered):
"Sigue la cuenta para saber
cómo aplicar esto en tu negocio."

SMALL BOTTOM (Inter Regular, #8892a4, small, centered):
"Todos los días, contenido práctico para dueños de negocio."

Subtle green glow from center.

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
