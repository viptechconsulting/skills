import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const OUTPUT_DIR = './carousel-images-ai-security';
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

VISUAL: Abstract shield with a subtle green glow (#00e87a) at center. Circuit or lock pattern barely visible in the background. Atmospheric, premium, authoritative.

SMALL LABEL TOP (small caps, #00e87a, centered):
"SEGURIDAD EN IA · 2026"

LARGE HEADLINE (Inter ExtraBold, white, centered, very large):
"Los modelos de IA
más potentes ahora
tienen supervisión real."

BELOW (Inter Regular, #8892a4, medium, centered):
"Lo que esto significa
para tu negocio."

SMALL BOTTOM (Inter Regular, #8892a4, small, centered):
"Desliza para entender qué cambió."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's2-que-paso.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Faint timeline or sequence of events barely visible in background. Atmospheric.

SLIDE NUMBER: "01" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"¿Qué pasó?"

DARK CARD (#111520, border #1a1e2a, rounded, centered):

SMALL LABEL (#00e87a, small caps): "EL CONTEXTO"
BODY (Inter Regular, white, medium):
"Anthropic lanzó sus modelos más avanzados.
Investigadores encontraron una forma de
eludir sus filtros de seguridad."

DIVIDER LINE (thin, #1a1e2a)

SMALL LABEL (#8892a4, small caps): "LA RESPUESTA"
BODY (Inter Regular, white, medium):
"En menos de dos semanas, la empresa
trabajó con el gobierno de EE.UU. para
construir nuevos controles de seguridad.
El problema fue bloqueado en más del 99% de los casos."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's3-como-funciona.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract funnel or filter diagram — requests coming in, some passing through (green), some blocked (dark/red faded). Clean, minimal, tech feel.

SLIDE NUMBER: "02" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"¿Cómo protegen
los modelos?"

BODY (Inter Regular, #8892a4, medium, centered):
"No es un solo filtro. Es una combinación:"

DARK CARD (#111520, border #1a1e2a, rounded, centered):

THREE rows with green bullet (#00e87a):

• El modelo aprende a rechazar solicitudes peligrosas
• Clasificadores automáticos detectan patrones de abuso en tiempo real
• Capas adicionales analizan el comportamiento después del hecho

BELOW CARD (Inter ExtraBold, white, medium, centered):
"Si una capa falla,
las otras compensan."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's4-framework.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract scoring grid or matrix, minimal, dark cards with numbers/levels. Feels like a classification system. Clean, authoritative.

SLIDE NUMBER: "03" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"Ahora existe un estándar
para medir riesgos."

BODY (Inter Regular, #8892a4, medium, centered):
"Anthropic, Amazon, Microsoft y Google
están creando un marco común para
clasificar la gravedad de los ataques a la IA."

DARK CARD (#111520, border #1a1e2a, rounded, centered):

LABEL (#00e87a, small caps): "4 CRITERIOS DE EVALUACIÓN"

FOUR rows with green bullet (#00e87a), Inter Regular white:

• ¿Qué capacidad nueva da el ataque?
• ¿Cuántas tareas afecta?
• ¿Qué tan fácil es ejecutarlo?
• ¿Qué tan fácil es descubrirlo?

BELOW CARD (Inter Regular, #8892a4, small, centered):
"Por primera vez, hay un lenguaje común
para hablar de seguridad en IA."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's5-gobierno.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract representation of collaboration — two entities connecting, network nodes, official/institutional feel. Dark, minimal, authoritative.

SLIDE NUMBER: "04" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"Los gobiernos ahora
revisan los modelos
antes del lanzamiento."

DARK CARD (#111520, border #1a1e2a, rounded, centered):

BODY (Inter Regular, white, medium):
"Para los modelos más avanzados, el gobierno
de EE.UU. tendrá acceso anticipado para
evaluar capacidades y seguridad antes
de que lleguen al público."

DIVIDER LINE (thin, #1a1e2a)

BODY (Inter Regular, #8892a4, small):
"También habrá reportes inmediatos cuando
se detecten vulnerabilidades, e investigación
conjunta entre empresas y agencias."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's6-impacto.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel slide. Background #080a0e.

VISUAL: Abstract business operations — workflow nodes, business icons barely visible — protected by a subtle green shield glow. Safe, premium, reassuring.

SLIDE NUMBER: "05" small top left, #00e87a

HEADLINE (Inter ExtraBold, white, large, centered):
"¿Qué significa esto
para tu negocio?"

DARK CARD (#111520, border #1a1e2a, rounded, centered):

FOUR rows with green bullet (#00e87a), Inter Regular white:

• Las herramientas de IA que usas tienen supervisión real
• Los modelos más poderosos pasan por evaluaciones independientes
• Hay estándares claros para responder a vulnerabilidades
• La industria se está regulando antes de que los gobiernos lo exijan

BELOW CARD (Inter ExtraBold, #00e87a, medium, centered):
"Usar IA en tu operación
es cada vez más seguro."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.`
  },
  {
    filename: 's7-cta.jpg',
    prompt: `${STYLE}

Create a 1080x1080px Instagram carousel CTA slide. Background #080a0e.

VISUAL: Subtle green glow from center, soft and atmospheric. Shield icon barely visible. Premium, minimal.

HEADLINE (Inter ExtraBold, white, large, centered):
"La IA está madurando."

BODY (Inter Regular, #8892a4, medium, centered):
"Con estándares de seguridad reales."
"Con supervisión gubernamental."
"Con responsabilidad de las empresas."

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
