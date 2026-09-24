# Rencana Implementasi: Rebranding ke "SI-PRABU Muaro Jambi"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah nama tampilan aplikasi menjadi "SI-PRABU Muaro Jambi" (Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja) di seluruh antarmuka pengguna dan metadata dokumen, dengan tetap menjaga stabilitas integrasi sistem eksternal menggunakan codename internal `sianjab`.

**Architecture:** Membuat modul konfigurasi sentral `src/config/branding.ts` dan memperbarui teks tampilan pada layer presentasi (Metadata, Layout, Landing Page, Login, Dashboard, Operator, Verifikasi Dokumen) tanpa mengubah API parameters, database schema, cookies, atau localStorage keys.

**Tech Stack:** Next.js (App Router), TypeScript, React.

## Global Constraints
- **PANTANGAN MUTLAK**: Jangan mengubah parameter `&integrasi=SIANJAB` pada pengecekan SPT OPD (`src/app/dashboard/users/page.tsx`).
- **PANTANGAN MUTLAK**: Jangan mengubah nama cookie `sianjab_token`, `sianjab_user`, maupun key localStorage seperti `sianjab_active_year`.
- **PANTANGAN MUTLAK**: Jangan mengubah path Realtime Database atau endpoint GAS.
- **IDENTITAS BARU**:
  - Nama Brand Tampilan: **SI-PRABU Muaro Jambi**
  - Singkatan: **SI-PRABU**
  - Kepanjangan: **Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja**

---

### Task 1: Buat Konfigurasi Sentral Branding
**Files:**
- Create: `src/config/branding.ts`

- [ ] **Step 1:** Buat file `src/config/branding.ts` yang mengekspor objek `BRANDING` lengkap dengan informasi nama baru dan codename internal.

---

### Task 2: Perbarui Metadata Global & SEO di Root Layout
**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1:** Impor `BRANDING` dan perbarui `metadata` (title, description, openGraph, twitter, dan JSON-LD Structured Data).

---

### Task 3: Perbarui Halaman Publik (Landing Page, Login, dan Peta Organisasi Publik)
**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/organisasi/page.tsx`

- [ ] **Step 1:** Perbarui judul dan teks di `src/app/page.tsx` (Navbar, Hero Title, Badge).
- [ ] **Step 2:** Perbarui judul form dan teks di `src/app/login/page.tsx`.
- [ ] **Step 3:** Perbarui header di `src/app/organisasi/page.tsx`.

---

### Task 4: Perbarui Layout Dashboard Admin & Operator
**Files:**
- Modify: `src/app/dashboard/layout.tsx`
- Modify: `src/app/operator/layout.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1:** Perbarui brand title di sidebar `src/app/dashboard/layout.tsx`.
- [ ] **Step 2:** Perbarui brand title di sidebar `src/app/operator/layout.tsx`.
- [ ] **Step 3:** Perbarui ucapan selamat datang di `src/app/dashboard/page.tsx`.

---

### Task 5: Perbarui Komponen Verifikasi Dokumen & Modal Pendukung
**Files:**
- Modify: `src/app/verify/page.tsx`
- Modify: `src/components/DocumentVerificationFooter.tsx`
- Modify: `src/components/QuickAbkModal.tsx`
- Modify: `src/app/dashboard/users/page.tsx` (hanya teks label tampilan UI)

- [ ] **Step 1:** Perbarui teks identitas sistem di `src/app/verify/page.tsx`.
- [ ] **Step 2:** Perbarui teks identitas sistem di `src/components/DocumentVerificationFooter.tsx`.
- [ ] **Step 3:** Perbarui label teks di `src/components/QuickAbkModal.tsx`.
- [ ] **Step 4:** Perbarui teks deskripsi UI di `src/app/dashboard/users/page.tsx` (pastikan `&integrasi=SIANJAB` TIDAK tersentuh).

---

### Task 6: Verifikasi & Uji Kompilasi
**Files:**
- Verifikasi: `npm run build`

- [ ] **Step 1:** Jalankan `npm run build` untuk memverifikasi tidak ada kesalahan TypeScript dan static generation 29 halaman berjalan 100% mulus.
- [ ] **Step 2:** Pastikan integrasi check SPT tetap utuh dengan melakukan `grep` pada file users.
