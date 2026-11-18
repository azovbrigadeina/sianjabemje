# Security Tahap 1 2026-11-18 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup 6 temuan keamanan Tahap 1 dari audit menyeluruh 18 Nov 2026: SEC-K1 (token Homeserver tanpa verifikasi HMAC), SEC-K2 (`/db/*.json` terbuka), SEC-K3 (secret hardcoded), SEC-K4 (GAS menerima token palsu pada action publik), SEC-T5 (self-promote admin), SEC-T7 (password plaintext + rate-limit pakai IP klien).

**Architecture:** Semua perbaikan server-side (homeserver `sianjab-db-server/server.js` + GAS `gas/Code.gs`), plus pembersihan secret dari klien/konfigurasi. Tidak ada perubahan kontrak publik `src/lib/api.ts` kecuali menghapus fallback secret (nilai fallback, bukan bentuk API). Urutan: Task 1 (K3) → Task 2 (K1) → Task 3 (K2) → Task 4 (bind 127.0.0.1) → Task 5 (ketahanan bebaa) → Task 6 (K4) → Task 7 (T5) → Task 8 (T7). Setiap task independen dan di-commit sendiri.

**Tech Stack:** Node.js 20 (`node --test`), Google Apps Script (test via vm sandbox di `gas/tests/`), Next.js 16.2.9, Docker Compose.

**Spec:** `docs/audit/2026-11-18-audit-menyeluruh.md` (bagian 3, temuan SEC-K1..K4, SEC-T5, SEC-T7).

## Prasyarat (WAJIB sebelum Task 1)

- [ ] **Backup terverifikasi ada** (sudah dibuat 2026-11-18, cek ulang keberadaan file sebelum mulai):
  - `backups/source_snapshot_20261118_104434.tar.gz` (19M)
  - `backups/backup_20261118_104434.json` (snapshot live RTDB, 14M)
  - `backups/git_head_20261118_104434.txt` (HEAD `173e3cad57cc672f29555b69c1162a75274a2144`)
- [ ] **Backup data Homeserver di bebaa (WAJIB — tarball source TIDAK memuatnya)** — `sianjab-db-server/data/` di-exclude dari snapshot repo. Di bebaa jalankan:
  ```bash
  cd /path/ke/sianjab-db-server && tar -czf ~/backup_hs_data_$(date +%Y%m%d_%H%M%S).tar.gz data/
  ```
  Simpan juga salinan di mesin lain (falconxtra). Minimal `sianjab-db.json` + `outbox.json` + `server-state.json`.
- [ ] **Mitigasi darurat sebelum Task 3 (celah sedang terbuka di internet)** — `GET /db/.json` tanpa auth terbukti mengembalikan seluruh DB (termasuk hash password) lewat `https://bebaa-server-1.tail56d53d.ts.net:10000`. Lakukan salah satu SEKARANG:
  - `sudo tailscale funnel --bg --https=10000 off` di bebaa (paling cepat; aplikasi fallback ke RTDB), ATAU
  - blokir `GET /db/` di firewall/reverse proxy sementara.
  Rotasi `FIREBASE_SECRET` juga mendesak: secret itu ada di repo dan bisa dipakai menulis RTDB langsung.
- [ ] **Rotasi secret dilakukan user (BUKAN agent)** — SEC-K3 memodifikasi sistem yang memakai secret. Agent hanya menghapus secret dari kode; nilai baru di-set user di:
  - Firebase Console → Project Settings → Service Accounts → Database secrets (FIREBASE_SECRET baru)
  - Google Apps Script → Project Settings → Script Properties (`API_SECRET` baru)
  - File env homeserver (lihat Task 1)
  - **Peringatan:** rotasi `API_SECRET` membuat semua token sesi yang ada tidak valid — semua user harus login ulang. Koordinasikan waktunya.

## Konteks Deployment: `bebaa-server-1`

