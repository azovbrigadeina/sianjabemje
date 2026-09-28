# Design Document: Duplikasi Unit Kerja & Struktur Jabatan (Universal Unit Cloning)

**Tanggal**: 28 September 2026  
**Status**: Disetujui  
**Target Route**: `/dashboard/opd`, `/dashboard/organisasi`  
**Backend**: Google Apps Script (`gas/Code.gs`), Firebase Realtime Database  
**Sistem Target**: Sianjab ABK EM-JE (Admin Dashboard)

---

## 1. Latar Belakang & Tujuan

Pada susunan organisasi Pemerintah Kabupaten Muaro Jambi, banyak unit kerja yang memiliki struktur nomenklatur jabatan dan uraian tugas yang identik, seperti:
- **Puskesmas**: Memiliki susunan seragam (Kepala Puskesmas, Kasubag Tata Usaha, Dokter, Dokter Gigi, Bidan, Perawat, Sanitarian, Nutrisionis, dll).
- **Sekolah**: Memiliki susunan seragam (Kepala Sekolah, Guru Kelas/Mapel, Tenaga Administrasi).
- **Kecamatan**: Memiliki susunan seragam (Camat, Sekcam, Kasi Tata Pemerintahan, Kasi Trantib, Kasubag Umum/Kepegawaian, dll).

Ketika dibentuk unit kerja baru (misal pemekaran kecamatan atau pembangunan puskesmas baru), admin atau operator sebelumnya harus menginput puluhan jabatan dan ratusan butir uraian tugas (anjab) satu per satu secara manual, yang memakan waktu berhari-hari dan rawan salah ketik.

Fitur **Duplikasi Unit Kerja & Struktur Jabatan** memungkinkan Administrator untuk:
1. Menyalin seluruh pohon jabatan dari satu Unit Kerja (OPD maupun Sub-Unit) ke unit kerja lain dalam hitungan detik.
2. Menyalin seluruh uraian Anjab lengkap (Kualifikasi, Syarat Jabatan, Tugas Pokok, Bahan/Perangkat Kerja, Tanggung Jawab, Wewenang, Korelasi, dll) dengan mereset nilai jumlah pegawai riil di ABK ke 0.
3. Memilih mode: **Buat Unit Baru Sekaligus Duplikasi** (1 langkah) ATAU **Salin ke Unit yang Sudah Ada**.
4. Melindungi proses dengan **Konfirmasi Berlapis (Two-Step Confirmation Review)** untuk mencegah kelalaian admin salah memilih OPD induk atau unit sasaran.

---

## 2. Arsitektur Backend & Integritas Data (`gas/Code.gs`)

### A. Endpoint API Baru
Menambahkan action baru pada `handleRequest_` di `Code.gs`:
```javascript
case 'duplicateUnitKerja':
  result = duplicateUnitKerja_(params);
  break;
```

### B. Parameter `duplicateUnitKerja_`
```typescript
interface DuplicateUnitKerjaParams {
  sourceUnitId: string;
  mode: 'createNew' | 'existing';
  targetData: {
    // Mode createNew:
    nama?: string;
    kode?: string;
    parentId?: string; // ID OPD Induk (jika sub-unit) atau kosong (jika OPD mandiri)
    urutan?: number;
    // Mode existing:
    targetUnitId?: string;
  };
}
```

### C. Alur Algoritma Backend:
1. **Validasi Sumber & Keunikan Kode**:
   - Ambil seluruh jabatan aktif untuk tahun berjalan (`2026/jabatan`).
   - Filter jabatan yang memiliki `unitKerjaId === sourceUnitId`. Jika jumlahnya 0, tolak dengan pesan: *"Unit sumber tidak memiliki data jabatan untuk diduplikasi."*
   - Jika mode `createNew`, periksa keunikan `targetData.kode`. Jika kode sudah digunakan oleh unit lain, tolak dengan pesan ramah.
2. **Pembuatan Unit Kerja Target**:
   - Jika `mode === 'createNew'`:
     - Buat ID unik unit kerja baru dari kode atau `Utilities.getUuid()`.
     - Simpan atribut `nama`, `kode`, `parentId` (jika ada), `urutan`, `tahun: '2026'`, `statusValidasi: 'Draft'`, `createdAt`, dan `updatedAt`.
     - `targetUnitId` = ID unit kerja baru tersebut.
   - Jika `mode === 'existing'`:
     - `targetUnitId` = `targetData.targetUnitId`.
3. **Penyalinan Pohon Jabatan dengan ID Mapping**:
   - Inisialisasi tabel pemetaan `idMap = {}` (`oldJabatanId ➔ newJabatanId`).
   - Untuk setiap jabatan di unit sumber:
     - Generate `newJabatanId = Utilities.getUuid()`.
     - Catat di `idMap[oldJbt.id] = newJabatanId`.
   - Untuk setiap jabatan baru:
     - Salin atribut: `namaJabatan`, `kodeJabatan`, `jenisJabatan`, `kelasJabatan`, `level`, `ikhtisarJabatan`, `urutan`, `tahun`.
     - Set `unitKerjaId = targetUnitId`.
     - Perbarui `parentId`:
       - Jika `oldJbt.parentId` terdaftar di `idMap`, maka `newJbt.parentId = idMap[oldJbt.parentId]` (menjaga pohon hirarki atasan-bawahan internal unit tetap 100% utuh).
       - Jika `oldJbt.parentId` tidak terdaftar di `idMap` (misal atasan di luar unit/di OPD induk), pertahankan atau biarkan sesuai struktur.
