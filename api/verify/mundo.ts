import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB } from '../../lib/db';
import { mundoDecrypt, mundoEncrypt } from '../../lib/crypto';

function enc(data: any, code: number, res: VercelResponse) {
  res.status(code).setHeader('Content-Type', 'text/plain; charset=UTF-8');
  res.send(mundoEncrypt(JSON.stringify(data)));
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return enc({ status: false, code: 'error', message: 'Only POST' }, 405, res);

  const db = loadDB();

  // raw body: data=<b64> ya plain b64
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (req.body && typeof req.body === 'object' && (req.body as any).data) raw = String((req.body as any).data);
  else raw = '';
  if (!raw) {
    // vercel ne parse kiya ho to fallback: query
    const q = (req.query?.data as string) || '';
    raw = q;
  }
  raw = raw.trim();
  // agar form-encoded "data=xxx" aaya ho
  if (raw.startsWith('data=')) raw = decodeURIComponent(raw.slice(5));

  // body empty ho to raw stream try (vercel edge) — yaha bodyParser se mil jayega
  if (!raw) return enc({ status: false, code: 'error', message: 'Empty body' }, 400, res);

  const dec = mundoDecrypt(decodeURIComponent(raw));
  if (!dec) return enc({ status: false, code: 'error', message: 'Decryption failed' }, 400, res);

  const parts = dec.split('|');
  if (parts.length < 4) return enc({ status: false, code: 'error', message: 'Malformed payload' }, 400, res);
  const [S1, S2, S3_A] = parts;

  // match key: S1 = sdk_key + HWID (panel_code system hata diya — global search)
  const all = [...db.mundo_keys];
  let matched: any = null;
  let hwid = '';
  for (const k of all) {
    if (S1.startsWith(k.sdk_key)) { matched = k; hwid = S1.slice(k.sdk_key.length); break; }
  }
  if (!matched) return enc({ status: false, code: 'error', message: 'Invalid SDK key' }, 403, res);

  // pkg extract
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
  if (!pkg || !app) return enc({ status: false, code: 'error', message: 'Malformed pkg/app' }, 400, res);

  if (db.server_status.MUNDO.maintenance_mode === 1)
    return enc({ status: false, code: 'error', message: db.server_status.MUNDO.maintenance_message || 'Server is under maintenance' }, 503, res);
  if (matched.is_blocked) return enc({ status: false, code: 'error', message: 'SDK key blocked' }, 403, res);

  const exp = new Date(matched.created_at).getTime() + matched.duration_days * 86400 * 1000;
  if (Date.now() > exp) return enc({ status: false, code: 'error', message: 'SDK key expired' }, 403, res);

  const binds = db.mundo_bindings.filter((b) => b.sdk_key_id === matched.id);
  const pkgs = new Set(binds.map((b) => b.pkg_name));
  if (!pkgs.has(pkg) && pkgs.size >= matched.pkg_limit)
    return enc({ status: false, code: 'error', message: 'Package limit reached' }, 403, res);

  let mb = binds.find((b) => b.pkg_name === pkg && b.app_name === app);
  if (!mb) {
    if (binds.length >= matched.pkg_limit * matched.app_limit)
      return enc({ status: false, code: 'error', message: 'App limit reached' }, 403, res);
    if (binds.filter((b) => b.pkg_name === pkg).length >= matched.app_limit)
      return enc({ status: false, code: 'error', message: 'App limit reached' }, 403, res);
    const row = { id: db.seq.bind++, sdk_key_id: matched.id, pkg_name: pkg, app_name: app, is_blocked: 0 };
    db.mundo_bindings.push(row);
    persistDB(db);
    mb = row;
  }
  if ((mb as any).is_blocked) return enc({ status: false, code: 'error', message: 'Binding blocked' }, 403, res);

  return enc({
    status: true, code: 'success', message: 'SDK key validated successfully',
    sdk_key: matched.sdk_key, pkg_name: pkg, app_name: app, device_id: hwid,
    expires: new Date(exp).toISOString().slice(0, 19).replace('T', ' '),
  }, 200, res);
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
