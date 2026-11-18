# Security Phase 2 — IDOR, Cache & Otorisasi Baris

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup 4 temuan keamanan tersisa dari audit: SEC-T6 (IDOR baca antar-OPD), SEC-T8 (token query string + cache logout), SEC-T9 (otorisasi baris anak), SEC-T10 (kode unitKerja duplikat).

**Architecture:** Semua perbaikan server-side: GAS `gas/Code.gs` + Homeserver `sianjab-db-server/server.js` (parity), plus klien untuk logout cache. Tidak ada perubahan kontrak API publik selain `Authorization` header opsional.

**Tech Stack:** Node.js 20 (`node --test`), GAS (test vm sandbox), Next.js 16.

**Spec:** `docs/audit/2026-11-18-audit-menyeluruh.md` (SEC-T6, T8, T9, T10).

## Global Constraints

- Jangan ubah format token HMAC 4 bagian.
- Lint bukan gate; gate = `npm run test:unit`, `npm run test:gas`, `node --test sianjab-db-server/server.test.js`, `npm run build`.
- Perilaku yang sudah benar TIDAK boleh rusak: test `server.test.js` 16/16 & `simulate-auth.js` 6/6 tetap hijau.

---

### Task 1: SEC-T6 — Scoping Read Operator (IDOR)

**Files:**
- Modify: `sianjab-db-server/server.js` (handler action `getBulkData`, `read`, `readAll`)
- Modify: `gas/Code.gs` (helper yang sama, fungsi baca)

**Interfaces:**
- Consumes: `getAllowedUnitKerjaIds_(userUnitId)` (GAS, sudah ada), `db.users` scope helpers (Homeserver).
- Produces: fungsi util `assertReadScope_(currentUser, entity, record)` — baca record milik unit lain (bukan turunan unit operator) → error 403 `Forbidden read`.

- [ ] **Step 1:** Test — operator mencoba `read` record OPD lain → error; operator membaca record OPD-nya sendiri → sukses. Admin bebas.
- [ ] **Step 2:** Implement: helper `canAccessOrgRecord_(user, unitId)` di homeserver (Gemini mirror GAS `assertJabatanAccess_`); pakai di `saveRecord`, `readBulkData`, dsb.
- [ ] **Step 3:** Verify `node --test sianjab-db-server/server.test.js` + `npm run test:gas` PASS.

### Task 2: SEC-T8 — Cache Logout & Token Header

**Files:**
- Modify: `src/lib/UserContext.tsx` (logout)
- Modify: `src/lib/api.ts` (kirim `Authorization` header; masih kirim query param untuk backward compat)

**Interfaces:**
- Produces: Fungsi `clearClientCaches_()` untuk dipanggil di logout.

- [ ] **Step 1:** Tambah clear cache logout (localStorage + storageIndexedDB `getAiConfig` dll).
- [ ] **Step 2:** Test manual — logout → cek localStorage kosong, cache `caches` default / IndexedDB clear.
- [ ] **Step 3:** Verify `npm run build` PASS.

### Task 3: SEC-T9 — Otorisasi Baris Anak (update/delete)

**Files:**
- Modify: `sianjab-db-server/server.js` (handler `update`/`delete`)

**Interfaces:**
- Consumes: fungsi scope sama dengan Task 1.

- [ ] **Step 1:** Test — update/delete record milik unit lain → 403.
- [ ] **Step 2:** Implement: validasi `unitKerjaId` pada record anak sebelum update/delete.
- [ ] **Step 3:** Verify test PASS + `npm run test:gas`.

### Task 4: SEC-T10 — Kode Unit Kerja Duplikat

**Files:**
- Modify: `gas/Code.gs` (create/update unitKerja)

**Interfaces:** (server-side guard kode unik case-insensitive.)

- [ ] **Step 1:** Test — create unitKerja dengan kode yang sudah ada → error jelas.
- [ ] **Step 2:** Implement: cek unik di `createRecord_` / `updateRecord_`.
- [ ] **Step 3:** Verify test PASS + build.
