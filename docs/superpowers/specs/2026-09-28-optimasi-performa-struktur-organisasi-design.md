# Design Document: Optimasi Performa Tambah, Edit, dan Hapus Jabatan di Bagan Organisasi

**Tanggal**: 28 September 2026  
**Status**: Disetujui  
**Target Route**: `/dashboard/organisasi`, `/operator/organisasi`  
**Backend**: Google Apps Script (`gas/Code.gs`), Firebase Realtime Database  
**Tujuan Utama**: Peningkatan kecepatan respon UI (turun dari 5-8 detik ke < 1 detik) dan penghematan kuota concurrent execution Google Apps Script (GAS) hingga 80%.

---

## 1. Latar Belakang & Akar Masalah

Pada modul Bagan Organisasi (`/dashboard/organisasi` untuk Admin dan `/operator/organisasi` untuk Operator OPD), operasi Tambah, Edit, dan Hapus Jabatan dirasakan lambat (memakan waktu 5 hingga 8 detik per aksi).

Berdasarkan investigasi kode, ditemukan 4 penyebab utama:
1. **Refetch Menyeluruh Pasca-Aksi (`await loadData(true)`)**:
   Setiap kali operasi tulis (tambah, edit, hapus) selesai, frontend selalu memanggil `loadData(true)`. Karena cache ter-invalidasi, sistem mengunduh ulang seluruh data unit kerja dan jabatan dari 42+ OPD se-kabupaten melalui `api.getBulkData(['unitKerja', 'jabatan'])`.
2. **13 Panggilan HTTP Berurutan (*Sequential Reads*) saat Hapus**:
   Fungsi `deleteRecord_('jabatan', id)` di `Code.gs` menjalankan loop `fbGet_()` berurutan pada 13 tabel anak untuk proses cascading delete, memakan waktu 2,5 - 4 detik di server backend.
3. **Loop 4x Round-Trip Berturutan saat Tambah Jabatan Fungsional**:
   Penambahan Jabatan Fungsional Keahlian atau Keterampilan menjalankan 4x `await api.createJabatan(...)` secara berurutan, mengirim 4 request HTTP terpisah ke GAS.
4. **Flicker dan Beban Rendering Pohon**:
   Unduhan ulang data menyebabkan pohon organisasi di-render ulang secara penuh dan berpotensi menutup cabang pohon yang sedang ditinjau.

---

## 2. Arsitektur Solusi & Efisiensi Kuota GAS

### A. Backend GAS: Parallel Cascading Fetch (`gas/Code.gs`)
Pada fungsi `deleteRecord_('jabatan', id)`:
- Mengganti loop sequential 13x `fbGet_()` dengan pemanggilan paralel **`UrlFetchApp.fetchAll(requests)`**.
- Seluruh 13 tabel anak (`kualifikasi`, `syaratJabatan`, `hasilKerja`, `prestasiKerja`, `abk`, `tugasPokok`, `bahanKerja`, `perangkatKerja`, `tanggungJawab`, `wewenang`, `korelasiJabatan`, `kondisiLingkungan`, `risikoBahaya`) dibaca secara bersamaan dalam 1 round-trip paralel (~300 ms).
- Jika ditemukan data turunan terkait, penghapusan dieksekusi dalam batch patch payload tunggal.

### B. Backend GAS & API: Batch Create Jabatans (`createBatchJabatans`)
- Menambahkan action `'createBatchJabatans'` pada `handleRequest_` di `Code.gs`.
- Menerima array: `items: JabatanPayload[]`.
- Menghasilkan UUID baru untuk tiap jabatan, menyusun payload dalam memori, dan menyimpannya ke Firebase dalam **1 kali operasi `fbPatch_`**.
- Mengembalikan daftar jabatan baru yang berhasil dibuat: `{ success: true, items: CreatedJabatan[] }`.
- Di `src/lib/api.ts`, menambahkan method `api.createBatchJabatans(items)`.

### C. Frontend: In-Memory State Mutation Tanpa Refetch
Pada `/dashboard/organisasi/page.tsx` dan `/operator/organisasi/page.tsx`:
- Menghapus pemanggilan `await loadData(true)` setelah operasi berhasil.
- **Aksi Tambah**:
  - Menyisipkan item baru dari respon API ke `rawJabatans`.
  - Re-generate pohon secara lokal: `buildOrgTreeNodes(rawOpds, updatedJabatans)`.
  - Membuka cabang atasan: `setExpandedNodes(prev => ({ ...prev, [parentId]: true }))`.
- **Aksi Edit**:
  - Mengupdate item yang diedit pada array `rawJabatans`.
  - Re-generate pohon secara lokal tanpa request jaringan tambahan.
- **Aksi Hapus**:
  - Menyaring keluar `id` jabatan yang dihapus dari `rawJabatans`.
  - Re-generate pohon secara lokal; node langsung lenyap dari layar.
- **Preservasi Status Buka/Tutup Pohon**:
  - `expandedNodes` dipertahankan sehingga posisi pandangan pengguna tidak melompat (*zero flicker*).

---

## 3. Analisis Dampak Performa & Kuota

| Parameter | Sebelum Optimasi | Sesudah Optimasi | Peningkatan |
|---|---|---|---|
| **Waktu Respon Tambah Biasa** | 4 – 6 detik | **~0,5 detik** | **8x – 12x Lebih Cepat** |
| **Waktu Respon Tambah JF (4 Jenjang)** | 6 – 9 detik | **~0,8 detik** | **10x Lebih Cepat** |
| **Waktu Respon Hapus Jabatan** | 5 – 8 detik | **~0,6 detik** | **10x Lebih Cepat** |
| **Konsumsi Kuota GAS per Aksi** | 2 – 5 eksekusi + payload seluruh OPD | **1 eksekusi payload mini** | **Hemat Kuota ~80%** |
| **Stabilitas Pohon (Flicker)** | Pohon reload/flicker penuh | **Halus / Zero Flicker** | Sempurna |

---

## 4. Rencana Verifikasi & Pengujian

1. **Typecheck & Build**:
   - `npx tsc --noEmit --incremental false`
   - `npm run build`
2. **Pengujian Fungsional**:
   - Tambah Jabatan Struktural / Pelaksana: pastikan jabatan langsung muncul di pohon dalam < 1 detik.
   - Tambah Jabatan Fungsional (4 Jenjang): pastikan ke-4 jenjang langsung muncul di bawah atasan dalam 1 kali simpan.
   - Edit Jabatan: pastikan perubahan nama dan kelas langsung tercermin di pohon.
   - Hapus Jabatan: pastikan jabatan langsung hilang dari pohon dan data turunan di Firebase terhapus bersih.
3. **Deployment**:
   - Frontend: `npx firebase-tools deploy --only hosting`
   - Backend: `npx @google/clasp push && npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw`
