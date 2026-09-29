# Rencana Perbaikan Sistem Sianjab ABK (Audit 29 September 2026)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memperbaiki 22 temuan audit sistem Sianjab ABK (AUDIT-2026-09-29), mencakup keamanan token, penutupan backdoor, perlindungan secret, integritas data bagan organisasi, perbaikan antrean write API client, proteksi API key AI, dan sinkronisasi sesi.

**Architecture:** 
1. Hardening otentikasi & RBAC di Google Apps Script (`gas/Code.gs`), fail-closed token validation, rate-limiting, dan otorisasi entitas sensitif.
2. Hardening antrean tulis & pembatasan retry operasi tulis di `src/lib/api.ts` serta cache invalidation terarah.
3. Perbaikan mutasi data bagan organisasi di `src/app/dashboard/organisasi/page.tsx` dan `src/app/operator/organisasi/page.tsx` untuk menjaga `ikhtisarJabatan` dan mencegah node hantu `temp_`.
4. Sanitasi repository dari skrip debug yang memuat kredensial dan pengamanan pemanggilan AI ke sisi backend.

**Tech Stack:** Next.js (App Router), TypeScript, Google Apps Script (GAS), Firebase Realtime Database.

## Global Constraints
- **Deployment Flag:** Selalu deploy GAS menggunakan `npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw -d "<deskripsi>"`.
- **Cache Invalidation:** Setiap operasi write wajib memanggil invalidasi cache yang relevan di server dan client.
- **Defensive:** Seluruh perubahan diuji bertahap dengan `npx tsc --noEmit --incremental false` dan `npm run build`.

---

## Status Pencadangan (Telah Berhasil Dilakukan)
- ✅ **Database Backup:** Tersimpan di `backups/db_backup_2026-09-29_pre_audit.json` (15.91 MB, 21 node root terverifikasi utuh).
- ✅ **Git Branch Backup:** Branch `backup-audit-2026-09-29` telah dibuat dari commit terkini.
- ✅ **Backend Code Backup:** Tersimpan di `backups/Code.gs.backup-2026-09-29`.

---

### Task 1: Sanitasi Secret & File Debug Repositori (C3, L3)

**Files:**
- Delete: `fix_db.js`, `debug_tree.js`, `debug_tree2.js`, `parse_debug.js`, `parse_test.js`, `parse_test2.js`, `parse_test3.js`, `patch.js`
- Modify: `.gitignore`

- [ ] **Step 1: Hapus file skrip debug sensitif dari git tracking**
- [ ] **Step 2: Tambahkan pattern file debug di `.gitignore`**
- [ ] **Step 3: Verifikasi git status bersih dari file-file tersebut**

---

### Task 2: Pengamanan Backend GAS & RBAC (C1, C2, C4, C6, L1, L3)

**Files:**
- Modify: `gas/Code.gs`

- [ ] **Step 1: Terapkan fail-closed token validation & hapus default secret hardcoded di `gas/Code.gs` (C1)**
- [ ] **Step 2: Hapus backdoor pembuatan otomatis akun `admin/admin` dari `loginUser_` dan buat helper manual `bootstrapInitialAdmin_` (C2)**
- [ ] **Step 3: Tambahkan RBAC guard pada aksi generik `create`, `update`, `delete` untuk entitas `users` & `settings` serta validasi kepemilikan OPD, dan hapus `getSptSpreadsheetData` dari public actions (C4)**
- [ ] **Step 4: Tambahkan rate-limiting pada percobaan login dan HMAC salt untuk password (C6)**
- [ ] **Step 5: Perbaiki typo status dinonaktifkan "meggunakan" -> "menggunakan" (L1) dan hapus dead code `runBenchmark_` (L3)**

---

### Task 3: Integritas Data & Client API Layer (H1, H2, H3, H4, H5, L2)

**Files:**
- Modify: `src/app/dashboard/organisasi/page.tsx`
- Modify: `src/app/operator/organisasi/page.tsx`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Perbaiki `handleModalSave` di `src/app/dashboard/organisasi/page.tsx` agar tidak mengirim `ikhtisarJabatan: ''` dan `level: 1` saat edit, serta hapus fallback `temp_` ID (H1, H2, L2)**
- [ ] **Step 2: Perbaiki `handleModalSave` di `src/app/operator/organisasi/page.tsx` agar tidak mengirim `ikhtisarJabatan: ''` dan `level: 1` saat edit, serta hapus fallback `temp_` ID (H1, H2)**
- [ ] **Step 3: Nonaktifkan auto-retry untuk operasi tulis di `src/lib/api.ts` (H3)**
- [ ] **Step 4: Perbaiki rantai mutex `writeQueuePromise` di `src/lib/api.ts` (H4)**
- [ ] **Step 5: Tambahkan invalidasi cache untuk aksi `saveABK` dan `saveBulkAnjabData` di `invalidateTargetedCache` (H5)**

---

### Task 4: Proteksi AI API Key & Sinkronisasi Sesi (C5, M5)

**Files:**
- Modify: `gas/Code.gs`
- Modify: `src/lib/api.ts`
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Di `gas/Code.gs`, sensor (*strip*) semua key berakhiran `ApiKey` saat entitas `settings` dibaca oleh non-admin (C5)**
- [ ] **Step 2: Di `src/lib/api.ts`, alihkan `generateAnjabWithAI` untuk menggunakan endpoint backend GAS alih-alih direct-call browser (C5)**
- [ ] **Step 3: Di `src/app/login/page.tsx`, samakan masa berlaku cookie menjadi 24 jam (M5)**
- [ ] **Step 4: Di `src/lib/api.ts`, tambahkan interceptor saat token kadaluarsa untuk membersihkan sesi dan me-redirect ke `/login?expired=1` (M5)**

---

### Task 5: Optimasi Performa & Konsistensi (M1, M2, M3, M4)

**Files:**
- Modify: `gas/Code.gs`

- [ ] **Step 1: Optimasi cascading delete di `deleteRecord_` menggunakan filter REST query Firebase (M1)**
- [ ] **Step 2: Standarisasi konstanta `BASE_YEAR = '2026'` dan proteksi tahun dinamis di `deleteYearData_` (M2)**
- [ ] **Step 3: Perbaiki batching maksimal 30 keys di `putLargeCache_` dan `getLargeCache_` (M3)**
- [ ] **Step 4: Tambahkan limit 100 record terbaru untuk pembacaan `security_logs` (M4)**

---

### Task 6: Verifikasi, Build & Deployment

- [ ] **Step 1: Jalankan `npx tsc --noEmit --incremental false`**
- [ ] **Step 2: Jalankan `npm run build`**
- [ ] **Step 3: Push dan deploy backend Google Apps Script**
- [ ] **Step 4: Deploy Next.js ke Firebase Hosting**
