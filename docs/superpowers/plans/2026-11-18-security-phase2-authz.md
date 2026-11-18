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

## Sesi Lanjutan (ARC-F2 + ARC-F8/F9 selesai)

- **ARC-F2 selesai** (commit 8274906): parity test mandiri `gas/tests/parity-gas-homeserver.js` (114 assertion PASS, masuk `npm run test:gas`); konstanta bersama `WKE_FIX_JAM` diekspor `sianjab-db-server/server.js`; fix kategori `struktural` di `src/lib/utils.ts`. Refactor kontrak API tunggal tetap ditunda (butuh perubahan besar dua sisi).
- **ARC-F8 selesai** (commit 71e6f11 … 8ea0fc8, ba26354, 593e0c1, 66564ec, d1b97b9): `any` di seluruh halaman/komponen diganti tipe konkret (`TemplateMappings`, `ExportAbkData`, `ExportAbkRow`, `ParsedAnjabData`, `SheetInfo`, `SheetAnalysis`, `RekapAbkRow`, `MapAbkRecord`, `BulkItem`, `AbkRecord`, dll). Sisa 26 `any` hanya di `src/lib/api.ts` (permukaan API publik — menunggu tipedata domain).
- **ARC-F9 selesai** (commit d1b97b9): `react-hooks/set-state-in-effect` 0 error di seluruh `src` — setState dipindah ke microtask (`Promise.resolve().then(...)`) atau callback promise; pagination di-clamp turunan; state diturunkan saat render.
- Gate akhir: unit 23/23, gas 122/122 + 6/6 + parity 114/114, server 25/25, resilience 1/1, build OK, `tsc --noEmit` 0 error, eslint 0 error.
- Head branch: `1d0f3b0`.

## Sesi Lanjutan (fallback RTDB saat bebaa offline)

Insiden "login langsung logout + data 0": funnel `:8443` ke homeserver 502, frontend gagal baca, tidak fallback — data tampil kosong. Fix di `src/lib/api.ts` + `src/lib/homeserver-failure.ts`.

- **Runbook fallback RTDB**: `docs/runbooks/2026-11-18-fallback-rtdb-saat-bebaa-offline.md` — perilaku saat bebaa offline, verifikasi cepat, dan langkah wajib setelah pulih (flush outbox → tarik RTDB → homeserver).
- **Helper `isHomeserverNetworkFailure(status, message)`** (`src/lib/homeserver-failure.ts`, diuji): status `0`, HTTP 5xx (termasuk 502/503/504 Funnel), atau kegagalan klasik (`Failed to fetch`, `NetworkError`, `Load failed`, `Request Timeout`, `Homeserver sedang OFF`) → fallback; 400/401/403/429 tetap dilempar ke UI.
- **`executeActualRequest`**: respons non-JSON dari Funnel kini diubah jadi error ber-`httpStatus` dan diklasifikasi `isHomeserverNetworkFailure()` — HTML error proxy tidak lagi dianggap error bisnis.
- **`DEFAULT_HOMESERVER_URL` → `:8443`** (funnel resmi; placeholder `:10000` lama diperbaiki).
- Test: unit 27/27 (termasuk 4 baru), gas 122/122 + 6/6 + parity 121/121, env 4/4, server 28/28, build OK, `tsc --noEmit` 0 error.
- Head branch: `4a5d691`.

## Sesi Lanjutan (ARC-F3 + ARC-F11 selesai)

- **ARC-F11 selesai** (commit e1d1a6f): `sianjab-db-server/.env.example` lengkap (semua env server, termasuk `PASSWORD_PEPPER` wajib + opsional `PORT`/`BIND_HOST`/`DATA_DIR`/`CORS_ALLOWED_ORIGINS`/`BACKUP_INTERVAL_MS`/`BACKUP_RETENTION`), `.env.local.example` frontend baru, keduanya dijaga test `sianjab-db-server/env-example.test.js` (`npm run test:env`); `.gitignore` `!.env.local.example`; eslint `globalIgnores` `sianjab-db-server/**` + `gas/**` (Node CJS, bukan bundel Next.js).
- **ARC-F3 selesai** (commit f7cb1d7 homeserver + 1d0f3b0 GAS + paritas):
  - Format hash v2: `v2$<salt32hex>$<hmac64hex>`; key HMAC = `salt:username:PASSWORD_PEPPER`; salt acak per user (`crypto.randomBytes(16)` / `Utilities.getUuid()`); HMAC-SHA256 satu putaran tanpa iterasi (keputusan user: kecepatan login).
  - `PASSWORD_PEPPER` wajib fail-closed: homeserver menolak start (`requireEnv`); GAS login gagal "PASSWORD_PEPPER belum dikonfigurasi di Script Properties."
  - Verifikasi berurutan v2 → v1 (`HMAC(password, username:API_SECRET)`) → legacy (`sha256(password)`), perbandingan constant-time (`safeEqualHex` / `constantTimeEqual_`).
  - Migrasi login-first (tanpa bulk script): login sukses dengan hash lama → tulis `password` v2, hapus `passwordHash` (homeserver) / `passwordHash: null` (GAS patch).
  - Parity test 7 assertion baru: hash v2 & v1 GAS = Homeserver, format, verifikasi rehash, password salah ditolak — total parity 121 PASS, masuk `npm run test:gas`.
  - **Urutan deploy aman:** deploy v2 dengan `API_SECRET` lama → semua user login (auto-migrasi ke v2) → setelah semua termigrasi, baru rotasi `API_SECRET`. `PASSWORD_PEPPER` diisi (nilai sama di homeserver `.env` + GAS Script Properties) SEBELUM user pertama login, dan TIDAK dirotasi bersama `API_SECRET` (rotasi pepper = semua password direset).
- Gate akhir: unit 23/23, gas 122/122 + 6/6 + parity 121/121, env 3/3, server 27/27 (+1 migrasi, 28 total dengan resilience), resilience 1/1, build OK, `tsc --noEmit` 0 error.
- Head branch: `1d0f3b0`.
