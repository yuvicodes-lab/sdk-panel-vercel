import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadDB, persistDB, newSdkKey } from '../lib/db';
import { getAuthUser, sendJson } from '../lib/auth';
import { testKey } from '../lib/verify';

function normEngine(e: any): 'MUNDO' | 'BCORE' {
  return String(e).toUpperCase() === 'BCORE' ? 'BCORE' : 'MUNDO';
}

// /api/keys?op=generate|list|do|test
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { error: 'Login required' });
  const op = String(req.query.op || '');
  const db = await loadDB();
  const isOwner = user.role === 'OWNER';

  // ---- generate (POST) ----
  if (op === 'generate') {
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
    await persistDB(db);
    return sendJson(res, 200, { ok: true, engine: eng, key: row });
  }

  // ---- list (GET, ADMIN sirf apni, OWNER sab) ----
  if (op === 'list') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Only GET' });
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

  // ---- test (POST dry-run) ----
  if (op === 'test') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });
    const { engine, sdk_key = '', pkg_name = '', app_name = '', device_id = '' } = (req.body || {}) as any;
    const eng = normEngine(engine);
    const result = testKey(db, eng, {
      sdk_key: String(sdk_key),
      pkg_name: String(pkg_name),
      app_name: String(app_name),
      device_id: String(device_id),
    });
    return sendJson(res, 200, { engine: eng, ...result });
  }

  // ---- do = block/unblock/delete/bind actions (POST) ----
  if (op === 'do') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Only POST' });
    const { action, engine, key_id, bind_id, pkg_name = '', app_name = '' } = (req.body || {}) as any;
    const eng = normEngine(engine);
    const keyId = Number(key_id);
    const bindId = Number(bind_id);
    const keyTable = eng === 'BCORE' ? db.bcore_keys : db.mundo_keys;
    const bindTable = eng === 'BCORE' ? db.bcore_bindings : db.mundo_bindings;
    const key = keyTable.find((k) => k.id === keyId);
    if (!key) return sendJson(res, 404, { error: 'Key not found' });
    if (!isOwner && key.userId !== user.id) return sendJson(res, 403, { error: 'Not your key' });

    if (action === 'block_key') { key.is_blocked = 1; await persistDB(db); return sendJson(res, 200, { ok: true }); }
    if (action === 'unblock_key') { key.is_blocked = 0; await persistDB(db); return sendJson(res, 200, { ok: true }); }
    if (action === 'delete_key') {
      const ki = keyTable.findIndex((k) => k.id === keyId);
      keyTable.splice(ki, 1);
      for (let i = bindTable.length - 1; i >= 0; i--) if (bindTable[i].sdk_key_id === keyId) bindTable.splice(i, 1);
      await persistDB(db);
      return sendJson(res, 200, { ok: true });
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
      await persistDB(db);
      return sendJson(res, 200, { ok: true });
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
      await persistDB(db);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 400, { error: 'Unknown action' });
  }

  return sendJson(res, 400, { error: 'Unknown op' });
}
