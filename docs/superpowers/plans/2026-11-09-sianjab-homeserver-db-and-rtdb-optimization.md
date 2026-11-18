# Sianjab Homeserver Docker Database & RTDB Quota Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengalihkan sumber data utama Sianjab ke kontainer Docker Homeserver khusus (`sianjab-db-server` di port `3098` dengan Tailscale Funnel HTTPS `:8443`), menjadikan Firebase RTDB sebagai database cadangan (sinkronisasi Write-Behind + Outbox), memangkas konsumsi kuota RTDB >95% di `gas/Code.gs`, serta menerapkan seluruh optimasi performa frontend & backend agar aplikasi sangat responsif (*snappy*) saat pengisian serentak 42+ OPD.

**Architecture:**
1. **`sianjab-db-server/` (Node.js 20 Alpine, Port `3098`, Funnel `:8443`)**: Menyimpan database di RAM + disk atomik (`/data/sianjab-db.json`), membangun Secondary Index $O(1)$ di memori (`byYearJabatan` dan `byYearUnit`), mencatat perubahan di `/data/outbox.json`, serta menyinkronkan perubahan ke Firebase RTDB secara berkala (Write-Behind setiap 3 menit) atau manual. Menyediakan API yang 100% kompatibel dengan `src/lib/api.ts` serta Dashboard Live Monitor SSE.
2. **Smart Router & Circuit Breaker (`src/lib/api.ts`)**: Mengarahkan seluruh operasi baca/tulis langsung ke Homeserver saat mode `HOMESERVER` aktif (latensi ~10–30ms tanpa antrean limit 30 eksekusi GAS), dengan fallback otomatis ke GAS + RTDB jika jaringan Homeserver terputus.
3. **Optimasi Kuota RTDB & Kecepatan (`gas/Code.gs` + Frontend)**: Menambahkan `Accept-Encoding: gzip`, `print=silent`, pemisahan `template_docx` dari `settings`, negative-cache `isTokenRevoked_`, cache RBAC `getAllowedUnitKerjaIds_` / `assertJabatanAccess_`, write-through cache pada penyimpanan Anjab/ABK, batch API `createBatchReferensi`, dan perbaikan semua temuan `PERFORMANCE_AUDIT.md` (`PRF-02` s.d. `PRF-15`).

**Tech Stack:** Next.js (Static Export, TypeScript), Node.js 20 (HTTP/SSE/Gzip native), Docker & Docker Compose, Tailscale Funnel, Google Apps Script (`gas/Code.gs`), Firebase Realtime Database.

---

### Task 1: Buat Kontainer Docker Homeserver (`sianjab-db-server/`) & Skrip Tailscale Funnel

**Files:**
- Create: `sianjab-db-server/package.json`
- Create: `sianjab-db-server/Dockerfile`
- Create: `sianjab-db-server/docker-compose.yml`
- Create: `sianjab-db-server/setup-funnel.sh`
- Create: `sianjab-db-server/README.md`
- Create: `sianjab-db-server/server.js`
- Test: `sianjab-db-server/server.test.js`

- [ ] **Step 1: Buat `package.json`, `Dockerfile`, `docker-compose.yml`, `setup-funnel.sh`, dan `README.md`**
  - Konfigurasi port `3098`, volume `./data:/data`, environment variable untuk Sianjab RTDB (`https://anjabmj-44141-default-rtdb.asia-southeast1.firebasedatabase.app`) dan SiTPP RTDB, serta skrip `setup-funnel.sh` untuk Tailscale Funnel di port `8443` (`sudo tailscale funnel --bg --https=8443 http://127.0.0.1:3098`).
- [ ] **Step 2: Implementasikan `sianjab-db-server/server.js`**
  - In-Memory DB + Atomic Disk Write (`/data/sianjab-db.json`) dengan error propagation (tidak menelan error disk).
  - Secondary Index $O(1)$ (`idxByYearJabatan` untuk 13 tabel anak Anjab/ABK, `idxJabatanByYearUnit` untuk jabatan per unit kerja).
  - Outbox persisten (`/data/outbox.json`) + Write-Behind Scheduler ke Firebase RTDB (dengan `print=silent` dan `Accept-Encoding: gzip`).
  - Endpoint API Sianjab lengkap (`/api` dan `/?action=...`) yang 100% kompatibel dengan seluruh action di `src/lib/api.ts`, mendukung token HMAC GAS/Homeserver, kompresi Gzip, dan ETag `304`.
  - Endpoint kontrol & Live Monitor SSE (`GET /`, `/_homeserver/status`, `/_homeserver/ping`, `/_homeserver/activity`, `/_homeserver/monitor-stream`, `/_homeserver/pull-from-rtdb`, `/_homeserver/flush-to-rtdb`, `/_homeserver/mode`, `/_homeserver/seed-from-file`).