Homeserver berjalan di mesin **`bebaa-server-1`** (`https://bebaa-server-1.tail56d53d.ts.net:10000`), diekspos lewat **Tailscale Funnel → `http://127.0.0.1:3098`**. **Kondisi live terverifikasi saat audit (18 Nov):**
- Funnel aktif di port **`10000`** (BUKAN 8443 — port 8443 balas HTTP 502, config Funnel kemungkinan mengarah ke service lain/mati). Default URL klien saat ini juga `:10000` (lihat audit performa NF-01; plan performa Task 2 akan menyamakannya — samakan ke port yang benar-benar aktif, jangan asumsi 8443).
- **`GET /db/users.json` dan `GET /db/.json` tanpa kredensial DARI INTERNET sudah terbukti mengembalikan seluruh database** — termasuk hash password semua user. Ini bukan simulasi; celah SEC-K2 sedang terbuka sekarang juga di produksi. Prioritas Task 3 = darurat.
- Konsekuensi yang WAJIB diperhatikan di setiap task:

- Port `3098` **tidak boleh** bind ke `0.0.0.0`; Funnel hanya butuh `127.0.0.1:3098`. `docker-compose.yml` memakai `network_mode: host` — pastikan server listen di `127.0.0.1` (env `BIND_HOST`, default `127.0.0.1`), bukan semua interface.
- Perbaikan SEC-K2 **tidak boleh** mematikan Funnel: klien tetap harus bisa memanggil `/_homeserver/*` dan `/db/*` lewat Funnel dengan secret/token yang sah. Selama Funnel belum dipindah ke `:8443`, lakukan mitigasi darurat: matikan Funnel port `10000` SEKARANG (`sudo tailscale funnel --bg --https=10000 off` di bebaa) sampai Task 3 selesai — klien otomatis fallback ke RTDB lewat circuit breaker.
- `bebaa-server-1` adalah **single point of failure**. Skenario mati ditangani eksplisit di Task 5.
- Mesin lain (`falconxtra`) hanya untuk pengembangan; jangan hardcode hostname di kode — pakai `NEXT_PUBLIC_HOMESERVER_URL` / `localStorage`.

## Global Constraints

- Jangan pernah menghapus `invalidateAllCache()` / serial write queue (`AGENTS.md`).
- Deployment ID GAS tetap: `AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw`.
- Jangan ubah format token GAS 4 bagian (`username:timestamp:nonce:hmac`) — hanya Homeserver yang disamakan ke format itu.
- Lint (520 masalah) BUKAN regression gate; yang jadi gate: `npm run test:unit`, `npm run test:gas`, `node --test sianjab-db-server/server.test.js`, `npm run build`.
- Pesan commit Bahasa Indonesia bergaya conventional.
- `sianjab-db-server/` untracked di git — setelah Task 1, tambahkan ke git **tanpa secret** (pastikan `.gitignore` mencakup `sianjab-db-server/data/`, `sianjab-db-server/.env`).

## Review Focus

1. **Token tanpa HMAC harus ditolak** — `validateAuthToken(base64('admin:<now>:x:palsu'))` harus `null`. → Task 2.
2. **Token 3 bagian (legacy) harus ditolak** — parity dengan GAS. → Task 2.
3. **`/db/.json` tanpa kredensial harus 401/403**, GET maupun PUT. → Task 3.
4. **`getBulkData` dengan token palsu tidak boleh membaca `users`/`security_logs`** — `assertSensitiveReadPermission_(null, entity)` harus throw. → Task 6.
5. **Self-update `role: 'admin'` oleh operator harus ditolak**, di Homeserver dan GAS. → Task 7.
6. **Login dengan password yang tersimpan sebagai plaintext harus gagal** — hanya hash HMAC yang sah. → Task 8.
7. **`grep` semua secret lama harus kosong** di tracked files setelah Task 1. → verifikasi akhir.
8. **Server mati tidak boleh kehilangan data** — flush outbox saat SIGTERM; klien fallback RTDB via circuit breaker. → Task 5.

---

### Task 1: Hapus Kredensial Hardcoded (SEC-K3)

