# Design Document: Audit Performa, Integritas Relasi Data, dan Proteksi Sistem Sianjab

**Tanggal**: 2026-09-03  
**Status**: Approved by User  
**Target**: Refactoring backend GAS (`Code.gs`) dan frontend (`src/app/`, `src/lib/`) untuk menjamin kestabilan data, kebersihan relasi database, dan performa tinggi di masa depan.

---

## 1. Latar Belakang & Tujuan

Aplikasi Sianjab digunakan oleh 42+ OPD secara bersamaan dengan backend Google Apps Script (GAS) dan Firebase Realtime Database. Hasil audit mengidentifikasi 5 potensi kerentanan sistem:
1. **Dangling Orphaned Data**: Penghapusan Jabatan atau Unit Kerja tidak melakukan *cascading delete* terhadap entitas anak.
2. **Infinite Loop Vulnerability**: Belum ada *cycle detection* pada pengubahan `parentId` (Unit Kerja & Jabatan).
3. **Race Condition dalam Operasi Write**: Operasi pembaruan data massal (`saveMultiEntity_`, `saveBulkAnjabData_`, `syncFromSheet_`) di GAS belum dilindungi *ScriptLock*.
4. **Sub-optimal Client Fetch & Algoritma**: Halaman frontend tertentu memanggil `readAllEntity` secara terpisah dan menggunakan pencarian $O(N \times M)$ (`Array.includes`).
5. **Memory Leak Risk**: Client-side in-memory cache (`API_CACHE`) tidak memiliki mekanisme pembatasan kapasitas (LRU Eviction).

---

## 2. Rincian Desain Arsitektur & Solusi Teknis

### A. Cascading Delete & Garbage Collection (`gas/Code.gs`)
1. **Penghapusan Jabatan (`deleteRecord_('jabatan', id)`)**:
   - Sebelum atau saat menghapus record jabatan, hapus seluruh entitas turunan yang memiliki `jabatanId === id`:
     - Single entities: `kualifikasi`, `syaratJabatan`, `hasilKerja`, `prestasiKerja`, `abk`.
     - Multi entities: `tugasPokok`, `bahanKerja`, `perangkatKerja`, `tanggungJawab`, `wewenang`, `korelasiJabatan`, `kondisiLingkungan`, `risikoBahaya`.
2. **Penghapusan Unit Kerja (`deleteRecord_('unitKerja', id)`)**:
   - Tambahkan validasi sub-unit: Jika unit kerja memiliki sub-unit (`parentId === id`), gagalkan penghapusan dengan instruksi pemindahan sub-unit terlebih dahulu.
3. **Fungsi Cleanup / Repair Database (`cleanupOrphanedRecords_`)**:
   - Tambahkan fungsi maintenance di GAS untuk mendeteksi dan menghapus entitas anak di Firebase yang `jabatanId`-nya sudah tidak ada di tabel `jabatan`.

### B. Proteksi Siklus Hirarki / Cycle Detection (`gas/Code.gs` & Frontend)
1. **Backend Validation (`Code.gs`)**:
   - Pada `updateRecord_` untuk `unitKerja` dan `jabatan`:
     - Jika `parentId` diubah, lakukan traversal leluhur (*ancestor path traversal*).
     - Jika `parentId === id` atau `parentId` merupakan salah satu keturunan dari `id`, tolak update dengan pesan error: `"Pilihan atasan tidak valid (menyebabkan rantai melingkar/circular reference)."`.
2. **Frontend Helper**:
   - Tambahkan validasi siklus di `src/lib/utils.ts` untuk memvalidasi di UI sebelum request dikirim.

### C. Concurrency Locking di GAS (`gas/Code.gs`)
1. Gunakan `LockService.getScriptLock()` pada fungsi operasi *write* kompleks:
   - `saveBulkAnjabData_`, `saveMultiEntity_`, `syncFromSheet_`, `cloneYearData_`, `deleteYearData_`.
2. Timeout lock diset 10-15 detik dengan mekanisme graceful try-lock & release (`lock.releaseLock()`) dalam blok `finally`.

### D. Refactoring Performa Frontend (`src/app/`)
1. **`src/app/organisasi/page.tsx`**:
   - Ubah `api.readAllEntity('jabatan', '')` menjadi `api.getBulkData(['unitKerja', 'jabatan'])`.
   - Ubah `targetUnitIds.includes(j.unitKerjaId)` menjadi `const targetSet = new Set(targetUnitIds); j.unitKerjaId && targetSet.has(j.unitKerjaId)`.
2. **`src/app/dashboard/referensi/page.tsx`**:
   - Ganti `api.readAllEntity('referensiJabatan', '')` menjadi `api.getBulkData(['referensiJabatan'])` untuk memanfaatkan caching tier.

### E. Manajemen Cache & LRU Eviction Client (`src/lib/api.ts`)
1. Batasi `API_CACHE` Map hingga maksimal 100 entries.
2. Jika melebihi batas, hapus entry tertua (*least recently inserted/used*).

---

## 3. Rencana Verifikasi & Pengujian

1. **Unit & Logic Verification**:
   - Pastikan `npm run build` berjalan tanpa warning/error TypeScript.
2. **Cascading & Maintenance Test**:
   - Uji pembuatan dan penghapusan jabatan dummy, verifikasi di Firebase Realtime DB bahwa record anak terhapus bersih.
3. **Cycle Test**:
   - Uji set `parentId` circular di Unit Kerja / Jabatan, verifikasi error ditangkap dengan benar.
4. **Deploy & Smoke Test**:
   - Sesuai aturan `AGENTS.md`: Jalankan build Next.js (`npm run build && npx firebase-tools deploy`) dan deploy GAS (`npx @google/clasp push && npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw`).

---
