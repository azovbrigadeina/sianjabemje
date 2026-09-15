# Database Backup & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, secure Database Backup & Restore menu (`/dashboard/backup-database`) in Sianjab for Superadmins (`admin`), enabling full JSON exports (including all year folders like `2026`, `2027` and global tables like `users`, `referensiJabatan`), safety preview validation, emergency auto-backups, and backend cache invalidation.

**Architecture:** 
1. Backend actions in Google Apps Script (`gas/Code.gs`) to read/write entire Firebase Realtime Database trees cleanly and securely.
2. API methods in Next.js frontend (`src/lib/api.ts`) to bridge client calls to GAS backend and handle automatic client cache invalidation.
3. Interactive Next.js Page (`src/app/dashboard/backup-database/page.tsx`) and Sidebar Link (`src/app/dashboard/layout.tsx`) featuring Safety Preview Modal, Emergency Auto-Backup before restore, and Security Log table.

**Tech Stack:** Next.js (App Router), TypeScript, Google Apps Script (GAS), Firebase Realtime Database.

## Global Constraints
- **Deployment Flag:** Always deploy GAS using `npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw -d "<description>"`.
- **Cache Invalidation:** Call `invalidateAllCaches_()` in GAS and `invalidateAllCache()` in client API for all write/restore operations.
- **No Dummy Fallbacks:** Throw explicit error messages on invalid JSON or failed API calls.

---

### Task 1: Backend Implementation in Google Apps Script (`gas/Code.gs`)

**Files:**
- Modify: `gas/Code.gs`

**Interfaces:**
- Consumes: Firebase Realtime Database REST API (`fbGet_`, `fbPut_`, `invalidateAllCaches_`, `logSecurityEvent_`).
- Produces: GAS actions `exportFullDatabase` and `restoreFullDatabase`.

- [ ] **Step 1: Add `exportFullDatabase` and `restoreFullDatabase` cases to `handleRequest_` in `gas/Code.gs`**

Add the switch cases under `handleRequest_`:
```javascript
case 'exportFullDatabase':
  result = exportFullDatabase_();
  break;
case 'restoreFullDatabase':
  result = restoreFullDatabase_(params.data, params._user);
  break;
```

- [ ] **Step 2: Add `exportFullDatabase_()` helper function in `gas/Code.gs`**

```javascript
function exportFullDatabase_() {
  Logger.log('[BACKUP] === exportFullDatabase_ STARTED ===');
  var fullData = fbGet_('') || {};
  
  var exportPayload = {
    app: 'SIANJAB_ABK',
    version: '1.0',
    timestamp: new Date().toISOString(),
    exportedAt: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    data: fullData
  };
  
  Logger.log('[BACKUP] === exportFullDatabase_ COMPLETED ===');
  return exportPayload;
}
```

- [ ] **Step 3: Add `restoreFullDatabase_()` helper function in `gas/Code.gs`**

```javascript
function restoreFullDatabase_(backupPayload, currentUser) {
  Logger.log('[RESTORE] === restoreFullDatabase_ STARTED ===');
  if (!backupPayload || typeof backupPayload !== 'object' || !backupPayload.data) {
    throw new Error('Payload backup tidak valid: Node data utama tidak ditemukan.');
  }

  var restoredData = backupPayload.data;
  
  // Write each root node safely
  var rootKeys = Object.keys(restoredData);
  for (var i = 0; i < rootKeys.length; i++) {
    var key = rootKeys[i];
    fbPut_(key, restoredData[key]);
  }

  // Clear all GAS backend caches
  invalidateAllCaches_();

  // Log Security Event
  logSecurityEvent_({
    timestamp: new Date().toISOString(),
    event: 'RESTORE_DATABASE',
    user: currentUser ? (currentUser.username || currentUser.nama) : 'System Admin',
    details: 'Database restored from JSON backup (' + rootKeys.length + ' top-level nodes restored)'
  });

  Logger.log('[RESTORE] === restoreFullDatabase_ COMPLETED ===');
  return {
    success: true,
    message: 'Database berhasil dipulihkan (' + rootKeys.length + ' node utama ter-update)',
    restoredKeysCount: rootKeys.length
  };
}
```

- [ ] **Step 4: Deploy Google Apps Script using clasp with specific ID**

Run command:
`npx @google/clasp push && npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw -d "Add export and restore database actions"`

- [ ] **Step 5: Verify GAS push and deploy succeeded**

---

### Task 2: Frontend API Methods & Cache Register (`src/lib/api.ts`)