**Files:**
- Modify: `sianjab-db-server/server.js:36-43` (ganti fallback dengan fail-keras)
- Modify: `sianjab-db-server/docker-compose.yml:13-23` (hapus baris secret)
- Create: `sianjab-db-server/.env.example` (nama variabel tanpa nilai)
- Modify: `src/lib/api.ts:34` (hapus `|| 'sianjab-homeserver-2026'`), serta `:919`, `:938`, `:956` (fallback secret lain)
- Modify: `src/app/dashboard/backup-database/page.tsx:50` (hapus default secret state)
- Modify: `backup.sh:10` (hapus `FIREBASE_SECRET="..."` hardcoded; wajib dari env)
- Test: `sianjab-db-server/server.test.js`

**Interfaces:**
- Consumes: `process.env.HOMESERVER_SECRET`, `API_SECRET`, `FIREBASE_SECRET`, `SITPP_SECRET`.
- Produces: `requireEnv(name: string): string` (diekspor; lempar `Error('Missing required environment variable: ' + name)` bila kosong), `verifyAdminSecret(req, body): boolean` (diekspor untuk test) yang **tidak lagi** menerima `FIREBASE_SECRET`.

- [ ] **Step 1: Tulis test gagal** — di awal `server.test.js` set env dummy sebelum `require('./server.js')`:
  ```js
  process.env.HOMESERVER_SECRET = 'test-hs-secret';
  process.env.API_SECRET = 'test-api-secret';
  process.env.FIREBASE_SECRET = 'test-fb-secret';
  process.env.SITPP_SECRET = 'test-sitpp-secret';
  ```
  Test: (a) `requireEnv('__TIADA__')` throws `/Missing required environment variable/`; (b) `verifyAdminSecret({headers:{'x-homeserver-secret':'test-fb-secret'}},{})` === `false`; (c) ternyata `true` untuk `'test-hs-secret'`.

- [ ] **Step 2: Verifikasi test gagal** — `node --test sianjab-db-server/server.test.js` → FAIL (fungsi belum diekspor / fb secret masih diterima).

- [ ] **Step 3: Implementasi** — definisikan `requireEnv` di `server.js`, ganti 4 konstanta: `const HOMESERVER_SECRET = requireEnv('HOMESERVER_SECRET')` dst. Hapus `|| sec === FIREBASE_SECRET` di `verifyAdminSecret` (baris 2250). Hapus nilai default `value='sianjab-homeserver-2026'` di HTML monitor (sekitar `:2040`, `:2127-2153`). Ekspor `requireEnv` + `verifyAdminSecret`. Bersihkan `docker-compose.yml`, `backup.sh`, `api.ts`, `backup-database/page.tsx`; buat `.env.example` berisi nama variabel saja.

- [ ] **Step 4: Verifikasi test** — `node --test sianjab-db-server/server.test.js` → 8 test lama + 2 test baru PASS. `npm run test:unit` PASS.

- [ ] **Step 5: Grep bersih** — `git ls-files | xargs grep -l "f1xsHZlTBH\|sianjab-homeserver-2026\|jC0c5eC7s0\|sianjab-secret-key-2024"` → kosong.

- [ ] **Step 6: Commit** — `fix(security): hapus semua secret hardcoded, env wajib fail-keras (SEC-K3)`

---

### Task 2: Verifikasi HMAC Token di Homeserver (SEC-K1)

**Files:**
- Modify: `sianjab-db-server/server.js:658-694` (`validateAuthToken`), `:696-721` (`getAuthenticatedUser` — hapus bypass `username === 'admin'`)
- Test: `sianjab-db-server/server.test.js`

**Interfaces:**
- Consumes: `API_SECRET` (sudah env-only dari Task 1), format token GAS: `base64(username:timestamp:nonce:hmac_hex)`.
- Produces: `validateAuthToken(token): string|null` — sekarang WAJIB 4 bagian + HMAC cocok (`crypto.timingSafeEqual`) + cek `isActive` + cek nonce dicabut. `getAuthenticatedUser` tidak punya jalur tanpa record user.

