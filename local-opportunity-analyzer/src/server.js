import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { recoverStuckAudits } from './audit.js';
await migrate(); await recoverStuckAudits();
// Arranque inicial: si no existe ningún usuario y hay ADMIN_EMAIL/ADMIN_PASSWORD, crea el administrador.
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const { one, q } = await import('./db.js'); const { hashPassword, passwordProblem } = await import('./auth.js');
  if (!(await one('SELECT 1 FROM users LIMIT 1'))) {
    const pw = passwordProblem(process.env.ADMIN_PASSWORD);
    if (pw) console.error('ADMIN_PASSWORD no cumple la política: ' + pw);
    else { await q(`INSERT INTO users(email,name,role,password_hash) VALUES(lower($1),$2,'admin',$3)`, [process.env.ADMIN_EMAIL, process.env.ADMIN_NAME || 'Administrador', await hashPassword(process.env.ADMIN_PASSWORD)]); console.log('Administrador inicial creado.'); }
  }
}
createApp().listen(config.port, () => console.log(`VIP Tech Local Opportunity Analyzer en http://localhost:${config.port}`));
