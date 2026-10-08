# Audit Aplikasi SI-ANJAB — 2026-10-07

Lingkup: seluruh backend Google Apps Script (`gas/Code.gs`, 4.018 baris) + frontend Next.js (`src/`). Fokus sesuai permintaan: error, inkonsistensi, bug integritas data, dan fungsi tombol.

Skala: 🔴 Kritis — 🟠 Tinggi — 🟡 Sedang — ⚪ Rendah.

---

## A. Temuan Integritas Data & Keamanan (backend)

### A1. 🔴 `fbGet_/fbPut_/fbPatch_/fbDelete_` mengabaikan status HTTP → kegagalan senyap ("success palsu")
`gas/Code.gs:538-570` — semua helper Firebase memakai `muteHttpExceptions: true` lalu langsung `JSON.parse(res.getContentText())` **tanpa mengecek `getResponseCode()`**.

- Bila Firebase menolak (401 secret expired, 412 rules, 400 payload invalid), body berisi `{"error":"..."}` yang tetap ter-parse dan dikembalikan sebagai "data".
- `createRecord_` mengembalikan `{ id: result.name }` → `id === undefined`; `fbDelete_` selalu mengembalikan `{ deleted: true }`; `fbPut_` untuk `saveTemplate/saveTagMappings/saveDeadline` tidak pernah menganggap gagal.
- **Efek:** UI menampilkan toast "✅ berhasil disimpan", padahal data hilang. Ini penyebab paling klasik dari "data aneh/hilang" yang dilaporkan user.
- **Perbaikan:** tambahkan guard di satu tempat, mis. `assertOk_(res, label)` yang melempar `Error('Firebase HTTP ' + code + ...)` bila kode di luar 2xx. SITPP (`fbPutSitpp_`) sudah benar — tinggal diterapkan pola yang sama ke semua helper lokal.

### A2. 🔴 `createBatchJabatans` lolos dari semua cek RBAC
`gas/Code.gs:447-449` — kasus switch `createBatchJabatans` memanggil fungsi langsung tanpa `assertWritePermission_`/`assertJabatanAccess_` (bandingkan `create` di baris 414 yang memanggilnya). Operator OPD A dapat batch-insert jabatan dengan `unitKerjaId` milik OPD B → data organisasi OPD lain bisa ditambah diam-diam, dan karena jabatan hasil injeksi menempel di pohon organisasi, isian Anjab/ABK jabatan milik OPD lain ikut terlewati cek `allowedUnits`.

**Perbaikan:** tambahkan `assertWritePermission_(currentUser, 'jabatan', null, item)` per item di `createBatchJabatans_`.

### A3. 🟠 Semua action READ tidak difilter per OPD (`read`, `readAll`, `getABK`, `getJabatanFull`, `getHierarchy`)
`assertWritePermission_` hanya melindungi tulis. Kasus `read` / `readAll` (`gas/Code.gs:414-416`) tidak memanggil apa pun, dan `getABK_` (`:483`) tidak punya `assertJabatanAccess_`.

- Operator OPD A bisa menjalankan `readAll` untuk `users` (daftar NIP, email, nama seluruh kabupaten — hash password memang dibuang, tapi PII tetap bocor), `security_logs` (IP + userAgent + username), `verification_logs`, dan `abk`/`jabatan` milik OPD lain lewat `getJabatanFull`/`getABK`.
- **Perbaikan:** white-list per role untuk entitas sensitif (`users`, `security_logs`, `verification_logs` → admin-only), dan tambah `assertJabatanAccess_` (versi read) pada `getABK`, `getJabatanFull`, `getHierarchy`.

### A4. 🟠 Param `tahun` tidak divalidasi → penulisan ke node arbitrer
`gas/Code.gs:343` — `CURRENT_TAHUN = params.tahun || BASE_YEAR` menerima string apa pun. `getFirebasePath_` memvalidasi `entity` tapi **bukan prefix tahun**.

- Operator dengan token valid bisa memanggil `create?entity=jabatan&tahun=users` → record tersimpan di `users/jabatan/...` (mengotori node users), atau `tahun=referensiJabatan` dsb. Ini korupsi data sederhana via URL.
- **Perbaikan:** validasi `tahun` tunggal di `handleRequest_`: `if (!/^\d{4}$/.test(CURRENT_TAHUN)) return error;`.

### A5. 🟠 `saveSingleEntity_` tanpa lock → duplikat baris tunggal
`gas/Code.gs:1060-1090` — pola read-then-update/create TANPA `LockService` (berbeda dengan `saveMultiEntity_` dan `saveBulkAnjabData_` yang terkunci). Dua simpanan bersamaan membuat dua record `syaratJabatan/kualifikasi/...` untuk satu jabatan; `getJabatanFull_` hanya mengambil "yang pertama ditemukan", sehingga data ganda tidak terlihat sampai ekspor/laporan.

