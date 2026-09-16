import type { DB } from './db';

// Panel ke "Key Test" page ke liye dry-run validation (koi write nahi, limit consume nahi).
// Wahi rules jo /api/verify/mundo aur /api/verify/bcore me lagte hain.

export interface TestInput {
  sdk_key: string;
  pkg_name: string;
  app_name: string;
  device_id?: string;
}

export interface TestStep {
  label: string;
  pass: boolean;
  info?: string;
}

export interface TestResult {
  ok: boolean;
  code: string;
  message: string;
  steps: TestStep[];
  data?: any;
}

export function testKey(db: DB, engine: 'MUNDO' | 'BCORE', inp: TestInput): TestResult {
  const steps: TestStep[] = [];
  const sdk_key = (inp.sdk_key || '').trim();
  const pkg_name = (inp.pkg_name || '').trim();
  const app_name = (inp.app_name || '').trim();

  if (!sdk_key || !pkg_name || !app_name) {
    return {
      ok: false, code: 'MISSING_PARAMETER', message: 'sdk_key + pkg_name + app_name teeno bharo',
      steps: [{ label: 'Required fields', pass: false, info: 'koi field khali hai' }],
    };
  }

  // 1) maintenance
  const maint = db.server_status[engine].maintenance_mode === 1;
  steps.push({
    label: 'Maintenance check', pass: !maint,
    info: maint ? db.server_status[engine].maintenance_message || 'Server maintenance par hai' : 'Server ONLINE hai',
  });
  if (maint) return { ok: false, code: 'SERVER_MAINTENANCE', message: steps[0].info!, steps };

  // 2) key exists
  const table = engine === 'BCORE' ? db.bcore_keys : db.mundo_keys;
  const binds = engine === 'BCORE' ? db.bcore_bindings : db.mundo_bindings;
  const key = table.find((k) => k.sdk_key === sdk_key);
  steps.push({ label: 'Key valid', pass: !!key, info: key ? `Key mili (ID #${key.id})` : 'Ye key database me nahi hai' });
  if (!key) return { ok: false, code: 'INVALID_KEY', message: 'Invalid SDK key', steps };

  // 3) blocked?
  steps.push({ label: 'Key block check', pass: key.is_blocked !== 1, info: key.is_blocked === 1 ? 'Key BLOCKED hai' : 'Key ACTIVE hai' });
  if (key.is_blocked === 1) return { ok: false, code: 'INVALID_KEY', message: 'SDK key blocked hai', steps };

  // 4) expiry
  const exp = new Date(key.created_at).getTime() + key.duration_days * 86400 * 1000;
  const alive = Date.now() <= exp;
  steps.push({
    label: 'Expiry check', pass: alive,
    info: alive ? `Valid hai, expires: ${new Date(exp).toLocaleString()}` : 'Key EXPIRE ho chuki hai',
  });
  if (!alive) return { ok: false, code: 'EXPIRED_KEY', message: 'SDK key expired', steps };

  // 5) pkg limit
  const myBinds = binds.filter((b) => b.sdk_key_id === key.id);
  const pkgs = new Set(myBinds.map((b) => b.pkg_name));
  const pkgOk = pkgs.has(pkg_name) || pkgs.size < key.pkg_limit;
  steps.push({
    label: 'Package limit', pass: pkgOk,
    info: `${pkgs.size}/${key.pkg_limit} pkg use — ${pkgs.has(pkg_name) ? 'ye pkg pehle se bound hai' : pkgOk ? 'naya pkg bind ho jayega' : 'PKG LIMIT FULL'}`,
  });
  if (!pkgOk) return { ok: false, code: 'PKG_LIMIT_REACHED', message: 'Package limit reached', steps };

  // 6) app limit
  const mb = myBinds.find((b) => b.pkg_name === pkg_name && b.app_name === app_name);
  const total = key.pkg_limit * key.app_limit;
  const inPkg = myBinds.filter((b) => b.pkg_name === pkg_name).length;
  const appOk = !!mb || (myBinds.length < total && inPkg < key.app_limit);
  steps.push({
    label: 'App limit', pass: appOk,
    info: mb ? 'Ye app pehle se bound hai' : `${myBinds.length}/${total} apps use — ${appOk ? 'nayi app bind ho jayegi' : 'APP LIMIT FULL'}`,
  });
  if (!appOk) return { ok: false, code: 'APP_LIMIT_REACHED', message: 'App limit reached', steps };

  // 7) binding blocked?
  if (mb && (mb as any).is_blocked === 1) {
    steps.push({ label: 'Binding status', pass: false, info: 'Ye pkg/app binding BLOCKED hai' });
    return { ok: false, code: 'BINDING_BLOCKED', message: 'This app binding is blocked', steps };
  }
  steps.push({
    label: 'Binding status', pass: true,
    info: mb ? 'Bound + ACTIVE' : 'Nayi binding banegi (dry-run: abhi banayi nahi)',
  });

  return {
    ok: true, code: 'VALID', message: 'Key bilkul sahi kaam karegi ✓', steps,
    data: {
      sdk_key: 'valid', pkg_name, app_name,
      device_id: inp.device_id ? 'registered' : '',
      features1: key.feature1 === 1, features2: key.feature2 === 1,
      expires: new Date(exp).toLocaleString(),
    },
  };
}
