import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB, newReferralCode } from '../../lib/db';
import { getAuthUser, sendJson } from '../../lib/auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  if (user.role !== 'OWNER') return sendJson(res, 403, { error: 'Only OWNER can create referrals' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });

  const { role = 'ADMIN', durationDays = 30 } = (req.body || {}) as any;
  const r = String(role).toUpperCase() === 'OWNER' ? 'OWNER' : 'ADMIN';
  const d = Number(durationDays);
  if (![15, 30, 60].includes(d)) return sendJson(res, 400, { error: 'Duration 15 / 30 / 60 only' });

  const db = loadDB();
  let code = newReferralCode();
  while (db.referrals.some((x) => x.code === code)) code = newReferralCode();

  const now = Date.now();
  const ref = {
    code,
    role: r as 'OWNER' | 'ADMIN',
    durationDays: d as 15 | 30 | 60,
    createdBy: user.id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + d * 86400 * 1000).toISOString(),
    used: false,
    usedBy: null as number | null,
  };
  db.referrals.push(ref);
  persistDB(db);
  return sendJson(res, 200, { ok: true, referral: ref });
}
