// Uso: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run create-admin
import { pool, q } from './db.js';
import { migrate } from './migrate.js';
import { hashPassword, passwordProblem } from './auth.js';
const { ADMIN_EMAIL, ADMIN_NAME = 'Administrador', ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) { console.error('Defina ADMIN_EMAIL y ADMIN_PASSWORD'); process.exit(1); }
const pw = passwordProblem(ADMIN_PASSWORD); if (pw) { console.error(pw); process.exit(1); }
await migrate();
await q(`INSERT INTO users(email,name,role,password_hash) VALUES(lower($1),$2,'admin',$3) ON CONFLICT (email) DO UPDATE SET password_hash=$3, role='admin', active=true`, [ADMIN_EMAIL, ADMIN_NAME, await hashPassword(ADMIN_PASSWORD)]);
console.log('Administrador listo:', ADMIN_EMAIL); await pool.end();
