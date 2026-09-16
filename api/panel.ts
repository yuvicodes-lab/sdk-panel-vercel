import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB } from '../lib/db';
import { getAuthUser, sendJson } from '../lib/auth';

// /api/panel?op=stats|server  (dashboard counts + server status + activity)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  const op = String(req.query.op || '');
  const db = await loadDB();
  const isOwner = user.role === 'OWNER';
  const persistent = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

  // ---- dashboard stats (GET) ----
  if (op === 'stats') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Only GET' });
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

  // ---- server status ----
  if (op === 'server') {
    if (req.method === 'GET') {
      const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
      const host = (req.headers.host as string) || 'localhost';
      const base = `${proto}://${host}`;
      return sendJson(res, 200, {
        status: db.server_status,
        endpoints: {
          mundo: `${base}/api/verify?engine=mundo`,
          bcore: `${base}/api/verify?engine=bcore`,
        },
        meta: { uptime: '99.9%', load: '12%', health: 'Healthy', persistent },
        activity: db.verify_log.slice(0, 20),
      });
    }
    if (req.method === 'POST') {
      if (!isOwner) return sendJson(res, 403, { error: 'Only OWNER can change server status' });
      const { engine, maintenance_mode, maintenance_message = '' } = (req.body || {}) as any;
      const eng = String(engine).toUpperCase() === 'BCORE' ? 'BCORE' : 'MUNDO';
      db.server_status[eng] = {
        maintenance_mode: Number(maintenance_mode) ? 1 : 0,
        maintenance_message: String(maintenance_message).slice(0, 300),
      };
      await persistDB(db);
      return sendJson(res, 200, { ok: true, status: db.server_status });
    }
  }

  return sendJson(res, 400, { error: 'Unknown op' });
}
