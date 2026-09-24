# Dokumen Desain Teknis: Optimasi Performa Pemuatan Data & Arsitektur Caching Sianjab

## 1. Latar Belakang & Masalah
Sianjab digunakan bersamaan oleh 42+ OPD dengan kuota Google Apps Script (GAS) sebesar 30 concurrent executions. Terdapat beberapa inefisiensi utama pada pemuatan data:
1. **Pemuatan Pohon Struktur Jabatan Berlebihan (Over-fetching Payload)**:
   Halaman Analisis dan Beban Kerja saat ini memanggil `getBulkData` untuk 7 entitas lengkap: `unitKerja`, `jabatan`, `abk`, `tugasPokok`, `syaratJabatan`, `kualifikasi`, dan `bahanKerja`. Data teks lengkap (uraian tugas, syarat, dsb.) diunduh se-kabupaten (~2–4 MB) hanya untuk mengecek apakah suatu jabatan memiliki data (menentukan badge centang hijau `anjabTerisi` & `abkTerisi`).
2. **Bottleneck Ekstrem `getJabatanFull`**:
   Saat jabatan diklik di pohon, backend GAS membaca 13 entitas seluruh kabupaten di memori untuk mencari data 1 jabatan, memakan waktu 2–5 detik per klik karena tidak memiliki cache mandiri.
3. **Cache Klien URL-Exact & Invalidation Penuh**:
   Klien meng-cache berdasarkan string URL mentah, sehingga data `unitKerja` atau `jabatan` tidak bisa dibagi antar-halaman yang memanggil daftar entitas berbeda. Selain itu, setiap simpan data apapun memicu `invalidateAllCache()` yang menghapus seluruh memori & IndexedDB.
4. **Redundant Fetch di Layout**:
   `dashboard/layout.tsx` dan `operator/layout.tsx` melakukan fetch terpisah untuk tema, tahun aktif, dan nama unit kerja pada setiap mount.

---

## 2. Solusi & Arsitektur

### A. Backend GAS (`gas/Code.gs`)
1. **Dedicated Cache untuk `getJabatanFull_(jabatanId)`**:
   - Cache key: `fb_{CURRENT_TAHUN}_jfull_{jabatanId}` menggunakan GAS `CacheService.getScriptCache()` dengan TTL 300 detik (5 menit).
   - Saat `getJabatanFull_` dipanggil, periksa cache ini terlebih dahulu. Jika *hit*, kembalikan seketika (< 100 ms).
   - Invalidation otomatis: Pada setiap fungsi simpan yang mengubah data jabatan (`saveSingleEntity_`, `saveMultiEntity_`, `saveBulkAnjabData`, `updateJabatan`), panggil `removeLargeCache_('fb_' + CURRENT_TAHUN + '_jfull_' + jabatanId)`.
2. **Lightweight Status Endpoint / Parameter Ringkas Pohon**:
   - Endpoint aksi baru: `getAnjabStatusSummary`.
   - Mengembalikan daftar ID jabatan yang terisi Anjab dan ABK dalam bentuk array ID ringkas:
     ```json
     {
       "anjabFilled": ["id1", "id2"],
       "abkFilled": ["id1"]
     }
     ```
   - Halaman pohon Analisis & Beban Kerja cukup memanggil `getBulkData(['unitKerja', 'jabatan'])` ditambah `getAnjabStatusSummary`. Ukuran payload berkurang dari ~3 MB menjadi < 80 KB (pemangkasan payload ~97%).
3. **Cetak Rekap / Bulk Anjab per Unit Kerja**:
   - Tambahkan kemampuan filter `unitKerjaId` pada pembacaan multi-entitas di backend untuk fitur unduh laporan, sehingga tidak mengunduh data seluruh kabupaten jika hanya mencetak 1 OPD.

### B. Client-side API & Caching (`src/lib/api.ts`)
1. **Entity-Level Store**:
   - Memecah hasil respons `getBulkData` ke cache per entitas (`unitKerja`, `jabatan`, dsb.).
   - Panggilan individual seperti `getUnitKerja()` dapat langsung dilayani dari cache lokal tanpa request jaringan tambahan jika entitas tersebut sudah ada di cache.
2. **Targeted / Granular Invalidation**:
   - Ketika menyimpan sub-entitas jabatan (tugas pokok, syarat jabatan, kualifikasi, dsb.), hanya hapus cache entitas tersebut dan cache spesifik `jabatanFull_{jabatanId}`.
   - Cache `unitKerja`, `referensiJabatan`, dan `settings` tetap utuh.
3. **Optimistic Tree Status Update**:
   - Saat pengguna menyimpan tugas pokok atau syarat pertama kali pada suatu jabatan di editor, state pohon lokal langsung di-update menjadi `anjabTerisi = true` seketika tanpa perlu memuat ulang pohon se-kabupaten.

### C. Konsolidasi Layout (`layout.tsx`)
1. Menggunakan data OPD dan setting yang tersimpan di sesi lokal (`sianjab_user` dan `localStorage`) saat inisialisasi awal.
2. Menghindari pemanggilan terpisah `getUnitKerja`, `getThemeSetting`, dan `getActiveYearSetting` di layout pada setiap navigasi halaman.

---

## 3. Penanganan Error & Keandalan Data
1. **Jaminan Anti-Stale Data**:
   - Setiap write operation tetap berjalan serial di antrian klien (`writeQueuePromise`) untuk mencegah race condition.
   - Invalidation langsung menghapus cache jabatan terkait baik di klien maupun backend GAS.
2. **Fallback Jaringan**:
   - Jika endpoint ringkasan mengalami kegagalan, sistem memiliki fallback graceful ke metode normal.
   - Tetap mempertahankan batas waktu 30 detik dan mekanisme 1x auto-retry.

---

## 4. Rencana Pengujian
1. Verifikasi tipe TypeScript (`npx tsc --noEmit --incremental false`).
2. Uji alur simpan:
   - Edit tugas pokok pada Jabatan A -> Simpan -> Pindah ke tab lain -> Pindah ke Jabatan B -> Kembali ke Jabatan A -> Pastikan data terbaru muncul.
3. Verifikasi badge pohon:
   - Pastikan indikator status centang hijau terisi muncul dengan benar menggunakan ringkasan status ringan.
4. Uji perpindahan halaman:
   - Dari Organisasi ke Analisis ke Beban Kerja: pastikan data master `unitKerja` dan `jabatan` langsung instan dari cache lokal.
