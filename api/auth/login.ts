import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB, hashPassword } from '../../lib/db';
import { signToken, setSessionCookie, sendJson } from '../../lib/auth';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });
  const { username = '', password = '' } = (req.body || {}) as any;
  const u = String(username).trim();
  const p = String(password);
  if (u.length < 3 || p.length < 4) return sendJson(res, 400, { error: 'Username min 3, password min 4' });

  const db = await loadDB();
  const user = db.users.find((x) => x.username.toLowerCase() === u.toLowerCase());
  if (!user) return sendJson(res, 401, { error: 'Invalid username or password' });
  if (hashPassword(p, user.salt) !== user.passwordHash)
    return sendJson(res, 401, { error: 'Invalid username or password' });

  const token = signToken(user.id);
  setSessionCookie(res, token);
  return sendJson(res, 200, { ok: true, user: { id: user.id, username: user.username, role: user.role } });
}
