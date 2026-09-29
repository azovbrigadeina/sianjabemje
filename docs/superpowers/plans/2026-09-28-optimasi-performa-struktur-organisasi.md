# Rencana Implementasi: Optimasi Performa Tambah, Edit, dan Hapus Jabatan di Bagan Organisasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mempercepat operasi Tambah, Edit, dan Hapus Jabatan di Bagan Organisasi Admin dan Operator (turun dari 5-8 detik ke < 1 detik) dan menghemat kuota GAS hingga 80% dengan menerapkan parallel fetch di backend dan in-memory state mutation di frontend tanpa refetch database se-kabupaten.

**Architecture:**
1. Backend GAS (`gas/Code.gs`): Mengoptimasi `deleteRecord_` dengan `UrlFetchApp.fetchAll` (13 tabel paralel) dan menambahkan endpoint `createBatchJabatans_` untuk membuat formasi fungsional (4 jenjang) dalam 1 HTTP request.
2. Client API (`src/lib/api.ts`): Menambahkan `api.createBatchJabatans`.
3. Frontend (`/dashboard/organisasi` & `/operator/organisasi`): Mengganti `await loadData(true)` pasca-aksi dengan mutasi memori lokal (`setRawJabatans` & `buildOrgTreeNodes`) yang mempertahankan status buka/tutup cabang pohon (*zero flicker*).

**Tech Stack:** Next.js (TypeScript, React), Google Apps Script (JavaScript), Firebase Realtime Database.

## Global Constraints
- Mempertahankan integritas cascading delete data turunan Anjab di Firebase.
- Menjaga keakuratan pohon silsilah tanpa merusak parentId atasan-bawahan.
- Mencegah unduhan ulang data seluruh OPD (`loadData(true)`) pasca operasi simpan/hapus.

---

### Task 1: Backend GAS (`gas/Code.gs`) - Parallel Cascading Fetch & Batch Create

**Files:**
- Modify: `gas/Code.gs:420-445, 800-845, 2320+`

**Interfaces:**
- Produces: Action `createBatchJabatans` di `handleRequest_`.
- Optimizes: `deleteRecord_('jabatan', id)` menggunakan `UrlFetchApp.fetchAll`.

- [x] **Step 1: Optimasi `deleteRecord_('jabatan', id)` menggunakan `UrlFetchApp.fetchAll` di `gas/Code.gs`**

Ganti loop 13x `fbGet_` di `deleteRecord_` dengan pembacaan paralel:
```javascript
    // 2. Cascading Delete entitas anak menggunakan UrlFetchApp.fetchAll paralel
    var childEntities = [
      'kualifikasi', 'syaratJabatan', 'hasilKerja', 'prestasiKerja', 'abk',
      'tugasPokok', 'bahanKerja', 'perangkatKerja', 'tanggungJawab',
      'wewenang', 'korelasiJabatan', 'kondisiLingkungan', 'risikoBahaya'
    ];

    var fetchRequests = childEntities.map(function(ent) {
      var url = FIREBASE_URL + '/' + getFirebasePath_(ent) + '.json?auth=' + FIREBASE_SECRET;
      return {
        url: url,
        method: 'get',
        muteHttpExceptions: true
      };
    });

    var responses = UrlFetchApp.fetchAll(fetchRequests);
    for (var i = 0; i < childEntities.length; i++) {
      var ent = childEntities[i];
      var res = responses[i];
      if (res.getResponseCode() === 200) {
        var tableData = JSON.parse(res.getContentText());
        if (tableData) {
          var patchPayload = {};
          var count = 0;
          Object.keys(tableData).forEach(function(key) {
            var item = tableData[key];
            if (item && (item.jabatanId === id || item.parentId === id)) {
              patchPayload[key] = null;
              count++;
            }
          });

          if (count > 0) {
            fbPatch_(getFirebasePath_(ent), patchPayload);
            invalidateCache_(ent);
          }
        }
      }
    }
```

