# Audit Performa 2026-11-18 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup 7 temuan baru dari audit 18 Nov 2026 (1 kritis, 3 tinggi, 3 sedang; temuan ke-8/NF-06 adalah ide alur dan ditangani terpisah) tanpa mengubah kontrak API publik `src/lib/api.ts`.

**Architecture:** Perbaikan dibagi menjadi 5 task independen yang masing-masing menghasilkan perubahan yang bisa di-commit dan diuji sendiri. Task 1–2 menyasar backend/konfigurasi (secret & URL homeserver), Task 3–5 menyasar klien (scoped query, cache, circuit breaker). Helper murni diekstrak ke berkas `src/lib/*.ts` kecil agar bisa diuji dengan `node --test` (pola yang sudah dipakai `utils.wke.test.ts`).

**Tech Stack:** Next.js 16.2.9 (Turbopack), TypeScript, Node.js 20 (`node --test`), Google Apps Script, Docker Compose, Tailscale Funnel.

**Spec:** `docs/audit/2026-11-18-audit-performa-dan-alur-perbaikan.md`

## Global Constraints

- Jangan pernah menghapus `invalidateAllCache()` / `invalidateTargetedCache()` pada operasi write (`AGENTS.md` Kaidah Kestabilan Data #1).
- Operasi write di `api.ts` wajib tetap serial; read tetap paralel (`AGENTS.md` #2).
- Jangan menambahkan logika write ke endpoint `getBulkData` (`AGENTS.md` Backend #3).
- Deploy GAS wajib memakai `npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw`.
- Jangan mengubah header cache di `firebase.json` atau idle timeout 30 menit di `UserContext.tsx`.
- Semua kredensial wajib berasal dari environment variable. **Dilarang** menyimpan nilai fallback secret di source code, `docker-compose.yml`, `localStorage`, atau bundle klien.
- Konvensi commit pesan Bahasa Indonesia bergaya conventional (contoh: `fix(security): hapus fallback secret hardcoded`).

## Review Focus

1. **Secret masih bisa dipakai tanpa env** — setelah Task 1, menjalankan server tanpa `HOMESERVER_SECRET` harus gagal keras, bukan memakai `'sianjab-homeserver-2026'`. → dites di Task 1 lewat `requireEnv('__MISSING__')` yang melempar error.
2. **Firebase secret masih membuka kontrol admin** — `verifyAdminSecret_({headers:{'x-homeserver-secret': FIREBASE_SECRET}}, {})` harus `false`. → dites eksplisit di Task 1.
3. **Mode HOMESERVER aktif tapi URL port salah** — konfigurasi default harus `:8443`, dan `switchMode('HOMESERVER')` harus menolak host yang tidak sehat. → dites di Task 2.
4. **Data scoped operator tertukar dengan cache admin** — cache entitas hasil `getBulkData(..., unitId)` tidak boleh dibaca oleh `getCachedBulkData()` tanpa `unitId`. → dites di Task 3.
5. **Error bisnis memicu fallback ganda (write terkirim ke 2 backend)** — pesan error yang mengandung kata "Failed to fetch" tetapi berasal dari validasi harus tetap diklasifikasikan `business`. → dites di Task 5.

---

### Task 1: Hardening Kredensial & Akses Admin Homeserver

**Files:**
- Modify: `sianjab-db-server/server.js:36-43` (pembacaan env), `:2250` (`verifyAdminSecret_`), `:2040` & `:2127-2153` (monitor), `:2457-2466` (exports)
- Modify: `sianjab-db-server/docker-compose.yml:12-21`
- Create: `sianjab-db-server/.env.example`
- Modify: `src/lib/api.ts:34, 919, 938, 956` (hapus fallback secret)
- Modify: `src/app/dashboard/backup-database/page.tsx:50` (default state)
- Test: `sianjab-db-server/server.test.js`

**Interfaces:**
- Consumes: `process.env.HOMESERVER_SECRET`, `API_SECRET`, `FIREBASE_SECRET`, `SITPP_SECRET` (di-set oleh test sebelum `require`).
- Produces: `verifyAdminSecret(req, body): boolean` diekspor dari `server.js` untuk keperluan test; helper internal `requireEnv(name): string` yang melempar `Error(\`Missing required environment variable: ${name}\`)`.

- [ ] **Step 1: Tulis test gagal untuk env wajib & penolakan Firebase secret**

Tambahkan di bagian atas `server.test.js` (sebelum `require('./server.js')`):
```js
process.env.HOMESERVER_SECRET = 'test-hs-secret';
process.env.API_SECRET = 'test-api-secret';
process.env.FIREBASE_SECRET = 'test-fb-secret';
process.env.SITPP_SECRET = 'test-sitpp-secret';
```
Tambahkan test (dalam `test(...)` utama):
```js
await t.test('verifyAdminSecret menolak FIREBASE_SECRET dan menerima HOMESERVER_SECRET', () => {
  const { verifyAdminSecret } = require('./server.js');
  const mk = (secret) => ({ headers: { 'x-homeserver-secret': secret }, url: '/_homeserver/status' });
  assert.equal(verifyAdminSecret(mk('test-fb-secret'), {}), false);
  assert.equal(verifyAdminSecret(mk('wrong'), {}), false);
  assert.equal(verifyAdminSecret(mk('test-hs-secret'), {}), true);
});

await t.test('requireEnv gagal keras bila variabel tidak diset', () => {
  const { requireEnv } = require('./server.js');
  assert.throws(() => requireEnv('__TIADA_VARIABEL_INI__'), /Missing required environment variable/);
});
```

- [ ] **Step 2: Verifikasi test gagal**

Run: `node --test sianjab-db-server/server.test.js`
Expected: FAIL — `verifyAdminSecret is not a function` dan `requireEnv is not a function` (belum diekspor), serta `test-fb-secret` masih diterima.

- [ ] **Step 3: Implementasi `requireEnv` & ekspor `verifyAdminSecret`**

Di `server.js`, ganti 4 baris konstanta dengan `const HOMESERVER_SECRET = requireEnv('HOMESERVER_SECRET')` dst. Definisikan `requireEnv(name)` di atasnya: baca `process.env[name]`, bila kosong lempar `Error`. Hapus `|| sec === FIREBASE_SECRET` pada baris 2250. Tambahkan `verifyAdminSecret` dan `requireEnv` ke `module.exports`.

- [ ] **Step 4: Hilangkan secret default dari klien & monitor**

- `api.ts`: `const secret = localStorage.getItem(HS_SECRET_KEY) || '';` dan tiga baris `const secret = customSecret || cfg.secret || '';` (919, 938, 956).
- `backup-database/page.tsx:50`: `useState('')`.
- `server.js:2040`: hapus atribut `value="sianjab-homeserver-2026"`, ubah `placeholder` menjadi `"Homeserver Secret (dari environment variable)"`. Fungsi `triggerAction`/`switchMode` tetap membaca input, sehingga admin memasukkan secret secara manual.

- [ ] **Step 5: Environmentalisasi Docker Compose**

Di `docker-compose.yml`, ganti nilai literal pada baris 13, 15, 18, 21 dengan `${HOMESERVER_SECRET:?HOMESERVER_SECRET wajib di-set}`, `${API_SECRET:?...}`, `${FIREBASE_SECRET:?...}`, `${SITPP_SECRET:?...}`. Buat `.env.example` berisi daftar keempat variabel dengan nilai placeholder (bukan secret asli). Pastikan `.env` tetap ter-abaikan oleh `.gitignore` (sudah ada pola `.env*`).

- [ ] **Step 6: Verifikasi test lulus & tidak ada fallback tersisa**

Run: `node --test sianjab-db-server/server.test.js && grep -rn "sianjab-homeserver-2026\|sianjab-secret-key-2024\|f1xsHZlTBH\|jC0c5eC7s0" --include='*.js' --include='*.ts' --include='*.tsx' --include='*.yml' src sianjab-db-server`
Expected: test lulus; `grep` **tidak mengembalikan hasil** (semua nilai hardcoded hilang).

- [ ] **Step 7: Commit**

```bash
git add sianjab-db-server/server.js sianjab-db-server/server.test.js sianjab-db-server/docker-compose.yml sianjab-db-server/.env.example src/lib/api.ts src/app/dashboard/backup-database/page.tsx
git commit -m "fix(security): hapus credential hardcoded dan batasi akses admin homeserver"
```

---

### Task 2: Perbaiki URL Default & Health Gate Homeserver

**Files:**
- Create: `src/lib/homeserverConfig.ts`
- Create: `src/lib/homeserverConfig.test.ts`
- Modify: `src/lib/api.ts:10, 953-984`

**Interfaces:**
- Consumes: `process.env.NEXT_PUBLIC_HOMESERVER_URL`.
- Produces:
  - `DEFAULT_HOMESERVER_URL: string` — konstanta dengan port `8443`.
  - `checkHomeserverHealth(url: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean; mode?: string; reason?: string }>`.

- [ ] **Step 1: Tulis test gagal**

Buat `src/lib/homeserverConfig.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOMESERVER_URL, checkHomeserverHealth } from './homeserverConfig';

test('default Homeserver memakai HTTPS port 8443', () => {
  assert.match(DEFAULT_HOMESERVER_URL, /^https:\/\/.*:8443$/);
});

test('checkHomeserverHealth menolak host yang tidak merespons', async () => {
  const deadFetch = async () => { throw new TypeError('Failed to fetch'); };
  const r = await checkHomeserverHealth('https://dead.invalid:8443', deadFetch as any);
  assert.equal(r.ok, false);
  assert.match(r.reason!, /Failed to fetch/);
});

test('checkHomeserverHealth menerima status ok', async () => {
  const okFetch = async () => new Response(JSON.stringify({ status: 'ok', mode: 'HOMESERVER' }), { status: 200 });
  const r = await checkHomeserverHealth('https://ok.invalid:8443', okFetch as any);
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'HOMESERVER');
});
```

- [ ] **Step 2: Verifikasi test gagal**

Run: `node --no-warnings --test src/lib/homeserverConfig.test.ts`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Implementasi modul**

Buat `src/lib/homeserverConfig.ts` dengan `DEFAULT_HOMESERVER_URL = process.env.NEXT_PUBLIC_HOMESERVER_URL || 'https://bebaa-server-1.tail56d53d.ts.net:8443'`. Implementasikan `checkHomeserverHealth`: fetch `${url.replace(/\/+$/,'')}/_homeserver/status`, tangkap error menjadi `{ok:false, reason: error.message}`, validasi `res.ok` dan `json.status === 'ok'`, kembalikan `{ok:true, mode: json.mode}`.

- [ ] **Step 4: Verifikasi test lulus**

Run: `node --no-warnings --test src/lib/homeserverConfig.test.ts`
Expected: PASS 3/3.

- [ ] **Step 5: Pasang health gate di `switchMode`**

Di `api.ts`, hapus definisi `DEFAULT_HOMESERVER_URL` baris 10 dan impor dari `@/lib/homeserverConfig`. Di `api.homeserver.switchMode`, **sebelum** POST ke `/_homeserver/mode`, bila `nextMode === 'HOMESERVER'` panggil `checkHomeserverHealth(baseUrl)`; bila `ok === false`, lempar `Error(\`Homeserver tidak sehat, switch dibatalkan: ${reason}\`)` sebelum menulis konfigurasi lokal.

- [ ] **Step 6: Verifikasi build**

Run: `npm run build`
Expected: sukses, 29/29 rute.

- [ ] **Step 7: Commit**

```bash
git add src/lib/homeserverConfig.ts src/lib/homeserverConfig.test.ts src/lib/api.ts
git commit -m "fix(homeserver): perbaiki port default dan tambah health gate switch mode"
```

---

### Task 3: Scoped Query Operator & Isolasi Cache

**Files:**
- Create: `src/lib/cacheKeys.ts`
- Create: `src/lib/cacheKeys.test.ts`
- Modify: `src/lib/api.ts:411-414, 635-642, 653-663`
- Modify: 9 pemanggilan di `src/app/operator/{page,analisis,beban-kerja,laporan,organisasi,peta-jabatan}/page.tsx`

**Interfaces:**
- Consumes: `user.unitKerjaId` dari `useUser()` (`SessionUser.unitKerjaId?: string`).
- Produces: `getBulkEntityCacheKey(entity: string, activeYear: string, unitKerjaId?: string): string` — format `entity_${year}_${entity}${unitKerjaId ? '_u_' + unitKerjaId : ''}`.

- [ ] **Step 1: Tulis test gagal**

Buat `src/lib/cacheKeys.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBulkEntityCacheKey } from './cacheKeys';

test('cache key scoped diawali prefix unscoped agar invalidateTargetedCache tetap bekerja', () => {
  const plain = getBulkEntityCacheKey('abk', '2026');
  const scoped = getBulkEntityCacheKey('abk', '2026', 'unit_dinkes');
  assert.equal(plain, 'entity_2026_abk');
  assert.equal(scoped, 'entity_2026_abk_u_unit_dinkes');
  assert.ok(scoped.startsWith(plain));
});
```

- [ ] **Step 2: Verifikasi test gagal**

Run: `node --no-warnings --test src/lib/cacheKeys.test.ts`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Implementasi helper & integrasi di `api.ts`**

Buat `src/lib/cacheKeys.ts` berisi fungsi tersebut. Di `api.ts`:
- Impor helper.
- Baris 413: ganti key dengan `getBulkEntityCacheKey(entName, activeYear, context?.opts?.params?.unitKerjaId)`.
- `getCachedBulkData(entities: string[], unitKerjaId?: string)`: gunakan helper pada baris 658; ubah loop menjadi `Promise.all` (lihat Task 4 bila digabung).
- `getBulkData(entities, signal?, unitKerjaId?)`: sudah benar — tidak diubah.

- [ ] **Step 4: Teruskan `unitKerjaId` di semua halaman operator**

Pada setiap pemanggilan `api.getBulkData([...])` di `src/app/operator/*`, tambahkan argumen ketiga `user.unitKerjaId`. Pastikan `useUser()` sudah diimpor dan dipanggil di komponen tersebut (beberapa halaman sudah memakai `user`, mis. `beban-kerja/page.tsx:212`). Daftar 9 lokasi persis ada di bagian NF-02 pada spec audit → gunakan `grep -rn "api.getBulkData(" src/app/operator` sebagai checklist. Jangan ubah halaman `dashboard/*` (admin tetap mengambil data penuh).

- [ ] **Step 5: Verifikasi**

Run: `node --no-warnings --test src/lib/cacheKeys.test.ts && grep -rn "api.getBulkData(" src/app/operator && grep -rn "getCachedBulkData(" src/app/operator`
Expected: test lulus; setiap `getBulkData` di operator memiliki argumen ke-3; setiap `getCachedBulkData` di operator memiliki argumen ke-2.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cacheKeys.ts src/lib/cacheKeys.test.ts src/lib/api.ts src/app/operator
git commit -m "perf(operator): scope data per OPD dan isolasi cache entitas"
```

---

### Task 4: Hydration Paralel & Dukungan ETag Klien

**Files:**
- Create: `src/lib/httpCache.ts`
- Create: `src/lib/httpCache.test.ts`
- Modify: `src/lib/api.ts:80-83, 264-305, 368-419, 653-663`

**Interfaces:**
- Consumes: `CacheEntry` (diperluas dengan `etag?: string`).
- Produces:
  - `isNotModified(status: number): boolean`
  - `buildConditionalHeaders(etag?: string): Record<string, string>`
  - Internal `getCacheEntry(key: string): Promise<CacheEntry | null>` di `api.ts` (dipakai Task 4 Step 5).

- [ ] **Step 1: Tulis test gagal**

Buat `src/lib/httpCache.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isNotModified, buildConditionalHeaders } from './httpCache';

test('304 diklasifikasikan not modified', () => {
  assert.equal(isNotModified(304), true);
  assert.equal(isNotModified(200), false);
  assert.equal(isNotModified(500), false);
});

test('header kondisional hanya dibuat saat ETag tersedia', () => {
  assert.deepEqual(buildConditionalHeaders(), {});
  assert.deepEqual(buildConditionalHeaders('W/"abc"'), { 'If-None-Match': 'W/"abc"' });
});
```

- [ ] **Step 2: Verifikasi test gagal**

Run: `node --no-warnings --test src/lib/httpCache.test.ts`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Implementasi `httpCache.ts` & test lulus**

Buat modul dengan dua fungsi di atas. Run ulang test → PASS 2/2.

- [ ] **Step 4: Hydration paralel**

Di `api.ts`, ubah `getCachedBulkData` menjadi:
```ts
const entries = await Promise.all(
  entities.map(ent => getFromCache<any[]>(getBulkEntityCacheKey(ent, activeYear, unitKerjaId)))
);
if (entries.some(e => e === null)) return null;
const result: Record<string, any[]> = {};
entities.forEach((ent, i) => { result[ent] = entries[i]!; });
return result as T;
```
(impor `getBulkEntityCacheKey` dari Task 3.)

- [ ] **Step 5: ETag sisi klien**

Perluas `CacheEntry` dengan `etag?: string`. Ubah `setCache(key, data, etag?)` menyimpan `etag`. Tambahkan `getCacheEntry(key): Promise<CacheEntry | null>` yang mengembalikan entri penuh (memory atau IndexedDB). Di `executeActualRequest`, sebelum loop `fetch`: untuk GET yang cacheable, ambil `getCacheEntry(url)` dan gabungkan `buildConditionalHeaders(entry?.etag)` ke `fetchOpts.headers`. Di dalam loop, **sebelum** `await res.json()`, tangani `if (isNotModified(res.status))`: perpanjang expiry entri cache lama dan `return entry.data as T`. Setelah `json.success`, simpan `setCache(url, json.data, res.headers.get('etag') || undefined)`.

- [ ] **Step 6: Verifikasi**

Run: `node --no-warnings --test src/lib/httpCache.test.ts src/lib/cacheKeys.test.ts && npm run build`
Expected: test lulus; build sukses.

- [ ] **Step 7: Commit**

```bash
git add src/lib/httpCache.ts src/lib/httpCache.test.ts src/lib/api.ts
git commit -m "perf(cache): paralelkan hydration dan dukung ETag 304 di klien"
```

---

### Task 5: Klasifikasi Error & Circuit Breaker Tangguh

**Files:**
- Create: `src/lib/routerError.ts`
- Create: `src/lib/routerError.test.ts`
- Modify: `src/lib/api.ts:23-25, 38-52, 507-528`

**Interfaces:**
- Consumes: `unknown` error dari `executeActualRequest`.
- Produces:
  - `classifyRouterError(error: unknown): 'network' | 'business'`
  - `getCircuitBackoffMs(failures: number): number`
  - Konstanta storage: `sianjab_hs_circuit_until`, `sianjab_hs_circuit_failures`.

- [ ] **Step 1: Tulis test gagal**

Buat `src/lib/routerError.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRouterError, getCircuitBackoffMs } from './routerError';

test('TypeError dari fetch = network', () => {
  assert.equal(classifyRouterError(new TypeError('Failed to fetch')), 'network');
});

test('error bisnis dengan kata network tetap business', () => {
  assert.equal(classifyRouterError(new Error('Validasi gagal: Failed to fetch tidak berlaku')), 'business');
});

test('error dengan status HTTP 5xx = network', () => {
  assert.equal(classifyRouterError({ status: 503, message: 'Service Unavailable' }), 'network');
});

test('backoff kelipatan 20 detik dan dibatasi 5 menit', () => {
  assert.equal(getCircuitBackoffMs(1), 20000);
  assert.equal(getCircuitBackoffMs(2), 40000);
  assert.equal(getCircuitBackoffMs(99), 300000);
});
```

- [ ] **Step 2: Verifikasi test gagal**

Run: `node --no-warnings --test src/lib/routerError.test.ts`
Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Implementasi `routerError.ts`**

`classifyRouterError`: `network` bila `error instanceof TypeError`, atau `error.status` berada di rentang 500–599, atau `error.name === 'AbortError'`; selain itu `business`. `getCircuitBackoffMs(failures)`: `Math.min(20000 * failures, 300000)`.

- [ ] **Step 4: Verifikasi test lulus**

Run: `node --no-warnings --test src/lib/routerError.test.ts`
Expected: PASS 4/4.

- [ ] **Step 5: Integrasi di `api.ts`**

Ganti blok `isNetworkFailure` (baris 513-524) dengan `classifyRouterError(hsErr)`. Saat network failure: increment counter kegagalan di `sessionStorage`, simpan `homeserverCircuitOpenUntil = Date.now() + getCircuitBackoffMs(failures)`, lalu fallback ke GAS. Saat request Homeserver berhasil: reset counter & `homeserverCircuitOpenUntil = 0`. Hydrate kedua nilai dari `sessionStorage` saat modul dimuat (di dalam `typeof window !== 'undefined'`). `setLocalHomeserverConfig` tetap mereset circuit seperti sebelumnya.

- [ ] **Step 6: Verifikasi penuh**

Run: `node --no-warnings --test src/lib/routerError.test.ts src/lib/httpCache.test.ts src/lib/cacheKeys.test.ts src/lib/homeserverConfig.test.ts && npm run test:unit && npm run test:gas && node --test sianjab-db-server/server.test.js && npm run build`
Expected: semua lulus; build 29/29 rute.

- [ ] **Step 7: Commit**

```bash
git add src/lib/routerError.ts src/lib/routerError.test.ts src/lib/api.ts
git commit -m "fix(router): klasifikasi error dan circuit breaker dengan backoff persisten"
```

---

## Di Luar Cakupan Plan Ini

Lima ide alur (A–E) di audit — push invalidation via SSE, offline write queue, indikator status sinkron, health gate UI, dan observability — memerlukan spec/brainstorming terpisah karena mengubah perilaku produk dan kontrak data. Health gate (Alur D) sudah diakomodasi sebagian di Task 2 (level klien, bukan UI panel).

## Verifikasi Akhir Sebelum Deploy

1. ✅ `npm run build` sukses tanpa error
2. ✅ Seluruh test suite lulus (unit, gas, homeserver, 4 test modul baru)
3. ✅ `grep` memastikan tidak ada secret hardcoded tersisa
4. ✅ Deploy GAS dengan flag `-i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw`
5. ✅ Restart container Homeserver dengan `.env` terisi, lalu uji mode HOMESERVER di incognito
