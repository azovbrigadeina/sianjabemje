# Simplifikasi Tombol Struktur Organisasi & Kelola OPD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyederhanakan tombol-tombol aksi Google Sheet menjadi dropdown "Sinkronisasi" pada Struktur Organisasi dan Operator Organisasi, menjaga tombol "Publish ke SiTPP" tetap independen, menghapus tombol duplikasi unit dari Struktur Organisasi, dan menghapus tombol sheet & publish dari Kelola OPD.

**Architecture:** Menggunakan pola popup dropdown berbasis React (`useRef` + click-outside + ESC listener) di header aksi `Struktur Organisasi` dan `Operator Organisasi`. Menghapus elemen redundan dan mendistribusikan wewenang tombol sesuai konteks halaman (duplikasi unit kerja hanya di Kelola OPD, integrasi sheet & SiTPP hanya di Struktur Organisasi).

**Tech Stack:** Next.js (App Router, Client Components), TypeScript, CSS Modules, React Hooks (`useRef`, `useState`, `useEffect`).

## Global Constraints
- Target deployment: Next.js static export (`out/`), Firebase Hosting.
- Build command `npm run build` harus 100% lulus tanpa error TypeScript ataupun linting.
- Nama menu dropdown adalah **"Sinkronisasi"** (bukan "Sinkronisasi Sheet").
- Tombol **"Publish ke SiTPP"** harus tetap berdiri sendiri (**independen**) sebagai tombol utama.
- Tombol **"Duplikasi Unit & Jabatan"** hanya boleh ada di halaman **Kelola OPD** (`/dashboard/opd`), dan harus dihapus dari **Struktur Organisasi** (`/dashboard/organisasi`).
- Halaman **Kelola OPD** (`/dashboard/opd`) tidak boleh menampilkan tombol Google Sheet maupun tombol Publish ke SiTPP.

---

### Task 1: Simplifikasi Tombol pada Struktur Organisasi Admin (`/dashboard/organisasi`)

**Files:**
- Modify: `src/app/dashboard/organisasi/page.tsx:7,58,866-880,945-953,1408-1418`

**Interfaces:**
- Consumes: `handleSyncToSheet()`, `handleSyncFromSheet(clean: boolean)`, `handlePublishSitpp()`
- Produces: Dropdown menu "Sinkronisasi ▾" dengan click-outside handler dan ESC key listener, tombol independen "🚀 Publish ke SiTPP", serta toolbar bersih tanpa tombol duplikasi.

- [ ] **Step 1: Modifikasi `src/app/dashboard/organisasi/page.tsx`**
  - Hapus import `ModalDuplikasiUnit` di line 7.
  - Hapus state `isDuplicateModalOpen` di line 58.
  - Tambahkan state `isSheetDropdownOpen` dan `dropdownRef = useRef<HTMLDivElement>(null)`.
  - Tambahkan effect click-outside dan ESC listener untuk menutup dropdown.
  - Ganti render 3 tombol sheet di `styles.actions` (line 866-879) dengan komponen dropdown `📊 Sinkronisasi ▾`:
    - Menu dropdown memuat:
      1. `📤 Ekspor ke Sheet` -> `onClick={() => { setIsSheetDropdownOpen(false); handleSyncToSheet(); }}`
      2. `📥 Impor dari Sheet` -> `onClick={() => { setIsSheetDropdownOpen(false); handleSyncFromSheet(false); }}`
      3. `📥🧹 Sync Bersih` -> `onClick={() => { setIsSheetDropdownOpen(false); handleSyncFromSheet(true); }}`
  - Pertahankan tombol independen:
    `<button className={styles.btnPrimary} onClick={handlePublishSitpp} disabled={isSyncing} ...>{isSyncing ? "Memproses..." : "🚀 Publish ke SiTPP"}</button>`
  - Hapus tombol `📋 Duplikasi Unit & Jabatan` dari toolbar bawah (sekitar line 945-953).
  - Hapus pemanggilan `<ModalDuplikasiUnit ... />` di bagian bawah JSX (sekitar line 1408-1418).

