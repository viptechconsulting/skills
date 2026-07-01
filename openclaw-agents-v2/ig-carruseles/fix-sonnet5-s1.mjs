import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const MODEL = 'gemini-3.1-flash-image-preview';

const prompt = `
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

Create a 1080x1080px Instagram carousel cover slide. Background #080a0e.

VISUAL: Abstract neural network or circuit pattern barely visible in the background, dark and atmospheric. A subtle green glow (#00e87a) radiating from center bottom.

SMALL LABEL TOP (small caps, #00e87a, centered):
"ANTHROPIC · JULIO 2026"

PRODUCT NAME (Inter ExtraBold, #00e87a, large, centered):
"Claude Sonnet 5"

LARGE HEADLINE (Inter ExtraBold, white, centered, very large):
"Más poderoso.
Mucho más
accesible."

BELOW (Inter Regular, #8892a4, medium, centered):
"Lo que esto significa
para tu negocio."

SMALL BOTTOM (Inter Regular, #8892a4, small, centered):
"Desliza para entender qué cambió."

FOOTER: @lynkroio small bottom right, #8892a4

DO NOT render style rules as text.
`;

const res = await ai.models.generateContent({
  model: MODEL,
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  config: { responseModalities: ['TEXT', 'IMAGE'] }
});

for (const part of res.candidates[0].content.parts) {
  if (part.inlineData) {
    const buf = Buffer.from(part.inlineData.data, 'base64');
    await fs.writeFile('./carousel-images-sonnet5/s1-cover.jpg', buf);
    console.log('✓ s1-cover.jpg', Math.round(buf.length / 1024) + 'KB');
    break;
  }
}
