# Design Spec: Enforcement & Integrasi ABK pada Ekspor Word ANJAB

## 1. Context & Goal
Di aplikasi Sianjab, Laporan Analisis Jabatan (ANJAB) dan Analisis Beban Kerja (ABK) merupakan satu kesatuan dokumen resmi yang saling terkait. Sebelumnya, ketika pengguna menekan tombol "Unduh Word" di halaman Analisis Jabatan (`/analisis`), sistem tidak menyertakan data ABK yang tersimpan di database (`abkData`), atau menggunakan nilai default fallback (misalnya 0 atau angka belum terverifikasi) jika ABK belum pernah dihitung di menu Beban Kerja.

Dokumen spesifikasi ini mengatur pengetatan alur (*enforcement*) agar:
1. Ekspor Word dari halaman ANJAB selalu mengambil data ABK terbaru yang sah dari database.
2. Jika ABK untuk suatu Jabatan **belum pernah diisi/dihitung**, sistem mencegat aksi "Unduh Word" dan menampilkan **Quick ABK Modal** langsung di halaman ANJAB.
3. Pengguna dapat langsung memverifikasi/mengisi WKE, norma waktu, dan volume beban kerja di tempat, lalu menyimpan data ABK dan secara otomatis mengunduh dokumen Word yang 100% lengkap.

---

## 2. Component & Architecture Changes

### A. Tampilan UI Indikator Status ABK (Header Editor ANJAB)
- **Lokasi**: Di bagian header atas modal/form Editor ANJAB, tepat di area atas baris tombol aksi (di atas tombol `Unduh Word` / `Unduh SIASN`).
- **Desain**:
  - Badge / Status Chip yang bersih & kontras:
    - 🟢 **Status ABK: Terhitung** (jika data ABK sudah ada di database).
    - ⚠️ **Status ABK: Belum Dihitung** (jika data ABK belum pernah disimpan).
- **Pohon Jabatan (Luar)**: Tetap bersih tanpa penambahan badge baru agar tidak terlalu ramai.

---

### B. Komponen UI Baru: `QuickAbkModal` (`src/components/QuickAbkModal.tsx`)
Sebuah komponen modal interaktif yang menerima prop:
- `isOpen: boolean`
- `onClose: () => void`
- `jabatan: JabatanFull`
- `onSuccess: (savedAbkData: any) => void`

**Fitur & Interface Modal**:
- Header: *"Lengkapi Perhitungan ABK - [Nama Jabatan]"*
- Banner Informasi: Alert tip bahwa Laporan ANJAB & ABK adalah satu kesatuan dokumen resmi.
- Form Setting Dasar:
  - WKE (Waktu Kerja Efektif per tahun): Default `1250` jam (atau `72000` menit).
  - Satuan Waktu Penyelesaian: Options `Jam` (default) atau `Menit`.
- Tabel Ringkasan Tugas Pokok:
  - Uraian Tugas (Read-only dari ANJAB)
  - Hasil Kerja / Satuan (Read-only dari ANJAB)
  - Waktu Penyelesaian (Editable numeric input, default dari ANJAB)
  - Jumlah Hasil / Volume per Tahun (Editable numeric input, default dari ANJAB)
  - Hasil Kalkulasi otomatis per baris: Waktu Efektif = Waktu × Volume; Kebutuhan Pegawai = Waktu Efektif / WKE.
- Ringkasan Total Kebutuhan & Pembulatan Formasi di footer modal.
- Tombol Aksi: `[ Simpan ABK & Unduh Word ]` (dengan loading spinner saat menyimpan).

---

### C. Modifikasi Ekspor Word (`src/lib/exportDocx.ts`)
- Fungsi `exportJabatanToDocx(jabatan: JabatanFull, abkData?: any, ...)` diperbarui:
  - Jika `abkData` disertakan, gunakan baris `rows` dan `wke` dari `abkData` untuk menyusun variabel `tugasPokok`, `totalWaktuEfektif`, `totalKebutuhanPegawai`, dan `pembulatanFormasi`.
  - Jika `abkData` bernilai undefined atau kosong, lemparkan error/peringatan agar pemanggil menangani enforcement dengan benar.

---

### D. Modifikasi Halaman Analisis Jabatan (`src/app/dashboard/analisis/page.tsx` & `src/app/operator/analisis/page.tsx`)
1. **Pemuatan Data**:
   - Memanggil `api.getBulkData(['unitKerja', 'jabatan', 'abk', 'tugasPokok', ...])`.
   - Membuat `abkMap` (`Record<string, any>`) untuk pemetaan status dan data ABK berdasarkan `jabatanId`.
2. **Indikator Status di UI**:
   - Menampilkan badge status ABK di header Editor ANJAB di atas tombol `Unduh SIASN` / `Unduh Word`.
3. **Alur Intersepsi Unduh Word**:
   - Fungsi `handleExportDocx(jabatan)`:
     - Cek apakah `abkMap[jabatan.id]` ada.
     - **Jika Ada**: Panggil `exportJabatanToDocx(jabatan, abkMap[jabatan.id])`.
     - **Jika Belum**: Set `selectedJabatanForAbk = jabatan` dan buka `QuickAbkModal`.
4. **Callback `onSuccess` dari `QuickAbkModal`**:
   - Simpan data ABK baru ke state local `abkMap[jabatan.id] = newAbkData`.
   - Otomatis panggil `exportJabatanToDocx(jabatan, newAbkData)`.
   - Tampilkan toast pemberitahuan: *"Data ABK berhasil disimpan dan dokumen Word sedang diunduh."*

---

## 3. Data Flow & State Management

```
[ Aksi Pengguna: Klik 'Unduh Word' di /analisis ]
                      │
                      ▼
            { abkMap[jabatanId] ada? }
            /                        \
          YA                          TIDAK
          /                            \
         v                              v
[ Panggil exportJabatanToDocx ]   [ Tampilkan QuickAbkModal ]
(Pakai data ABK tersimpan)              │
                                        ▼
                            [ Pengguna Mengisi & Klik 'Simpan' ]
                                        │
                                        ▼
                            [ Call api.saveSingleEntity('abk') ]
                            (Invalidates cache & updates DB)
                                        │
                                        ▼
                            [ Update abkMap + Trigger Export ]
```

---

## 4. Kaidah & Quota Constraints Compliance
- **Performance**: Menggunakan `getBulkData` di awal pemuatan halaman untuk meminimalkan request ke GAS backend.
- **Cache Invalidation**: Penyimpanan ABK via `api.saveSingleEntity('abk', payload)` secara otomatis memicu `invalidateAllCache()` di client dan `invalidateCache_('abk')` di backend GAS.
- **Dynamic Import**: Import `exportJabatanToDocx` dilakukan secara dinamik (`await import("@/lib/exportDocx")`) saat tombol unduh dipicu untuk menjaga bundle size tetap ringan.

---

## 5. Verification Plan

### Automated Verification
- Run `npm run build` untuk memastikan tidak ada kesalahan TypeScript / build Next.js.

### Manual Verification
1. Uji ekspor Word pada Jabatan yang **sudah** memiliki data ABK: Pastikan angka ABK di dokumen Word sesuai persis dengan angka di menu Beban Kerja.
2. Uji ekspor Word pada Jabatan yang **belum** memiliki data ABK: Pastikan `QuickAbkModal` muncul, form pre-filled dari tugas pokok ANJAB, tombol simpan berhasil menyimpan ABK ke database, dan file Word langsung terunduh secara otomatis setelah disimpan.
