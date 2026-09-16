import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB } from '../../lib/db';
import { getAuthUser, sendJson } from '../../lib/auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const user = getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });

  const { action, engine, key_id, bind_id, pkg_name = '', app_name = '' } = (req.body || {}) as any;
  const eng = String(engine).toUpperCase() === 'BCORE' ? 'BCORE' : 'MUNDO';
  const keyId = Number(key_id);
  const bindId = Number(bind_id);
  const isOwner = user.role === 'OWNER';

  const db = loadDB();
  const keyTable = eng === 'BCORE' ? db.bcore_keys : db.mundo_keys;
  const bindTable = eng === 'BCORE' ? db.bcore_bindings : db.mundo_bindings;

  const key = keyTable.find((k) => k.id === keyId);
  if (!key) return sendJson(res, 404, { error: 'Key not found' });
  if (!isOwner && key.userId !== user.id) return sendJson(res, 403, { error: 'Not your key' });

  const save = () => persistDB(db);

  if (action === 'block_key') { key.is_blocked = 1; save(); return sendJson(res, 200, { ok: true }); }
  if (action === 'unblock_key') { key.is_blocked = 0; save(); return sendJson(res, 200, { ok: true }); }
  if (action === 'delete_key') {
    const ki = keyTable.findIndex((k) => k.id === keyId);
    keyTable.splice(ki, 1);
    for (let i = bindTable.length - 1; i >= 0; i--) if (bindTable[i].sdk_key_id === keyId) bindTable.splice(i, 1);
    save(); return sendJson(res, 200, { ok: true });
  }
  if (action === 'block_bind' || action === 'unblock_bind' || action === 'delete_bind' || action === 'save_bind') {
    const b = bindTable.find((x) => x.id === bindId && x.sdk_key_id === keyId);
    if (!b) return sendJson(res, 404, { error: 'Binding not found' });
    if (action === 'block_bind') b.is_blocked = 1;
    if (action === 'unblock_bind') b.is_blocked = 0;
    if (action === 'delete_bind') bindTable.splice(bindTable.indexOf(b), 1);
    if (action === 'save_bind') {
      const p = String(pkg_name).trim(), a = String(app_name).trim();
      if (!p || !a) return sendJson(res, 400, { error: 'pkg_name + app_name required' });
      b.pkg_name = p; b.app_name = a;
    }
    save(); return sendJson(res, 200, { ok: true });
  }
  if (action === 'add_bind') {
    const p = String(pkg_name).trim(), a = String(app_name).trim();
    if (!p || !a) return sendJson(res, 400, { error: 'pkg_name + app_name required' });
    const binds = bindTable.filter((x) => x.sdk_key_id === keyId);
    const total = key.pkg_limit * key.app_limit;
    if (binds.length >= total) return sendJson(res, 400, { error: `App limit reached (${total})` });
    const appsInPkg = binds.filter((x) => x.pkg_name === p).length;
    const pkgs = new Set(binds.map((x) => x.pkg_name));
    if (!pkgs.has(p) && pkgs.size >= key.pkg_limit) return sendJson(res, 400, { error: 'Package limit reached' });
    if (appsInPkg >= key.app_limit) return sendJson(res, 400, { error: 'App limit reached for this package' });
    bindTable.push({ id: db.seq.bind++, sdk_key_id: keyId, pkg_name: p, app_name: a, is_blocked: 0 });
    save(); return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 400, { error: 'Unknown action' });
}
