# Rencana Implementasi: Modal Alert Popup Tarik Anjab & Simpan ABK

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menampilkan modal alert popup tengah layar dengan tombol "OK" bertuliskan "Tarik Anjab berhasil" setelah proses penarikan dari Anjab selesai, dan bertuliskan "Berhasil Disimpan" setelah proses penyimpanan Beban Kerja selesai.

**Architecture:** Menambahkan state `alertPopup` pada komponen editor Beban Kerja (Admin & Operator) beserta elemen dialog popup dengan layer teratas (`z-index: 10002`). Menambahkan style kelas `.alertOverlay`, `.alertCard`, `.alertIcon`, `.alertTitle`, `.alertMessage`, `.alertButton` pada file CSS module terkait.

**Tech Stack:** Next.js (React 19 / TypeScript), CSS Modules.

## Global Constraints
- Tetap mematuhi aturan performa Sianjab: tidak merusak serialisasi write di `api.ts`.
- Desain konsisten dan adaptif antara halaman Admin (`/dashboard/beban-kerja`) dan Operator (`/operator/beban-kerja`).
- Pesan teks sesuai permintaan: "Tarik Anjab berhasil" dan "Berhasil Disimpan".
- Z-index modal alert popup harus `10002` (di atas modal editor yang bernilai `1000`).

---

### Task 1: Tambahkan Styling CSS Modal Alert Popup
**Files:**
- Modify: `src/app/dashboard/beban-kerja/page.module.css`
- Modify: `src/app/operator/beban-kerja/page.module.css`

- [ ] **Step 1:** Tambahkan class `.alertOverlay`, `.alertCard`, `.alertIconSuccess`, `.alertTitle`, `.alertMessage`, `.alertButton`, `.alertClose` ke `src/app/dashboard/beban-kerja/page.module.css`.
- [ ] **Step 2:** Tambahkan class yang sama ke `src/app/operator/beban-kerja/page.module.css`.

---

### Task 2: Implementasikan Dialog Popup di Halaman Admin Beban Kerja
**Files:**
- Modify: `src/app/dashboard/beban-kerja/page.tsx`

- [ ] **Step 1:** Tambahkan state `alertModal: { title: string; message: string; type?: 'success' | 'warning' | 'error' } | null` dan fungsi pembuka/penutup alert.
- [ ] **Step 2:** Pada tombol "Tarik dari Anjab", panggil `setAlertModal({ title: 'Berhasil', message: 'Tarik Anjab berhasil', type: 'success' })` setelah proses tarik data selesai.
- [ ] **Step 3:** Pada fungsi `handleSave`, panggil `setAlertModal({ title: 'Berhasil', message: 'Berhasil Disimpan', type: 'success' })` setelah `api.saveABK` selesai.
- [ ] **Step 4:** Render komponen modal popup dialog di dalam return JSX dengan tombol "OK" dan tombol tutup `✕`.

---

### Task 3: Implementasikan Dialog Popup di Halaman Operator Beban Kerja
**Files:**
- Modify: `src/app/operator/beban-kerja/page.tsx`

- [ ] **Step 1:** Tambahkan state `alertModal` dan helper yang sama di operator beban kerja.
- [ ] **Step 2:** Perbarui handler "Tarik dari Anjab" agar menampilkan popup "Tarik Anjab berhasil".
- [ ] **Step 3:** Perbarui `handleSave` agar menampilkan popup "Berhasil Disimpan".
- [ ] **Step 4:** Render komponen modal popup dialog di dalam return JSX.

---

### Task 4: Verifikasi & Build
**Files:**
- Verifikasi: Jalankan `npm run build`

- [ ] **Step 1:** Jalankan build Next.js lokal untuk memastikan tidak ada kesalahan kompilasi atau tipe TypeScript.
- [ ] **Step 2:** Verifikasi bahwa output build sukses ke direktori `out/`.
