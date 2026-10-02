# Tahap 2 Implementation Plan: Reliabilitas Eksekusi, Keamanan Arsip Database, & Eliminasi Ketergantungan Spreadsheet

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengimplementasikan timeout dinamis klien (N4), sanitasi kredensial ekspor backup & preservasi akun saat restore dengan LockService (N6, N7), serta menghapus seluruh fitur sinkronisasi Google Spreadsheet demi memusatkan Firebase Realtime Database sebagai SSOT (N8 & pembersihan legacy).

**Architecture:** Modifikasi penanganan timeout di `src/lib/api.ts`, penambahan proteksi kredensial & mutex lock di `gas/Code.gs`, penambahan banner peringatan resmi di `src/app/dashboard/backup-database/page.tsx`, dan pembersihan seluruh antarmuka Spreadsheet di `src/app/dashboard/organisasi/page.tsx` & `src/app/operator/organisasi/page.tsx`.

**Tech Stack:** Next.js (App Router, Static Export), TypeScript, Google Apps Script (Clasp), Firebase Realtime Database, Firebase Hosting.

## Global Constraints
- Target GAS Deployment ID: `AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw` (wajib `-i`).
- Static Next.js export: wajib lolos `npx tsc --noEmit --incremental false` dan `npm run build`.
- Jangan menghapus mekanisme invalidasi cache `invalidateAllCaches_()`.

---

### Task 1: Dynamic Client Timeout di `src/lib/api.ts` (N4)

**Files:**
- Modify: `src/lib/api.ts:275-298`

**Interfaces:**
- Consumes: `context?.action` dari parameter `executeActualRequest`
- Produces: `timeoutMs` dinamis (150s untuk AI, 180s untuk restore, 120s untuk ekspor, 30s default)

- [ ] **Step 1: Definisikan mapping timeout diperpanjang**
Tambahkan konstanta mapping:
```typescript
const EXTENDED_TIMEOUT_ACTIONS: Record<string, number> = {
  generateAnjabWithAI: 150000,
  testAiConnection: 60000,
  restoreFullDatabase: 180000,
  exportFullDatabase: 120000,
  exportForSitpp: 120000,
};
```

- [ ] **Step 2: Terapkan dynamic timeout pada `executeActualRequest`**
Ganti baris `const timeoutMs = 30000;` dengan:
```typescript
const timeoutMs = (context?.action && EXTENDED_TIMEOUT_ACTIONS[context.action])
  ? EXTENDED_TIMEOUT_ACTIONS[context.action]
  : 30000;
```
Sesuaikan pesan error abort:
```typescript
timeoutId = setTimeout(() => controller.abort(new Error(`Server membutuhkan waktu lebih lama untuk memproses ${context?.action || 'permintaan'}. (Batas waktu: ${timeoutMs / 1000}s)`)), timeoutMs);
```

- [ ] **Step 3: Jalankan typecheck TypeScript**
Run: `npx tsc --noEmit --incremental false`
Expected: 0 error.

---

### Task 2: Sanitasi Backup & Preservasi Kredensial Database dengan LockService di `gas/Code.gs` (N6, N7)

**Files:**
- Modify: `gas/Code.gs:3980-4025`

**Interfaces:**
- Produces: `exportFullDatabase_` (sanitized JSON), `restoreFullDatabase_` (atomic mutex + preserved credentials)

- [ ] **Step 1: Perbarui fungsi `exportFullDatabase_` dengan sanitasi kredensial**
Di `gas/Code.gs`:
```javascript
function exportFullDatabase_() {
  var fullData = fbGet_('') || {};
  
  // Sanitasi node users: jangan ekspor hash password
  if (fullData.users && typeof fullData.users === 'object') {
    for (var uId in fullData.users) {
      if (fullData.users[uId]) {
        delete fullData.users[uId].password;
        fullData.users[uId]._hasPassword = true;
      }
    }
  }

  // Sanitasi node settings: jangan ekspor kunci API AI mentah
  if (fullData.settings && fullData.settings.ai && typeof fullData.settings.ai === 'object') {
    var ai = fullData.settings.ai;
    for (var k in ai) {
      if (k.toLowerCase().indexOf('apikey') !== -1 || k.toLowerCase().indexOf('secret') !== -1 || k === 'savedKeys') {
        delete ai[k];
      }
    }
  }

  return {
    app: 'SIANJAB_ABK',
    version: '1.0',
    timestamp: new Date().toISOString(),
    exportedAt: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    sanitized: true,
    data: fullData
  };
}
```

