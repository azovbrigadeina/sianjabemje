# Rencana Implementasi: Duplikasi Unit Kerja & Struktur Jabatan (Universal Unit Cloning)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun fitur duplikasi universal untuk Unit Kerja (OPD, Bagian Setda, Bidang Dinas, Puskesmas, Sekolah, dll) dan seluruh pohon jabatannya beserta uraian tugas Anjab (dengan nilai ABK pegawai riil di-reset 0), dilengkapi modal konfirmasi berlapis 2-langkah.

**Architecture:** 
1. Backend Google Apps Script (`gas/Code.gs`): Menambahkan fungsi atomic batch `duplicateUnitKerja_` yang memetakan ID hirarki jabatan lama ke ID baru, menyalin seluruh 12 tabel anak Anjab, dan melakukan batch write (`fbPatch_`) ke Firebase Realtime Database.
2. Client API (`src/lib/api.ts`): Menambahkan method `duplicateUnitKerja` dengan auto cache invalidation.
3. Frontend UI (`src/components/ModalDuplikasiUnit.tsx`): Komponen modal 2-langkah dengan ringkasan visual dan pertanyaan konfirmasi eksplisit sebelum eksekusi, dipasang pada `/dashboard/opd` dan `/dashboard/organisasi`.

**Tech Stack:** Next.js (App Router, TypeScript, CSS Modules), Google Apps Script (JavaScript), Firebase Realtime Database.

## Global Constraints
- **Aturan Proyek Sianjab**: Operasi write wajib memanggil `invalidateAllCaches_()` di GAS dan `invalidateAllCache()` di client.
- **Pencegahan Timeout GAS**: Semua operasi penulisan data baru (unit baru, puluhan jabatan, ratusan tabel anak) wajib menggunakan batch patch (`fbPatch_`) dalam memori, bukan loop pemanggilan HTTP berulang.
- **Integritas Pohon Hirarki**: `parentId` seluruh jabatan baru harus dipetakan ke ID jabatan atasan yang baru melalui `idMap`.

---

### Task 1: Backend Google Apps Script (`gas/Code.gs`) - Fungsi `duplicateUnitKerja_`

**Files:**
- Modify: `gas/Code.gs:175-185, 410-435, 2520+`

**Interfaces:**
- Produces: Action `duplicateUnitKerja` di `handleRequest_`.
- Parameter: `sourceUnitId`, `mode` ('createNew' | 'existing'), `targetData` (`nama`, `kode`, `parentId`, `targetUnitId`).

- [ ] **Step 1: Daftarkan action `duplicateUnitKerja` ke `writeActions` dan `handleRequest_` di `Code.gs`**

Di `gas/Code.gs`:
1. Tambahkan `'duplicateUnitKerja'` ke array write actions (jika ada daftar write actions di GAS).
2. Tambahkan switch-case pada `handleRequest_`:
```javascript
      case 'duplicateUnitKerja':
        result = duplicateUnitKerja_(params);
        break;
```

- [ ] **Step 2: Implementasikan fungsi `duplicateUnitKerja_(params)` di `Code.gs`**

