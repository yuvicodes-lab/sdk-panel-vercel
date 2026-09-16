import crypto from 'crypto';

// ===== BCORE: RC4 + Base64 (PHP bcore.php ke same) =====
export const BCORE_SECRET = 'YuviMatrix_Secure_2026';

export function rc4(data: Buffer, key: string): Buffer {
  const S: number[] = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key.charCodeAt(i % key.length)) % 256;
    [S[i], S[j]] = [S[j], S[i]];
  }
  let i = 0;
  j = 0;
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < data.length; y++) {
    i = (i + 1) % 256;
    j = (j + S[i]) % 256;
    [S[i], S[j]] = [S[j], S[i]];
    out[y] = data[y] ^ S[(S[i] + S[j]) % 256];
  }
  return out;
}

export function bcoreEncrypt(plain: string): string {
  return rc4(Buffer.from(plain, 'utf-8'), BCORE_SECRET).toString('base64');
}

export function bcoreDecrypt(cipherB64: string): string {
  try {
    const raw = Buffer.from(cipherB64, 'base64');
    return rc4(raw, BCORE_SECRET).toString('utf-8');
  } catch {
    return '';
  }
}

// ===== MUNDO: AES-128-ECB dynamic key (PHP mundo.php ke same) =====
export const MUNDO_SALT = 'https://mundo.cp.cheat/v2/api/verify';

export function mundoAesKey(salt: string = MUNDO_SALT): Buffer {
  let key = '';
  const len = salt.length;
  for (let i = 0; i < 16; i++) {
    key += String.fromCharCode(salt.charCodeAt(i % len) ^ ((len + i) & 0xff));
  }
  return Buffer.from(key, 'latin1');
}

export function mundoEncrypt(plain: string): string {
  const key = mundoAesKey();
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]).toString('base64');
}

export function mundoDecrypt(b64: string): string {
  try {
    const key = mundoAesKey();
    const raw = Buffer.from(b64, 'base64');
    const dec = crypto.createDecipheriv('aes-128-ecb', key, null);
    dec.setAutoPadding(true);
    return Buffer.concat([dec.update(raw), dec.final()]).toString('utf-8');
  } catch {
    return '';
  }
}
