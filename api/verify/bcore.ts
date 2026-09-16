import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB } from '../../lib/db';
import { bcoreDecrypt, bcoreEncrypt } from '../../lib/crypto';

function enc(data: any, code: number, res: VercelResponse) {
  res.status(code).setHeader('Content-Type', 'text/plain; charset=UTF-8');
  res.send(bcoreEncrypt(JSON.stringify(data)));
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return enc({ status: 'error', code: 'METHOD_NOT_ALLOWED', message: 'Only POST' }, 405, res);
  const db = loadDB();

  let raw = '';
  if (typeof req.body === 'string') raw = req.body.trim();
  else if (req.body && typeof req.body === 'object') {
    // JSON me {data:"..."} ya direct fields (decrypted test ke liye)
    if ((req.body as any).data) raw = String((req.body as any).data);
    else if ((req.body as any).sdk_key) {
      // plain JSON (debug) — direct verify
      const { sdk_key = '', pkg_name = '', app_name = '', device_id = '' } = req.body as any;
      return verifyPlain(String(sdk_key), String(pkg_name), String(app_name), String(device_id), db, res);
    }
  }
  if (!raw) return enc({ status: 'error', code: 'EMPTY_BODY', message: 'Request body is empty' }, 400, res);

  const dec = bcoreDecrypt(raw.trim());
  let input: any = null;
  try { input = JSON.parse(dec); } catch { input = null; }
  if (!input) { input = {}; try { const sp = new URLSearchParams(dec); sp.forEach((v, k) => (input[k] = v)); } catch {} }
  if (!input || !input.sdk_key) return enc({ status: 'error', code: 'DECRYPT_FAILED', message: 'Invalid encrypted payload' }, 400, res);

  return verifyPlain(String(input.sdk_key || input.user_key || ''), String(input.pkg_name || input.package_name || ''), String(input.app_name || ''), String(input.device_id || ''), db, res);
}

function verifyPlain(sdk_key: string, pkg_name: string, app_name: string, device_id: string, db: any, res: VercelResponse) {
  if (db.server_status.BCORE.maintenance_mode === 1)
    return enc({ status: 'error', code: 'SERVER_MAINTENANCE', message: db.server_status.BCORE.maintenance_message || 'Server is under maintenance' }, 503, res);
  if (!sdk_key || !pkg_name || !app_name)
    return enc({ status: 'error', code: 'MISSING_PARAMETER', message: 'Required parameter is missing' }, 400, res);

  const key = db.bcore_keys.find((k: any) => k.sdk_key === sdk_key.trim());
  if (!key) return enc({ status: 'error', code: 'INVALID_KEY', message: 'Invalid SDK key' }, 400, res);
  if (key.is_blocked) return enc({ status: 'error', code: 'INVALID_KEY', message: 'Invalid SDK key' }, 403, res);

  const exp = new Date(key.created_at).getTime() + key.duration_days * 86400 * 1000;
  if (Date.now() > exp) return enc({ status: 'error', code: 'EXPIRED_KEY', message: 'SDK key has expired' }, 403, res);

  const binds = db.bcore_bindings.filter((b: any) => b.sdk_key_id === key.id);
  const pkgs = new Set(binds.map((b: any) => b.pkg_name));
  if (!pkgs.has(pkg_name) && pkgs.size >= key.pkg_limit)
    return enc({ status: 'error', code: 'PKG_LIMIT_REACHED', message: 'Package limit reached' }, 403, res);

  let mb = binds.find((b: any) => b.pkg_name === pkg_name && b.app_name === app_name);
  if (!mb) {
    if (binds.length >= key.pkg_limit * key.app_limit)
      return enc({ status: 'error', code: 'APP_LIMIT_REACHED', message: 'App name limit reached' }, 403, res);
    if (binds.filter((b: any) => b.pkg_name === pkg_name).length >= key.app_limit)
      return enc({ status: 'error', code: 'APP_LIMIT_REACHED', message: 'App name limit reached' }, 403, res);
    const row = { id: db.seq.bind++, sdk_key_id: key.id, pkg_name, app_name, is_blocked: 0 };
    db.bcore_bindings.push(row);
    persistDB(db);
    mb = row;
  }
  if ((mb as any).is_blocked) return enc({ status: 'error', code: 'INVALID_KEY', message: 'This app binding is blocked' }, 403, res);

  const f1 = key.feature1 === 1, f2 = key.feature2 === 1;
  return enc({
    status: 'success', code: 'VALID', message: 'SDK key validated successfully',
    feature1: f1 ? 1 : 0, feature2: f2 ? 1 : 0,
    data: { sdk_key: 'valid', pkg_name, app_name, device_id: device_id ? 'registered' : '', features1: f1, features2: f2 },
  }, 200, res);
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
