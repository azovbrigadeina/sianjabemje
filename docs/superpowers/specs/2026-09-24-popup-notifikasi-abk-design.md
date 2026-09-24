# Desain: Modal Alert Popup untuk Tarik Anjab & Simpan Beban Kerja (ABK)

- **Tanggal**: 2026-09-24
- **Topik**: Notifikasi Popup Tengah Layar pada Beban Kerja
- **Status**: Disetujui Pengguna

## 1. Latar Belakang & Masalah
Pada modal pengisian Beban Kerja (ABK) baik di halaman Admin (`dashboard/beban-kerja`) maupun Operator (`operator/beban-kerja`):
- Ketika pengguna menekan tombol **"Tarik dari Anjab"**, proses penarikan data berjalan namun umpan balik visual tidak terlihat atau tertutup.
- Ketika pengguna menekan tombol **"Simpan"**, data tersimpan ke backend namun notifikasi visual tidak muncul.
- Pengguna membutuhkan konfirmasi visual yang tegas di tengah layar berupa modal dialog popup bertuliskan **"Tarik Anjab berhasil"** setelah menarik data dan **"Berhasil Disimpan"** setelah menyimpan data.

## 2. Spesifikasi Solusi

### 2.1 Komponen Modal Alert Popup
Komponen modal alert diletakkan di layer paling atas (`z-index: 10002`):
- **Backdrop**: Layar overlay gelap semi-transparan dengan efek *backdrop blur*, menutup seluruh layar.
- **Card Dialog**:
  - Ukuran proporsional, `max-width: 420px`, sudut membulat (*border-radius: 16px*), latar belakang adaptif terhadap tema sistem.
  - Ikon visual status:
    - Lingkaran hijau dengan icon centang `✓` untuk sukses.
    - Lingkaran kuning dengan icon tanda seru `!` untuk peringatan (misal jika Anjab kosong).
    - Lingkaran merah dengan icon silang `✕` untuk kegagalan.
  - Judul Dialog: Misal **"Berhasil"** atau **"Perhatian"**.
  - Pesan Dialog:
    - Selesai Tarik Anjab: **"Tarik Anjab berhasil"**
    - Selesai Simpan ABK: **"Berhasil Disimpan"**
    - Anjab kosong: **"Anjab masih kosong!"**
  - Tombol Aksi: Tombol **"OK"** dengan styling tombol primer untuk menutup dialog.
  - Interaksi Penutupan: Klik tombol "OK", klik ikon silang di sudut kanan atas dialog, klik area backdrop luar, atau menekan tombol `Escape`.

### 2.2 Berkas yang Dimodifikasi
1. `src/app/dashboard/beban-kerja/page.tsx`
2. `src/app/dashboard/beban-kerja/page.module.css`
3. `src/app/operator/beban-kerja/page.tsx`
4. `src/app/operator/beban-kerja/page.module.css`

### 2.3 Rencana Verifikasi
1. Uji build frontend (`npm run build`) untuk memastikan tidak ada kesalahan TypeScript / CSS / Sintaks.
2. Pastikan `z-index` popup berada di atas modal editor (`10002` > `1000`).
3. Pengujian alur:
   - Klik "Tarik dari Anjab" -> Memunculkan dialog popup "Tarik Anjab berhasil".
   - Klik "Simpan" -> Memunculkan dialog popup "Berhasil Disimpan".