- [ ] **Step 1: Tulis test gagal** — helper test buat token sah: `generateAuthToken('admin')` (sudah ada di server.js, ekspor bila perlu). Test:
  - token sah → `validateAuthToken` return `'admin'`;
  - token dengan HMAC salah → `null`;
  - token 3 bagian (tanpa HMAC) → `null`;
  - `getAuthenticatedUser` untuk user yang tidak ada di `db.users` → throw 401 (tidak ada lagi admin virtual).

- [ ] **Step 2: Verifikasi gagal** — token HMAC-salah saat ini dikembalikan sebagai valid → test FAIL.

- [ ] **Step 3: Implementasi** — di `validateAuthToken`: wajib `parts.length === 4`; hitung ulang `crypto.createHmac('sha256', API_SECRET).update(username+':'+timestamp+':'+nonce)`; bandingkan dengan `crypto.timingSafeEqual(Buffer.from(expected,'hex'), Buffer.from(signature,'hex'))` (bungkus try/catch length mismatch). Tolak token 3 bagian. Hapus `&& username !== 'admin'` di baris 689 dan blok `if (username === 'admin')` di `getAuthenticatedUser` (708-710).

- [ ] **Step 4: Verifikasi** — test homeserver PASS semua. Cek paritas manual: token buatan GAS (`computeHmacHex_` hex lowercase) harus lulus di Homeserver — bandingkan hasil hex keduanya (GAS `Code.gs:219-230` menghasilkan hex lowercase; pastikan Homeserver juga).

- [ ] **Step 5: Commit** — `fix(security): wajibkan verifikasi HMAC token di homeserver, hapus bypass admin (SEC-K1)`

**Catatan deploy:** setelah task ini, Homeserver dan GAS **harus** memakai `API_SECRET` yang sama (lihat prasyarat rotasi). Jika belum, semua request Homeserver dari klien gagal 401 — itu memang tujuan fail-closed.

---

### Task 3: Kunci Endpoint `/db/*.json` (SEC-K2)

**Files:**
- Modify: `sianjab-db-server/server.js:2358-2390` (routing `/db/`)
- Modify: `sianjab-db-server/server.js:2178-2183` (`setCorsHeaders` — hapus `*`)
- Modify: `sianjab-db-server/docker-compose.yml` (binding port bila ada konfigurasi host)
- Test: `sianjab-db-server/server.test.js`

**Interfaces:**
- Produces: route `/db/<path>.json` menerima: (a) `verifyAdminSecret(req, body)` OK, ATAU (b) token user valid via `getAuthenticatedUser`. Selain itu 401. `fbPath === ''` (root) ditolak untuk write (400); root GET hanya admin-secret. CORS origin dinamis: echo `Origin` hanya bila ada di allowlist env `CORS_ALLOWED_ORIGINS` (default: origin aplikasi produksi + `http://localhost:3000`), tanpa `credentials` cross-origin.

- [ ] **Step 1: Tulis test gagal** — test level `createAppServer` (pola http supertest ringan dengan `fetch` ke `server.listen(0)`):
  - `GET /db/.json` tanpa secret → 401;
  - `PUT /db/users/u1.json` dengan token operator (bukan admin) → 403;
  - `PUT /db/.json` dengan admin-secret → 400 (root write ditolak);
  - `GET /db/2026/unitKerja.json` dengan admin-secret → 200;
  - CORS header tanpa `Origin` allowlist tidak mengandung `*`.

- [ ] **Step 2: Verifikasi gagal** — semua test auth FAIL (endpoint saat ini terbuka).

- [ ] **Step 3: Implementasi** — di awal blok `/db/`: ambil token dari `params.token` / header `Authorization: Bearer` / body; bila `verifyAdminSecret` gagal dan token tidak valid → `sendJson(req, res, 401, { error: 'Unauthorized' })`. Tolak write ke `fbPath === ''`. Ganti `setCorsHeaders`: `const origin = req.headers.origin; if (origin && CORS_ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);` (tanpa `*`).

