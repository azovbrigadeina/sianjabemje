# Fix Urutan Reorder & Referensi Validation in Struktur Organisasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix saving of visual ordering (drag-and-drop & manual edit) in Struktur Organisasi for both Dashboard Admin and Operator, and fix the false referensi validation error when saving jabatan.

**Architecture:**
1. Fix backend GAS `updateUrutanBatch_` to support `unitKerja` with proper access checks (`assertRecordAccess_`), while maintaining fail-closed security for `jabatan` and child entities.
2. In Next.js frontend (`dashboard/organisasi/page.tsx` & `operator/organisasi/page.tsx`), isolate reordering payloads by node type (`filter(c => c.type === targetNode.type)`), normalize parent comparisons, show toasts only upon API success, update React state (`rawJabatans`/`rawOpds`), and add missing `urutan` input to operator jabatan modal.
3. Fix referensi loading and validation in `organisasi` pages by ensuring `referensiJabatan` is loaded on demand/hydrated, handling edit mode when name is unchanged, and allowing seamless manual editing of `urutan`.

**Tech Stack:** Next.js (React 19), Google Apps Script (GAS), Firebase Realtime Database.

---

### Task 1: Update GAS Backend `updateUrutanBatch_` & Add Tests
**Files:**
- Modify: `gas/Code.gs:1388-1432`
- Test: `gas/tests/simulate-ai-pintar.js:400-465`

- [ ] **Step 1: Write test case in `simulate-ai-pintar.js` for `updateUrutanBatch_` on `unitKerja`**
- [ ] **Step 2: Update `gas/Code.gs` in `updateUrutanBatch_` to support `entity === 'unitKerja'` with `assertRecordAccess_`**
- [ ] **Step 3: Run `node gas/tests/simulate-ai-pintar.js` to ensure all tests pass**

---

### Task 2: Fix Frontend `handleDrop` in `dashboard/organisasi/page.tsx` and `operator/organisasi/page.tsx`
**Files:**
- Modify: `src/app/dashboard/organisasi/page.tsx:80-155`
- Modify: `src/app/operator/organisasi/page.tsx:80-155`

- [ ] **Step 1: Filter sibling payload by `c.type === targetNode.type` so OPD IDs and Jabatan IDs are never mixed in batch updates**
- [ ] **Step 2: Normalize parent/unitKerja comparisons (`|| ''`) and enforce `draggedNode.type === targetNode.type`**
- [ ] **Step 3: Move success toast after successful `await api.updateUrutanBatch(...)`, add catch error toast, and update `rawJabatans`/`rawOpds` state**

---

### Task 3: Fix Referensi Loading & Validation in `dashboard/organisasi/page.tsx` and `operator/organisasi/page.tsx`
**Files:**
- Modify: `src/app/dashboard/organisasi/page.tsx`
- Modify: `src/app/operator/organisasi/page.tsx`

- [ ] **Step 1: Ensure `rawReferensi` is loaded in `operator/organisasi/page.tsx` (add `ensureReferensiLoaded` and call in `openAddModal`/`openEditModal`, load in bulk data if needed)**
- [ ] **Step 2: In `dashboard/organisasi/page.tsx`, call `ensureReferensiLoaded()` in `openEditModal`**
- [ ] **Step 3: In both pages, add check in `handleModalSave`: if `modalMode === 'edit'` and name is unchanged from existing record, allow saving without blocking**
- [ ] **Step 4: In `operator/organisasi/page.tsx`, add the missing `Urutan (Opsional)` input field for Jabatan in the modal**

---

### Task 4: Verification & Build
**Files:**
- Run build & verification

- [ ] **Step 1: Run `npm run build` to confirm zero TypeScript and linting errors**
- [ ] **Step 2: Run `node gas/tests/simulate-ai-pintar.js` to confirm GAS tests pass**
- [ ] **Step 3: Verification report**
