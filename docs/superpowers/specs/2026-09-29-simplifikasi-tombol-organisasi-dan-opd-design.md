# Spesifikasi Desain: Simplifikasi Tombol Struktur Organisasi & Kelola OPD

**Tanggal**: 2026-09-29  
**Status**: Usulan Desain (Menunggu Konfirmasi Pengguna)  

---

## 1. Latar Belakang & Tujuan
Tampilan header dan toolbar pada halaman **Struktur Organisasi** (`/dashboard/organisasi`) dan **Kelola OPD** (`/dashboard/opd`) memiliki banyak tombol aksi yang padat dan redundan. 

Tujuan perubahan ini adalah:
1. Menyederhanakan 3 tombol integrasi Google Sheet (`📤 Ekspor ke Sheet`, `📥 Impor dari Sheet`, `📥🧹 Sync Bersih`) ke dalam satu komponen dropdown terpadu bernama **"Sinkronisasi"**.
2. Membiarkan tombol **"🚀 Publish ke SiTPP"** tetap berdiri sendiri (**independen**) sebagai tombol utama yang jelas dan mudah diakses.
3. Menghapus tombol **"📋 Duplikasi Unit & Jabatan"** dari halaman Struktur Organisasi karena fungsi duplikasi struktur jabatan unit kerja dialokasikan secara spesifik di halaman **Kelola OPD**.
4. Menghapus tombol integrasi Sheet & SiTPP dari header **Kelola OPD** (`/dashboard/opd`) sehingga halaman Kelola OPD fokus pada manajemen master unit kerja dan duplikasi struktur.
5. Menyelaraskan tampilan halaman **Operator Organisasi** (`/operator/organisasi`) dengan pola yang sama (Dropdown "Sinkronisasi" + Tombol Independen "Publish ke SiTPP").

---

## 2. Rincian Desain & Perubahan Antarmuka

### A. Halaman Struktur Organisasi (`/dashboard/organisasi`)

#### 1. Header Actions (Kanan Atas)
Mengganti 3 tombol Google Sheet yang terpisah menjadi satu menu dropdown:
- **Tombol Pemicu**:
  - Teks: `📊 Sinkronisasi ▾`
  - Style: Sekunder (`btnSecondary`), dengan ikon panah kecil ke bawah (chevron down).
  - Interaksi: Toggle buka/tutup menu saat diklik; menutup otomatis ketika user mengklik di luar menu (*click-outside listener*) atau setelah memilih aksi.
- **Menu Dropdown (Popover)**:
  - Posisi: Mengambang di bawah tombol pemicu dengan *box shadow*, border rapi, dan background panel.
  - Item 1: `📤 Ekspor ke Sheet` — Menjalankan ekspor data mutakhir ke Google Sheet.
  - Item 2: `📥 Impor dari Sheet` — Menjalankan impor data tambah/update dari Google Sheet.
  - Item 3: `📥🧹 Sync Bersih` — Menjalankan impor bersih (menghapus baris di Sianjab yang sudah tidak ada di Sheet), ditandai dengan aksen merah peringatan.
- **Tombol Independen SiTPP**:
  - Teks: `{isSyncing ? "Memproses..." : "🚀 Publish ke SiTPP"}`
  - Style: Primer (`btnPrimary`), warna hijau emerald (`#10b981`), berdiri sendiri tepat di samping dropdown Sinkronisasi.

#### 2. Toolbar Bawah (Pencarian & Kontrol Tree)
- **Sebelum**: `[Cari nama...]` | `[➕ Kembangkan Semua]` | `[➖ Ciutkan Semua]` | `[⇄ Mode Atur Urutan]` | `[📋 Duplikasi Unit & Jabatan]`
- **Sesudah**: Tombol `[📋 Duplikasi Unit & Jabatan]` dihapus dari toolbar Struktur Organisasi.
- Kode terkait di `organisasi/page.tsx`:
  - Hapus import `ModalDuplikasiUnit`.
  - Hapus state `isDuplicateModalOpen`.
  - Hapus render modal `<ModalDuplikasiUnit />`.

---

### B. Halaman Kelola OPD & Sub Unit Kerja (`/dashboard/opd`)

#### 1. Header Actions
- Menghapus 4 tombol di header:
  - `📤 Ekspor ke Sheet` (dihapus)
  - `📥 Impor dari Sheet` (dihapus)
  - `📥🧹 Sync Bersih` (dihapus)
  - `🚀 Publish ke SiTPP` (dihapus)
- Bersihkan fungsi yang tidak lagi dipakai:
  - `handleSyncToSheet`
  - `handleSyncFromSheet`
  - `handlePublishSitpp`

#### 2. Toolbar Kelola OPD
- Tombol `📋 Duplikasi Unit & Jabatan` **tetap dipertahankan** di toolbar halaman ini berdampingan dengan `➕ Tambah OPD Utama`.

---

### C. Halaman Operator Organisasi (`/operator/organisasi`)

- Menyelaraskan tampilan header aksi pada halaman Operator:
  - Mengelompokkan tombol Sheet ke dalam dropdown `📊 Sinkronisasi ▾` (Ekspor, Impor, Sync Bersih).
  - Tombol `🚀 Publish ke SiTPP` tetap mandiri/independen.
  - Tetap terikat pada pengecekan hak akses `orgEditEnabled`.

---

## 3. Komponen & Styling

Untuk dropdown menu "Sinkronisasi":
- Dibuat menggunakan struktur CSS yang responsif dan aman z-index (`z-index: 50`).
- Menu ditutup otomatis melalui event listener `mousedown` pada `document`.
- Animasi transisi halus saat dropdown terbuka (*fade-in / scale-in*).

---

## 4. Rencana Verifikasi
1. **Verifikasi Fungsional Struktur Organisasi**:
   - Klik tombol "Sinkronisasi ▾" -> Menu dropdown terbuka.
   - Klik "Ekspor ke Sheet" -> Memproses ekspor dan dropdown tertutup.
   - Klik "Impor dari Sheet" -> Memproses impor dan dropdown tertutup.
   - Klik "Sync Bersih" -> Memunculkan dialog konfirmasi sinkronisasi bersih dan dropdown tertutup.
   - Klik di luar menu dropdown -> Dropdown tertutup.
   - Klik "🚀 Publish ke SiTPP" -> Tetap berjalan independen tanpa membuka dropdown.
   - Toolbar tidak lagi menampilkan tombol "Duplikasi Unit & Jabatan".
2. **Verifikasi Kelola OPD**:
   - Header Kelola OPD bersih dari tombol Sheet dan SiTPP.
   - Tombol "Duplikasi Unit & Jabatan" di toolbar tetap ada dan berfungsi membuka modal duplikasi.
3. **Verifikasi Operator**:
   - Tampilan tombol di Operator Organisasi konsisten dengan Admin Organisasi.
4. **Verifikasi Build**:
   - `npm run build` sukses 100% tanpa error TypeScript maupun linting.
