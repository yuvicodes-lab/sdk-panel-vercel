import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB } from '../../lib/db';
import { getAuthUser, sendJson } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Only GET' });
  const db = await loadDB();
  const isOwner = user.role === 'OWNER';

  const mAll = db.mundo_keys.filter((k) => (isOwner ? true : k.userId === user.id));
  const bAll = db.bcore_keys.filter((k) => (isOwner ? true : k.userId === user.id));
  const mBinds = db.mundo_bindings.filter((b) => mAll.some((k) => k.id === b.sdk_key_id)).length;
  const bBinds = db.bcore_bindings.filter((b) => bAll.some((k) => k.id === b.sdk_key_id)).length;

  const recentM = [...mAll].sort((a, b) => b.id - a.id).slice(0, 5);
  const recentB = [...bAll].sort((a, b) => b.id - a.id).slice(0, 5);

  return sendJson(res, 200, {
    mundo: {
      total: mAll.length,
      active: mAll.filter((k) => !k.is_blocked).length,
      blocked: mAll.filter((k) => !!k.is_blocked).length,
      pkgs: mBinds,
      recent: recentM,
    },
    bcore: {
      total: bAll.length,
      active: bAll.filter((k) => !k.is_blocked).length,
      blocked: bAll.filter((k) => !!k.is_blocked).length,
      pkgs: bBinds,
      recent: recentB,
    },
    role: user.role,
  });
}
