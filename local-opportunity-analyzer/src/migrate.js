import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
export async function migrate() {
  const sql = readFileSync(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');
  await pool.query(sql);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate(); console.log('Migración aplicada.'); await pool.end();
}