- [ ] **Step 3: Buat dan jalankan unit test `sianjab-db-server/server.test.js`**
  - Run: `node --test sianjab-db-server/server.test.js`
  - Expected: PASS untuk operasi CRUD, Secondary Index $O(1)$, `getJabatanFull`, `saveBulkAnjabData`, `getBulkData` (penuh & terfilter `unitKerjaId`), Outbox tracking, dan Mode switching.

---

### Task 2: Optimasi Kuota RTDB & Kecepatan Eksekusi di `gas/Code.gs`

**Files:**
- Modify: `gas/Code.gs`
- Modify: `tests/gas-Logic.test.mjs`

- [ ] **Step 1: Optimasi HTTP Layer Firebase (`fbGet_`, `fbPut_`, `fbPatch_`, `fbPutSitpp_`, `fbPatchSitpp_`)**
  - Tambahkan `headers: { 'Accept-Encoding': 'gzip' }` pada semua panggilan baca `UrlFetchApp.fetch` dan `UrlFetchApp.fetchAll`.
  - Tambahkan `&print=silent` pada semua panggilan tulis `PUT` dan `PATCH` ke Firebase RTDB.
- [ ] **Step 2: Pisahkan `template_docx` dari node `settings`**
  - Tambahkan `'template_docx'` ke `ALLOWED_ENTITIES_` dan `nonYearly` di `getFirebasePath_`.
  - Ubah action `saveTemplate` dan `getTemplate` agar menyimpan/membaca dari path top-level `template_docx` (dengan fallback baca dari `settings/templateDocx` dan pembersihan otomatis `settings/templateDocx` saat simpan sehingga ukuran `settings` turun dari 3,77 MB menjadi < 5 KB).
- [ ] **Step 3: Eliminasi Uncached Reads pada Auth, RBAC, dan Security Logs (`PRF-02`, `PRF-14`)**
  - Cache hasil `isTokenRevoked_(nonce)` di `scriptCache_` selama 180 detik (`rev_chk_` + nonce) dan langsung set `'REVOKED'` saat `revokeToken_`.
  - Gunakan `cachedFbGet_(getFirebasePath_('unitKerja'), 300)` dan Adjacency Map $O(U)$ di `getAllowedUnitKerjaIds_`.
  - Gunakan lookup dari `readAllRecords_('jabatan')` (yang sudah ter-cache) di `assertJabatanAccess_` sebelum fallback ke `readRecord_`.
  - Ubah `rotateSecurityLogs_` agar hanya berjalan probabilistik 5% (`Math.random() < 0.05`) dan menggunakan `?shallow=true` untuk mengecek jumlah kunci sebelum mengunduh seluruh log.
- [ ] **Step 4: Optimasi Write-Through Cache & Batch Endpoints (`PRF-03`, `PRF-05`, `PRF-06`, `PRF-12`, `PRF-13`)**
  - Pada `saveSingleEntity_`, `saveMultiEntity_`, dan `saveBulkAnjabData_`, baca dari `getLargeCache_` terlebih dahulu untuk mencari key lama (`row.jabatanId === parentId`), lalu perbarui objek cache secara *in-place* (`putLargeCache_`) tanpa menghapus seluruh cache tabel bagi 42 OPD lain.
  - Tambahkan action `createBatchReferensi` (`createBatchReferensi_`) dan `invalidateAllCaches` di `handleRequest_`.
  - Tambahkan dukungan parameter opsional `unitKerjaId` pada `getBulkData` (`readMultipleEntities_`) untuk memfilter `jabatan` dan `abk` sesuai sub-pohon OPD operator.
  - Gunakan `UrlFetchApp.fetchAll()` secara paralel pada `exportForSitpp_` dan `buildAiContext_`, serta baca `tahun/jabatan` cukup 1 kali per tahun pada `migrateOldAbkWke_`.

