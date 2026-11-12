// Crea UN prospecto DEMO etiquetado (sin métricas inventadas). Uso: SEED_OWNER_EMAIL=... npm run seed:demo
import { pool, one, q } from './db.js';
const u = await one('SELECT id FROM users WHERE lower(email)=lower($1)', [process.env.SEED_OWNER_EMAIL || '']);
if (!u) { console.error('Defina SEED_OWNER_EMAIL con un usuario existente'); process.exit(1); }
await q(`INSERT INTO prospects(owner_id,company,website,gbp_url,city,state,category,services,is_demo,notes) VALUES($1,'DEMO — Ejemplo de Negocio Local','https://example.com','https://maps.app.goo.gl/demo','Miami','FL','Servicios del hogar',ARRAY['Plomería','Destapes'],true,'DEMO: prospecto de demostración; no corresponde a un negocio real.')`, [u.id]);
console.log('Prospecto DEMO creado.'); await pool.end();
