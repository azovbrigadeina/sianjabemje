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

---

## Hasil Eksekusi (selesai 18 Nov 2026)

| Task | Status | Catatan |
|---|---|---|
| SEC-T6 IDOR | ✅ | readAll/getJabatanByUnit/getBulkAnjabByUnit di-scope per OPD (server.js + Code.gs) |
| SEC-T8 token header + cache logout | ✅ | `Authorization: Bearer` di /api homeserver; `clearClientCache()` saat login/logout |
| SEC-T9 baris anak | ✅ | jabatanId record lama dicek saat update/delete |
| SEC-T10 kode unitKerja | ✅ | kode duplikat ditolak |
| SEC-S1 fail-closed | ✅ | assert*Access tolak user null |
| SEC-S2 secret query | ✅ | hanya header/body |
| SEC-R1 constant-time | ✅ | `constantTimeEqual_` GAS |
| SEC-S3 CSP + rules | ✅ | firebase.json headers + database.rules.json |
| SEC-R3 pesan login | ✅ | GAS seragam "Username atau password salah" |
| BE-T1 | ✅ | tanpa konversi menit; >8 jam ditolak keras (keputusan user) |
| BE-T2 | ✅ | pull ditolak saat dirtyPaths>0 (opsi force); flush pakai PATCH (merge) |
| BE-T3 | ✅ | saveSingle/MultiEntity baca RTDB segar dalam lock; id & createdAt stabil |
| FE-T11/T12/T13 | ✅ | request-id openEditor; rollback save gagal; modal impor selalu bisa ditutup |
| FE-T15 | ✅ | getJabatanByUnit sertakan sub-unit |
| ARC-F7 | ✅ | `httpStatusForError` — 401/403/400/429/500 |

**ARC-F12 (CI):** workflow `.github/workflows/ci.yml` sudah dibuat tetapi BELUM bisa di-push
(PAT tanpa scope `workflow`). Commit di-stash unpushed — user perlu PAT dengan scope
`workflow` atau push manual.

**Ditunda (butuh refactor besar, tidak masuk fase ini):** ARC-F2, ARC-F8/F9, ARC-F14.

Gate akhir: server.test.js 24/24, resilience 1/1, gas 122/122 + auth 6/6, unit 23/23, build OK.
Head branch: `e659c0c`.

## Sesi Lanjutan (ARC-F14 + F8 parsial)

- **ARC-F14 selesai** (commit f2e4b74): `runBackupNow()` + `pruneBackupFiles()` (retensi default 14, env `BACKUP_INTERVAL_MS` / `BACKUP_RETENTION`); interval harian otomatis; backup saat shutdown; endpoint admin `POST /_homeserver/backup`; `getMonitorSummary().alerts` berisi `storageError`/`lastBackupAt`/`lastBackupError` untuk alerting.
- **ARC-F8 parsial** (commit f60c250): tipe konkret menggantikan `any` di internal `src/lib/api.ts` (opts, catch, batch, restoreFull, dll). Sisa 26 `any` di permukaan API publik yang dikonsumsi lintas halaman — perlu tipedata domain dulu (ARC-F2 wilayah).
- Test: server 25/25, resilience 1/1, gas 122/122+6/6, unit 23/23, build OK, `tsc --noEmit` 0 error.
- Catatan: commit `.github/workflows/ci.yml` masih tertahan (PAT tanpa scope `workflow`) — file untracked di worktree.
