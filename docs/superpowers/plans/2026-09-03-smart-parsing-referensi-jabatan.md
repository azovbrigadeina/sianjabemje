# Smart Parsing & Standardisasi Referensi Jabatan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meng-upgrade mesin audit investigasi dengan Smart Parsing (Base Name + Jenjang Fungsional) serta menambahkan fitur Pemetaan Manual & 1-Click Standardisasi Nama ke Master Referensi Jabatan.

**Architecture:** Memperbarui `src/lib/investigasiUtils.ts` dengan parser jenjang fungsional (`parseJenjangJabatan`), meng-update fungsi `analyzeAnomali`, dan menambahkan modal pemetaan referensi interaktif di `src/app/dashboard/investigasi/page.tsx`.

**Tech Stack:** Next.js (App Router, Static Export), TypeScript, CSS Modules.

## Global Constraints

- Pemasangan Smart Parsing harus mengenali Jenjang Keterampilan (`Pemula`, `Terampil`, `Mahir`, `Penyelia`) dan Keahlian (`Ahli Pertama`, `Ahli Muda`, `Ahli Madya`, `Ahli Utama`).
- Operasi standardisasi hanya mengubah `namaJabatan` (menjaga ID & relasi `unitKerjaId` 100% utuh untuk SiTPP).
- `api.updateJabatan()` dipanggil setelah pemetaan disetujui admin (otomatis invalidasi cache).

---

### Task 1: Smart Parsing & Referensi Matching Logic (`src/lib/investigasiUtils.ts`)

**Files:**
- Modify: `src/lib/investigasiUtils.ts`

- [ ] **Step 1: Implement Jenjang Parser & Smart Reference Matcher**

In `src/lib/investigasiUtils.ts`:
Add list of standard jenjang:
```typescript
export const JENJANG_FUNGSIONAL = [
  'Ahli Utama',
  'Ahli Madya',
  'Ahli Muda',
  'Ahli Pertama',
  'Penyelia',
  'Mahir',
  'Terampil',
  'Pemula',
];

export interface ParsedJabatan {
  baseName: string;
  jenjang: string | null;
}

export function parseJenjangJabatan(nama: string): ParsedJabatan {
  const cleanName = (nama || '').trim();
  for (const j of JENJANG_FUNGSIONAL) {
    const regex = new RegExp(`\\b${j}$`, 'i');
    if (regex.test(cleanName)) {
      const baseName = cleanName.replace(regex, '').trim();
      if (baseName.length > 0) {
        return { baseName, jenjang: j };
      }
    }
  }
  return { baseName: cleanName, jenjang: null };
}
```

Update `analyzeAnomali`:
- For Pelaksana/Fungsional roles:
  1. Call `parseJenjangJabatan(j.namaJabatan)` to get `baseName` and `jenjang`.
  2. Normalize `baseName` (`normBase = normalizeName(parsed.baseName)`).
  3. Look up `normBase` in `refNameMap`.
  4. If exact match found on `refNameMap`:
     - Standard Name = `${refMatch.namaBase}${parsed.jenjang ? ' ' + parsed.jenjang : ''}`
     - If `j.namaJabatan === standardName`:
       - Do NOT flag as anomaly (it is valid!).
     - Else (e.g. `asisten apoteker mahir` or `Ast. Apoteker Mahir`):
       - Flag `TYPO_SPACE` with `rekomendasi: standardName`.
  5. If no exact match on `normBase`:
     - Perform fuzzy matching on `normBase` vs `ref.namaBase`.
     - If fuzzy match found (≥ 0.78):
       - Standard Name = `${bestMatch.namaBase}${parsed.jenjang ? ' ' + parsed.jenjang : ''}`
       - Flag `FUZZY_TYPO` with `rekomendasi: standardName`.
     - Else:
       - Flag `UNREFERENCED` with `rekomendasiBase: parsed.baseName` and `parsedJenjang: parsed.jenjang`.

- [ ] **Step 2: Commit Task 1**

```bash
git add src/lib/investigasiUtils.ts
git commit -m "feat: add smart jenjang parser and enhanced reference matching logic"
```

---

### Task 2: Standardisasi 1-Click & Modal Pemetaan Referensi (`page.tsx`)

**Files:**
- Modify: `src/app/dashboard/investigasi/page.tsx`
- Modify: `src/app/dashboard/investigasi/investigasi.module.css`

- [ ] **Step 1: Add 1-Click "Standardkan Nama" button and Mapping Modal**

In `src/app/dashboard/investigasi/page.tsx`:
- Add handler `handleQuickStandardize(item: AnomaliItem)`:
  - Calls `api.updateJabatan(item.jabatanId, { namaJabatan: item.rekomendasi })`.
  - Updates local state.
- Add Mapping Modal state:
  - `mappingAnomali: AnomaliItem | null`
  - `selectedRefBase: string`
  - `selectedJenjang: string`
  - Computed preview: `${selectedRefBase}${selectedJenjang ? ' ' + selectedJenjang : ''}`
  - Handler `handleSaveMapping()`:
    - Calls `api.updateJabatan(mappingAnomali.jabatanId, { namaJabatan: computedStandard })`.

- [ ] **Step 2: Commit Task 2**

```bash
git add src/app/dashboard/investigasi/page.tsx src/app/dashboard/investigasi/investigasi.module.css
git commit -m "feat: add 1-click standardization button and interactive reference mapping modal"
```

---

### Task 3: Build & Deploy Verification

- [ ] **Step 1: Build & TypeScript check**

Run: `npm run build`
Expected: 0 errors.

- [ ] **Step 2: Deploy to Firebase Hosting & GAS**

Run: `npx firebase-tools deploy && npx @google/clasp push && npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw -d "Update Smart Parsing & Pemetaan Referensi"`
