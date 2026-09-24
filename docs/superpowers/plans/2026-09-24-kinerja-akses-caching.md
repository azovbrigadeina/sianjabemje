# Rencana Implementasi: Optimasi Performa Pemuatan Data & Arsitektur Caching Sianjab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mempercepat pemuatan data (*data loading*) di seluruh aplikasi Sianjab hingga 5x–10x lebih cepat melalui caching per-entitas, dedicated cache detail jabatan di GAS, pemangkasan payload pohon struktur (97%), konsolidasi request layout, dan penerapan *optimistic loading* (0 ms display) dengan jaminan data tidak pernah tertinggal (*anti-stale*).

**Architecture:** 
1. Backend GAS (`gas/Code.gs`): Dedicated caching untuk `getJabatanFull_` per ID, endpoint ringkas status `getAnjabStatusSummary` (hanya ID terisi), filter laporan per unit kerja, dan auto-invalidation saat write.
2. Klien API (`src/lib/api.ts`): Entity-level cache store, granular invalidation per entitas/ID jabatan, dan helper *immediate cache hydration*.
3. Frontend UI (`dashboard` & `operator`): Optimistic loading pohon data (render seketika dari cache 0 ms lalu silent refresh), optimistic update centang hijau saat simpan, dan eliminasi request redundan di layout.

**Tech Stack:** Next.js (App Router, Static Export), Google Apps Script (GAS), Firebase Realtime Database, IndexedDB / In-Memory Cache, TypeScript.

## Global Constraints
- Deployment ID GAS tetap: `AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw`.
- Maksimal kuota eksekusi serentak GAS adalah 30 concurrent executions; minimalkan jumlah request dan ukuran payload.
- Operasi write harus tetap berjalan serial untuk mencegah race condition.
- Setiap operasi write wajib meng-invalidate cache terkait di klien dan di GAS.
- Data yang ditampilkan tidak boleh tertinggal (*anti-stale data guarantee*).

---

### Task 1: Backend GAS (`gas/Code.gs`) - Dedicated Caching & Lightweight Status Endpoint

**Files:**
- Modify: `gas/Code.gs`

**Interfaces:**
- Produces:
  - `case 'getAnjabStatusSummary'`: return `{ anjabFilled: string[], abkFilled: string[] }`
  - `fb_{CURRENT_TAHUN}_jfull_{jabatanId}` cache per jabatan di GAS CacheService
  - `removeLargeCache_` invalidation per `jabatanId` di fungsi-fungsi write jabatan.

- [ ] **Step 1: Tambahkan endpoint `getAnjabStatusSummary_` di `gas/Code.gs`**
  Mengambil hanya daftar `jabatanId` yang memiliki data pada `tugasPokok`, `syaratJabatan`, `kualifikasi`, `bahanKerja`, dan `abk`, lalu mengembalikan array ID ringkas tanpa seluruh isi teks tabel.
- [ ] **Step 2: Tambahkan dedicated cache pada `getJabatanFull_` di `gas/Code.gs`**
  Cek `getLargeCache_('fb_' + CURRENT_TAHUN + '_jfull_' + jabatanId)`. Jika ada, langsung return data (< 100 ms). Jika tidak, baca data, simpan ke cache dengan TTL 300 detik.
- [ ] **Step 3: Tambahkan targeted invalidation pada fungsi write jabatan di `gas/Code.gs`**
  Di `saveSingleEntity_`, `saveMultiEntity_`, `saveBulkAnjabData_`, `updateJabatan_`, dan `deleteJabatan_`, panggil:
  `removeLargeCache_('fb_' + CURRENT_TAHUN + '_jfull_' + jabatanId);`
  serta `invalidateCache_('jabatan')` dan `removeLargeCache_('fb_' + CURRENT_TAHUN + '_statusSummary');`.
- [ ] **Step 4: Tambahkan filter unit kerja pada laporan `getBulkAnjabByUnit_` di `gas/Code.gs`**
  Membuat endpoint/helper pembacaan data dokumen anjab khusus unit kerja tertentu agar tidak perlu mengunduh 13 entitas se-kabupaten saat mencetak dokumen 1 OPD.

---

### Task 2: Client API (`src/lib/api.ts`) - Entity-Level Store & Targeted Invalidation

**Files:**
- Modify: `src/lib/api.ts`

**Interfaces:**
- Produces:
  - `api.getAnjabStatusSummary(signal?: AbortSignal): Promise<{ anjabFilled: string[]; abkFilled: string[] }>`
  - Entity-level cache store di `API_CACHE` dan IndexedDB.
  - `api.getCachedEntity<T>(entity: string): Promise<T | null>`
  - `api.getCachedJabatanFull(jabatanId: string): Promise<JabatanFull | null>`
  - Targeted `invalidateEntityCache(entity: string, jabatanId?: string)`

- [ ] **Step 1: Implementasikan penyimpanan per-entitas pada `getBulkData` di `src/lib/api.ts`**
  Ketika data bulk diterima, selain menyimpan URL response, simpan tiap entitas secara terpisah di cache (`entity_{tahun}_{entityName}`).
- [ ] **Step 2: Buat fungsi `getAnjabStatusSummary` di objek `api`**
  Menyediakan method pemanggilan aksi `getAnjabStatusSummary` ke backend GAS dengan caching 3 menit.
