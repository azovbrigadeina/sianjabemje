# Desain Spesifikasi: Rebranding Aplikasi ke "SI-PRABU Muaro Jambi"

- **Tanggal**: 2026-09-24
- **Topik**: Rebranding Tampilan Aplikasi (UI/Metadata) dengan Mempertahankan Codename Internal (`sianjab`)
- **Status**: Disetujui Pengguna

## 1. Latar Belakang & Tujuan
Aplikasi sebelumnya menggunakan nama tampilan **"SianjabABK EM-JE"** / **"Sianjab"**. Pengguna menginginkan pembaruan identitas (rebranding) menjadi:
- **Nama Utama**: **SI-PRABU Muaro Jambi**
- **Kepanjangan**: **Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja**

### Batasan Kritis (Non-Negotiable)
Untuk menjaga stabilitas sistem dan integrasi dengan aplikasi eksternal (seperti SiTPP dan SPT Digital):
1. **Codename Internal Tetap `sianjab`**:
   - Struktur Realtime Database Firebase & GAS endpoints tidak diubah.
   - Parameter integrasi API: parameter `&integrasi=SIANJAB` pada modul pengecekan SPT OPD tetap dipertahankan.
   - Kunci penyimpanan lokal (`localStorage`) dan Cookie autentikasi (`sianjab_token`, `sianjab_user`, `sianjab_active_year`, dll.) tetap dipertahankan agar sesi pengguna tidak terputus.
   - Prefix unik kode verifikasi fisik `BAGORMJ-` tetap utuh.

## 2. Arsitektur Solusi

### 2.1 File Konfigurasi Tunggal (`src/config/branding.ts`)
Membuat file sentral berisi data identitas merek agar seluruh aplikasi membaca dari sumber tunggal:
```typescript
export const BRANDING = {
  codename: "sianjab",
  shortName: "SI-PRABU",
  displayName: "SI-PRABU Muaro Jambi",
  fullName: "SI-PRABU (Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja)",
  tagline: "Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja",
  region: "Kabupaten Muaro Jambi",
  government: "Pemerintah Kabupaten Muaro Jambi",
  metaTitle: "SI-PRABU Muaro Jambi | Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja",
  metaDescription: "Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja Kabupaten Muaro Jambi",
};
```

### 2.2 Komponen & Halaman yang Diperbarui (Display Layer Saja)
1. **`src/app/layout.tsx`**: Title web browser, openGraph metadata, Twitter card, dan JSON-LD Structured Data.
2. **`src/app/page.tsx`**: Landing page hero title, deskripsi, dan navbar.
3. **`src/app/login/page.tsx`**: Form login judul dan identitas sistem.
4. **`src/app/dashboard/layout.tsx`**: Sidebar brand logo/teks ("SI-PRABU Muaro Jambi").
5. **`src/app/operator/layout.tsx`**: Sidebar brand logo/teks ("SI-PRABU Muaro Jambi").
6. **`src/app/dashboard/page.tsx`**: Ucapan selamat datang di dashboard admin.
7. **`src/app/organisasi/page.tsx`**: Header peta organisasi publik.
8. **`src/app/verify/page.tsx`**: Halaman verifikasi publik keabsahan dokumen.
9. **`src/components/DocumentVerificationFooter.tsx`**: Teks footer verifikasi dokumen hasil cetak.
10. **`src/components/QuickAbkModal.tsx`**: Teks banner info ABK.
11. **`src/app/dashboard/users/page.tsx`**: Label deskripsi pengaturan UI.

## 3. Rencana Pengujian & Verifikasi
1. Jalankan `npm run build` untuk memverifikasi tidak ada error sintaks/tipe data.
2. Verifikasi bahwa tidak ada parameter integrasi SPT (`&integrasi=SIANJAB`) yang terubah.
3. Verifikasi konsistensi tampilan nama baru di browser.
