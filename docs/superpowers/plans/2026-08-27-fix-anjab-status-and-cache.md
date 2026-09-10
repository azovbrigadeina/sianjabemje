# Fix Anjab Status Indicator and Editor Data Fetching Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure database data is correctly reflected in the UI without stale empty editor states or false "Anjab Kosong" badges.

**Architecture:**
1. Bypass client-side IndexedDB caching in `src/lib/api.ts` for `getJabatanFull` so clicking "Isi Anjab" always fetches live data from Firebase/GAS.
2. Expand `getBulkData` and `anjabTerisi` status calculation across dashboard and operator pages (`analisis`, `beban-kerja`, `verifikasi`) to check `tugasPokok`, `syaratJabatan`, `kualifikasi`, and `bahanKerja`.
3. Update `invalidateAllCaches_` in `gas/Code.gs` to include all ANJAB entities.

**Tech Stack:** Next.js, TypeScript, GAS Backend, Client API client.

## Global Constraints
- Do not alter Firebase Realtime Database structures or delete existing user data.
- Maintain high performance via bulk read APIs (`getBulkData`).

---

### Task 1: Fix Client API Caching in `src/lib/api.ts`

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Exclude `getJabatanFull` from client-side caching**

In `src/lib/api.ts`, update `apiCall` so that `getJabatanFull` is not stored in client IndexedDB/memory cache:
```typescript
const noCacheActions = ['getJabatanFull'];
const shouldCache = !isWriteOperation && !noCacheActions.includes(action);
if (shouldCache) {
  await setCache(url, json.data);
}
```
And when `getFromCache` is called:
```typescript
if (noCacheActions.includes(action)) {
  // Always skip cache for getJabatanFull
}
```

---

### Task 2: Update GAS Cache Invalidation in `gas/Code.gs`

**Files:**
- Modify: `gas/Code.gs`

- [ ] **Step 1: Add ANJAB entities to cacheable and invalidation lists in `Code.gs`**

In `gas/Code.gs`:
Update `invalidateAllCaches_()` and `cacheable` array to include `'syaratJabatan'`, `'kualifikasi'`, `'bahanKerja'`.

---

### Task 3: Update `anjabTerisi` Calculation and Bulk Fetching across Dashboard & Operator Pages

**Files:**
- Modify: `src/app/dashboard/analisis/page.tsx`
- Modify: `src/app/operator/analisis/page.tsx`
- Modify: `src/app/dashboard/beban-kerja/page.tsx`
- Modify: `src/app/operator/beban-kerja/page.tsx`
- Modify: `src/app/dashboard/verifikasi/page.tsx`

- [ ] **Step 1: Update bulk data call and `anjabTerisi` logic in `analisis` and `beban-kerja` pages**

Use `getBulkData(['unitKerja', 'jabatan', 'tugasPokok', 'syaratJabatan', 'kualifikasi', 'bahanKerja'])`.
Set `anjabTerisi`:
```typescript
const isTerisi = (jbt.ikhtisarJabatan && jbt.ikhtisarJabatan.trim().length > 5) || 
                 !!tpMap[jbt.id] || 
                 !!sjMap[jbt.id] || 
                 !!kqMap[jbt.id] || 
                 !!bkMap[jbt.id];
```

---

### Task 4: Build & Deployment

- [ ] **Step 1: Run `npm run build`**
- [ ] **Step 2: Deploy to Firebase Hosting and GAS**