- [ ] **Step 4: Verifikasi** — test PASS; pastikan klien Next.js masih jalan: `npm run build` PASS, dan jalankan manual `mode HOMESERVER` dari UI login+read (klien mengirim token via query string — masih didukung oleh jalur (b)).

- [ ] **Step 5: Commit** — `fix(security): autentikasi wajib di endpoint /db, batasi CORS origin (SEC-K2)`

---

### Task 4: Bind `127.0.0.1` + Kesiapan Funnel (SEC-K2 lanjutan, khusus bebaa)

**Files:**
- Modify: `sianjab-db-server/server.js` (baris `http.createServer(...).listen(PORT, ...)` — sekitar `:2436-2443`; cari `.listen(` di akhir file)
- Modify: `sianjab-db-server/docker-compose.yml` (tambah env `BIND_HOST=127.0.0.1`)
- Test: `sianjab-db-server/server.test.js`

**Interfaces:**
- Consumes: `process.env.BIND_HOST` (default `'127.0.0.1'`). Funnel `setup-funnel.sh` sudah mengarah ke `http://127.0.0.1:${LOCAL_PORT}` — tidak berubah.
- Produces: server listen di `BIND_HOST`. Log startup mencantumkan host yang di-listen.

- [ ] **Step 1: Test gagal** — jalankan server di test dengan `BIND_HOST=127.0.0.1`, assert `server.address().address === '127.0.0.1'`.

- [ ] **Step 2: Implementasi** — `.listen(PORT, process.env.BIND_HOST || '127.0.0.1', cb)`.

- [ ] **Step 3: Verifikasi di bebaa (user)** — setelah deploy: `ss -tlnp | grep 3098` harus menampilkan `127.0.0.1:3098` BUKAN `0.0.0.0:3098`; lalu dari luar: `curl https://bebaa-server-1.tail56d53d.ts.net:10000/_homeserver/ping` tetap `{"status":"ok",...}` (port Funnel aktif saat ini `10000`, bukan 8443 — lihat Konteks Deployment), dan Funnel status tetap aktif.

- [ ] **Step 4: Commit** — `fix(security): bind homeserver ke 127.0.0.1, akses publik hanya via tailscale funnel (SEC-K2)`

---

### Task 5: Ketahanan Saat `bebaa-server-1` Mati (Skenario Downtime)

**Goal:** Saat bebaa mati/restart, aplikasi TIDAK boleh kehilangan data dan TIDAK boleh macet — klien harus otomatis lanjut ke RTDB.

**Analisis kondisi sekarang (sudah diverifikasi di kode):**
- Klien sudah punya circuit breaker (`src/lib/api.ts:24,62,524`): homeserver gagal → bypass 20 detik → fallback RTDB. ✅ (dasar sudah ada)
- Data lokal persisten: `saveDbNow()` atomic write saat tiap write (server.js:2382) + outbox `/data/outbox.json` (load di `:415-458`). Perubahan belum flush ke RTDB **tidak hilang** selama disk `/data` volume utuh. ✅
- **Yang belum ada:** (1) flush outbox saat SIGTERM (Docker stop + restart-policy → perubahan 0–3 menit terakhir hanya ada di disk lokal, bukan RTDB — aman dari Restart, berisiko bila disk bebaa hilang); (2) dorongan tulisan tertahan: saat bebaa down lama dan user menulis via RTDB fallback, begitu bebaa hidup lagi ia melayani data RAM lama — **stale sampai pull manual**.

**Files:**
- Modify: `sianjab-db-server/server.js` (SIGTERM/SIGINT handler sebelum `.listen()`; on-startup conditional pull)
- Modify: `sianjab-db-server/Dockerfile` (pastikan `STOPSIGNAL SIGTERM` — default sudah)
- Test: `sianjab-db-server/server.test.js`

