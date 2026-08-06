# Spesifikasi Desain: Fitur Keabsahan & Verifikasi Dokumen Laporan (BAGORMJ)

## 1. Ringkasan Fitur
Fitur Keabsahan Dokumen menambahkan mekanisme identifikasi dan verifikasi keaslian dokumen laporan (Analisis Jabatan, Beban Kerja, Peta Jabatan) yang dicetak atau diexport dari **Sistem Terpadu Analisis Jabatan & Beban Kerja Pemerintah Kabupaten Muaro Jambi (SianjabABK EM-JE)** yang dikembangkan oleh Bagian Organisasi Kabupaten Muaro Jambi.

setiap cetakan/ekspor laporan akan dilengkapi dengan **Kode Verifikasi Unik** berawalan `BAGORMJ-` dan **QR Code** yang memuat link verifikasi publik. Siapapun yang memindai QR Code atau membuka link verifikasi dapat mengonfirmasi keaslian data dokumen tersebut langsung dari aplikasi tanpa memerlukan hak akses login.

---

## 2. Format Kode Verifikasi & Alur Identifikasi Dokumen

### Format Kode Unik
- **Prefix**: `BAGORMJ` (Menandakan dokumen sah buatan Bagian Organisasi Kab. Muaro Jambi).
- **Format**: `BAGORMJ-YYYYMMDD-[HASH_6]`
- **Contoh**: `BAGORMJ-20260806-A9B8C7`

### Pembuatan Hash & Log Dokumen
1. Ketika pengguna menekan tombol Cetak/Export (DOCX/Print Layar):
   - Sistem membangkitkan `hash` 6 karakter berbasis timestamp, ID OPD, ID Jabatan, dan ID User.
   - Sistem membuat record di database/state log keabsahan (metadata: kode verifikasi, nama OPD, nama jabatan/dokumen, tanggal cetak, pencetak, jumlah formasi/ringkasan data).
2. Kode verifikasi dan URL verifikasi (`/verify/[code]` atau `/verifikasi?code=BAGORMJ-...`) disisipkan ke QR Code.

### Blok Footer Keabsahan pada Dokumen Cetak / Export
Teks keabsahan ditempatkan di bagian footer dokumen (cetakan print maupun ekspor file Word `.docx`):
> **Pemerintah Kabupaten Muaro Jambi — Bagian Organisasi**  
> *Sistem Terpadu Analisis Jabatan & Beban Kerja (SianjabABK EM-JE)*  
> Dokumen ini terdaftar resmi secara digital dengan Kode Verifikasi: **BAGORMJ-20260806-A9B8C7**  
> Keabsahan dokumen ini dapat diverifikasi melalui QR Code di atas atau tautan: `https://<domain>/verify/BAGORMJ-20260806-A9B8C7`

---

## 3. Halaman Verifikasi Publik (`src/app/verify/[code]/page.tsx` atau `/verifikasi`)

Halaman publik yang dapat diakses bebas tanpa login oleh instansi, auditor, maupun publik.

### Komponen Visual Halaman Verifikasi:
1. **Header Instansi**:
   - Logo Kabupaten Muaro Jambi
   - Nama Sistem: **Sistem Terpadu Analisis Jabatan & Beban Kerja (SianjabABK EM-JE)**
   - Subtitle: *Portal Verifikasi Keabsahan Dokumen Resmi — Bagian Organisasi Pemkab Muaro Jambi*
2. **Status Keabsahan Dokumen**:
   - **Status VALID**: Badge Hijau mencolok `✓ DOKUMEN RESMI & TERVERIFIKASI`
   - **Status INVALID / TIDAK DITEMUKAN**: Badge Merah `✕ KODE VERIFIKASI TIDAK TERDAFTAR`
3. **Kartu Informasi Metadata Dokumen**:
   - **Kode Verifikasi**: `BAGORMJ-20260806-A9B8C7`
   - **Jenis Dokumen**: Laporan Analisis Jabatan & Beban Kerja (ABK)
   - **Perangkat Daerah (OPD)**: Nama OPD terkait
   - **Unit Kerja / Jabatan**: Nama Jabatan terkait
   - **Tanggal Penerbitan**: Tanggal & jam cetak dokumen
   - **Pencetak / Operator**: Nama User / Operator OPD
   - **Ringkasan Data**: Kebutuhan Pegawai (Formasi), Beban Kerja Total, Status Validasi Admin (Disetujui/Draft)

---

## 4. Rencana Perubahan Komponen Codebase

1. **Util Verification (`src/lib/verification.ts`)**:
   - Fungsi generate code `generateVerificationCode()` dengan format `BAGORMJ-...`.
   - Fungsi penyimpan log cetak dokumen & pembacaan data verifikasi.
2. **Komponen Footer & QR Code (`src/components/DocumentVerificationFooter.tsx`)**:
   - Reusable React component yang merender QR Code (menggunakan SVG/Canvas atau QR library) dan teks keabsahan untuk mode `window.print()`.
3. **Ekspor Word (`src/lib/exportDocx.ts`)**:
   - Penambahan paragraf footer keabsahan & QR Code image di bagian akhir file `.docx`.
4. **Halaman Publik Verifikasi (`src/app/verify/[code]/page.tsx`)**:
   - Halaman Next.js publik untuk menangani URL verifikasi `BAGORMJ-xxx`.

---

## 5. Uji Coba & Verifikasi
- Menguji generate kode `BAGORMJ-YYYYMMDD-XXXXXX`.
- Menguji hasil ekspor DOCX dan tampilan cetak layar apakah QR Code dan footer keabsahan muncul dengan rapi.
- Memindai QR Code menggunakan smartphone untuk memastikan diarahkan ke halaman `/verify/BAGORMJ-...` dan menampilkan badge hijau "DOKUMEN RESMI & TERVERIFIKASI".
