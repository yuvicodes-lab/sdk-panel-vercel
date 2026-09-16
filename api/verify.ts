import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB, logVerify, maskKey, DB } from '../lib/db';
import { mundoDecrypt, mundoEncrypt, bcoreDecrypt, bcoreEncrypt } from '../lib/crypto';

// /api/verify?engine=mundo|bcore  (POST encrypted — panel ka verify endpoint)
function encMundo(data: any, code: number, res: VercelResponse) {
  res.status(code).setHeader('Content-Type', 'text/plain; charset=UTF-8');
  res.send(mundoEncrypt(JSON.stringify(data)));
}

function encBcore(data: any, code: number, res: VercelResponse) {
  res.status(code).setHeader('Content-Type', 'text/plain; charset=UTF-8');
  res.send(bcoreEncrypt(JSON.stringify(data)));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).setHeader('Content-Type', 'text/plain; charset=UTF-8');
    res.send('Only POST');
    return;
  }
  const engine = String(req.query.engine || 'mundo').toLowerCase() === 'bcore' ? 'BCORE' : 'MUNDO';
  if (engine === 'MUNDO') return handleMundo(req, res);
  return handleBcore(req, res);
}

// ================= MUNDO (AES-128-ECB, S1|S2|S3_A|S3_B) =================
async function handleMundo(req: VercelRequest, res: VercelResponse) {
  const db = await loadDB();
  const tag = (key: string, pkg = '', app = '') => ({
    engine: 'MUNDO' as const, key: maskKey(key), pkg, app, t: new Date().toISOString(),
  });
  const fail = async (key: string, pkg: string, app: string, code: string, message: string, http: number) => {
    logVerify(db, { ...tag(key, pkg, app), ok: false, code });
    await persistDB(db);
    return encMundo({ status: false, code: 'error', message }, http, res);
  };

  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (req.body && typeof req.body === 'object' && (req.body as any).data) raw = String((req.body as any).data);
  if (!raw) raw = String(req.query?.data || '');
  raw = raw.trim();
  if (raw.startsWith('data=')) raw = decodeURIComponent(raw.slice(5));
  if (!raw) return encMundo({ status: false, code: 'error', message: 'Empty body' }, 400, res);

  const dec = mundoDecrypt(decodeURIComponent(raw));
  if (!dec) return encMundo({ status: false, code: 'error', message: 'Decryption failed' }, 400, res);

  const parts = dec.split('|');
  if (parts.length < 4) return encMundo({ status: false, code: 'error', message: 'Malformed payload' }, 400, res);
  const [S1, S2, S3_A] = parts;

  let matched: any = null;
  let hwid = '';
  for (const k of db.mundo_keys) {
    if (S1.startsWith(k.sdk_key)) { matched = k; hwid = S1.slice(k.sdk_key.length); break; }
  }
  if (!matched) return encMundo({ status: false, code: 'error', message: 'Invalid SDK key' }, 403, res);

  let pkg = '';
  if (S2.endsWith(S1)) {
    const prefix = S2.slice(0, S2.length - S1.length);
    if (prefix.length % 2 === 0) {
      const h = prefix.length / 2;
      if (prefix.slice(0, h) === prefix.slice(h)) pkg = prefix.slice(0, h);
    }
  }
  let app = '';
  if (S3_A.endsWith(matched.sdk_key)) {
    const prefix = S3_A.slice(0, S3_A.length - matched.sdk_key.length);
    if (prefix.length % 2 === 0) {
      const h = prefix.length / 2;
      if (prefix.slice(0, h) === prefix.slice(h)) app = prefix.slice(0, h);
    }
  }
  if (!pkg || !app) return encMundo({ status: false, code: 'error', message: 'Malformed pkg/app' }, 400, res);

  if (db.server_status.MUNDO.maintenance_mode === 1)
    return fail(matched.sdk_key, pkg, app, 'SERVER_MAINTENANCE', db.server_status.MUNDO.maintenance_message || 'Server is under maintenance', 503);
  if (matched.is_blocked)
    return fail(matched.sdk_key, pkg, app, 'INVALID_KEY', 'SDK key blocked', 403);

  const exp = new Date(matched.created_at).getTime() + matched.duration_days * 86400 * 1000;
  if (Date.now() > exp)
    return fail(matched.sdk_key, pkg, app, 'EXPIRED_KEY', 'SDK key expired', 403);

  const binds = db.mundo_bindings.filter((b) => b.sdk_key_id === matched.id);
  const pkgs = new Set(binds.map((b) => b.pkg_name));
  if (!pkgs.has(pkg) && pkgs.size >= matched.pkg_limit)
    return fail(matched.sdk_key, pkg, app, 'PKG_LIMIT_REACHED', 'Package limit reached', 403);

  let mb = binds.find((b) => b.pkg_name === pkg && b.app_name === app);
  if (!mb) {
    if (binds.length >= matched.pkg_limit * matched.app_limit)
      return fail(matched.sdk_key, pkg, app, 'APP_LIMIT_REACHED', 'App limit reached', 403);
    if (binds.filter((b) => b.pkg_name === pkg).length >= matched.app_limit)
      return fail(matched.sdk_key, pkg, app, 'APP_LIMIT_REACHED', 'App limit reached', 403);
    const row = { id: db.seq.bind++, sdk_key_id: matched.id, pkg_name: pkg, app_name: app, is_blocked: 0 };
    db.mundo_bindings.push(row);
    mb = row;
  }
  if ((mb as any).is_blocked)
    return fail(matched.sdk_key, pkg, app, 'BINDING_BLOCKED', 'Binding blocked', 403);

  logVerify(db, { ...tag(matched.sdk_key, pkg, app), ok: true, code: 'VALID' });
  await persistDB(db);
  return encMundo({
    status: true, code: 'success', message: 'SDK key validated successfully',
    sdk_key: matched.sdk_key, pkg_name: pkg, app_name: app, device_id: hwid,
    expires: new Date(exp).toISOString().slice(0, 19).replace('T', ' '),
  }, 200, res);
}