**Interfaces:**
- Produces: (1) pada SIGTERM/SIGINT: `await flushOutboxToRtdb()` lalu `process.exit(0)`, timeout keras 10 detik (jangan gantung shutdown Docker); (2) saat startup: bila `dirtyPaths.size === 0` DAN outbox kosong DAN env `AUTO_PULL_ON_START !== 'false'` → `pullAllFromRtdb()`; bila outbox berisi → LOG PERINGATAN jelas `[SIANJAB-DB] Outbox belum flush (N), skip auto-pull agar tulisan lokal tidak tertimpa` (jangan pernah pull dan buang outbox — patuh BE-T2).

- [ ] **Step 1: Tulis test gagal** — test SIGTERM sulit di unit test sederhana; test bagian yang bisa: logika keputusan on-startup diekstrak jadi fungsi murni `shouldPullOnStart({dirtyCount, outboxCount, autoPullEnv})` → true hanya bila `dirtyCount===0 && outboxCount===0 && autoPullEnv!=='false'`. Test assertion itu.

- [ ] **Step 2: Implementasi** — refactor `shouldPullOnStart` keluar dari `loadFromDisk()`/startup; tambah handler:
  ```js
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SIANJAB-DB] ${signal} diterima, flush outbox sebelum keluar...`);
    const t = setTimeout(() => { console.error('[SIANJAB-DB] Flush timeout, keluar paksa'); process.exit(1); }, 10000);
    try { saveDbNow(); if (dirtyPaths.size > 0) await flushOutboxToRtdb(); }
    catch (e) { console.error('[SIANJAB-DB] Gagal flush saat shutdown:', e.message); }
    clearTimeout(t);
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  ```

- [ ] **Step 3: Verifikasi** — test unit PASS; test manual user di bebaa: (a) tulis 1 record → `docker restart sianjab-db-server` → record masih ada DAN muncul di RTDB (flush shutdown sukses); (b) `docker stop` saat RTDB tidak terjangkau → container tetap exit ≤ 10 detik.

- [ ] **Step 4: Ambil backup bebaa juga** — tambahkan langkah opsional di README: cron di bebaa `rsync sianjab-db-server/data/` ke lokasi kedua (falconxtra), minimal harian. Cukup dokumentasi, bukan kode.

- [ ] **Step 5: Commit** — `fix(resilience): flush outbox saat shutdown + auto-pull aman saat startup (downtime bebaa)`

**Skenario downtime yang dijamin setelah task ini:**
| Kondisi | Yang terjadi |
|---|---|
| bebaa restart cepat (< menit) | Disk utuh → data kembali; outbox ter-flush saat SIGTERM; user nyaris tak merasakan (circuit breaker 20s → fallback RTDB baca+tulis) |
| bebaa mati lama | Klien fallback ke RTDB (baca+tulis jalan normal); saat bebaa hidup lagi, outbox flush shutdown → bebaa sinkron; bila ada tulisan RTDB selama downtime, admin klik "Tarik Data RTDB" (pull) — dengan guard outbox kosong |
| Disk bebaa hilang | Restore: seed dari RTDB (`/_homeserver/pull-from-rtdb` + upload `backups/backup_*.json`) — data maksimal basi 3 menit + backup harian |

---

### Task 6: GAS — Token Publik Harus Tervalidasi (SEC-K4)

**Files:**
- Modify: `gas/Code.gs:442-497` (`handleRequest_` blok auth)
- Modify: `gas/Code.gs:373-397` (`getUserFromToken_` — verifikasi HMAC, bukan cuma decode username)
- Test: `gas/tests/` (extend `simulate-ai-pintar.js` harness vm sandbox, atau file baru `gas/tests/simulate-auth.js` memakai pola sama)

**Interfaces:**
- Produces: `getUserFromToken_(token): {id,username,role,unitKerjaId}|null` — SEKARANG memanggil `validateToken_` lebih dulu; token gagal validasi → `null`. Di `handleRequest_`: action publik tetap lolos tanpa token, TAPI `currentUser` hanya diisi dari token yang lolos `validateToken_`.

- [ ] **Step 1: Tulis test gagal** — di sandbox vm (pola `gas/tests/simulate-ai-pintar.js:60-72`): buat token palsu `Utilities.base64Encode('admin:0:x:y')` (hex salah), panggil `getUserFromToken_` → harus `null` (saat ini mengembalikan object admin). Panggil `handleRequest_` dengan `action=getBulkData&entities=users` + token palsu → respons harus berisi `Akses ditolak: Data users hanya dapat dilihat oleh Administrator` (karena `currentUser = null` → `assertSensitiveReadPermission_` throw).

- [ ] **Step 2: Verifikasi gagal** — token palsu saat ini diterima sebagai admin → FAIL.

- [ ] **Step 3: Implementasi** — `getUserFromToken_`: baris pertama `if (!validateToken_(token)) return null;` lalu logic lama. Di `handleRequest_` aman otomatis karena `currentUser` berasal dari `getUserFromToken_`.

- [ ] **Step 4: Verifikasi** — `npm run test:gas` PASS (118 lama + baru). Pastikan `ping`, `login`, `checkVerificationCode` tanpa token tetap jalan, dan `getDashboardStats`/`getBulkData` dengan token sah user biasa tetap mengembalikan data non-sensitif seperti sebelumnya (jangan pecahkan alur dashboard operator).

- [ ] **Step 5: Commit** — `fix(security): getUserFromToken_ wajib validasi HMAC, blokir baca sensitif via token palsu (SEC-K4)`

---

### Task 7: Blokir Self-Promote Role (SEC-T5)

**Files:**
- Modify: `sianjab-db-server/server.js:1710-1719` (`updateUser`)
- Modify: `gas/Code.gs:564-566` (panggil `updateUser_(currentUser, id, data)` — case `'updateUser'` di `handleRequest_`)
- Modify: `gas/Code.gs:2136-2154` (`updateUser_`)
- Test: `sianjab-db-server/server.test.js` + test vm GAS

**Interfaces:**
- Produces: konstanta `SELF_UPDATE_ALLOWED_FIELDS = ['nama', 'email', 'password']` (paritas kedua backend). Self-update (non-admin, `id === currentUser.id`) hanya boleh mengubah field tersebut; field lain (`role`, `unitKerjaId`, `isActive`, `username`) dibuang dari payload. Admin bebas.

- [ ] **Step 1: Tulis test gagal** — Homeserver: `updateUser` oleh operator dengan `{role:'admin'}` → hasil tetap `role: 'operator'` (atau 403; pilih: field dibuang diam-diam + log, respons sukses tanpa role berubah). GAS vm test: `updateUser_(ownId, {role:'admin'})` → `fbPatch_` yang tertangkap stub TIDAK mengandung `role`.

- [ ] **Step 2: Verifikasi gagal** — role berubah → FAIL.

- [ ] **Step 3: Implementasi** — kedua backend: sebelum merge, `if (currentUser.role !== 'admin' && currentUser.id === id) { for (const k of Object.keys(uData)) if (!SELF_UPDATE_ALLOWED_FIELDS.includes(k)) delete uData[k]; }`. Di GAS terapkan pada `data` sebelum `fbPatch_`; ubah signature `updateUser_(id, data)` → `updateUser_(currentUser, id, data)` dan pemanggilnya di `Code.gs:565` (`result = updateUser_(currentUser, id, data)`).

- [ ] **Step 4: Verifikasi** — test PASS di kedua backend; `npm run test:gas` PASS.

- [ ] **Step 5: Commit** — `fix(security): larang self-update role/unitKerja/isActive oleh non-admin (SEC-T5)`

---

### Task 8: Hapus Password Plaintext & Perbaiki Rate-Limit Login (SEC-T7)

**Files:**
- Modify: `sianjab-db-server/server.js:1209-1254` (login — hapus jalur plaintext `storedPass === password` di `:1240`)
- Modify: `sianjab-db-server/server.js` (tambah rate-limit login per `username` + `clientIp` dari `req.socket.remoteAddress` bukan body)
- Modify: `gas/Code.gs:1970-1988` (`loginUser_` — rate key pakai `attemptedUser` + IP hasil derive server, bukan `data.ip` dari klien)
- Modify: `src/app/login/page.tsx:61` (hapus pengiriman `ip` dari api.ipify.org — backend yang menentukan)
- Test: `sianjab-db-server/server.test.js` + test vm GAS

**Interfaces:**
- Produces: HomeServer login: `verifyPassword(stored, password, username)` — benar HANYA bila `stored === hashPasswordHmac(password, username)`; record lama berformat plaintext / sha256-salt **ditolak** (user reset password via admin). Rate limit: peta in-memory `{key: {count, firstAt}}`, key = `sha256(lower(username)) + '|' + clientIp`, maks 5 gagal / 15 menit, respons 429.

- [ ] **Step 1: Tulis test gagal** — (a) user dengan `password: 'plain123'` di DB + login `'plain123'` → gagal (401), bukan sukses; (b) user dengan `password: hashPasswordHmac('rahasia','budi')` + login benar → sukses; (c) 6 login gagal berturut (IP sama, username sama) → percobaan ke-6 return 429; (d) mengubah field `ip` di body TIDAK mengubah counter (kunci dari socket).

- [ ] **Step 2: Verifikasi gagal** — (a) sukses saat ini (plaintext diterima), (d) counter bisa di-bypass → FAIL.

- [ ] **Step 3: Implementasi** — kecualikan `storedPass === password`; bila stored bukan hex 64 char HMAC, tolak dengan pesan generik `Username atau password salah` (jangan bedakan akun vs password — juga tutup SEC-R3). Abaikan `data.ip`; kunci rate-limit GAS: karena GAS tanpa socket, pakai kompromi: key = username saja + catat `data.ip` hanya untuk log. Kasus Homeserver memakai `req.socket.remoteAddress` penuh.

- [ ] **Step 4: Verifikasi** — test PASS. `npm run test:gas` PASS (test login lama di sandbox masih jalan — cek apakah ada test yang bergantung pada plaintext compare).

- [ ] **Step 5: Commit** — `fix(security): tolak password plaintext, rate-limit login per username+ip socket (SEC-T7)`

---

## Verifikasi Akhir (setelah semua task)

1. `node --test sianjab-db-server/server.test.js` — semua PASS.
2. `npm run test:unit && npm run test:gas && npm run build` — PASS.
3. `git ls-files | xargs grep -l "f1xsHZlTBH\|sianjab-homeserver-2026\|jC0c5eC7s0\|sianjab-secret-key-2024"` — kosong. Juga cek `out/` (build lama) di-regenerate.
4. `grep -rn "username === 'admin'\|username !== 'admin'" sianjab-db-server/server.js` — kosong (bypass admin hilang).
5. Di bebaa: `ss -tlnp | grep 3098` → `127.0.0.1:3098` saja.
6. Uji manual (user, dengan env baru terpasang):
   - `curl https://bebaa-server-1.tail56d53d.ts.net:10000/db/.json` tanpa secret → 401.
   - `curl -X PUT .../db/2026/unitKerja.json` dengan token operator → 403.
   - Login operator, coba `updateUser` role jadi admin → role tetap.
   - `getBulkData?entities=users` tanpa token / token palsu → ditolak.
   - Login operator OPD A tidak melihat data OPD B (regresi).
   - `docker restart sianjab-db-server` setelah 1 tulisan → data tetap ada dan muncul di RTDB (uji Task 5).
7. Deploy GAS: `npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw` — **setelah** env `API_SECRET` baru tersinkron antara GAS Script Properties dan homeserver `.env`.
8. Komunikasikan ke user: semua sesi aktif logout otomatis setelah rotasi `API_SECRET`.

## Rollback

- Sumber kode: `git` (commit per task, revert mudah) + tarball `backups/source_snapshot_20261118_104434.tar.gz`.
- Database: restore dari `backups/backup_20261118_104434.json` (RTDB) atau tarball `~/backup_hs_data_*.tar.gz` dari bebaa (homeserver) bila ada penulisan yang salah.