Tambahkan fungsi lengkap:
```javascript
function duplicateUnitKerja_(params) {
  if (!params) throw new Error("Parameter duplikasi tidak boleh kosong.");
  var sourceUnitId = params.sourceUnitId;
  var mode = params.mode || 'createNew';
  var targetData = params.targetData || {};

  if (!sourceUnitId) throw new Error("Unit sumber wajib dipilih.");

  // 1. Ambil data Unit Kerja & Jabatan aktif (2026)
  var allUnits = fbGet_(getFirebasePath_('unitKerja')) || {};
  var allJbt = fbGet_(getFirebasePath_('jabatan')) || {};

  var sourceUnit = allUnits[sourceUnitId];
  if (!sourceUnit) throw new Error("Unit kerja sumber tidak ditemukan di database.");

  // 2. Filter seluruh jabatan yang terikat ke unit sumber
  var sourceJabatans = [];
  Object.keys(allJbt).forEach(function(k) {
    var j = allJbt[k];
    if (j && j.unitKerjaId === sourceUnitId) {
      j.id = k;
      sourceJabatans.push(j);
    }
  });

  if (sourceJabatans.length === 0) {
    throw new Error("Unit kerja sumber tidak memiliki data jabatan untuk diduplikasi.");
  }

  // 3. Tentukan Target Unit ID & Buat Unit Baru jika mode createNew
  var targetUnitId = '';
  var patchPayloadUnitKerja = {};

  if (mode === 'createNew') {
    if (!targetData.nama || !targetData.nama.trim()) {
      throw new Error("Nama unit kerja baru wajib diisi.");
    }
    var kodeClean = (targetData.kode || '').toString().trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (!kodeClean) {
      kodeClean = 'UNIT_' + Utilities.getUuid().substring(0, 8);
    }

    // Periksa keunikan ID/kode
    if (allUnits[kodeClean]) {
      throw new Error("Kode unit kerja '" + targetData.kode + "' sudah digunakan. Gunakan kode lain.");
    }

    targetUnitId = kodeClean;
    var newUnitObj = {
      nama: targetData.nama.trim(),
      kode: targetData.kode ? targetData.kode.trim() : kodeClean,
      parentId: targetData.parentId || '',
      urutan: targetData.urutan || 0,
      tahun: '2026',
      statusValidasi: 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    patchPayloadUnitKerja[targetUnitId] = newUnitObj;
  } else {
    targetUnitId = targetData.targetUnitId;
    if (!targetUnitId || !allUnits[targetUnitId]) {
      throw new Error("Unit kerja target sasaran tidak valid atau tidak ditemukan.");
    }
  }

  // 4. Bangun ID Translation Map (oldJabatanId -> newJabatanId)
  var idMap = {};
  var newJabatansList = [];

  sourceJabatans.forEach(function(oldJbt) {
    var newId = Utilities.getUuid();
    idMap[oldJbt.id] = newId;
    newJabatansList.push({
      oldJbt: oldJbt,
      newId: newId
    });
  });

  // 5. Susun payload Jabatan Baru dengan parentId yang telah dipetakan
  var patchPayloadJabatan = {};
  newJabatansList.forEach(function(item) {
    var oldJbt = item.oldJbt;
    var newId = item.newId;

    var newParentId = '';
    if (oldJbt.parentId) {
      if (idMap[oldJbt.parentId]) {
        // Parent internal unit: arahkan ke ID jabatan baru
        newParentId = idMap[oldJbt.parentId];
      } else {
        // Parent eksternal (misal atasan di OPD induk): pertahankan
        newParentId = oldJbt.parentId;
      }
    }

    var newJbtObj = {
      namaJabatan: oldJbt.namaJabatan || '',
      kodeJabatan: oldJbt.kodeJabatan || '',
      jenisJabatan: oldJbt.jenisJabatan || 'Fungsional',
      kelasJabatan: oldJbt.kelasJabatan || 1,
      level: oldJbt.level || 4,
      ikhtisarJabatan: oldJbt.ikhtisarJabatan || '',
      urutan: oldJbt.urutan || 0,
      tahun: '2026',
      unitKerjaId: targetUnitId,
      parentId: newParentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Salin field struktural opsional jika ada
    ['jptUtama', 'jptMadya', 'jptPratama', 'administrator', 'pengawas', 'pelaksana', 'jabatanFungsional'].forEach(function(f) {
      if (oldJbt[f]) newJbtObj[f] = oldJbt[f];
    });

    patchPayloadJabatan[newId] = newJbtObj;
  });

  // 6. Salin Uraian Anjab Anak (12 Tabel) & Reset ABK Pegawai Riil
  var childEntities = [
    'kualifikasi', 'syaratJabatan', 'hasilKerja', 'prestasiKerja',
    'tugasPokok', 'bahanKerja', 'perangkatKerja', 'tanggungJawab',
    'wewenang', 'korelasiJabatan', 'kondisiLingkungan', 'risikoBahaya', 'abk'
  ];

  var childPatches = {};
  childEntities.forEach(function(ent) {
    childPatches[ent] = {};
    var tableData = fbGet_(getFirebasePath_(ent)) || {};

    Object.keys(tableData).forEach(function(k) {
      var row = tableData[k];
      if (!row) return;

      var targetOldJabId = row.jabatanId || row.parentId;
      if (targetOldJabId && idMap[targetOldJabId]) {
        var newJabId = idMap[targetOldJabId];
        var newChildId = Utilities.getUuid();
        var clonedRow = JSON.parse(JSON.stringify(row));
        delete clonedRow.id;

        if (clonedRow.jabatanId) clonedRow.jabatanId = newJabId;
        if (clonedRow.parentId) clonedRow.parentId = newJabId;
        clonedRow.createdAt = new Date().toISOString();
        clonedRow.updatedAt = new Date().toISOString();

        // Reset nilai pegawai riil jika tabel abk
        if (ent === 'abk') {
          if ('jumlahPegawai' in clonedRow) clonedRow.jumlahPegawai = 0;
          if ('pegawaiSaatIni' in clonedRow) clonedRow.pegawaiSaatIni = 0;
          if ('bebanKerja' in clonedRow) clonedRow.bebanKerja = 0;
        }

        childPatches[ent][newChildId] = clonedRow;
      }
    });
  });

  // 7. Eksekusi Batch Writes ke Firebase
  if (mode === 'createNew') {
    fbPatch_(getFirebasePath_('unitKerja'), patchPayloadUnitKerja);
  }
  fbPatch_(getFirebasePath_('jabatan'), patchPayloadJabatan);

  childEntities.forEach(function(ent) {
    if (Object.keys(childPatches[ent]).length > 0) {
      fbPatch_(getFirebasePath_(ent), childPatches[ent]);
    }
  });

  // 8. Invalidasi Cache Server
  invalidateAllCaches_();

  return {
    success: true,
    message: "Berhasil menduplikasi " + sourceJabatans.length + " jabatan beserta uraian tugas ke unit sasaran.",
    targetUnitId: targetUnitId,
    totalJabatans: sourceJabatans.length
  };
}
```

- [ ] **Step 3: Verifikasi sintaks JavaScript GAS**

