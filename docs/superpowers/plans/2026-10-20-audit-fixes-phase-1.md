# Implementasi Perbaikan Audit Tahap 1 (Kritis & Keamanan Mendesak)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memperbaiki 4 temuan prioritas kritis dan tinggi dari hasil audit (BUG-01, SEC-01, ARC-01, INT-01) untuk menjamin optimistik cache berjalan normal, menutup celah keamanan backend GAS, memutus siklus dependensi bundler, dan memastikan sinkronisasi auto-register operator menggunakan data tahun aktif.

**Architecture:** 
1. Penambahan `await` pada pemanggilan async cache di Beban Kerja.
2. Pengetatan RBAC whitelist fail-closed pada backend GAS untuk entitas master dan entitas anak.
3. Pemindahan fungsi parser string Anjab ke dalam `smartExtraction.ts` agar `importXlsx.ts` hanya memiliki dependensi satu arah (unidirectional).
4. Penyesuaian pembacaan unit kerja di `autoRegisterOperator_` ke path tahunan aktif `2026/unitKerja`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Google Apps Script (GAS), Node.js test runner.

## Global Constraints
- Tetap mematuhi aturan `.agents/AGENTS.md`: WKE fix 1250 jam/tahun, pembagian serial write vs paralel read.
- Seluruh pengujian otomatis (`npm run test:unit`, `npm run test:gas`, `npx tsc --noEmit`, `npm run build`) harus 100% PASS sebelum pekerjaan dianggap selesai.

---

### Task 1: Perbaikan BUG-01 (Missing `await` pada `api.getCachedJabatanFull`)

**Files:**
- Modify: `src/app/dashboard/beban-kerja/page.tsx:295`
- Modify: `src/app/operator/beban-kerja/page.tsx:327`

- [ ] **Step 1: Edit pemanggilan di `src/app/dashboard/beban-kerja/page.tsx`**
Tambahkan `await` pada `api.getCachedJabatanFull(node.id)`.

- [ ] **Step 2: Edit pemanggilan di `src/app/operator/beban-kerja/page.tsx`**
Tambahkan `await` pada `api.getCachedJabatanFull(node.id)`.

- [ ] **Step 3: Jalankan verifikasi typecheck**
Run: `npx tsc --noEmit`
Expected: 0 error.

---

### Task 2: Perbaikan ARC-01 (Putus Dependensi Melingkar antara `importXlsx.ts` dan `smartExtraction.ts`)

**Files:**
- Modify: `src/lib/smartExtraction.ts:1-15`
- Modify: `src/lib/importXlsx.ts:1-20 & 446-580`

- [ ] **Step 1: Pindahkan implementasi parser fungsi dari `importXlsx.ts` ke `smartExtraction.ts`**
Pindahkan fungsi `parseBakatKerja`, `parseTemperamenKerja`, `parseMinatKerja`, `parseUpayaFisik`, dan `mapFungsiPekerjaan` langsung ke dalam `smartExtraction.ts` dan ekspor fungsi-fungsi tersebut.
Hapus `import { ... } from './importXlsx';` dari `src/lib/smartExtraction.ts`.

- [ ] **Step 2: Update import di `src/lib/importXlsx.ts`**
Impor fungsi-fungsi parser tersebut dari `./smartExtraction`.
Hapus definisi duplikat di `importXlsx.ts`.

- [ ] **Step 3: Jalankan verifikasi typecheck dan build**
Run: `npx tsc --noEmit && npm run build`
Expected: Berhasil dikompilasi tanpa circular dependency warning/error.

---

### Task 3: Perbaikan SEC-01 & INT-01 pada Backend GAS

**Files:**
- Modify: `gas/Code.gs` (`assertWritePermission_` & `autoRegisterOperator_`)
- Modify: `gas/tests/simulate-ai-pintar.js`

- [ ] **Step 1: Tulis unit test simulasi penolakan operator untuk entitas master di `gas/tests/simulate-ai-pintar.js`**
Tambahkan test case:
1. Operator mencoba menulis ke `referensiJabatan` -> Ditolak.
2. Operator mencoba menulis ke `anomaliExclusion` -> Ditolak.
3. `autoRegisterOperator_` membaca data unit kerja dari path tahunan aktif `2026/unitKerja`.

- [ ] **Step 2: Jalankan test untuk memverifikasi kegagalan awal**
Run: `npm run test:gas`
Expected: Menunjukkan kebutuhan update logic.

- [ ] **Step 3: Update `assertWritePermission_` di `gas/Code.gs`**
Kunci entitas master:
```javascript
  var adminOnlyEntities = ['users', 'settings', 'referensiJabatan', 'anomaliExclusion'];
  if (adminOnlyEntities.indexOf(entity) !== -1) {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Akses ditolak: Operasi pada entitas ' + entity + ' hanya dapat dilakukan oleh Administrator.');
    }
    return;
  }
```

- [ ] **Step 4: Update `autoRegisterOperator_` di `gas/Code.gs`**
Ubah baris 2517:
```javascript
  var allUnit = fbGet_(getFirebasePath_('unitKerja')) || fbGet_('unitKerja') || {};
```

- [ ] **Step 5: Jalankan simulasi test backend**
Run: `npm run test:gas`
Expected: Semua test pass (PASS 100%).

---

### Task 4: Verifikasi Menyeluruh (Verification Before Completion)

- [ ] **Step 1: Jalankan unit test frontend**
Run: `npm run test:unit`
Expected: 24/24 PASS.

- [ ] **Step 2: Jalankan simulasi backend GAS**
Run: `npm run test:gas`
Expected: PASS 100%.

- [ ] **Step 3: Jalankan kompilasi TypeScript**
Run: `npx tsc --noEmit`
Expected: 0 error.

- [ ] **Step 4: Jalankan Next.js production build**
Run: `npm run build`
Expected: 29/29 halaman berhasil digenerate ke `out/`.

- [ ] **Step 5: Perbarui status di `AUDIT.md`**
Tandai BUG-01, SEC-01, ARC-01, INT-01 sebagai "Selesai Diperbaiki".
