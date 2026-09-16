import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB, hashPassword } from '../lib/db';
import { signToken, setSessionCookie, clearSessionCookie, getAuthUser, sendJson } from '../lib/auth';
import crypto from 'crypto';

// /api/auth?op=login|register|me|logout  (1 function me 4 kaam — Hobby 12-function limit ke liye)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = String(req.query.op || '');
  const db = await loadDB();

  if (op === 'login') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });
    const { username = '', password = '' } = (req.body || {}) as any;
    const u = String(username).trim();
    const p = String(password);
    if (u.length < 3 || p.length < 4) return sendJson(res, 400, { error: 'Username min 3, password min 4' });
    const user = db.users.find((x) => x.username.toLowerCase() === u.toLowerCase());
    if (!user || hashPassword(p, user.salt) !== user.passwordHash)
      return sendJson(res, 401, { error: 'Invalid username or password' });
    const token = signToken(user.id);
    setSessionCookie(res, token);
    return sendJson(res, 200, { ok: true, user: { id: user.id, username: user.username, role: user.role } });
  }

  if (op === 'register') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });
    const { username = '', password = '', referralCode = '' } = (req.body || {}) as any;
    const u = String(username).trim();
    const p = String(password);
    const ref = String(referralCode).trim().toUpperCase();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(u)) return sendJson(res, 400, { error: 'Username 3-20 chars (a-z, 0-9, _)' });
    if (p.length < 4 || p.length > 50) return sendJson(res, 400, { error: 'Password 4-50 chars' });
    if (!ref) return sendJson(res, 400, { error: 'Referral code required' });
    if (db.users.some((x) => x.username.toLowerCase() === u.toLowerCase()))
      return sendJson(res, 400, { error: 'Username already taken' });
    const r = db.referrals.find((x) => x.code === ref);
    if (!r) return sendJson(res, 400, { error: 'Invalid referral code' });
    if (r.used) return sendJson(res, 400, { error: 'Referral code already used' });
    if (Date.now() > new Date(r.expiresAt).getTime())
      return sendJson(res, 400, { error: 'Referral code expired' });
    const salt = crypto.randomBytes(8).toString('hex');
    const user = {
      id: db.seq.user++,
      username: u,
      passwordHash: hashPassword(p, salt),
      salt,
      role: r.role,
      createdAt: new Date().toISOString(),
      usedReferral: ref,
    };
    db.users.push(user);
    r.used = true;
    r.usedBy = user.id;
    await persistDB(db);
    const token = signToken(user.id);
    setSessionCookie(res, token);
    return sendJson(res, 200, { ok: true, user: { id: user.id, username: user.username, role: user.role } });
  }

  if (op === 'logout') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  // op=me (GET)
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not logged in' });
  return sendJson(res, 200, { user: { id: user.id, username: user.username, role: user.role } });
}
