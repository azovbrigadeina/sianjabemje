# Salt Acak Password + Penyelarasan Env — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti hash password deterministik menjadi `v2$<salt>$<hmac>` dengan salt acak per user (migrasi otomatis saat login) dan selaraskan contoh env server + frontend dengan env yang benar-benar dibaca kode.

**Architecture:** Satu format hash dipakai dua backend (GAS + Homeserver). Verifikasi berurutan v2 → v1 → legacy; hash lama yang cocok ditulis ulang ke v2. Pepper dipisah dari `API_SECRET` lewat `PASSWORD_PEPPER` yang wajib terisi (fail-closed), sehingga rotasi `API_SECRET` tidak mengunci akun.

**Tech Stack:** Node 26 (`node:test`, `node:crypto`), Google Apps Script (`Utilities.computeHmacSignature`, `Utilities.getUuid`), Next.js 16 (env `NEXT_PUBLIC_*`).

**Spec:** `docs/superpowers/specs/2026-11-18-password-salt-env-design.md`

## Global Constraints

- Format hash: `v2$<salt>$<hashHex>`; `salt` = 32 karakter hex; `hashHex` = HMAC-SHA256 hex huruf kecil dari `salt + ':' + username + ':' + pepper`.
- `PASSWORD_PEPPER` wajib terisi di Homeserver (gagal start bila kosong) dan di GAS Script Properties (gagal login dengan pesan jelas bila kosong).
- Verifikasi berurutan: v2 → v1 (`HMAC(password, username:API_SECRET)`) → legacy (`SHA256(password)`).
- Migrasi hanya saat login sukses; tulis ke field `password`, hapus `passwordHash` bila ada.
- Tidak ada iterasi tambahan (keputusan user: kecepatan login).
- Tidak ada password plaintext yang diterima.
- Gate tiap task: `npx tsc --noEmit` 0 error, `npm run test:unit`, `npm run test:gas`, `node --test sianjab-db-server/server.test.js`, `node --test sianjab-db-server/resilience.test.js`, `npm run build`.

## Review Focus

- Password benar tetapi hash tersimpan format lama (v1/legacy) → login harus sukses dan hash berubah ke v2.
- Password salah pada akun ber-hash v2 → ditolak, tidak ada penulisan hash.
- `PASSWORD_PEPPER` kosong → Homeserver menolak start; GAS menolak login dengan pesan konfigurasi, bukan "password salah".
- Dua user dengan password sama → hash tersimpan berbeda (salt acak).
- `API_SECRET` dirotasi setelah semua user termigrasi v2 → login tetap sukses (pepper terpisah).

---

### Task 1: Selaraskan contoh env (ARC-F11)

**Files:**
- Modify: `sianjab-db-server/.env.example`
- Create: `.env.local.example`
- Modify: `.gitignore:34`
- Create: `sianjab-db-server/env-example.test.js`
- Modify: `package.json:5-13`

**Interfaces:**
- Consumes: tidak ada.
- Produces: `npm run test:env` yang memeriksa kelengkapan contoh env.

- [ ] **Step 1: Tulis test yang gagal**

