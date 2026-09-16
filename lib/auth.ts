import crypto from 'crypto';
import type { VercelRequest } from '@vercel/node';
import { loadDB, User } from './db';

const SECRET = process.env.SESSION_SECRET || 'yuvi-sdk-secret-change-on-vercel-2026';

export function signToken(userId: number): string {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 din
  const body = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return Buffer.from(`${body}.${sig}`).toString('base64url');
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const [uid, exp, sig] = raw.split('.');
    if (!uid || !exp || !sig) return null;
    const body = `${uid}.${exp}`;
    const want = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    if (want !== sig) return null;
    if (Date.now() > Number(exp)) return null;
    return { userId: Number(uid) };
  } catch {
    return null;
  }
}

export function getTokenFromReq(req: VercelRequest): string | null {
  const cookie = (req.headers.cookie as string) || '';
  const m = cookie.match(/sdk_session=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  const auth = req.headers.authorization as string | undefined;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export function getAuthUser(req: VercelRequest): User | null {
  const token = getTokenFromReq(req);
  if (!token) return null;
  const data = verifyToken(token);
  if (!data) return null;
  const db = loadDB();
  return db.users.find((u) => u.id === data.userId) || null;
}

export function setSessionCookie(res: any, token: string) {
  res.setHeader(
    'Set-Cookie',
    `sdk_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
  );
}

export function clearSessionCookie(res: any) {
  res.setHeader('Set-Cookie', `sdk_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function sendJson(res: any, status: number, obj: any) {
  res.status(status).json(obj);
}
