# Design Document: Menu Investigasi & Audit Anomali Jabatan

**Tanggal**: 3 September 2026  
**Status**: Disetujui (Diperbarui dengan Smart Parsing & Standardisasi Referensi)  
**Target Route**: `/dashboard/investigasi`  
**Sistem Target**: Sianjab ABK EM-JE (Admin Dashboard)

---

## 1. Ringkasan Fitur

Menu Investigasi Anomali Jabatan dirancang sebagai fitur audit internal bagi Administrator Sianjab untuk mendeteksi, mendiagnosis, dan memfasilitasi koreksi terhadap ketidaksesuaian data Jabatan dan Kelas Jabatan di seluruh OPD.

Fitur ini mencakup **Smart Parsing & Standardisasi Referensi**:
1. **Smart Parsing Base Name & Jenjang**: Mengisolasi *Base Name* (misal `"Asisten Apoteker"`) dari *Jenjang Suffix* (misal `"Mahir"`, `"Penyelia"`, `"Ahli Pertama"`, `"Ahli Muda"`).
2. **Standardisasi Nama Otomatis & Terpandu**: Menghubungkan nama jabatan di OPD dengan Master `referensiJabatan` tanpa mengubah ID entitas atau merusak relasi SiTPP (`sianjab_export`).
3. **Disparitas Kelas Jabatan pada Nama Jabatan Sama**: Perbedaan `kelasJabatan` untuk jabatan yang sama antar-OPD.
4. **Outlier Kelas Jabatan Struktural**: Penyimpangan kelas jabatan pada rombongan JPT Pratama, Administrator, dan Pengawas.

---

## 2. Arsitektur Data & Performa

Sesuai dengan **Aturan Proyek Sianjab**:
- **Single Bulk Request**: Pengambilan data menggunakan `api.getBulkData(['unitKerja', 'jabatan', 'referensiJabatan'])` dalam 1 kali round-trip HTTP ke GAS backend.
- **O(1) Map Lookups**: Pemetaan unit kerja dan referensi jabatan menggunakan data struktur `Map` (bukan `.find()` dalam loop) untuk performa instan di client side.
- **Memoized Compute**: Seluruh mesin kalkulasi anomali di-wrap dalam `useMemo` dengan dependensi `[jabatan, referensiJabatan, unitKerja]`.
- **Atomic Edit & Auto Invalidation**: Pengubahan data nama atau kelas jabatan memanggil `api.updateJabatan()` yang secara otomatis menghapus cache client & server (`invalidateAllCache()`).

---

## 3. Spesifikasi Logika Audit & Smart Parsing Engine

### A. Daftar Jenjang Standar Fungsional
- **Keterampilan**: `Pemula`, `Terampil`, `Mahir`, `Penyelia`.
- **Keahlian**: `Ahli Pertama`, `Ahli Muda`, `Ahli Madya`, `Ahli Utama`.

### B. Algoritma Smart Parsing & Matching (`src/lib/investigasiUtils.ts`)
1. **Parsing Input Teks**:
   - Diberikan `namaJabatan` OPD (misal `"Asisten Apoteker Mahir"` atau `"asisten apoteker  mahir"`).
   - Ekstrak akhiran kata jenjang. Jika cocok dengan salah satu jenjang standar:
     - `baseName` = teks sebelum jenjang (di-trim).
     - `jenjang` = string jenjang yang cocok.
   - Jika tidak ada jenjang suffix: `baseName` = `namaJabatan` utuh, `jenjang` = `null`.
2. **Pencocokan ke Referensi (`referensiJabatan`)**:
   - Normalisasi `baseName` dan cari di `referensiJabatan` (menggunakan match tepat & fuzzy similarity ≥ 80%).
   - Jika `baseName` ditemukan di Referensi:
     - Konstruksi `namaStandar` = `${ref.namaBase}${jenjang ? ' ' + jenjang : ''}`.
     - Jika `namaJabatan` OPD persis sama dengan `namaStandar` -> **VALID_REFERENCED** (Bukan Anomali).
     - Jika terdapat perbedaan kapitalisasi, spasi ganda, atau typo kecil -> Flag `TYPO_SPACE` atau `FUZZY_TYPO` dengan `rekomendasi` = `namaStandar`.
   - Jika `baseName` tidak ditemukan di Referensi -> Flag `UNREFERENCED` (Memberikan opsi **Pemetaan Manual ke Referensi**).

### C. Disparitas Kelas Jabatan (Nama Identik)
- Grouping semua entitas `Jabatan` berdasarkan nama ter-normalisasi.
- Hitung Modus (Dominan Grade) dan tandai record yang berbeda sebagai `DISPARITAS_KELAS`.

### D. Outlier Kelas Jabatan Struktural
- JPT Pratama (14/15), Administrator (11-12), Pengawas (8-9).

---

## 4. UI Component Updates

1. **Tombol "✨ Standardkan Nama"**:
   - Memungkinkan admin menerapkan `rekomendasi` nama terstandar dengan 1-klik.
2. **Modal "🔗 Pemetaan Manual Referensi"**:
   - Memungkinkan admin memilih Master Referensi dari dropdown + memilih Jenjang untuk menghasilkan nama terstandar bagi jabatan hasil import lama.

---

## 5. Rencana Pengujian

1. Running `npm run build` & `npx tsc --noEmit`.
2. Pengujian parsial parsing "Asisten Apoteker Mahir" -> Valid Referensi.
3. Deploy frontend (`firebase-tools deploy`) & GAS (`clasp push && clasp deploy -i ...`).
