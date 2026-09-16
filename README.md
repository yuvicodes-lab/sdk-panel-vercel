# SDK Panel — Vercel Compatible (TypeScript + Static Mobile-First UI)

PHP wale panel ka same UI, par **panel_code system hata diya**. Ab simple hai:
- **Login / Register + Referral**
- **Role:** OWNER (full access) | ADMIN (sirf Generate + apni Keys)
- **Referral:** sirf OWNER nikal sakta hai — role select (ADMIN/OWNER) + duration select (15/30/60 din). Jo code banega wahi register me lagega, wahi role milega.
- **Engines:** MUNDO (AES-128-ECB) + BCORE (RC4) — verify APIs same crypto ke saath.
- **Mobile-first UI:** glass-card / clay-card / dual MUNDO-BCORE tabs — `public/` me.

## Structure (simple, jyada complex nahi)

```
vercel.json
package.json / tsconfig.json
lib/
  db.ts        → JSON file + memory DB (users, referrals, keys, bindings, server_status)
  auth.ts      → HMAC token + cookie session
  crypto.ts    → BCORE RC4 + MUNDO AES-128-ECB (PHP ke same)
api/
  auth/login.ts | register.ts | me.ts (GET=me, POST=logout)
  referrals/create.ts (OWNER) | list.ts (GET=list, POST=delete)
  keys/generate.ts | list.ts | action.ts (block/unblock/delete/bind)
  dashboard/stats.ts
  server/status.ts (GET + POST owner only)
  verify/mundo.ts | bcore.ts   (POST encrypted, panel_code nahi)
public/
  index.html | style.css | app.js
data/db.json (auto-create, gitignore)
```

## Local run

```bash
npm install
npx vercel dev
# kholo http://localhost:3000
# default owner: owner / owner123
```

## Vercel deploy (2 min)

1. Is folder ko GitHub par push karo.
2. https://vercel.com → New Project → repo import → Deploy (koi build command nahi chahiye, `vercel.json` routes sambhal lega).
3. Env (optional): `SESSION_SECRET` = koi lamba random string.
4. Deploy URL kholo → `owner / owner123` se login → Referral banao → Register test karo.

> Note: DB `data/db.json` + memory me hai (Vercel free par persistent Postgres nahi). Restart/redeploy par data reset ho sakta hai. Permanent chahiye to baad me Vercel KV/Postgres lagana — API same rahegi.

## Flow

1. OWNER login (`owner/owner123`) → Referral page → role=ADMIN, duration=30 → code `YUVI-XXXX-XXXX` copy.
2. Logout → Register → username + password + referral code → ADMIN account ban gaya.
3. ADMIN login → Dashboard (sirf apne keys ke stats) → Generate (MUNDO/BCORE) → Keys (sirf apni, blur + copy + block/delete + pkg/app bind).
4. OWNER login → sab keys (`@username` ke saath) + Server (endpoint URL + maintenance toggle) + Referrals (list/delete).
5. App verify: `POST https://<tumhara-domain>/api/verify/mundo` ya `/api/verify/bcore` — encrypted body, same format jaise PHP me tha (salt/secret same rakhe hain taaki purana `.so`/client bina change ke chale).

## Verify format (panel_code HATA diya)

- MUNDO: `data=<urlencode(base64(AES-128-ECB(S1|S2|S3_A|S3_B)))>`, key=`generateDynamicAESKey("https://mundo.cp.cheat/v2/api/verify")`
- BCORE: raw body = `base64(RC4(payload, "YuviMatrix_Secure_2026"))`, payload JSON ya `sdk_key=&pkg_name=&app_name=&device_id=`