Pastikan kurung kurawal, penamaan variabel, dan fungsi Firebase helper terpasang rapi.

---

### Task 2: Client API Integration (`src/lib/api.ts`)

**Files:**
- Modify: `src/lib/api.ts:50-80, 520-560`

**Interfaces:**
- Produces: `api.duplicateUnitKerja(params)`.
- Updates: `writeActions` array dengan `'duplicateUnitKerja'`.

- [ ] **Step 1: Tambahkan `'duplicateUnitKerja'` ke `writeActions` di `src/lib/api.ts`**

Pastikan pemanggilan action ini memicu `invalidateAllCache()` di sisi klien secara otomatis.

- [ ] **Step 2: Definisikan antarmuka dan method `duplicateUnitKerja` di `api`**

```typescript
export interface DuplicateUnitKerjaParams {
  sourceUnitId: string;
  mode: 'createNew' | 'existing';
  targetData: {
    nama?: string;
    kode?: string;
    parentId?: string;
    urutan?: number;
    targetUnitId?: string;
  };
}

// Di dalam object api:
  duplicateUnitKerja: (params: DuplicateUnitKerjaParams) =>
    apiCall<{ success: boolean; message: string; targetUnitId: string; totalJabatans: number }>(
      'duplicateUnitKerja',
      'unitKerja',
      { params }
    ),
```

- [ ] **Step 3: Verifikasi Typecheck TypeScript**

Run: `npx tsc --noEmit --incremental false`
Expected: Exit code 0.

---

### Task 3: UI Modal Duplikasi Unit Kerja 2-Langkah (`src/components/ModalDuplikasiUnit.tsx`)

**Files:**
- Create: `src/components/ModalDuplikasiUnit.tsx`
- Create: `src/components/ModalDuplikasiUnit.module.css`
- Modify: `src/app/dashboard/opd/page.tsx`
- Modify: `src/app/dashboard/organisasi/page.tsx`

**Interfaces:**
- Props: `isOpen`, `onClose`, `onSuccess`, `unitKerjas: UnitKerja[]`, `jabatans?: Jabatan[]`.

- [ ] **Step 1: Buat file styling `src/components/ModalDuplikasiUnit.module.css`**

Mencakup layout modal backdrop, wizard steps, form input, warning review card, dan tombol aksi.

- [ ] **Step 2: Buat komponen `ModalDuplikasiUnit.tsx`**

Komponen mencakup:
1. **State Wizard**: `step === 1` (Form Input) dan `step === 2` (Review & Konfirmasi Berlapis).
2. **Kalkulasi Data**: Menghitung jumlah jabatan pada unit sumber yang dipilih.
3. **Validasi Input**: Validasi nama unit baru dan kode pada langkah 1 sebelum lanjut ke langkah 2.
4. **Layar Konfirmasi (Step 2)**:
   - Tampilkan kartu ringkasan: Unit Sumber (dan jumlah jabatannya), Unit Tujuan, OPD Induk, Cakupan Data.
   - Pertanyaan konfirmasi eksplisit:
     *"Apakah Anda yakin akan menduplikasi seluruh jabatan dari [Unit Sumber] lalu membuat unit baru ke [Unit Sasaran] di bawah naungan [OPD Induk]?"*
   - Tombol `⬅️ Kembali & Periksa Ulang` dan `✅ Ya, Lanjutkan Duplikasi`.
5. **Eksekusi API**: Memanggil `api.duplicateUnitKerja(payload)` dengan state loading `submitting`.

- [ ] **Step 3: Pasang tombol `📋 Duplikasi Unit & Jabatan` di `/dashboard/opd/page.tsx`**

Tambahkan tombol di header bar halaman OPD dan render `<ModalDuplikasiUnit />`. Ketika duplikasi sukses, panggil `loadData(true)`.

- [ ] **Step 4: Pasang tombol `📋 Duplikasi Unit & Jabatan` di `/dashboard/organisasi/page.tsx`**

Tambahkan tombol di header bar bagan organisasi dan panggil refresh data setelah duplikasi sukses.

- [ ] **Step 5: Verifikasi typecheck TypeScript**

Run: `npx tsc --noEmit --incremental false`
Expected: Exit code 0.

---

### Task 4: Verifikasi Sistem, Build, dan Deployment

**Files:**
- Test & Verify: Seluruh workspace Sianjab

- [ ] **Step 1: Jalankan typecheck penuh**

Run: `npx tsc --noEmit --incremental false`
Expected: Exit code 0.

- [ ] **Step 2: Jalankan Next.js build**

Run: `npm run build`
Expected: 29/29 halaman static ter-generate tanpa error.

- [ ] **Step 3: Commit seluruh perubahan Task 1 - 3**

```bash
git add gas/Code.gs src/lib/api.ts src/components/ModalDuplikasiUnit.tsx src/components/ModalDuplikasiUnit.module.css src/app/dashboard/opd/page.tsx src/app/dashboard/organisasi/page.tsx
git commit -m "feat: tambahkan fitur duplikasi unit kerja dan struktur jabatan dengan konfirmasi berlapis"
```
