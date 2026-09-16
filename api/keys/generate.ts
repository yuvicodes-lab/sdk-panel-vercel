import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB, newSdkKey } from '../../lib/db';
import { getAuthUser, sendJson } from '../../lib/auth';

function normEngine(e: any): 'MUNDO' | 'BCORE' {
  return String(e).toUpperCase() === 'BCORE' ? 'BCORE' : 'MUNDO';
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });

  const { engine, sdk_key = '', duration = 30, pkg_limit = 1, app_limit = 1, feature1 = true, feature2 = true } =
    (req.body || {}) as any;
  const eng = normEngine(engine);
  let customKey = String(sdk_key).trim();
  const dur = Number(duration);
  const pkgL = Math.max(1, Number(pkg_limit) || 1);
  const appL = Math.max(1, Number(app_limit) || 1);

  if (customKey !== '' && customKey.length < 5) return sendJson(res, 400, { error: 'Custom key min 5 chars' });
  if (![7, 15, 30, 60].includes(dur)) return sendJson(res, 400, { error: 'Invalid duration' });
  if (pkgL > 10 || appL > 20) return sendJson(res, 400, { error: 'Limits too high (pkg<=10, app<=20)' });

  const db = loadDB();
  const table = eng === 'BCORE' ? db.bcore_keys : db.mundo_keys;
  if (customKey === '') customKey = newSdkKey();
  if (table.some((k) => k.sdk_key === customKey)) return sendJson(res, 400, { error: `${eng} me ye key already hai` });

  const row = {
    id: db.seq.key++,
    userId: user.id,
    sdk_key: customKey,
    duration_days: dur,
    pkg_limit: pkgL,
    app_limit: appL,
    feature1: feature1 ? 1 : 0,
    feature2: feature2 ? 1 : 0,
    is_blocked: 0,
    created_at: new Date().toISOString(),
  };
  table.push(row);
  persistDB(db);
  return sendJson(res, 200, { ok: true, engine: eng, key: row });
}
