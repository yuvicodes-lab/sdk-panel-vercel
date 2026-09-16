import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser, clearSessionCookie, sendJson } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'GET') {
    const user = await getAuthUser(req);
    if (!user) return sendJson(res, 401, { error: 'Not logged in' });
    return sendJson(res, 200, { user: { id: user.id, username: user.username, role: user.role } });
  }
  return sendJson(res, 405, { error: 'Method not allowed' });
}
