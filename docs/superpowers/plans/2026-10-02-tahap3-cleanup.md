# Tahap 3 Implementation Plan: Pembersihan Redundansi AI, Keamanan Token SPT, Konsistensi Mutasi OPD, & Konsolidasi Konstanta Tahun (N9, N10, N11, N12, N13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyelesaikan item audit N9–N13: menyederhanakan normalisasi AI di client (N9), memindahkan verifikasi SPT ke server GAS agar token aman (N10), memperjelas label statistik log keamanan (N11), memperbaiki mutasi unit kerja OPD agar bebas duplikasi dan memiliki guard ID (N12), serta mengonsolidasikan konstanta tahun aktif (N13).

**Architecture:** Modifikasi `src/lib/api.ts`, penambahan action `checkSptOpd` di `gas/Code.gs`, pembaruan verifikasi SPT di `src/app/dashboard/users/page.tsx`, pembaruan label di `src/app/dashboard/log-keamanan/page.tsx`, koreksi `handleModalSave` di `src/app/dashboard/opd/page.tsx`, dan sentralisasi `getActiveYear()` di `src/lib/constants.ts`.

**Tech Stack:** Next.js (App Router, Static Export), TypeScript, Google Apps Script, Firebase Realtime Database.

## Global Constraints
- Target GAS Deployment ID: `AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw` (wajib `-i`).
- Static Next.js export: wajib lolos `npx tsc --noEmit --incremental false` dan `npm run build`.
- Jangan menghapus mekanisme invalidasi cache `invalidateAllCaches_()`.

---

### Task 1: Sentralisasi Konstanta Tahun Aktif (N13)

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/api.ts`
- Modify: `gas/Code.gs:2352`

**Interfaces:**
- Consumes: `localStorage.getItem('sianjab_active_year')`
- Produces: `getActiveYear(): string`, `DEFAULT_YEAR: string`, `SUPPORTED_YEARS: string[]`

- [ ] **Step 1: Tambahkan helper `getActiveYear` di `src/lib/constants.ts`**
Tambahkan fungsi helper:
```typescript
export function getActiveYear(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('sianjab_active_year') || DEFAULT_YEAR;
  }
  return DEFAULT_YEAR;
}
```

- [ ] **Step 2: Ganti sisa hardcoded `|| '2026'` di `src/lib/api.ts`**
Import `getActiveYear`, `DEFAULT_YEAR` dari `@/lib/constants` dan ganti seluruh kemunculan `|| '2026'` di `src/lib/api.ts` dengan `getActiveYear()`.

- [ ] **Step 3: Rapikan `CURRENT_TAHUN || '2026'` di `gas/Code.gs:2352`**
Ganti baris `gas/Code.gs:2352` (`CURRENT_TAHUN || '2026'`) menjadi `CURRENT_TAHUN || BASE_YEAR`.

- [ ] **Step 4: Jalankan typecheck TypeScript**
Run: `npx tsc --noEmit --incremental false`
Expected: 0 error.

---

### Task 2: Sederhanakan Normalisasi AI di Client (N9)

**Files:**
- Modify: `src/lib/api.ts:709-850`

**Interfaces:**
- Consumes: data draf AI hasil response server GAS
- Produces: draf AI ternormalisasi dengan null-safety guard tanpa merombak ulang skema yang telah diproses server

- [ ] **Step 1: Ganti fungsi `normalizeAiAnjabDraft` dengan `ensureAiAnjabDraft` ringan di `src/lib/api.ts`**
Ganti implementasi 97 baris `normalizeAiAnjabDraft` dengan:
```typescript
function ensureAiAnjabDraft(data: any): any {
  if (!data) return null;
  return {
    ...data,
    kualifikasi: data.kualifikasi || { pendidikanFormal: [], pendidikanPelatihan: [], pengalamanKerja: [] },
    syaratJabatan: data.syaratJabatan || {},
    hasilKerja: data.hasilKerja || { uraian: JSON.stringify([]) },
    prestasiKerja: data.prestasiKerja || { uraian: "" },
    tugasPokok: Array.isArray(data.tugasPokok) ? data.tugasPokok : [],
    bahanKerja: Array.isArray(data.bahanKerja) ? data.bahanKerja : [],
    perangkatKerja: Array.isArray(data.perangkatKerja) ? data.perangkatKerja : [],
    tanggungJawab: Array.isArray(data.tanggungJawab) ? data.tanggungJawab : [],
    wewenang: Array.isArray(data.wewenang) ? data.wewenang : [],
    korelasiJabatan: Array.isArray(data.korelasiJabatan) ? data.korelasiJabatan : [],
    kondisiLingkungan: Array.isArray(data.kondisiLingkungan) ? data.kondisiLingkungan : [],
    risikoBahaya: Array.isArray(data.risikoBahaya) ? data.risikoBahaya : [],
  };
}
```

- [ ] **Step 2: Update pemanggil di `generateAnjabWithAI`**
Ubah pemanggilan di `generateAnjabWithAI` menjadi `return ensureAiAnjabDraft(raw);`.

- [ ] **Step 3: Jalankan typecheck TypeScript**
Run: `npx tsc --noEmit --incremental false`
Expected: 0 error.

---

### Task 3: Pindahkan Verifikasi SPT Digital ke Backend GAS (N10)

**Files:**
- Modify: `gas/Code.gs`
- Modify: `src/lib/api.ts`
- Modify: `src/app/dashboard/users/page.tsx`
- Modify: `.env.local`

**Interfaces:**
- Consumes: `unitKerjaId: string`
- Produces: `api.checkSptOpd(unitKerjaId)` mengembalikan `{ success: boolean, hasSubmitted: boolean, namaAdmin?: string, nipAdmin?: string, message?: string }`

- [ ] **Step 1: Tambahkan action `checkSptOpd` di `gas/Code.gs`**
Di switch `handleRequest_` tambahkan case:
```javascript
case 'checkSptOpd':
  result = checkSptOpd_(params.unitKerjaId || id);
  break;