---

### Task 3: Integrasi Smart Router Homeserver & Optimasi Performa Frontend

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/app/dashboard/backup-database/page.tsx`
- Modify: `src/app/dashboard/referensi/page.tsx`
- Modify: `src/app/dashboard/laporan/page.tsx`
- Modify: `src/app/operator/laporan/page.tsx`
- Modify: `src/app/dashboard/organisasi/page.tsx`
- Modify: `src/app/dashboard/users/page.tsx`

- [ ] **Step 1: Optimasi `src/lib/constants.ts` (`PRF-07`) dan `src/lib/api.ts`**
  - Cache `activeYear` di memori modul pada `src/lib/constants.ts`.
  - Naikkan `CACHE_TTL_MS` di `src/lib/api.ts` menjadi 5 menit (`300_000` ms).
  - Tambahkan **Homeserver Smart Router & Circuit Breaker** di `src/lib/api.ts`:
    - Mendukung konfigurasi URL Homeserver (default Funnel `https://falconxtra.tail56d53d.ts.net:8443` atau konfigurasi dinamis dari `localStorage` / `settings/homeserverConfig`).
    - Saat mode `HOMESERVER` aktif, arahkan `apiCall` langsung ke `${homeserverUrl}/api` dengan fallback otomatis ke GAS (`API_BASE`) bila terjadi gangguan jaringan.
    - Tambahkan helper `api.homeserver.*` (`getConfig`, `saveConfig`, `getStatus`, `pullFromRtdb`, `flushToRtdb`, `setMode`, `seedFromBackup`) dan `api.createBatchReferensi`.
- [ ] **Step 2: Tambahkan Panel Kontrol Homeserver Docker & Funnel di `src/app/dashboard/backup-database/page.tsx`**
  - Tampilkan status sumber data aktif (`HOMESERVER DOCKER` vs `FIREBASE RTDB`), latensi ping (ms), jumlah antrean Outbox (`dirtyPaths`), statistik entitas di RAM Homeserver, input URL Tailscale Funnel & Secret, tautan ke Live Monitor Dashboard, serta tombol:
    1. **Tarik Data RTDB ke Homeserver (Seed)**
    2. **Flush Outbox ke RTDB Sekarang**
    3. **Saklar Mode: Gunakan Homeserver / Kembali ke RTDB (Safe Switch)**
- [ ] **Step 3: Terapkan Optimasi Frontend `PRF-03`, `PRF-04`, `PRF-09`, `PRF-10`, `PRF-11`**
  - `src/app/dashboard/referensi/page.tsx`: Gunakan `api.createBatchReferensi` saat impor Excel dan pre-normalized `Map` + filter panjang string sebelum Levenshtein di `checkSimilarityBeforeSave`.
  - `src/app/dashboard/laporan/page.tsx` & `src/app/operator/laporan/page.tsx`: Pre-index 13 entitas anak ke dalam `Map<jabatanId, any[]>` sebelum iterasi `jobsToDownload.map` ($O(J + R)$).
  - `src/app/dashboard/organisasi/page.tsx`: Gunakan `useMemo` untuk `opdMap` (`Map<id, UnitKerja>`).
  - `src/app/dashboard/users/page.tsx`: Bungkus `loadData` dengan `useCallback`.

---

### Task 4: Ekspos Tailscale Funnel, Seed Data Homeserver, & Verifikasi End-to-End

**Files:**
- Modify: `.env.local` (opsional variabel `NEXT_PUBLIC_HOMESERVER_URL`)

- [ ] **Step 1: Jalankan `sianjab-db-server` dan aktifkan Tailscale Funnel pada port `8443`**
  - Seed database lokal `sianjab-db-server/data/sianjab-db.json` dari snapshot/RTDB dan jalankan server pada port `3098`.
  - Aktifkan Tailscale Funnel `https://falconxtra.tail56d53d.ts.net:8443 -> http://127.0.0.1:3098` (berdampingan dengan `sitpp-failover` di port `443`).
- [ ] **Step 2: Jalankan Seluruh Suite Pengujian & Build Produksi**
  - Run: `node --test sianjab-db-server/server.test.js`
  - Run: `npm run test:unit && npm run test:gas`
  - Run: `npm run build`
  - Verifikasi semua tes lulus 100% dan `npm run build` sukses tanpa error.