- [ ] **Step 3: Implementasikan Targeted Invalidation di `apiCall`**
  Ganti pembersihan total `invalidateAllCache()` saat write sub-entitas anjab dengan pembersihan selektif: hapus cache entitas yang bersangkutan dan cache `jfull_{jabatanId}`, biarkan cache `unitKerja`, `settings`, dan `referensiJabatan` tetap aman.
- [ ] **Step 4: Tambahkan helper pembacaan instan (`getCachedSync` / `getCachedEntity`) untuk Optimistic Loading**
  Fungsi pembantu yang memungkinkan halaman komponen membaca data dari memory/IndexedDB secara instan sebelum melakukan fetch jaringan.

---

### Task 3: Optimistic Loading di Halaman Analisis Jabatan (`dashboard` & `operator`)

**Files:**
- Modify: `src/app/dashboard/analisis/page.tsx`
- Modify: `src/app/operator/analisis/page.tsx`

**Interfaces:**
- Consumes:
  - `api.getBulkData(['unitKerja', 'jabatan'])`
  - `api.getAnjabStatusSummary()`
  - `api.getCachedEntity`

- [ ] **Step 1: Ubah `loadTree` untuk menggunakan `getAnjabStatusSummary`**
  Hapus permintaan `['abk', 'tugasPokok', 'syaratJabatan', 'kualifikasi', 'bahanKerja']` dari `getBulkData`. Ganti dengan `['unitKerja', 'jabatan']` + `getAnjabStatusSummary()`.
- [ ] **Step 2: Terapkan Immediate Cache Hydration (0 ms Optimistic Loading)**
  Saat halaman Analisis dibuka, periksa apakah data `unitKerja`, `jabatan`, dan summary sudah ada di cache lokal. Jika ada, langsung bangun dan tampilkan pohon dalam 0 milidetik tanpa menampilkan skeleton/spinner tunggu.
- [ ] **Step 3: Tambahkan Silent Background Revalidation**
  Setelah pohon dari cache tampil, jalankan revalidasi hening di latar belakang untuk memperbarui data jika ada perubahan terbaru dari server.
- [ ] **Step 4: Terapkan Optimistic UI pada Editor Anjab**
  Saat pengguna menekan tombol Simpan Tugas Pokok/Syarat/Bahan Kerja:
  1. Perbarui state editor lokal instan.
  2. Perbarui badge centang hijau pohon secara lokal instan (`anjabTerisi = true`).
  3. Kirim permintaan simpan ke server. Jika gagal, beri notifikasi toast error dan kembalikan state.

---

### Task 4: Optimistic Loading di Halaman Beban Kerja & Organisasi

**Files:**
- Modify: `src/app/dashboard/beban-kerja/page.tsx`
- Modify: `src/app/operator/beban-kerja/page.tsx`
- Modify: `src/app/dashboard/organisasi/page.tsx`
- Modify: `src/app/operator/organisasi/page.tsx`

- [ ] **Step 1: Ringankan payload dan terapkan Optimistic Loading di Beban Kerja**
  Gunakan `getAnjabStatusSummary` dan render instan dari cache lokal di `dashboard/beban-kerja` dan `operator/beban-kerja`.
- [ ] **Step 2: Terapkan Optimistic Loading di Pohon Organisasi**
  Jika data `unitKerja` dan `jabatan` sudah ada di cache (misal baru saja membuka menu Analisis atau Organisasi sebelumnya), langsung render pohon organisasi dalam 0 ms.
- [ ] **Step 3: Optimistic Reordering di Organisasi**
  Pertahankan pembaruan urutan visual instan saat drag-and-drop, dan pastikan cache lokal langsung disinkronkan dengan urutan baru.

---

### Task 5: Konsolidasi Layout & Optimasi Export Laporan

**Files:**
- Modify: `src/app/dashboard/layout.tsx`
- Modify: `src/app/operator/layout.tsx`
- Modify: `src/app/dashboard/laporan/page.tsx`
- Modify: `src/app/operator/laporan/page.tsx`

- [ ] **Step 1: Hapus redundant fetch di `OperatorLayout` & `DashboardLayout`**
  Ambil nama OPD dari data sesi user (`user.unitKerjaId` / nama di sesi) atau dari cache `unitKerja` lokal. Hindari pemanggilan 3 request terpisah ke GAS pada setiap navigasi halaman.
- [ ] **Step 2: Optimasi pemuatan dan cetak laporan OPD di `laporan/page.tsx`**
  Gunakan pembacaan tersaring per OPD (`getBulkAnjabByUnit` atau pemanggilan terfokus) sehingga saat cetak dokumen satu OPD tidak mengunduh seluruh database kabupaten.

---

### Task 6: Verifikasi & Uji Menyeluruh

**Files:**
- All modified files

- [ ] **Step 1: Jalankan verifikasi tipe TypeScript**
  `npx tsc --noEmit --incremental false` dan pastikan 0 error.
- [ ] **Step 2: Uji alur pengisian anjab & anti-stale data**
  Pastikan pengisian di satu tab dan perpindahan antar-jabatan menampilkan data terkini tanpa tertinggal.
- [ ] **Step 3: Uji kecepatan render dan perpindahan halaman**
  Uji perpindahan antar-menu (Organisasi -> Analisis -> Beban Kerja) dan pastikan tampilan muncul instan (0 ms) dari cache.
- [ ] **Step 4: Commit dan push pembaruan ke GitHub**
