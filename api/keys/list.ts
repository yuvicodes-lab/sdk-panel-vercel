import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB } from '../../lib/db';
import { getAuthUser, sendJson } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Only GET' });

  const db = await loadDB();
  const isOwner = user.role === 'OWNER';
  // ADMIN sirf apne keys dekhega, OWNER sab dekhega
  const mundo = db.mundo_keys.filter((k) => (isOwner ? true : k.userId === user.id)).map((k) => ({
    ...k,
    bindings: db.mundo_bindings.filter((b) => b.sdk_key_id === k.id),
    owner: db.users.find((u) => u.id === k.userId)?.username || '?',
  }));
  const bcore = db.bcore_keys.filter((k) => (isOwner ? true : k.userId === user.id)).map((k) => ({
    ...k,
    bindings: db.bcore_bindings.filter((b) => b.sdk_key_id === k.id),
    owner: db.users.find((u) => u.id === k.userId)?.username || '?',
  }));
  mundo.sort((a, b) => b.id - a.id);
  bcore.sort((a, b) => b.id - a.id);
  return sendJson(res, 200, { mundo, bcore });
}