- [ ] **Step 2: Perbarui fungsi `restoreFullDatabase_` dengan `LockService` & preservasi kredensial**
Di `gas/Code.gs`:
```javascript
function restoreFullDatabase_(backupPayload, currentUser) {
  if (!backupPayload || !backupPayload.data) {
    throw new Error('Payload backup tidak valid: Node data utama tidak ditemukan.');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Server sedang sibuk memproses transaksi database lain. Silakan coba beberapa saat lagi.');
  }

  try {
    var restoredData = backupPayload.data;

    // Preservasi kredensial akun aktif jika file backup tidak memiliki password
    var existingUsers = fbGet_('users') || {};
    if (restoredData.users && typeof restoredData.users === 'object') {
      for (var uId in restoredData.users) {
        var rUser = restoredData.users[uId];
        if (rUser && !rUser.password && existingUsers[uId] && existingUsers[uId].password) {
          rUser.password = existingUsers[uId].password;
        }
        delete rUser._hasPassword;
      }
    }

    // Preservasi kredensial AI jika file backup tidak menyertakannya
    var existingAi = fbGet_('settings/ai') || {};
    if (restoredData.settings && restoredData.settings.ai && typeof restoredData.settings.ai === 'object') {
      var rAi = restoredData.settings.ai;
      for (var aiKey in existingAi) {
        if (!rAi[aiKey] && (aiKey.toLowerCase().indexOf('apikey') !== -1 || aiKey === 'savedKeys')) {
          rAi[aiKey] = existingAi[aiKey];
        }
      }
    }

    // Eksekusi penulisan node utama
    var rootKeys = Object.keys(restoredData);
    for (var i = 0; i < rootKeys.length; i++) {
      var key = rootKeys[i];
      fbPut_(key, restoredData[key]);
    }

    invalidateAllCaches_();
    logSecurityEvent_({
      timestamp: new Date().toISOString(),
      event: 'RESTORE_DATABASE',
      user: currentUser ? (currentUser.username || currentUser.nama) : 'System Admin',
      details: 'Database restored safely (' + rootKeys.length + ' top-level nodes restored, credentials preserved)'
    });

    return {
      success: true,
      message: 'Database berhasil dipulihkan (' + rootKeys.length + ' node utama ter-update, kredensial pengguna diamankan)',
      restoredKeysCount: rootKeys.length
    };
  } finally {
    lock.releaseLock();
  }
}
```

---

### Task 3: Peringatan Keamanan Arsip di `src/app/dashboard/backup-database/page.tsx` (N7)

**Files:**
- Modify: `src/app/dashboard/backup-database/page.tsx`

**Interfaces:**
- Produces: Komponen banner peringatan keamanan resmi pada kartu unduh backup database.

- [ ] **Step 1: Tambahkan banner peringatan resmi pada antarmuka backup**
Di bagian atas kartu download backup:
```tsx
<div style={{
  background: 'rgba(234, 179, 8, 0.08)',
  border: '1px solid rgba(234, 179, 8, 0.3)',
  borderRadius: '12px',
  padding: '1rem 1.25rem',
  marginBottom: '1.5rem',
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'flex-start'
}}>
  <span style={{ fontSize: '1.25rem' }}>⚠️</span>
  <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--foreground)' }}>
    <strong>PERINGATAN RESMI ARSIP DATABASE:</strong><br />
    Berkas cadangan JSON ini memuat seluruh data formasi jabatan, analisis beban kerja, dan unit kerja Pemerintah Kabupaten Muaro Jambi. Harap simpan berkas di media penyimpanan resmi yang aman. Demi standar privasi, kredensial sensitif (kunci API AI & hash password) secara otomatis disanitasi oleh sistem saat diunduh.
  </div>
</div>
```

---

### Task 4: Eliminasi Total Sinkronisasi Google Spreadsheet (N8 & Pembersihan Legacy)

**Files:**
- Modify: `gas/Code.gs`
- Modify: `src/lib/api.ts`
- Modify: `src/app/dashboard/organisasi/page.tsx`
- Modify: `src/app/operator/organisasi/page.tsx`

- [ ] **Step 1: Hapus method `syncToSheet` dan `syncFromSheet` dari `src/lib/api.ts`**
Hapus baris fungsi dan pembersihan `writeActions` yang memuat `'syncToSheet'` dan `'syncFromSheet'`.

- [ ] **Step 2: Hapus handler dan tombol Spreadsheet di `src/app/dashboard/organisasi/page.tsx` & `src/app/operator/organisasi/page.tsx`**
Hapus `handleSyncToSheet`, `handleSyncFromSheet`, state yang tidak diperlukan, serta tombol-tombol sync dari UI.

- [ ] **Step 3: Hapus action dan fungsi Spreadsheet di `gas/Code.gs`**
Hapus:
- `'syncToSheet'`, `'syncFromSheet'`, `'getSptSpreadsheetData'` dari `ADMIN_ONLY_ACTIONS_` dan switch case di `handleRequest_`.
- `syncToSheet_`, `syncFromSheet_`, `syncFromSheetClean_`, `getSptSpreadsheetData_`, dan menu `SpreadsheetApp` di `onOpen`.

---

### Task 5: Verifikasi Nyata, Build Next.js, dan Deployment ke GAS & Firebase Hosting

- [ ] **Step 1: Jalankan typecheck TypeScript**
Run: `npx tsc --noEmit --incremental false`
Expected: 0 error.

- [ ] **Step 2: Jalankan build Next.js**
Run: `npm run build`
Expected: 29 halaman static ter-compile dengan exit code 0.

- [ ] **Step 3: Deploy Google Apps Script**
Run: `npx @google/clasp push`
Run: `npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw -d "Tahap 2: Reliabilitas Eksekusi, Keamanan Arsip Database, & Eliminasi Spreadsheet (N4, N6, N7, N8)"`

- [ ] **Step 4: Deploy Firebase Hosting**
Run: `npx firebase-tools deploy --only hosting`

- [ ] **Step 5: Verifikasi Live & Audit Checklist**
Uji live sanitasi backup, pastikan tidak ada password/API key di hasil ekspor.
Tandai N4, N6, N7, N8 sebagai `[x] Selesai` di `docs/AUDIT-2026-09-29.md`.
Commit perubahan ke Git.
