# Design Document: Deteksi & Penghapusan Anomali JF Jenjang Ahli Utama

**Tanggal**: 28 September 2026  
**Status**: Disetujui  
**Target Route**: `/dashboard/investigasi`  
**Sistem Target**: Sianjab ABK EM-JE (Admin Dashboard)

---

## 1. Latar Belakang & Tujuan

Pada susunan organisasi pemerintah tingkat kabupaten/kota, Jabatan Fungsional (JF) jenjang **Ahli Utama** secara regulasi dan formasi kepegawaian sangat jarang atau tidak ada, karena formasi Ahli Utama umumnya dialokasikan pada instansi pemerintah pusat (kementerian/lembaga) atau tingkat provinsi.

Namun, di sistem Sianjab terdapat kemungkinan data jabatan fungsional jenjang Ahli Utama yang masuk akibat kesalahan input, import data historis, atau duplikasi tanpa formasi valid. Fitur ini menambahkan deteksi audit otomatis pada menu Investigasi & Audit di bawah tab **Outlier Struktural**, serta menyediakan aksi **Hapus Permanen** per baris untuk membersihkan jabatan fungsional tersebut secara aman beserta seluruh relasi datanya (*cascading delete*).

---

## 2. Arsitektur & Model Data

### A. Perluasan Tipe Anomali (`src/lib/investigasiUtils.ts`)
Menambahkan tipe anomali baru:
```typescript
export type AnomaliType =
  | 'TYPO_SPACE'
  | 'FUZZY_TYPO'
  | 'UNREFERENCED'
  | 'DISPARITAS_KELAS'
  | 'OUTLIER_STRUKTURAL'
  | 'OUTLIER_JENJANG_UTAMA'
  | 'DATA_YATIM';
```

### B. Algoritma Deteksi di `analyzeAnomali`
Pada saat iterasi validasi `validJabatans`:
1. Parse jenjang nama jabatan menggunakan helper yang sudah ada: `parseJenjangJabatan(j.namaJabatan)`.
2. Evaluasi apakah:
   - `parsed.jenjang === 'Ahli Utama'`, ATAU
   - Nama jabatan mengandung frase kata `/\bahli\s+utama\b/i` pada jabatan yang bukan merupakan Jabatan Pimpinan Tinggi (JPT).
3. Jika kondisi terpenuhi:
   - Tambahkan ke daftar `rawAnomaliOutlier` dengan atribut:
     - `type`: `'OUTLIER_JENJANG_UTAMA'`
     - `severity`: `'Tinggi'`
     - `pesan`: `'Jabatan Fungsional jenjang Ahli Utama tidak diperkenankan pada instansi tingkat Kabupaten'`
     - `rekomendasi`: `'Hapus jabatan ini jika tidak ada formasi di Kabupaten, atau sesuaikan ke jenjang Madya/Muda/Pertama'`
     - `parsedJenjang`: `'Ahli Utama'`
4. Hasil deteksi tetap mendukung sistem pengecualian (`anomaliExclusion`) jika di kemudian hari ada formasi khusus yang sah.

---

## 3. Desain Antarmuka (UI) & Alur Pengguna

### A. Tampilan Tab Outlier di `/dashboard/investigasi`
- Temuan `OUTLIER_JENJANG_UTAMA` dikelompokkan dan ditampilkan di tab **Outlier Struktural**.
- Kolom **Analisa & Temuan** menampilkan pesan ketidaksesuaian formasi kabupaten beserta badge tingkat risiko **Tinggi**.
- Pada kolom **Aksi**:
  - Tombol **`🗑️ Hapus Permanen`** ditampilkan khusus untuk baris dengan tipe `OUTLIER_JENJANG_UTAMA` (dan `DATA_YATIM`).
  - Baris anomali struktural biasa (`OUTLIER_STRUKTURAL`) tidak memiliki tombol hapus untuk mencegah insiden terhapusnya jabatan struktural penting.
  - Tombol standar lainnya tetap aktif: `✏️ Koreksi`, `🚫 Kecualikan`, dan `🗺️ Peta`.

### B. Modal Konfirmasi & Keamanan Penghapusan
1. Klik `🗑️ Hapus Permanen` membuka modal konfirmasi yang menampilkan:
   - Nama Jabatan yang akan dihapus.
   - Nama OPD / Unit Kerja asal.
   - Peringatan bahwa aksi ini akan menghapus data jabatan dan membersihkan data terkait (ABK, kualifikasi, tugas pokok).
2. Ketika dikonfirmasi, sistem memanggil `api.deleteEntity('jabatan', item.jabatanId)`.
3. Setelah API sukses merespons:
   - State `jabatans` diperbarui secara reaktif (`setJabatans(prev => prev.filter(j => j.id !== id))`).
   - Baris temuan langsung hilang seketika tanpa perlu memuat ulang halaman (zero reload).
4. Penanganan Kesalahan:
   - Jika jabatan memiliki bawahan langsung terikat, backend GAS akan mengembalikan error informatif dan sistem menampilkan alert kepada pengguna.

---

## 4. Alur Backend & Integritas Data

Operasi `deleteEntity('jabatan', id)` memanfaatkan fungsi backend GAS `deleteRecord_('jabatan', id)`:
1. **Validasi Hirarki**: Memastikan jabatan tidak memiliki bawahan langsung aktif (`childJbtCount === 0`).
2. **Cascading Delete**: Menghapus seluruh entitas anak terkait (`kualifikasi`, `syaratJabatan`, `hasilKerja`, `prestasiKerja`, `abk`, `tugasPokok`, `bahanKerja`, `perangkatKerja`, `tanggungJawab`, `wewenang`, `korelasiJabatan`, `kondisiLingkungan`, `risikoBahaya`).
3. **Invalidasi Cache**: Memanggil `invalidateCache_()` di server GAS dan `invalidateAllCache()` di client Next.js untuk menjamin konsistensi data instan.

---

## 5. Rencana Verifikasi & Pengujian

1. **Static Analysis & Type Checking**:
   - Jalankan `npx tsc --noEmit` untuk memastikan tidak ada kesalahan tipe TypeScript pada `AnomaliType` atau komponen Investigasi.
2. **Build Verification**:
   - Jalankan `npm run build` untuk memverifikasi halaman `/dashboard/investigasi` terkompilasi bersih tanpa error.
3. **Pemeriksaan Fungsional**:
   - Verifikasi apakah jabatan fungsional dengan jenjang "Ahli Utama" berhasil terdeteksi dan masuk ke tab Outlier dengan badge risiko Tinggi.
   - Verifikasi tombol `🗑️ Hapus Permanen` hanya muncul di baris JF Ahli Utama (dan Data Yatim), tidak muncul di Outlier struktural lain.
   - Verifikasi modal konfirmasi dan alur pembaruan state lokal saat penghapusan berhasil.