- [x] **Step 2: Tambahkan fungsi `createBatchJabatans_(items)` di `gas/Code.gs`**

```javascript
function createBatchJabatans_(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error("Daftar jabatan baru tidak boleh kosong.");
  }

  var patchPayload = {};
  var createdItems = [];
  var now = new Date().toISOString();

  items.forEach(function(data) {
    var newId = Utilities.getUuid();
    var record = JSON.parse(JSON.stringify(data));
    record.createdAt = now;
    record.updatedAt = now;
    patchPayload[newId] = record;

    var returnItem = JSON.parse(JSON.stringify(record));
    returnItem.id = newId;
    createdItems.push(returnItem);
  });

  fbPatch_(getFirebasePath_('jabatan'), patchPayload);
  invalidateCache_('jabatan');

  return {
    success: true,
    count: createdItems.length,
    items: createdItems
  };
}
```

- [x] **Step 3: Tambahkan `case 'createBatchJabatans':` pada `handleRequest_` di `Code.gs`**

```javascript
      case 'createBatchJabatans':
        result = createBatchJabatans_(data && data.items ? data.items : data);
        break;
```

---

### Task 2: Client API Integration (`src/lib/api.ts`)

**Files:**
- Modify: `src/lib/api.ts`

- [x] **Step 1: Daftarkan `'createBatchJabatans'` ke `writeActions`**

- [x] **Step 2: Tambahkan method `api.createBatchJabatans`**

```typescript
  createBatchJabatans: (items: any[]) =>
    apiCall<{ success: boolean; count: number; items: any[] }>(
      'createBatchJabatans',
      'jabatan',
      { data: { items } }
    ),
```

---

### Task 3: Optimasi Frontend di Bagan Organisasi Admin (`/dashboard/organisasi/page.tsx`)

**Files:**
- Modify: `src/app/dashboard/organisasi/page.tsx`

- [x] **Step 1: Optimasi `handleModalSave` untuk Edit Jabatan**
  - Setelah `api.updateJabatan` sukses:
    - Mutasi `rawJabatans` secara lokal.
    - Re-generate `const { roots } = buildOrgTreeNodes(rawOpds, updatedJabatans); setTreeData(roots);`
    - Hapus pemanggilan `await loadData(true);`.

- [x] **Step 2: Optimasi `handleModalSave` untuk Tambah Jabatan (Single & Batch)**
  - Untuk Fungsional Keahlian / Keterampilan: panggil `api.createBatchJabatans(payloads)` dalam 1 request.
  - Untuk jabatan biasa: panggil `api.createJabatan(jabatanPayload)`.
  - Sisipkan `createdItems` ke `rawJabatans` lokal.
  - Re-generate pohon secara lokal.
  - Auto-expand parent: `setExpandedNodes(prev => ({ ...prev, [pId]: true }));`
  - Hapus pemanggilan `await loadData(true);`.

- [x] **Step 3: Optimasi `handleDelete` untuk Hapus Jabatan**
  - Setelah `api.deleteJabatan(node.id)` sukses:
    - Filter keluar `node.id` dari `rawJabatans`.
    - Re-generate pohon secara lokal.
    - Hapus pemanggilan `await loadData(true);`.

---

### Task 4: Optimasi Frontend di Bagan Organisasi Operator (`/operator/organisasi/page.tsx`)

**Files:**
- Modify: `src/app/operator/organisasi/page.tsx`

- [x] **Step 1: Terapkan mutasi lokal yang sama pada `handleModalSave` dan `handleDelete` di halaman operator**

---

### Task 5: Verifikasi, Build, dan Deployment

**Files:**
- Test & Deploy

- [x] **Step 1: Jalankan typecheck penuh**
  `npx tsc --noEmit --incremental false`

- [x] **Step 2: Jalankan build Next.js**
  `npm run build`

- [x] **Step 3: Deploy frontend dan backend**
  - `npx firebase-tools deploy --only hosting`
  - `npx @google/clasp push && npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw`
