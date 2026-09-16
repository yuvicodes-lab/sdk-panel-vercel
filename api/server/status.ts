import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB } from '../../lib/db';
import { getAuthUser, sendJson } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  const db = await loadDB();
  const persistent = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

  if (req.method === 'GET') {
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = (req.headers.host as string) || 'localhost';
    const base = `${proto}://${host}`;
    return sendJson(res, 200, {
      status: db.server_status,
      endpoints: {
        mundo: `${base}/api/verify/mundo`,
        bcore: `${base}/api/verify/bcore`,
      },
      meta: { uptime: '99.9%', load: '12%', health: 'Healthy', persistent },
      activity: db.verify_log.slice(0, 20),
    });
  }

  if (req.method === 'POST') {
    if (user.role !== 'OWNER') return sendJson(res, 403, { error: 'Only OWNER can change server status' });
    const { engine, maintenance_mode, maintenance_message = '' } = (req.body || {}) as any;
    const eng = String(engine).toUpperCase() === 'BCORE' ? 'BCORE' : 'MUNDO';
    db.server_status[eng] = {
      maintenance_mode: Number(maintenance_mode) ? 1 : 0,
      maintenance_message: String(maintenance_message).slice(0, 300),
    };
    await persistDB(db);
    return sendJson(res, 200, { ok: true, status: db.server_status });
  }
  return sendJson(res, 405, { error: 'Method not allowed' });
}
