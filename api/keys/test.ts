import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB } from '../../lib/db';
import { getAuthUser, sendJson } from '../../lib/auth';
import { testKey } from '../../lib/verify';

// POST /api/keys/test — dry-run: key check karo bina limit consume kiye (OWNER + ADMIN)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });

  const { engine, sdk_key = '', pkg_name = '', app_name = '', device_id = '' } = (req.body || {}) as any;
  const eng = String(engine).toUpperCase() === 'BCORE' ? 'BCORE' : 'MUNDO';
  const db = await loadDB();
  const result = testKey(db, eng, {
    sdk_key: String(sdk_key),
    pkg_name: String(pkg_name),
    app_name: String(app_name),
    device_id: String(device_id),
  });
  return sendJson(res, 200, { engine: eng, ...result });
}
