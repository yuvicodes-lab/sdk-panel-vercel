import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ---------- Types ----------
export type Role = 'OWNER' | 'ADMIN';

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  salt: string;
  role: Role;
  createdAt: string;
  usedReferral: string | null;
}

export interface Referral {
  code: string;
  role: Role;
  durationDays: 15 | 30 | 60; // referral code validity
  createdBy: number;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedBy: number | null;
}

export interface SdkKey {
  id: number;
  userId: number;
  sdk_key: string;
  duration_days: number;
  pkg_limit: number;
  app_limit: number;
  feature1: number;
  feature2: number;
  is_blocked: number;
  created_at: string;
}

export interface Binding {
  id: number;
  sdk_key_id: number;
  pkg_name: string;
  app_name: string;
  is_blocked: number;
}

export interface Session {
  token: string;
  userId: number;
  expiresAt: number;
}

export interface VerifyLog {
  t: string;
  engine: 'MUNDO' | 'BCORE';
  key: string; // masked
  pkg: string;
  app: string;
  ok: boolean;
  code: string;
}

export interface DB {
  users: User[];
  referrals: Referral[];
  mundo_keys: SdkKey[];
  bcore_keys: SdkKey[];
  mundo_bindings: Binding[];
  bcore_bindings: Binding[];
  server_status: {
    MUNDO: { maintenance_mode: number; maintenance_message: string };
    BCORE: { maintenance_mode: number; maintenance_message: string };
  };
  sessions: Session[];
  verify_log: VerifyLog[];
  seq: { user: number; key: number; bind: number };
}

const DEFAULT_DB: DB = {
  users: [],
  referrals: [],
  mundo_keys: [],
  bcore_keys: [],
  mundo_bindings: [],
  bcore_bindings: [],
  server_status: {
    MUNDO: { maintenance_mode: 0, maintenance_message: '' },
    BCORE: { maintenance_mode: 0, maintenance_message: '' },
  },
  sessions: [],
  verify_log: [],
  seq: { user: 1, key: 1, bind: 1 },
};

// ---------- Upstash Redis (Vercel par persistent storage) ----------
// Vercel env me ye 2 variables lagao (Upstash Redis → REST API se copy):
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// Local me env nahi hoga to data/db.json file use hogi.
const R_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const R_KEY = 'sdk-panel-db-v1';
const hasRedis = () => !!(R_URL && R_TOKEN);

async function redisGet(): Promise<string | null> {
  const r = await fetch(`${R_URL}/get/${R_KEY}`, {
    headers: { Authorization: `Bearer ${R_TOKEN}` },
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  if (j.result == null) return null;
  return typeof j.result === 'string' ? j.result : JSON.stringify(j.result);
}

async function redisSet(val: string): Promise<void> {
  await fetch(`${R_URL}/set/${R_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'text/plain' },
    body: val,
  });
}

// ---------- Memory cache (same warm instance me repeat reads fast) ----------
declare global {
  // eslint-disable-next-line no-var
  var __SDK_DB__: DB | undefined;
  // eslint-disable-next-line no-var
  var __SDK_DB_AT__: number | undefined;
}
const TTL_MS = 3000;

function dbFile(): string {
  return path.join(process.cwd(), 'data', 'db.json');
}

function withDefaults(parsed: any): DB {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_DB)) as DB;
  return { ...fresh, ...(parsed || {}) };
}

function seedIfEmpty(db: DB): DB {
  if (db.users.length === 0) {
    // Default OWNER: username=owner password=owner123
    const salt = crypto.randomBytes(8).toString('hex');
    const passwordHash = crypto.createHash('sha256').update(salt + 'owner123').digest('hex');
    db.users.push({
      id: db.seq.user++,
      username: 'owner',
      passwordHash,
      salt,
      role: 'OWNER',
      createdAt: new Date().toISOString(),
      usedReferral: null,
    });
  }
  return db;
}

function toCache(db: DB) {
  global.__SDK_DB__ = db;
  global.__SDK_DB_AT__ = Date.now();
}

export async function loadDB(): Promise<DB> {
  const now = Date.now();
  if (global.__SDK_DB__ && global.__SDK_DB_AT__ && now - global.__SDK_DB_AT__ < TTL_MS) {
    return global.__SDK_DB__;
  }
  // 1) Redis (Vercel)
  if (hasRedis()) {
    try {
      const s = await redisGet();
      if (s) {
        const db = seedIfEmpty(withDefaults(JSON.parse(s)));
        toCache(db);
        return db;
      }
    } catch {
      // redis fail → file fallback
    }
  }
  // 2) File (local dev)
  try {
    const f = dbFile();
    if (fs.existsSync(f)) {
      const db = seedIfEmpty(withDefaults(JSON.parse(fs.readFileSync(f, 'utf-8'))));
      toCache(db);
      return db;
    }
  } catch {}
  const fresh = seedIfEmpty(withDefaults(null));
  toCache(fresh);
  await persistDB(fresh);
  return fresh;
}

export async function persistDB(db: DB): Promise<void> {
  toCache(db);
  if (hasRedis()) {
    try {
      await redisSet(JSON.stringify(db));
    } catch {}
  }
  try {
    const f = dbFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(db, null, 2));
  } catch {
    // Vercel read-only FS par ignore — Redis/memory me chalega
  }
}

export function maskKey(k: string): string {
  if (k.length <= 6) return '****';
  return k.slice(0, 4) + '****' + k.slice(-2);
}

export function logVerify(db: DB, e: VerifyLog) {
  db.verify_log.unshift(e);
  db.verify_log = db.verify_log.slice(0, 50);
}

export function hashPassword(password: string, salt: string): string {
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}

export function newReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) s += chars[buf[i] % chars.length];
  return 'YUVI-' + s.slice(0, 4) + '-' + s.slice(4);
}

export function newSdkKey(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase(); // 16 char
}
