import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB } from '../../lib/db';
import { getAuthUser, sendJson } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  if (user.role !== 'OWNER') return sendJson(res, 403, { error: 'Only OWNER' });

  const db = await loadDB();
  if (req.method === 'GET') {
    const list = [...db.referrals].reverse().map((r) => ({
      ...r,
      expired: Date.now() > new Date(r.expiresAt).getTime(),
    }));
    return sendJson(res, 200, { referrals: list });
  }
  if (req.method === 'POST') {
    // delete referral: { action:'delete', code }
    const { action, code } = (req.body || {}) as any;
    if (action === 'delete' && code) {
      db.referrals = db.referrals.filter((x) => x.code !== String(code).toUpperCase());
      await persistDB(db);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 400, { error: 'Unknown action' });
  }
  return sendJson(res, 405, { error: 'Method not allowed' });
}
