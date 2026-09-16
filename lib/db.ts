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
  seq: { user: 1, key: 1, bind: 1 },
};

// In-memory cache (Vercel serverless me filesystem ephemeral hai, isliye global cache)
declare global {
  // eslint-disable-next-line no-var
  var __SDK_DB__: DB | undefined;
}

function dbFile(): string {
  // Vercel me /tmp writable hai, local me ./data/db.json
  const local = path.join(process.cwd(), 'data', 'db.json');
  return local;
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

export function loadDB(): DB {
  if (global.__SDK_DB__) return global.__SDK_DB__;
  try {
    const f = dbFile();
    if (fs.existsSync(f)) {
      const raw = fs.readFileSync(f, 'utf-8');
      const parsed = JSON.parse(raw) as DB;
      global.__SDK_DB__ = seedIfEmpty({ ...DEFAULT_DB, ...parsed });
      return global.__SDK_DB__!;
    }
  } catch {}
  const fresh = seedIfEmpty(JSON.parse(JSON.stringify(DEFAULT_DB)) as DB);
  global.__SDK_DB__ = fresh;
  persistDB(fresh);
  return fresh;
}

export function persistDB(db: DB) {
  global.__SDK_DB__ = db;
  try {
    const f = dbFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(db, null, 2));
  } catch {
    // Vercel read-only FS par ignore — memory me chalega
  }
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