```
Implementasikan fungsi:
```javascript
function checkSptOpd_(unitKerjaId) {
  if (!unitKerjaId) {
    return { success: false, hasSubmitted: false, message: 'Unit Kerja ID wajib diisi.' };
  }
  var unit = readRecord_('unitKerja', unitKerjaId);
  var opdName = (unit && unit.nama) ? unit.nama : '';
  if (!opdName) {
    return { success: false, hasSubmitted: false, message: 'Nama Unit Kerja / OPD tidak ditemukan.' };
  }
  var props = PropertiesService.getScriptProperties();
  var sptUrl = props.getProperty('SPT_DIGITAL_URL') || 'https://sptdigital.muarojambikab.go.id/api';
  var sptToken = props.getProperty('SPT_DIGITAL_TOKEN') || 'YOUR_TOKEN';
  var checkUrl = sptUrl + '?action=checkSpt&opd=' + encodeURIComponent(opdName) + '&integrasi=SIANJAB&token=' + encodeURIComponent(sptToken);
  try {
    var response = UrlFetchApp.fetch(checkUrl, { muteHttpExceptions: true });
    var resJson = JSON.parse(response.getContentText());
    if (resJson.status === 'success' && resJson.hasSubmitted) {
      return {
        success: true,
        hasSubmitted: true,
        namaAdmin: resJson.namaAdmin || resJson.adminNama || resJson.penandatanganNama || '',
        nipAdmin: resJson.nipAdmin || resJson.adminNip || resJson.penandatanganNip || ''
      };
    }
    return {
      success: true,
      hasSubmitted: false,
      message: 'OPD "' + opdName + '" belum mengisi SPT Digital untuk kegiatan SIANJAB.'
    };
  } catch (err) {
    return { success: false, hasSubmitted: false, message: 'Gagal menghubungi server SPT Digital: ' + err.toString() };
  }
}
```

- [ ] **Step 2: Tambahkan metode `checkSptOpd` di `src/lib/api.ts`**
```typescript
checkSptOpd: (unitKerjaId: string) =>
  apiCall<{ success: boolean; hasSubmitted: boolean; namaAdmin?: string; nipAdmin?: string; message?: string }>(
    'checkSptOpd',
    '',
    { params: { unitKerjaId } }
  ),