// ================= BCORE (RC4 + Base64) =================
async function handleBcore(req: VercelRequest, res: VercelResponse) {
  const db = await loadDB();
  let raw = '';
  if (typeof req.body === 'string') raw = req.body.trim();
  else if (req.body && typeof req.body === 'object') {
    if ((req.body as any).data) raw = String((req.body as any).data);
    else if ((req.body as any).sdk_key) {
      const { sdk_key = '', pkg_name = '', app_name = '', device_id = '' } = req.body as any;
      return verifyBcorePlain(String(sdk_key), String(pkg_name), String(app_name), String(device_id), db, res);
    }
  }
  if (!raw) return encBcore({ status: 'error', code: 'EMPTY_BODY', message: 'Request body is empty' }, 400, res);

  const dec = bcoreDecrypt(raw.trim());
  let input: any = null;
  try { input = JSON.parse(dec); } catch { input = null; }
  if (!input) { input = {}; try { const sp = new URLSearchParams(dec); sp.forEach((v, k) => (input[k] = v)); } catch {} }
  if (!input || !input.sdk_key) return encBcore({ status: 'error', code: 'DECRYPT_FAILED', message: 'Invalid encrypted payload' }, 400, res);

  return verifyBcorePlain(String(input.sdk_key || input.user_key || ''), String(input.pkg_name || input.package_name || ''), String(input.app_name || ''), String(input.device_id || ''), db, res);
}

async function verifyBcorePlain(sdk_key: string, pkg_name: string, app_name: string, device_id: string, db: DB, res: VercelResponse) {
  const tag = (key: string) => ({ engine: 'BCORE' as const, key: maskKey(key || sdk_key), pkg: pkg_name, app: app_name, t: new Date().toISOString() });
  const fail = async (key: string, code: string, message: string, http: number) => {
    logVerify(db, { ...tag(key), ok: false, code });
    await persistDB(db);
    return encBcore({ status: 'error', code, message }, http, res);
  };
  if (db.server_status.BCORE.maintenance_mode === 1)
    return fail('', 'SERVER_MAINTENANCE', db.server_status.BCORE.maintenance_message || 'Server is under maintenance', 503);
  if (!sdk_key || !pkg_name || !app_name)
    return encBcore({ status: 'error', code: 'MISSING_PARAMETER', message: 'Required parameter is missing' }, 400, res);

  const key = db.bcore_keys.find((k: any) => k.sdk_key === sdk_key.trim());
  if (!key) return fail('', 'INVALID_KEY', 'Invalid SDK key', 400);
  if (key.is_blocked) return fail(key.sdk_key, 'INVALID_KEY', 'Invalid SDK key', 403);

  const exp = new Date(key.created_at).getTime() + key.duration_days * 86400 * 1000;
  if (Date.now() > exp) return fail(key.sdk_key, 'EXPIRED_KEY', 'SDK key has expired', 403);

  const binds = db.bcore_bindings.filter((b: any) => b.sdk_key_id === key.id);
  const pkgs = new Set(binds.map((b: any) => b.pkg_name));
  if (!pkgs.has(pkg_name) && pkgs.size >= key.pkg_limit)
    return fail(key.sdk_key, 'PKG_LIMIT_REACHED', 'Package limit reached', 403);

  let mb = binds.find((b: any) => b.pkg_name === pkg_name && b.app_name === app_name);
  if (!mb) {
    if (binds.length >= key.pkg_limit * key.app_limit)
      return fail(key.sdk_key, 'APP_LIMIT_REACHED', 'App name limit reached', 403);
    if (binds.filter((b: any) => b.pkg_name === pkg_name).length >= key.app_limit)
      return fail(key.sdk_key, 'APP_LIMIT_REACHED', 'App name limit reached', 403);
    const row = { id: db.seq.bind++, sdk_key_id: key.id, pkg_name, app_name, is_blocked: 0 };
    db.bcore_bindings.push(row);
    mb = row;
  }
  if ((mb as any).is_blocked) return fail(key.sdk_key, 'BINDING_BLOCKED', 'This app binding is blocked', 403);

  const f1 = key.feature1 === 1, f2 = key.feature2 === 1;
  logVerify(db, { ...tag(key.sdk_key), ok: true, code: 'VALID' });
  await persistDB(db);
  return encBcore({
    status: 'success', code: 'VALID', message: 'SDK key validated successfully',
    feature1: f1 ? 1 : 0, feature2: f2 ? 1 : 0,
    data: { sdk_key: 'valid', pkg_name, app_name, device_id: device_id ? 'registered' : '', features1: f1, features2: f2 },
  }, 200, res);
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