4. **Penyalinan Uraian Anjab Lengkap & Reset ABK**:
   - Daftar tabel anak yang disalin:
     `'kualifikasi'`, `'syaratJabatan'`, `'hasilKerja'`, `'prestasiKerja'`, `'tugasPokok'`, `'bahanKerja'`, `'perangkatKerja'`, `'tanggungJawab'`, `'wewenang'`, `'korelasiJabatan'`, `'kondisiLingkungan'`, `'risikoBahaya'`.
   - Setiap baris anak diberi ID baru unik, dan atribut `jabatanId` serta `parentId` diarahkan ke `idMap[oldJabatanId]`.
   - Untuk tabel `'abk'`:
     - Disalin strukturnya/tugasnya, tetapi kolom jumlah pegawai riil (`jumlahPegawai`, `pegawaiSaatIni`, dsb) di-reset ke `0`.
5. **Atomic Batch Write (`fbPatch_`)**:
   - Seluruh payload unit baru, jabatan baru, dan tabel anak dikumpulkan ke dalam memori GAS.
   - Dieksekusi ke Firebase Realtime Database menggunakan operasi batch `fbPatch_` dalam 1 kali round-trip HTTP.
   - Waktu eksekusi sangat cepat (~1-2 detik) dan anti-timeout.
6. **Invalidasi Cache**:
   - Memanggil `invalidateAllCaches_()` di server GAS.

---

## 3. Desain Antarmuka (UI) & Dialog Konfirmasi Berlapis

### A. Lokasi Tombol Akses
- Ditambahkan tombol utama di toolbar halaman:
  - `/dashboard/opd`
  - `/dashboard/organisasi`
- Label: **`📋 Duplikasi Unit & Jabatan`**.

### B. Modal Interaktif 2-Langkah (Wizard)

#### Langkah 1: Form Pemilihan Data
- **Pilihan Mode**:
  - `[🔘 Buat Unit Kerja Baru & Salin Jabatan]` (Default)
  - `[🔘 Salin ke Unit Kerja yang Sudah Ada]`
- **Pilih Unit Sumber**:
  - Dropdown pencarian seluruh Unit Kerja (menampilkan nama unit, kode, dan jumlah jabatannya).
- **Jika Mode Buat Unit Baru**:
  - Input: *Nama Unit Baru* (misal: `"Puskesmas Bahar Selatan"`).
  - Input: *Kode Unit Baru* (misal: `"PKM_BHR_02"`).
  - Dropdown: *OPD Induk* (otomatis terisi mengikuti parent dari unit sumber, dengan opsi "Tingkat OPD Mandiri / Tanpa Induk" jika menduplikasi OPD seperti Kecamatan).
- **Jika Mode Salin ke Unit Ada**:
  - Dropdown: *Pilih Unit Sasaran* (menampilkan unit kerja tujuan dan OPD induknya).
- Tombol aksi: `Batal` dan `Lanjut ke Konfirmasi ➡️`.

#### Langkah 2: Dialog Konfirmasi Berlapis (Summary Review)
Layar modal berubah menampilkan kartu ringkasan visual dengan warna peringatan yang jelas:
```
⚠️ KONFIRMASI TINDAKAN DUPLIKASI

• Unit Sumber  : [Nama Unit Sumber] ([X] Jabatan)
• Unit Tujuan  : [Nama Unit Sasaran]
• OPD Induk    : [Nama OPD Induk]
• Cakupan Data : Menyalin [X] Jabatan + Seluruh Uraian Tugas Anjab (ABK di-reset 0)

--------------------------------------------------------------------------
Pertanyaan Konfirmasi:
👉 "Apakah Anda yakin akan menduplikasi seluruh jabatan dari [Unit Sumber] lalu membuat unit baru ke [Unit Sasaran] di bawah naungan [OPD Induk]?"
(atau untuk unit yang ada: "Apakah Anda yakin akan menduplikasi seluruh jabatan dari [Unit Sumber] ke unit sasaran [Unit Sasaran] di bawah naungan [OPD Induk]?")
--------------------------------------------------------------------------
```
- Tombol:
  - `⬅️ Kembali & Periksa Ulang` (mengembalikan ke Langkah 1 untuk edit).
  - `✅ Ya, Lanjutkan Duplikasi` (mengeksekusi API).

#### Respon & Update Reaktif
- Saat diproses, tombol menampilkan indikator loading (*"Sedang menduplikasi [X] jabatan..."*).
- Setelah sukses:
  - Menampilkan toast sukses: *"✅ Berhasil menduplikasi [X] jabatan ke [Nama Unit Sasaran]!"*
  - Data pohon organisasi / tabel unit kerja langsung di-refresh otomatis di frontend (`loadData(true)`).

---

## 4. Rencana Verifikasi & Pengujian

1. **GAS Backend Verification**:
   - Uji pemanggilan `duplicateUnitKerja_` dengan unit uji (misal duplikasi Puskesmas atau unit sejenis).
   - Verifikasi integritas ID: pastikan `parentId` jabatan baru mengarah ke ID atasan baru, bukan atasan lama.
   - Verifikasi uraian Anjab tersalin lengkap dan ABK pegawai riil bernilai 0.
2. **Frontend Typecheck & Build**:
   - Jalankan `npx tsc --noEmit` untuk memastikan tidak ada kesalahan tipe TypeScript.
   - Jalankan `npm run build` untuk memverifikasi proses build Next.js sukses.
3. **Manual Flow Verification**:
   - Buka modal duplikasi, uji validasi input kosong.
   - Uji alur 2 langkah: pastikan ringkasan nama unit dan OPD induk tertulis jelas sebelum tombol final ditekan.
   - Periksa apakah unit baru dan seluruh jabatannya langsung tampil di bagan organisasi.