- [ ] **Step 2: Jalankan typecheck & build test**
  Run: `npm run build`
  Expected: Kompilasi berhasil tanpa error di `src/app/dashboard/organisasi/page.tsx`.

- [ ] **Step 3: Commit perubahan Task 1**
  ```bash
  git add src/app/dashboard/organisasi/page.tsx
  git commit -m "feat: simplifikasi tombol aksi dan hapus duplikasi di struktur organisasi admin"
  ```

---

### Task 2: Pembersihan Tombol pada Kelola OPD (`/dashboard/opd`)

**Files:**
- Modify: `src/app/dashboard/opd/page.tsx:55-93,498-512`

**Interfaces:**
- Consumes: Master OPD management, modal duplikasi unit & jabatan
- Produces: Header bersih tanpa tombol Sheet & SiTPP; toolbar tetap mempertahankan tombol duplikasi unit.

- [ ] **Step 1: Modifikasi `src/app/dashboard/opd/page.tsx`**
  - Hapus fungsi `handleSyncToSheet`, `handleSyncFromSheet`, dan `handlePublishSitpp` (line 55-93) karena tidak lagi digunakan di halaman Kelola OPD.
  - Hapus blok tombol di `styles.actions` pada header (line 498-512) yang berisi 4 tombol: `📤 Ekspor ke Sheet`, `📥 Impor dari Sheet`, `📥🧹 Sync Bersih`, dan `🚀 Publish ke SiTPP`.
  - Pastikan tombol `📋 Duplikasi Unit & Jabatan` di toolbar bawah (line 528-537) tetap utuh dan modal `ModalDuplikasiUnit` tetap terpasang dengan baik.

- [ ] **Step 2: Jalankan typecheck & build test**
  Run: `npm run build`
  Expected: Kompilasi berhasil tanpa error di `src/app/dashboard/opd/page.tsx`.

- [ ] **Step 3: Commit perubahan Task 2**
  ```bash
  git add src/app/dashboard/opd/page.tsx
  git commit -m "feat: hapus tombol integrasi sheet dan sitpp dari kelola opd"
  ```

---

### Task 3: Penyelarasan Tombol pada Struktur Organisasi Operator (`/operator/organisasi`)

**Files:**
- Modify: `src/app/operator/organisasi/page.tsx:876-891`

**Interfaces:**
- Consumes: `handleSyncToSheet()`, `handleSyncFromSheet(clean: boolean)`, `handlePublishSitpp()`, `orgEditEnabled`
- Produces: Dropdown menu "Sinkronisasi ▾" dan tombol independen "Publish ke SiTPP" di header Operator Organisasi.

- [ ] **Step 1: Modifikasi `src/app/operator/organisasi/page.tsx`**
  - Tambahkan state `isSheetDropdownOpen` dan `dropdownRef = useRef<HTMLDivElement>(null)`.
  - Tambahkan effect click-outside dan ESC listener untuk dropdown.
  - Ganti 3 tombol Sheet di baris 876-891 menjadi satu tombol dropdown `📊 Sinkronisasi ▾`.
  - Pertahankan tombol independen `🚀 Publish ke SiTPP`.

- [ ] **Step 2: Jalankan typecheck & build test**
  Run: `npm run build`
  Expected: Kompilasi berhasil tanpa error di `src/app/operator/organisasi/page.tsx`.

- [ ] **Step 3: Commit perubahan Task 3**
  ```bash
  git add src/app/operator/organisasi/page.tsx
  git commit -m "feat: selaraskan dropdown sinkronisasi dan tombol publish di operator organisasi"
  ```

---

### Task 4: Verifikasi Menyeluruh & Uji Build Akhir

**Files:**
- Test/Verification: Build artifact Next.js `out/`

- [ ] **Step 1: Jalankan Full Build**
  Run: `npm run build`
  Expected: Build sukses 100%, seluruh route ter-generate tanpa peringatan error.

- [ ] **Step 2: Verifikasi Git Diff**
  Run: `git diff HEAD~3`
  Expected: Perubahan sesuai dengan spesifikasi dan tidak ada file/kode tersisa yang tidak perlu.
