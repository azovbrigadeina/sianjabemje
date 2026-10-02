# Spesifikasi Desain Tahap 3: Pembersihan Redundansi AI, Keamanan Token SPT, Konsistensi Mutasi OPD, & Konsolidasi Konstanta Tahun (N9, N10, N11, N12, N13)

Tanggal: 2 Oktober 2026  
Status: Menunggu Review Pengguna  
Target: Sistem Sianjab (Next.js Frontend & Google Apps Script Backend)

---

## 1. Latar Belakang & Tujuan

Tahap 3 berfokus pada efisiensi data transfer, perlindungan rahasia integrasi antar-sistem, pencegahan mutasi data ganda di antarmuka organisasi, serta penyatuan konstanta tahun sistem:
- **N9 (Normalisasi AI):** Menghilangkan duplikasi logika normalisasi draf AI antara server dan client. Normalisasi komprehensif tetap berada di server GAS sebagai SSOT, sementara client hanya menerapkan *null-safety guard* ringan.
- **N10 (Token SPT):** Mengeliminasi kebocoran `NEXT_PUBLIC_SPT_DIGITAL_TOKEN` dari bundle JavaScript publik dengan memindahkan verifikasi SPT OPD ke action server GAS (`checkSptOpd`).
- **N11 (Statistik Log Keamanan):** Memperbaiki penamaan statistik kartu pada dashboard log keamanan agar akurat dan tidak menyesatkan terhadap batasan 200 record log terbaru.
- **N12 (Mutasi OPD Tanpa Duplikasi):** Mengoreksi `handleModalSave` pada unit kerja (OPD) agar tahun parent dipasang sebelum entitas dibuat, mencegah pemanggilan ganda `createEntity` lalu `updateUnitKerja`, serta memvalidasi ketersediaan `id` hasil pembuatan.
- **N13 (Konsolidasi Konstanta Tahun):** Menyediakan konstanta terpusat di `src/lib/constants.ts` dan mengganti seluruh sisa fallback hardcoded `|| '2026'` di berbagai file client & backend.

---

## 2. Arsitektur & Spesifikasi Teknis

### A. Penyederhanaan Normalisasi AI Client (`src/lib/api.ts` — N9)

1. **Server (`gas/Code.gs`):**
   - Tetap mempertahankan `normalizeAiAnjabDraft_(data)` sebagai pelindung skema utama.
   - Menjamin bahwa seluruh respon dari `generateAnjabWithAI` sudah memuat array yang rapi untuk kualifikasi, syarat jabatan, tabel multi-row, serta objek hasil/prestasi kerja.
2. **Client (`src/lib/api.ts`):**
   - Menghapus implementasi panjang (97 baris) `normalizeAiAnjabDraft` yang rawan beda tafsir (drift).
   - Menggantinya dengan fungsi guard sederhana `ensureAiAnjabDraft(data: any): any` yang hanya memastikan fallback array kosong jika respon bernilai null/undefined tanpa merombak kembali struktur data yang telah dirapikan server.

---

### B. Proteksi Token Integrasi SPT Digital (`gas/Code.gs` & `src/app/dashboard/users/page.tsx` — N10)

1. **Backend GAS (`gas/Code.gs`):**
   - Menambahkan action baru: `checkSptOpd`.
   - Mengambil URL dan Token dari Script Properties GAS:
     - `SPT_DIGITAL_URL` (default fallback ke URL SPT Kabupaten Muaro Jambi).
     - `SPT_DIGITAL_TOKEN` (kredensial tersimpan aman di server GAS, tidak pernah dikirim ke browser).
   - Server membaca unit kerja dari Firebase, melakukan HTTP request `UrlFetchApp.fetch` ke endpoint SPT Digital, lalu mengembalikan status `{ success: true, hasSubmitted: boolean, namaAdmin: string, nipAdmin: string }`.