**Perbaikan:** bungkus dengan `lock.waitLock(10000)` persis seperti `saveMultiEntity_`.

### A6. 🟡 `updateUrutanBatch` tanpa cek kepemilikan
`gas/Code.gs:425-427` — operator boleh mengubah `urutan` baris milik jabatan OPD lain (integritas tampilan pohon bisa dirusak lintas OPD). Tambah `assertJabatanAccess_` per item atau minimal cek unit dari id tujuan.

### A7. 🟡 Auto-register operator: pencocokan nama OPD terlalu longgar
`gas/Code.gs ~1930-1975` — `normalizeOpdName_` menyamakan bila salah satu nama *mengandung* yang lain setelah menghapus "dan"/spasi/pemisah. Nama berbeda yang sama-sama memuat kata umum (mis. "daerah") dapat dianggap cocok, sehingga akun operator baru dapat terikat ke OPD yang salah (RBAC pengguna itu lalu salah cakup).

**Perbaikan:** cocokkan berdasarkan field `kode` OPD atau persamaan persis setelah normalisasi; fallback tepat-1-kandidat saja.

### A8. 🟡 Auth seputar token
- Token = `base64(username:timestamp:hmac)` — tanpa nonce, tetap valid 24 jam penuh, tidak dapat dicabut saat logout (hanya tak-aktif setelah 5 menit cache users + tombol isActive). Logout hanya menghapus cookie di sisi browser.
- Token dikirim sebagai query string `?token=` pada **semua** request (GET & POST) → berpotensi terekam di log jejak / riwayat browser.
- `getDashboardStats` adalah PUBLIC action `gas/Code.gs:219` → agregat progres seluruh kabupaten terbuka tanpa login. `getBulkData` publik juga mengizinkan `abk` (`:516`) yang memuat formasi per jabatan.
**Perbaikan minimal:** hentikan cache users 5-menit hanya untuk cek isActive (atau TTL 30s), pertimbangkan `HttpOnly` cookie + mengirim token via header untuk POST, dan geser `getDashboardStats`/`getBulkData(abk)` di belakang token.

### A9. 🟡 `checkSptOpd_` berisi fallback URL + token hardcoded
`gas/Code.gs:3770-3780` — bila Script Properties kosong, sistem memakai default URL + token `sianjab_secure_token_abc123` yang tertanam di source code. Perbaiki: gagal-keras bila properti tidak ada (fail-closed), konsisten dengan `INTEGRATION_TOKEN`.

### A10. ⚪ Lain-lain backend
- `security_logs` disimpan tanpa rotasi (pembatasan hanya saat dibaca, 200 terbaru) — node terus membesar.
- `duplicateUnitKerja_` & `cloneYearData_` tanpa lock; bila dua admin menekan tombol bersamaan bisa dobel (UUID membuat id unik, tapi kode unit/kodeCustom bisa dobel).
- Panduan `gas/README.md` masih menyarankan rules Firebase terbuka `.read/.write: true` + "Database Secrets" — sudah tidak mencerminkan security model kode (HMAC, RBAC). Perbarui panduan.
- `getDashboardStats_` & `getAnjabStatusSummary_` membaca semua tabel besar tanpa dedup; masih OK, tapi jadikan kandidat cache summary.

---

## B. Inkonsistensi Logika Hitung (Anjab ↔ ABK)

### B1. 🟠 Dua rumus WKE berbeda antara draf AI dan ABK tersimpan
- `verifyFormasiIdeal_` (`gas/Code.gs ~2870`) menghitung formasi draf AI dengan `wkeReferensi || 75000` menit (1250 jam).
- Editor ABK (dashboard/operator & QuickAbkModal) menarik tugas dari Anjab lalu memakai default `72000` menit (1200 jam).
- Akibatnya angka **formasiIdeal (header editor Anjab)** dan **formasiPembulatan (ABK/laporan)** bisa berbeda untuk jabatan yang sama, walau data sama. Ini inkonsistensi yang sangat terasa di lapangan.
**Perbaikan:** pastikan satu konstanta WKE default untuk keduanya (mis. 1250 jam = 75000 menit, atau 72.000 — pilih sesuai kebijakan) di server dan di klien.