```

- [ ] **Step 3: Ganti fetch langsung di `src/app/dashboard/users/page.tsx`**
Panggil `await api.checkSptOpd(form.unitKerjaId)` dan tangani responnya. Hapus seluruh pembacaan `NEXT_PUBLIC_SPT_DIGITAL_TOKEN`.

- [ ] **Step 4: Bersihkan `.env.local`**
Hapus `NEXT_PUBLIC_SPT_DIGITAL_TOKEN` dari `.env.local`.

- [ ] **Step 5: Jalankan typecheck TypeScript**
Run: `npx tsc --noEmit --incremental false`
Expected: 0 error.

---

### Task 4: Perbaiki Mutasi Unit Kerja / OPD Tanpa Double Request (N12)

**Files:**
- Modify: `src/app/dashboard/opd/page.tsx:289-337`

**Interfaces:**
- Consumes: `modalData`, `rawOpds`, `activeYear`
- Produces: pembuatan unit kerja baru secara atomik dengan tahun yang tepat dan validasi id

- [ ] **Step 1: Hitung tahun parent sebelum `createEntity`**
Di dalam `handleModalSave`:
```typescript
let targetTahun = originalOpd?.tahun || activeYear;
if (modalMode === 'add' && modalData.parentId) {
  const parentOpd = rawOpds.find(o => o.id === modalData.parentId);
  if (parentOpd && parentOpd.tahun) {
    targetTahun = parentOpd.tahun;
  }
}
const opdPayload = {
  nama: modalData.nama.trim(),
  kode: modalData.kode.trim(),
  parentId: modalData.parentId || null,
  urutan: modalData.urutan || 0,
  tahun: targetTahun,
  statusValidasi: originalOpd?.statusValidasi || "Draft",
  catatanRevisi: originalOpd?.catatanRevisi || "",
  historyValidasi: originalOpd?.historyValidasi || []
};
```

- [ ] **Step 2: Tambahkan guard ID dan hapus pemanggilan `updateUnitKerja` kedua**
```typescript
if (modalMode === 'edit' && modalData.id) {
  await api.updateUnitKerja(modalData.id, opdPayload);
  showToast("✅ Unit Kerja berhasil diperbarui.");
} else {
  const opdCreated = await api.createEntity('unitKerja', opdPayload) as { id?: string };
  if (!opdCreated || !opdCreated.id) {
    throw new Error("Gagal membuat unit kerja: Server tidak mengembalikan ID entitas.");
  }
  showToast("✅ Unit Kerja baru berhasil ditambahkan.");
}
```

- [ ] **Step 3: Jalankan typecheck TypeScript**
Run: `npx tsc --noEmit --incremental false`
Expected: 0 error.

---

### Task 5: Klarifikasi Statistik Log Keamanan (N11) & Update Audit Doc

**Files:**
- Modify: `src/app/dashboard/log-keamanan/page.tsx:90-120`
- Modify: `docs/AUDIT-2026-09-29.md`

**Interfaces:**
- Consumes: array log keamanan (maksimal 200 record)
- Produces: label kartu metrik yang transparan dan akurat

- [ ] **Step 1: Sesuaikan label statistik di `src/app/dashboard/log-keamanan/page.tsx`**
Ubah label:
- "Total Percobaan" -> "Total Percobaan (200 Terkini)"
- "Berhasil Masuk" -> "Berhasil Masuk (200 Terkini)"
- "Gagal / Ditolak" -> "Gagal / Ditolak (200 Terkini)"
Tambahkan teks keterangan di bawah judul halaman:
`<p className={styles.pageSubtitle}>Riwayat aktivitas autentikasi (dibatasi 200 aktivitas terbaru untuk optimalisasi performa).</p>`

- [ ] **Step 2: Tandai item N9, N10, N11, N12, N13 sebagai `[x] Selesai` di `docs/AUDIT-2026-09-29.md`**

- [ ] **Step 3: Jalankan build verifikasi menyeluruh**
Run: `npx tsc --noEmit --incremental false && npm run build`
Expected: Sukses 100% tanpa error.