Buat `sianjab-db-server/env-example.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readEnvKeys(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  return new Set(
    text.split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('=')[0].trim())
  );
}

test('semua env yang dibaca server.js ada di .env.example', () => {
  const src = fs.readFileSync(path.join(root, 'sianjab-db-server/server.js'), 'utf8');
  const used = new Set();
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]);
  for (const m of src.matchAll(/requireEnv\('([A-Z0-9_]+)'\)/g)) used.add(m[1]);
  const documented = readEnvKeys('sianjab-db-server/.env.example');
  const missing = [...used].filter((k) => !documented.has(k)).sort();
  assert.deepEqual(missing, []);
});

test('semua NEXT_PUBLIC_* yang dibaca src ada di .env.local.example', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(root, 'src'));
  const used = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) used.add(m[1]);
  }
  const documented = readEnvKeys('.env.local.example');
  const missing = [...used].filter((k) => !documented.has(k)).sort();
  assert.deepEqual(missing, []);
});

test('.gitignore mengizinkan .env.local.example', () => {
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gi, /^!\.env\.local\.example$/m);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `node --test sianjab-db-server/env-example.test.js`
Expected: FAIL — `.env.local.example` tidak ada (ENOENT) dan daftar `missing` tidak kosong.

- [ ] **Step 3: Lengkapi `sianjab-db-server/.env.example`**

Tambahkan setelah blok secret wajib:

```
# Wajib (ARC-F3): pepper hash password — nilai sama dengan GAS Script Properties.
# JANGAN dirotasi bersamaan dengan API_SECRET; rotasi pepper = semua password harus direset.
PASSWORD_PEPPER=
```

Tambahkan di blok opsional:

```
# PORT=3098
# BIND_HOST=127.0.0.1
# DATA_DIR=./data
# CORS_ALLOWED_ORIGINS=
# BACKUP_INTERVAL_MS=86400000
# BACKUP_RETENTION=14
```

- [ ] **Step 4: Buat `.env.local.example`**

```
# Frontend (Next.js) — salin ke .env.local
# NEXT_PUBLIC_GAS_DEPLOYMENT_URL=https://script.google.com/macros/s/.../exec
# NEXT_PUBLIC_HOMESERVER_URL=https://bebaa-server-1.tail56d53d.ts.net:8443
# NEXT_PUBLIC_SITE_URL=https://anjabmj-44141.web.app
```

- [ ] **Step 5: Izinkan file contoh di `.gitignore`**

Sisipkan tepat setelah baris `.env*`:

```
!.env.local.example
```

- [ ] **Step 6: Tambah script `test:env`**

Di `package.json`, tambahkan setelah `"test:gas"`:

```json
"test:env": "node --test sianjab-db-server/env-example.test.js"
```

- [ ] **Step 7: Jalankan test, pastikan lulus**

Run: `npm run test:env`
Expected: `pass 3`, `fail 0`.

- [ ] **Step 8: Commit**

```bash
git add sianjab-db-server/.env.example .env.local.example .gitignore sianjab-db-server/env-example.test.js package.json
git commit -m "chore(env): selaraskan contoh env server + frontend (ARC-F11)"
```

---

### Task 2: Helper hash v2 + verifikasi berurutan di Homeserver

**Files:**
- Modify: `sianjab-db-server/server.js:44-48` (env), `:711-722` (helper), `:2730-2750` (exports)
- Test: `sianjab-db-server/server.test.js`

**Interfaces:**
- Consumes: `PASSWORD_PEPPER` dari env.
- Produces:
  - `hashPasswordWithSalt(password: string, username: string, salt: string): string` → `v2$<salt>$<hex>`
  - `hashPasswordHmac(password: string, username: string): string` → v2 dengan salt acak
  - `verifyPassword(password: string, username: string, stored: string): { valid: boolean, needsRehash: boolean }`
  - `hashPasswordV1(password: string, username: string): string` (v1, untuk verifikasi)
  - `hashPasswordLegacy(password: string): string` (sha256 polos)

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `sianjab-db-server/server.test.js`:

```js
test('ARC-F3: hash password v2 bersalt acak dan verifikasi berurutan', () => {
  const a = hashPasswordHmac('rahasia', 'budi');
  const b = hashPasswordHmac('rahasia', 'budi');
  assert.match(a, /^v2\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notEqual(a, b, 'salt acak harus membuat hash berbeda');

  assert.deepEqual(verifyPassword('rahasia', 'budi', a), { valid: true, needsRehash: false });
  assert.deepEqual(verifyPassword('salah', 'budi', a), { valid: false, needsRehash: false });

  const v1 = hashPasswordV1('rahasia', 'budi');
  assert.deepEqual(verifyPassword('rahasia', 'budi', v1), { valid: true, needsRehash: true });

  const legacy = hashPasswordLegacy('rahasia');
  assert.deepEqual(verifyPassword('rahasia', 'budi', legacy), { valid: true, needsRehash: true });

  assert.deepEqual(verifyPassword('rahasia', 'budi', 'plaintext'), { valid: false, needsRehash: false });
  assert.deepEqual(verifyPassword('rahasia', 'budi', ''), { valid: false, needsRehash: false });
});
```

Perbarui destructuring `require('./server.js')` di baris 17-35 agar memuat `verifyPassword`, `hashPasswordV1`, `hashPasswordLegacy`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `node --test sianjab-db-server/server.test.js`
Expected: FAIL — `verifyPassword is not a function`.

- [ ] **Step 3: Implementasi helper di `server.js`**

Ganti blok `hashPasswordOld`/`hashPasswordHmac`/`hashPasswordSha256` (baris 711-722) dengan:

```js
const PASSWORD_PEPPER = requireEnv('PASSWORD_PEPPER');

function hashPasswordLegacy(password) {
  return crypto.createHash('sha256').update(String(password || ''), 'utf8').digest('hex');
}

function hashPasswordV1(password, username) {
  const salt = `${username || ''}:${API_SECRET}`;
  return crypto.createHmac('sha256', salt).update(String(password || ''), 'utf8').digest('hex');
}

function hashPasswordWithSalt(password, username, salt) {
  const key = `${salt}:${username || ''}:${PASSWORD_PEPPER}`;
  const hex = crypto.createHmac('sha256', key).update(String(password || ''), 'utf8').digest('hex');
  return `v2$${salt}$${hex}`;
}

function hashPasswordHmac(password, username) {
  return hashPasswordWithSalt(password, username, crypto.randomBytes(16).toString('hex'));
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyPassword(password, username, stored) {
  const value = String(stored || '');
  if (!value) return { valid: false, needsRehash: false };
  if (value.startsWith('v2$')) {
    const parts = value.split('$');
    if (parts.length !== 3) return { valid: false, needsRehash: false };
    const expected = hashPasswordWithSalt(password, username, parts[1]);
    return { valid: safeEqualHex(expected, value), needsRehash: false };
  }
  if (safeEqualHex(hashPasswordV1(password, username), value)) {
    return { valid: true, needsRehash: true };
  }
  if (safeEqualHex(hashPasswordLegacy(password), value)) {
    return { valid: true, needsRehash: true };
  }
  return { valid: false, needsRehash: false };
}
```

- [ ] **Step 4: Perbarui exports**

Di objek `module.exports`, ganti `hashPasswordHmac,` menjadi:

```js
  hashPasswordHmac,
  hashPasswordWithSalt,
  hashPasswordV1,
  hashPasswordLegacy,
  verifyPassword,
```

- [ ] **Step 5: Set `PASSWORD_PEPPER` di semua test yang me-require server**

Tambahkan `process.env.PASSWORD_PEPPER = 'test-password-pepper';` di `sianjab-db-server/server.test.js` (setelah `SITPP_SECRET`), `sianjab-db-server/resilience.test.js`, dan `gas/tests/parity-gas-homeserver.js`.

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `node --test sianjab-db-server/server.test.js`
Expected: semua pass, termasuk test ARC-F3 baru.

- [ ] **Step 7: Commit**

```bash
git add sianjab-db-server/server.js sianjab-db-server/server.test.js sianjab-db-server/resilience.test.js gas/tests/parity-gas-homeserver.js
git commit -m "feat(auth): hash password v2 bersalt acak + verifikasi berurutan (ARC-F3)"
```

---

### Task 3: Migrasi login + pembuatan user di Homeserver

**Files:**
- Modify: `sianjab-db-server/server.js:1336-1375` (login), `:1849` (createUser), `:1878` (updateUser)
- Test: `sianjab-db-server/server.test.js`

**Interfaces:**
- Consumes: `verifyPassword`, `hashPasswordHmac` dari Task 2.
- Produces: tidak ada API baru.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di `sianjab-db-server/server.test.js`:

```js
test('ARC-F3: login memigrasi hash v1 ke v2 dan menolak password salah', async () => {
  setDbNode('users', {
    u_old: {
      id: 'u_old',
      username: 'userlama',
      role: 'admin',
      isActive: true,
      passwordHash: hashPasswordV1('passlama', 'userlama')
    }
  });

  const ok = await handleSianjabAction('login', {}, { username: 'userlama', password: 'passlama' }, '127.0.0.1');
  assert.equal(ok.username, 'userlama');

  const stored = getDbNode('users/u_old');
  assert.match(stored.password, /^v2\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(stored.passwordHash, undefined, 'passwordHash lama harus dihapus');

  const bad = await handleSianjabAction('login', {}, { username: 'userlama', password: 'salah' }, '127.0.0.2').catch((e) => e);
  assert.match(String(bad.message), /Username atau password salah/);
  assert.equal(getDbNode('users/u_old').password, stored.password, 'hash tidak boleh berubah saat gagal');
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `node --test sianjab-db-server/server.test.js`
Expected: FAIL — `stored.password` masih `undefined` (hash ada di `passwordHash`).

- [ ] **Step 3: Implementasi di login**

Ganti blok verifikasi di `server.js` (sekitar baris 1362-1368):

```js
    const storedPass = user.password || user.passwordHash || '';
    const check = verifyPassword(password, user.username, storedPass);
    if (!check.valid) {
      recordLoginFailure(username, clientIp);
      throw new Error('Username atau password salah');
    }
    clearLoginFailures(username, clientIp);

    if (check.needsRehash) {
      const migrated = hashPasswordHmac(password, user.username);
      const nextUser = { ...user, password: migrated, updatedAt: new Date().toISOString() };
      delete nextUser.passwordHash;
      setDbNode(`users/${foundUserId}`, nextUser);
      markDirtyPath(`users/${foundUserId}`);
      scheduleSaveDb();
    }
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `node --test sianjab-db-server/server.test.js`
Expected: semua pass.

- [ ] **Step 5: Commit**

```bash
git add sianjab-db-server/server.js sianjab-db-server/server.test.js
git commit -m "feat(auth): migrasi otomatis hash password lama ke v2 saat login (ARC-F3)"
```

---

### Task 4: Paritas GAS — hash v2, verifikasi, migrasi

**Files:**
- Modify: `gas/Code.gs:20-30` (pepper), `:1965-1982` (helper), `:2088-2125` (login), `:2153` (bootstrap), `:2180` (createUser), `:2222` (updateUser), `:2932-2947` (reset password)
- Test: `gas/tests/parity-gas-homeserver.js`

**Interfaces:**
- Consumes: format v2 dari Task 2.
- Produces:
  - `getPasswordPepper_(): string`
  - `hashPasswordWithSalt_(password, username, salt): string`
  - `hashPassword_(password, username): string`
  - `verifyPassword_(password, username, stored): { valid: boolean, needsRehash: boolean }`

- [ ] **Step 1: Tulis test paritas yang gagal**

Di `gas/tests/parity-gas-homeserver.js`, ganti stub `computeHmacSignature` di sandbox dengan HMAC asli:

```js
    computeHmacSignature: (_alg, data, key) => crypto.createHmac('sha256', String(key)).update(String(data), 'utf8').digest(),
```

Tambahkan `const crypto = require('crypto');` di bagian atas, lalu tambahkan sebelum ringkasan:

```js
  // ----------------------------------------------------------
  // 10. Paritas hash password v2 (ARC-F3)
  // ----------------------------------------------------------
  const fixedSalt = '0123456789abcdef0123456789abcdef';
  const gasHash = sandbox.hashPasswordWithSalt_('rahasia', 'budi', fixedSalt);
  const hsHash = server.hashPasswordWithSalt('rahasia', 'budi', fixedSalt);
  check('ARC-F3: hash v2 GAS = Homeserver (salt sama)', gasHash === hsHash, { gas: gasHash, hs: hsHash });
  check('ARC-F3: format hash v2', /^v2\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(hsHash), hsHash);

  const gasV1 = sandbox.hashPasswordV1_('rahasia', 'budi');
  const hsV1 = server.hashPasswordV1('rahasia', 'budi');
  check('ARC-F3: hash v1 GAS = Homeserver', gasV1 === hsV1, { gas: gasV1, hs: hsV1 });
  check('ARC-F3: verifikasi v1 GAS', sandbox.verifyPassword_('rahasia', 'budi', gasV1).needsRehash === true);
  check('ARC-F3: verifikasi v1 Homeserver', server.verifyPassword('rahasia', 'budi', hsV1).needsRehash === true);
  check('ARC-F3: password salah ditolak GAS', sandbox.verifyPassword_('salah', 'budi', gasHash).valid === false);
  check('ARC-F3: password salah ditolak Homeserver', server.verifyPassword('salah', 'budi', hsHash).valid === false);
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `node gas/tests/parity-gas-homeserver.js`
Expected: FAIL — `hashPasswordWithSalt_ is not a function`.

- [ ] **Step 3: Implementasi helper GAS**

Ganti `hashPasswordOld_`/`hashPassword_` (baris 1965-1982) dengan:

```js
function getPasswordPepper_() {
  var pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER');
  if (!pepper || !String(pepper).trim()) {
    throw new Error('PASSWORD_PEPPER belum dikonfigurasi di Script Properties.');
  }
  return String(pepper).trim();
}

function hashPasswordOld_(password) {
  var signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  var hexString = '';
  for (var i = 0; i < signature.length; i++) {
    var byte = signature[i];
    if (byte < 0) byte += 256;
    var byteStr = byte.toString(16);
    if (byteStr.length == 1) byteStr = '0' + byteStr;
    hexString += byteStr;
  }
  return hexString;
}

function hashPasswordV1_(password, username) {
  var salt = (username || '') + ':' + getApiSecret_();
  return computeHmacHex_(password, salt);
}

function hashPasswordWithSalt_(password, username, salt) {
  var key = salt + ':' + (username || '') + ':' + getPasswordPepper_();
  return 'v2$' + salt + '$' + computeHmacHex_(password, key);
}

function hashPassword_(password, username) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  return hashPasswordWithSalt_(password, username, salt);
}

function verifyPassword_(password, username, stored) {
  var value = String(stored || '');
  if (!value) return { valid: false, needsRehash: false };
  if (value.indexOf('v2$') === 0) {
    var parts = value.split('$');
    if (parts.length !== 3) return { valid: false, needsRehash: false };
    return { valid: hashPasswordWithSalt_(password, username, parts[1]) === value, needsRehash: false };
  }
  if (hashPasswordV1_(password, username) === value) return { valid: true, needsRehash: true };
  if (hashPasswordOld_(password) === value) return { valid: true, needsRehash: true };
  return { valid: false, needsRehash: false };
}
```

- [ ] **Step 4: Pakai verifikasi + migrasi di login GAS**

Ganti blok `saltedHash`/`legacyHash`/`needsRehash` (baris 2088-2102) dengan:

```js
  var storedPass = user.password || user.passwordHash || '';
  var check = verifyPassword_(data.password, user.username, storedPass);
  var isPasswordValid = check.valid;
  var needsRehash = check.needsRehash;
```

Ganti blok migrasi (baris 2116-2125) dengan:

```js
  if (needsRehash) {
    try {
      fbPatch_('users/' + foundUserId, { password: hashPassword_(data.password, user.username), passwordHash: null, updatedAt: new Date().toISOString() });
      invalidateCache_('users');
    } catch (rehashErr) {
      Logger.log('Gagal migrasi hash password: ' + rehashErr.message);
    }
  }
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `node gas/tests/parity-gas-homeserver.js`
Expected: `PASS: 121  FAIL: 0` (114 lama + 7 baru).

- [ ] **Step 6: Commit**

```bash
git add gas/Code.gs gas/tests/parity-gas-homeserver.js
git commit -m "feat(gas): hash password v2 bersalt acak + migrasi login (ARC-F3)"
```

---

### Task 5: Dokumentasi deploy + gate penuh

**Files:**
- Modify: `gas/CHECKLIST-DEPLOY.md`
- Modify: `docs/audit/2026-11-18-audit-menyeluruh.md`
- Modify: `docs/superpowers/plans/2026-11-18-security-phase2-authz.md`

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces: tidak ada.

- [ ] **Step 1: Tambah `PASSWORD_PEPPER` ke checklist GAS**

Di tabel Script Properties `gas/CHECKLIST-DEPLOY.md`, tambahkan baris:

```
| `PASSWORD_PEPPER` | ✅ | Pepper hash password v2 | Login gagal "PASSWORD_PEPPER belum dikonfigurasi" |
```

Tambahkan catatan di bagian 0:

```
> ⚠️ ARC-F3: isi `PASSWORD_PEPPER` (nilai sama dengan homeserver `.env`) SEBELUM
> user pertama login. Rotasi `API_SECRET` hanya boleh setelah user termigrasi ke v2.
```

- [ ] **Step 2: Perbarui status audit**

Di `docs/audit/2026-11-18-audit-menyeluruh.md`, ubah kalimat status agar menyebut ARC-F3 dan ARC-F11 selesai (hash v2 bersalt acak + migrasi login; contoh env server & frontend lengkap).

- [ ] **Step 3: Catat di plan security phase 2**

Tambahkan bagian "Sesi Lanjutan (ARC-F3 + ARC-F11 selesai)" berisi ringkasan perubahan dan urutan deploy pepper.

- [ ] **Step 4: Jalankan gate penuh**

```bash
npx tsc --noEmit
npm run test:unit
npm run test:gas
npm run test:env
node --test sianjab-db-server/server.test.js
node --test sianjab-db-server/resilience.test.js
npm run build
```

Expected: tsc 0 error; unit 23/23; gas 122/122 + 6/6 + 121/121; env 3/3; server semua pass; resilience 1/1; build sukses.

- [ ] **Step 5: Commit**

```bash
git add gas/CHECKLIST-DEPLOY.md docs/audit/2026-11-18-audit-menyeluruh.md docs/superpowers/plans/2026-11-18-security-phase2-authz.md
git commit -m "docs: catat ARC-F3/ARC-F11 selesai + urutan deploy pepper"
```