### B2. 🟡 Input waktu ABK memotong desimal (`parseInt`)
`src/app/dashboard/beban-kerja/page.tsx:~772` dan `src/app/operator/beban-kerja/page.tsx:~810` memakai `parseInt(...)||0` — menit desimal (7,5) terpangkas jadi 7. QuickAbkModal (`:120-137`) memakai `Number` + `step="any"`. Kartu sama, tiga perilaku berbeda di dua halaman dan satu modal.

### B3. 🟡 `applyFormasiBatas`/`calculateFormasiPembulatan` duplikat di dua dunia
Logika batas formasi (struktural=1; pelaksana/fungsional≥2) ada di `src/lib/utils.ts` **dan** `verifyFormasiIdeal_` di server. Saat ini paritasnya benar, tapi setiap perubahan kebijakan harus diedit di dua tempat — sempat berbeda di masa lalu (catatan komentar "kasus 2592 orang").

Sejajarkan dengan menyimpan angka **server-side final** pada `abk/formasiPembulatan` saat `saveABK` (server menghitung ulang, client hanya menampilkan).

### B4. ⚪ Toggle jam↔menit membulatkan dua arah
`Math.round(w/60*100)/100` saat turun, `×60` saat naik — bolak-balik menggeser nilai 1–2 menit. Minor, tapi tampil di laporan.

---

## C. Fungsi Tombol & Alur Frontend

Cek tombol-tombol utama; yang ditemukan bermasalah:

### C1. 🟡 Admin dapat menghapus/menonaktifkan akunnya sendiri (self-lockout)
`src/app/dashboard/users/page.tsx:196-205` — tombol 🗑️ mengizinkan admin menghapus akun yang sedang dipakai; token masih valid 24 jam sehingga aplikasi terasa normal, lalu mati. Tambah guard `u.id === user.id` + pesan.

### C2. 🟡 Aju validasi berdasarkan status basi (race kecil)
`src/app/operator/validasi/page.tsx:52-84` — status diambil saat load; admin bisa memproses ("Disetujui") di waktu bersamaan, operator lama dengan UI basi tetap bisa menekan "Kirim untuk Divalidasi" → status timbal-balik menimpa riwayat tanpa konflik check. Tambah cek server halus: bila statusValidasi === 'Disetujui' dan request 'Diajukan', tolak dengan pesan.

### C3. 🟡 "Tarik dari Anjab" menimpa ABK tanpa pratinjau
`page.tsx` kedua versi (dashboard & operator) — `confirm()` ada, tapi isian volume yang sudah dikoreksi operator langsung tertimpa tanpa diff. Pertimbangkan modal banding sebelum/sesudah.

### C4. ⚪ Detail UI
- `src/app/dashboard/layout.tsx:140-170` — tombol kecilkan/perluas sidebar memakai ikon sama "◀" untuk dua state (harusnya "▶" saat collapsed).
- Konstanta `WKE_DEFAULT = 72000` di kedua halaman beban-kerja tidak dipakai (dead code).
- Beberapa toast error masih memakai `String(err)` / `err` mentah (bisa menampilkan "[object Object]" pada kasus tertentu) — normalisasi seperti di QuickAbkModal: `err instanceof Error ? err.message : String(err)`.

Fungsi tombol lain yang DIVERIFIKASI OK: login (guard kosong, error cookie expired=1), kirim validasi (NIP 18 digit, disabled saat Diajukan/Disetujui, riwayat diperbarui), tolak/setujui OPD (catatan wajib saat Revisi, riwayat ditambah), simpan ABK (alert sukses/gagal, update pohon lokal), draf AI (progress + log terminal, toast), reset Anjab (konfirmasi ganda, payload benar), beberapa perbaikan investigasi (edit/quick-fix/delete dengan state lokal sinkron), backup (auto-backup sebelum restore, preview meta), kloning tahun & hapus tahun (proteksi 2026, prompt HAPUS), publish SiTPP (konfirmasi).

---

## D. Prioritas Perbaikan yang Disarankan

1. **A1** — guard status HTTP di `fbGet_/fbPut_/fbPatch_/fbDelete_` (satu fungsi kecil, efeknya menyelamatkan banyak data).
2. **A2 + A4** — RBAC `createBatchJabatans` & whitelist `tahun` (dua patch kecil di `handleRequest_`/fungsi terkait).
3. **A5** — lock di `saveSingleEntity_`.
4. **A3** — filter read sensitif (users / security_logs / verification_logs).
5. **B1–B3** — samakan WKE & masukkan perhitungan formasi final ke server saat saveABK.
6. **C1, C2** — guard self-delete & cek status di validasi.
7. Panduan `gas/README.md` disesuaikan dengan security model sekarang.

---

*Laporan audit ini dilakukan dengan pembacaan statis (tidak mengubah kode). Semua nomor baris merujuk kondisi file saat audit.*