**Files:**
- Modify: `src/lib/api.ts`

**Interfaces:**
- Consumes: GAS endpoints `exportFullDatabase` and `restoreFullDatabase`.
- Produces: Client methods `api.exportFullDatabase()` and `api.restoreFullDatabase(payload)`.

- [ ] **Step 1: Register `restoreFullDatabase` in `writeActions` array in `src/lib/api.ts`**

Update `writeActions`:
```typescript
const writeActions = [
  'createRecord', 'updateRecord', 'deleteRecord',
  'saveSingleEntity', 'saveMultiEntity', 'batchDeleteEntity',
  'syncUsulanWithGas', 'finalizePenyesuaian', 'kunciAnalisis',
  'saveTemplateDocx', 'saveTagMappings', 'saveDeadline',
  'batchUpdateIntegrasiSitpp', 'saveAiConfig', 'clearAllLogs',
  'restoreFullDatabase'
];
```

- [ ] **Step 2: Add API methods to `api` object in `src/lib/api.ts`**

```typescript
  exportFullDatabase: async () => {
    return await apiCall('exportFullDatabase');
  },

  restoreFullDatabase: async (backupPayload: any) => {
    return await apiCall('restoreFullDatabase', { data: backupPayload });
  },
```

- [ ] **Step 3: Run `npm run build` to verify TypeScript definitions and syntax**

---

### Task 3: Sidebar Navigation Update (`src/app/dashboard/layout.tsx`)

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: Navigation link layout.
- Produces: Sidebar link `Backup & Restore`.

- [ ] **Step 1: Add Link item in `src/app/dashboard/layout.tsx`**

In the "Administrasi" navigation section:
```tsx
<Link href="/dashboard/backup-database" className={`${styles.navItem} ${pathname.includes('/backup-database') ? styles.active : ''}`}>
  <span className={styles.navIcon}>💾</span> <span className={styles.navText}>Backup & Restore</span>
</Link>
```

- [ ] **Step 2: Update header page title mapper in `layout.tsx`**

```tsx
if (pathname.includes('/backup-database')) return 'Backup & Restore Database';
```

- [ ] **Step 3: Verify build with `npm run build`**

---

### Task 4: UI Component & Page Implementation (`src/app/dashboard/backup-database/page.tsx`)

**Files:**
- Create: `src/app/dashboard/backup-database/page.tsx`
- Create: `src/app/dashboard/backup-database/page.module.css`

**Interfaces:**
- Consumes: `api.exportFullDatabase`, `api.restoreFullDatabase`, `api.readAllEntity('security_logs', '')`, `UserContext`.
- Produces: Interactive page with Download Backup, Safety Preview Modal, Emergency Snapshot Download, and Security Log History.

- [ ] **Step 1: Create CSS module `page.module.css`**

Create CSS module with clean card layouts, badge status, file dropzone, modal backdrop, and button styles.

- [ ] **Step 2: Create React Page Component `page.tsx`**

Features to include:
1. Superadmin role check guard (`user?.role === 'admin'`).
2. Export function: calls `api.exportFullDatabase()`, triggers JSON file download (`backup_sianjab_YYYYMMDD_HHMMSS.json`).
3. Import & Safety Preview:
   - Reads `.json` file using `FileReader`.
   - Validates JSON structure.
   - Extracts node statistics (Counts for year nodes like `2026`, `2027`, `users`, `referensiJabatan`).
   - Displays **Safety Preview Modal**.
4. Emergency Auto-Backup & Restore Execution:
   - When user clicks "Konfirmasi & Restore Database", it first triggers `api.exportFullDatabase()` to automatically download `auto_backup_sebelum_restore_<timestamp>.json`.
   - Then executes `api.restoreFullDatabase(uploadedPayload)`.
   - Displays success notification, clears state, and reloads audit logs.
5. Security Audit Log Table:
   - Fetches and displays recent `BACKUP_EXPORT` and `RESTORE_DATABASE` security events.

- [ ] **Step 3: Run `npm run build` to verify no compilation errors**

---

### Task 5: Build & Deployment Verification

**Files:**
- Output: Firebase Hosting deployment + GAS backend update.

- [ ] **Step 1: Execute `npm run build`**
- [ ] **Step 2: Deploy Next.js to Firebase Hosting & push GAS to backend**
Run: `npm run build && npx firebase-tools deploy`
Run: `npx @google/clasp push && npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw -d "Deploy Database Backup & Restore Menu"`
- [ ] **Step 3: Verify output and completion**
