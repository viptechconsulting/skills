import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { one, many, q } from './db.js';
import { config } from './config.js';

export const hashToken = t => createHash('sha256').update(t).digest('hex');
export const hashPassword = p => bcrypt.hash(p, 12);
export function passwordProblem(p) { if (typeof p !== 'string' || p.length < 12) return 'La contraseña debe tener al menos 12 caracteres'; if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p)) return 'Debe incluir mayúscula, minúscula y número'; return null; }

const attempts = new Map(); // límite simple de intentos de login por IP+email
function throttled(key) { const a = attempts.get(key) || []; const now = Date.now(); const recent = a.filter(t => now - t < 15 * 60_000); attempts.set(key, recent); return recent.length >= 8; }

export async function login(email, password, ip) {
  const key = ip + '|' + String(email).toLowerCase();
  if (throttled(key)) throw Object.assign(new Error('Demasiados intentos. Espere 15 minutos.'), { status: 429 });
  const u = await one('SELECT * FROM users WHERE lower(email)=lower($1) AND active', [String(email || '')]);
  const ok = u && await bcrypt.compare(String(password || ''), u.password_hash);
  if (!ok) { attempts.get(key).push(Date.now()); throw Object.assign(new Error('Credenciales inválidas'), { status: 401 }); }
  const token = randomBytes(32).toString('hex');
  await q('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3||\' hours\')::interval)', [hashToken(token), u.id, String(config.sessionHours)]);
  return { token, user: publicUser(u) };
}
export const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, supervisor_id: u.supervisor_id });
export async function userFromToken(token) {
  if (!token) return null;
  const r = await one(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`, [hashToken(token)]);
  return r ? publicUser(r) : null;
}
export const logout = token => q('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
export const cookieOpts = () => `HttpOnly; Path=/; SameSite=Strict; Max-Age=${config.sessionHours * 3600}${config.secureCookies ? '; Secure' : ''}`;
export function parseCookies(h) { const o = {}; for (const p of String(h || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } return o; }

// ---- Control de acceso a prospectos (única fuente de verdad en servidor) ----
/** Devuelve [sqlCondition, params] para filtrar prospectos visibles por el usuario. alias = alias de tabla prospects. */
export function visibleProspects(user, alias = 'p', startIdx = 1) {
  if (user.role === 'admin') return [`TRUE`, []];
  if (user.role === 'supervisor') return [`(${alias}.owner_id=$${startIdx} OR ${alias}.owner_id IN (SELECT id FROM users WHERE supervisor_id=$${startIdx}))`, [user.id]];
  return [`${alias}.owner_id=$${startIdx}`, [user.id]];
}
export async function getVisibleProspect(user, id, columns = 'p.*') {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const [cond, params] = visibleProspects(user, 'p', 2);
  return one(`SELECT ${columns} FROM prospects p WHERE p.id=$1 AND ${cond}`, [id, ...params]);
}
export async function assignableUsers(user) {
  if (user.role === 'admin') return many(`SELECT id,name,email,role FROM users WHERE active ORDER BY name`);
  if (user.role === 'supervisor') return many(`SELECT id,name,email,role FROM users WHERE active AND (id=$1 OR supervisor_id=$1) ORDER BY name`, [user.id]);
  return [];
}