2. **Frontend (`src/app/dashboard/users/page.tsx` & `.env.local`):**
   - Menghapus pembacaan `process.env.NEXT_PUBLIC_SPT_DIGITAL_TOKEN`.
   - Mengganti fetch langsung dari browser dengan pemanggilan `api.checkSptOpd(opdId)`.
   - Menghapus variabel `NEXT_PUBLIC_SPT_DIGITAL_TOKEN` dari konfigurasi bundle client.

---

### C. Klarifikasi Statistik Log Keamanan (`src/app/dashboard/log-keamanan/page.tsx` — N11)

1. Server membatasi pembacaan log keamanan hingga 200 record terbaru untuk menjaga performa response time.
2. Kartu statistik pada antarmuka admin disesuaikan labelnya secara transparan:
   - "Total Percobaan (200 Terkini)"
   - "Berhasil Masuk (200 Terkini)"
   - "Gagal / Ditolak (200 Terkini)"
3. Menambahkan catatan informatif di bagian header tabel: *"Menampilkan riwayat 200 aktivitas keamanan sistem terbaru."*

---

### D. Perbaikan Mutasi Unit Kerja / OPD (`src/app/dashboard/opd/page.tsx` — N12)

1. **Penetapan Tahun Sebelum Simpan:**
   - Jika membuat unit kerja baru di bawah parent (`modalData.parentId`), sistem mencari data parent di `rawOpds`.
   - Bila parent memiliki tahun kerja spesifik, nilai `opdPayload.tahun` langsung diisi mengikuti parent **sebelum** memanggil `api.createEntity`.
2. **Eliminasi Round-Trip Update Kedua:**
   - Menghilangkan blok kode yang memanggil `api.updateUnitKerja` segera setelah `api.createEntity`.
3. **Guard Validasi ID:**
   - Menambahkan validasi: `if (!opdCreated || !opdCreated.id) throw new Error("Gagal membuat unit kerja: Server tidak mengembalikan ID entitas.");`
   - Mencegah timbulnya node orphan di antarmuka jika terjadi kegagalan jaringan parsial.

---

### E. Konsolidasi Konstanta Tahun (`src/lib/constants.ts` & Berbagai File — N13)

1. **Pembuatan `src/lib/constants.ts`:**
   ```typescript
   export const DEFAULT_YEAR = "2026";
   export const SUPPORTED_YEARS = ["2025", "2026", "2027", "2028", "2029", "2030"];
   export function getActiveYear(): string {
     if (typeof window !== "undefined") {
       return localStorage.getItem("sianjab_active_year") || DEFAULT_YEAR;
     }
     return DEFAULT_YEAR;
   }
   ```
2. **Pembersihan Fallback Tersebar:**
   - Mengganti seluruh `|| '2026'` di `src/lib/api.ts` dengan pemanggilan `getActiveYear()` atau `DEFAULT_YEAR`.
   - Menyeragamkan pemakaian di modul `organisasi`, `opd`, `analisis`, dan `beban-kerja`.
   - Pada `gas/Code.gs:2352` (`duplicateUnitKerja_`), gunakan konstanta `CURRENT_TAHUN`.

---

## 3. Rencana Verifikasi

1. **Verifikasi Statik & Build:**
   - `npx tsc --noEmit --incremental false` (harus 0 error).
   - `npm run build` (harus menghasilkan static export di folder `out/` tanpa peringatan breaking).
2. **Uji Fungsional & Keamanan:**
   - Verifikasi bahwa `generateAnjabWithAI` tetap mengembalikan data draft yang utuh dan aman dirender di halaman analisis jabatan.
   - Panggilan validasi operator baru di halaman user berhasil memverifikasi status SPT OPD melalui endpoint server GAS tanpa mengekspos token di browser network inspector.
   - Penambahan OPD/sub-unit baru langsung memiliki tahun yang sesuai tanpa trigger update kedua.
   - Log keamanan menampilkan label 200 terkini secara jujur dan informatif.
