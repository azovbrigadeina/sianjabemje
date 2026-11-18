# Audit Menyeluruh Aplikasi SIANJAB
**Tanggal:** 18 November 2026
**Versi:** Next.js 16.2.9 / React 19.2.4 / GAS / Homeserver DB (`sianjab-db-server`)
**Metode:** 4 audit paralel independent (keamanan, frontend, backend GAS + logika data, arsitektur & kualitas kode) — semuanya read-only. Klaim-klaim kritis diverifikasi ulang langsung di kode sebelum dimasukkan ke laporan ini.

> **Status perbaikan (update 18 Nov 2026):** SEC-K1, SEC-K2, SEC-K3, SEC-K4, SEC-T5, SEC-T6, SEC-T7, SEC-T8, SEC-T9, SEC-T10, SEC-S1, SEC-S2, SEC-S3, SEC-R1 sudah diperbaiki di branch `security-phase1` (commits `671ec79`..`5805640`). Sisa: SEC-R3 (pesan login sudah generik di Homeserver; GAS masih membedakan "Akun tidak ditemukan"/"Password salah" — perlu disamakan), plus temuan BE/FE/ARC. Secrets lebih lanjut: rotasi `FIREBASE_SECRET` / `API_SECRET` perlu dilakukan user di Firebase Console & GAS Script Properties setelah merge.

Dokumen pendukung:
- Audit performa: `docs/audit/2026-11-18-audit-performa-dan-alur-perbaikan.md`
- Plan implementasi dari audit performa: `docs/superpowers/plans/2026-11-18-audit-performa-fixes.md`
- Audit lama: `AUDIT.md`, `PERFORMANCE_AUDIT.md`, `docs/audit/2026-10-28-audit-penghematan-kuota-firebase.md`

---

## 1. Ringkasan Eksekutif

Terdapat **22 temuan**, terbagi dalam: 6 Kritis, 11 Tinggi, 11 Sedang, 6 Rendah (beberapa item dikelompokkan).

**Kabar penting:** audit ini menemukan *celah keamanan kritis baru yang belum pernah dilaporkan* di dokumen mana pun — terutama token HMAC yang tidak diverifikasi di Homeserver (K-1) dan endpoint `/db/*` yang terbuka penuh (K-2). Keduanya membuat seluruh mekanisme RBAC yang sudah dibangun dengan baik menjadi dapat ditembus.

**Verifikasi kualitas dasar:**
| Pengujian | Hasil |
|---|---|
| `npm run test:unit` | ✅ 24/24 |
| `npm run test:gas` | ✅ 118/118 |
| `node --test sianjab-db-server/server.test.js` | ✅ 8/8 |
| `npm run lint` | ⚠️ 520 masalah (415 error, 105 warning) |

---

## 2. Matrix Temuan

### 🔴 KRITIS

| ID | Judul | Lokasi |
|---|---|---|
| SEC-K1 | Token HMAC tidak diverifikasi di Homeserver | `sianjab-db-server/server.js:658-694` |
| SEC-K2 | Endpoint `/db/*.json` Homeserver tanpa autentikasi | `sianjab-db-server/server.js:2358-2390` |
| SEC-K3 | Kredensial hardcoded di repo & ter-bundle ke browser | `server.js:36-43`, `docker-compose.yml:15-27`, `src/lib/api.ts:34` |
| SEC-K4 | GAS menerima token tidak valid pada action publik → baca PII | `gas/Code.gs:206, 373-397, 474` |
| BE-K5 | Kloning tahun menimpa habis node tahun tujuan | `gas/Code.gs:2918-2948`, `server.js:1727-1757` |
| BE-K6 | Restore database menulis node root tanpa pengaman | `gas/Code.gs:4713-4717` |
| FE-K7 | Tahun aktif UI ≠ tahun yang dikirim ke API | `src/lib/constants.ts:9-34` |

### 🟠 TINGGI

| ID | Judul | Lokasi |
|---|---|---|
| BE-T1 | Tiga aturan konversi menit→jam bertentangan | `Code.gs:3846`, `Code.gs:2636`, `utils.ts:163` |
| BE-T2 | Write-behind outbox bisa menimpa tulisan pihak lain | `server.js:572-622` |
| BE-T3 | CacheService sebagai sumber kebenaran read-modify-write | `gas/Code.gs:1582-1606` |
| SEC-T5 | Operator bisa update diri menjadi admin (self-update role) | `server.js:1710-1719` |
| SEC-T6 | IDOR / kebocoran baca antar-OPD | `Code.gs:506-528, 678-680`, `server.js:1392-1418` |
| SEC-T7 | Rate limit login memakai IP dari klien; plaintext password diterima | `Code.gs:1971-1986`, `server.js:1238` |
| SEC-T8 | Token di query string; cache IndexedDB tidak dibersihkan saat logout | `src/lib/api.ts:495-501`, `UserContext.tsx:81-90` |
| SEC-T9 | Otorisasi baris anak tidak dicek pada update/delete | `Code.gs:898-938`, `server.js:1433-1456` |
| SEC-T10 | Create unitKerja bisa menimpa OPD lain via kode duplikat | `gas/Code.gs:944-948` |
| FE-T11 | AbortController hilang di openEditor → isian masuk ke jabatan salah | `operator/analisis/page.tsx:338-359` |
| FE-T12 | Optimistic save tanpa rollback | `operator/analisis/page.tsx:772-820` |
| FE-T13 | Modal impor dapat terkunci permanen | `operator/analisis/page.tsx:1251-1446` |
| FE-T14 | Konversi waktu `>8 = menit` mengubah data sah | `src/lib/utils.ts:163-167` |
| FE-T15 | Laporan per OPD mengabaikan sub-unit | `Code.gs:1782-1798`, `dashboard/laporan/page.tsx:225` |
| ARC-F2 | Duplikasi penuh logika bisnis GAS ↔ Homeserver | `Code.gs` vs `server.js` (5.030 vs 2.466 baris) |
| ARC-F3 | Password plaintext diterima + hash tanpa iterasi | `server.js:641-648, 1238` |
| ARC-F7 | Error API dikembalikan dengan HTTP 200 | `server.js:2474` |

### 🟡 SEDANG

| ID | Judul | Lokasi |
|---|---|---|
| SEC-S1 | Helper otorisasi fail-open (`return` saat currentUser null) | `gas/Code.gs:868-871, 908-910` |
| SEC-S2 | CORS `*` + secret via query string di admin endpoint | `server.js:2192-2196, 2245-2252` |
| SEC-S3 | Tidak ada CSP header / database.rules.json | `firebase.json:9-22` |
| FE-S1 | Ganti OPD di laporan bisa tampilkan data OPD lama | `dashboard/laporan/page.tsx:225-243` |
| FE-S2 | Urutan drag & drop tidak di-rollback saat gagal | `dashboard/organisasi/page.tsx:113-150` |
| FE-S3 | Aksi admin gagal ternelan tanpa pesan | `dashboard/users/page.tsx:184-211`, dsb. |
| FE-S4 | Timeout hilang bila caller kirim signal; abort salah klasifikasi | `src/lib/api.ts:356-366` |
| FE-S5 | Satu rekod cacat bisa menjatuhkan seluruh halaman | Multiple `page.tsx` |
| FE-S6 | Duplikasi masif `analisis`/`laporan` dashboard vs operator | ≥ 400 baris difference |
| BE-S1 | Lock global GAS + saveABK tanpa lock | `Code.gs:1387-1392, 2619-2664` |
| BE-S3 | `verifyFormasiIdeal_` menelan error & merekayasa volume TPP | `Code.gs:3956-3958, 3879-3901` |
| BE-S5 | Kode verifikasi bisa terbit tanpa terdaftar | `src/lib/verification.ts:138-145` |
| BE-S7 | Jalur batch melewati validasi hierarki (cycle) | `Code.gs:956-990, 2699-2752` |
| BE-S8 | Hash password & token tidak sepakat antar-backend | `server.js:641-656` vs `Code.gs:1907-1910` |
| ARC-F8 | 305 `any` + 89 unused vars dalam kode | Berbagai berkas |
| ARC-F9 | 42 pelanggaran `set-state-in-effect` | Halaman-halaman |
| ARC-F11 | Konfigurasi env tidak konsisten antara kode & contoh | `.env.local.example` |
| ARC-F12 | Kode kritis tidak diuji (api.ts, Code.gs handler) | `src/lib/api.ts`, dll. |
| ARC-F14 | Homeserver = single point of failure data (RAM) | `server.js:78` |

### 🟢 RENDAH
- SEC-R1: HMAC dibandingkan `!==` bukan constant-time (`Code.gs:264, 322`)
- SEC-R3: Pesan error login membedakan akun/password (enumerasi)
- BE-R1: `generateKodeJabatan` hanya 9 sekuens → duplikat
- BE-R2: `getWibTimestamp` bisa menghasilkan `24:xx:xx`
- BE-R4: `updateUrutanBatch_` menulis `urutan`, UI membaca `nomorUrut` (`Code.gs:1542` vs `:1102`)
- FE-R5: `sianjab_verification_logs` tumbuh tanpa batas di localStorage
- FE-R6: Modal tidak punya ARIA role dialog / focus trap / ESC

---

## 3. Rincian Temuan Kritis & Tinggi

### 🔴 [SEC-K1] Token HMAC Tidak Diverifikasi di Homeserver
**Terverifikasi langsung di `server.js:658-694`:**
```javascript
function validateAuthToken(token) {
  ...
  const parts = decoded.split(':');
  if (parts.length < 3) return null;
  // --- HANYA mengecek format, age, nonce, username ada. HMAC tidak pernah dibandingkan.
  const users = mapObjectWithIds(db.users);
  const exists = users.some((u) => ... username === ...);
  if (!exists && username !== 'admin') return null;
  ...
}
```
Fungsi `hashPasswordHmac` dan `createHmac` hanya dipakai untuk **membuat** token & password — tidak pernah untuk **memvalidasi**.

**Dampak:** Siapa pun bisa membuat token valid sendiri:
```
echo "admin:$(date +%s)000:x:apa-aja" | base64
# hasil = token admin yang lolos verifikasi
```
Selanjutnya menyebabkan: akses penuh semua data, `deleteYearData`, `restoreFullDatabase`, dsb. Bonus: `username==='admin'` lolos bahkan tanpa record di database (baris 689, 708-710).

**Rekomendasi:**
1. Tambahkan verifikasi HMAC di `validateAuthToken` dengan `crypto.createHmac('sha256', API_SECRET)` + `crypto.timingSafeEqual`.
2. Hapus cabang `username === 'admin'` (fail-closed).
3. Samakan format token 4 bagian dengan GAS.
4. Tambah unit test: token tanpa HMAC harus ditolak.

---

### 🔴 [SEC-K2] Endpoint `/db/*.json` Homeserver Tanpa Autentikasi
**Terverifikasi langsung di `server.js:2358-2390`** — routing `/db/*` hanya mengecek `pathname`, tidak memanggil `verifyAdminSecret`, dan `setCorsHeaders` berisi `Access-Control-Allow-Origin: *`.

**Dampak:** Siapa pun yang menjangkau port 3098 (dan `network_mode: host` + `setup-funnel.sh` membuatnya publik via Tailscale Funnel 8443) dapat:
- `GET /db/.json` → dump seluruh DB: hash password, `settings/aiConfig` yang berisi API key Gemini, `security_logs`.
- `PUT /db/.json` dengan body `{}` → menghapus seluruh database.
- `DELETE /db/users/u_admin` → hapus akun admin.
- Perubahan ini kemudian di-flush ke RTDB oleh write-behind worker!

**Rekomendasi:**
1. Hapus endpoint ini atau wajibkan `verifyAdminSecret`.
2. Batasi path yang diizinkan (whitelist entitas, tolak `fbPath===''`).
3. Hapus CORS `*`, atau batasi ke origin aplikasi.
4. Bind ke `127.0.0.1` atau tailnet saja, bukan `0.0.0.0`.

---

### 🔴 [SEC-K3] Kredensial Hardcoded di Repo & Ter-Bundle ke Browser
**Terverifikasi:**
```javascript
// sianjab-db-server/server.js:36-43
const HOMESERVER_SECRET = process.env.HOMESERVER_SECRET || 'sianjab-homeserver-2026';
const API_SECRET        = process.env.API_SECRET || 'sianjab-secret-key-2024';
const FIREBASE_SECRET   = process.env.FIREBASE_SECRET || 'f1xsHZlTBHQUeTpohIubYqdhTsICAvjcVx65yjNG';
const SITPP_SECRET      = process.env.SITPP_SECRET || 'jC0c5eC7s0B08bYLPbfSbdH8E6sPyuX1B1e2yLzI';
```
Terlihat juga di `docker-compose.yml:13-23`, `gas/Code.gs.local:21,24`, dan **klien bundle** (`src/lib/api.ts:34, 919, 938, 956`). Halaman Live Monitor mengisi field secret dengan nilai default ini (server.js:2040).

**Dampak:** Seluruh secret produksi tersedia untuk siapa pun yang membaca repositori atau DevTools browser. `FIREBASE_SECRET` = master secret, memungkinkan baca/tulis RTDB langsung tanpa melewati aplikasi/rbac/log.

**Rekomendasi:** Rotasi seluruh secret (Firebase, SiTPP, Homeserver, API). Pindahkan ke env/Script Properties. Hapus fallback dari kode klien dan HomeServer. Hapus dari docker-compose. Hapus nilai default di `src/lib/api.ts` dan isi `value=` di monitor HTML.

---

### 🔴 [SEC-K4] GAS Menerima Token Tidak Valid pada Action Publik
**Terverifikasi:**
```javascript
// gas/Code.gs:206
var PUBLIC_ACTIONS_ = ['login', 'autoRegisterOperator', 'ping', 'checkVerificationCode', 'getDashboardStats', 'getBulkData', 'logout'];

// gas/Code.gs:465-474
if (PUBLIC_ACTIONS_.indexOf(action) === -1) {
  if (!token || !validateToken_(token)) { return /* gagal */; }
}
// Di bawahnya, masih dieksekusi:
var currentUser = getUserFromToken_(token);
```
**Bug:** `getUserFromToken_` (baris 373-397) hanya memeriksa nama user dari token — tidak memverifikasi HMAC. Untuk action publik (termasuk `getBulkData`!), token palsu `base64("admin:0:x:y")` tetap diproses sebagai role admin.

**Dampak:** Endpoint `ANYONE_ANONYMOUS` (lihat `appsscript.json`) dapat memanggil `action=getBulkData&entities=users,security_logs` → seluruh daftar akun (NIP, email, role, unitKerjaId) dan log keamanan bocor.

**Rekomendasi:**
1. Untuk action publik, parameter `token` tetap wajib divalidasi via `validateToken_`. Bila gagal validasi → `currentUser = null`.
2. Jangan pernah percaya isi token tanpa verifikasi HMAC.

---

### 🔴 [BE-K5] Kloning Tahun Menimpa Habis Node Tahun Tujuan
**Lokasi:** `gas/Code.gs:2918-2948`, paritas di `server.js:1727-1757`.
```javascript
// fbPut_(toYear, sourceData)  ← REPLACE seluruh node toYear dengan isi sourceData
```
**Dampak:** Jika admin salah memilih tujuan kloning 2025 → 2026 selagi 2026 sudah berisi data, seluruh Anjab/ABK tahun berjalan tertimpa tanpa backup. Tidak ada guard "tujuan sudah diisi".

**Rekomendasi:**
1. Tolak di server bila node tujuan sudah berisi (kembalikan error yang menjelaskan).
2. Wajibkan parameter `confirm: true` + buat snapshot otomatis sebelum menulis ulang.
3. Alternatif: kloning per-entitas dengan merge atau drop `parentId` jika sudah ada.

---

### 🔴 [BE-K6] Restore Database Menulis Node Root Tanpa Pengaman
**Lokasi:** `gas/Code.gs:4713-4717`.
```javascript
Object.keys(restoredData).forEach(key => { fbPut_(key, restoredData[key]); });
```
**Bug:** PUT bersifat REPLACE. Bila file restore tidak mengandung entitas tertentu, node tersebut **terhapus**. Tidak ada validasi skema, whitelist, atau backup pra-restore. Kegagalan di tengah meninggalkan DB setengah terisi.

**Rekomendasi:** Validasi skema, whitelist entitas, snapshot otomatis sebelum restore, rollback bila gagal, dan gunakan PATCH per-node alih-alih PUT root.

---

### 🔴 [FE-K7] Tahun Aktif UI ≠ Tahun yang Dikirim ke API — Verified
**Terkonfirmasi:** fungsi `setActiveYearCache()` di `src/lib/constants.ts:29` **tidak dipanggil di mana pun** (saya cek via grep, hanya di definisi).
Update tahun hanya ditulis ke `localStorage` + `dispatchEvent("yearChanged")` (di 4 halaman dashboard) tetapi nilai `cachedActiveYear` pada module level **tidak pernah diperbarui**.

**Dampak:**
- Admin ganti tahun → UI menampilkan 2027, tapi semua request terus kirim `tahun=2026` sampai reload.
- Halaman operator **tidak punya listener** `yearChanged` sama sekali dan **tidak menampilkan tahun** — operator bisa mengisi Anjab/ABK ke tahun yang salah tanpa sadar.
- Satu perbaikan kecil menghilangkan kelas bug tahun ini.

**Rekomendasi:** Pindahkan tahun ke React Context (atau panggil `setActiveYearCache` pada ganti tahun), dan tambahkan indikator tahun di layout operator.

---

### 🟠 [SEC-T5] Self-Update Meloloskan Eskalasi Role (Privilege Escalation)
**Terverifikasi `server.js:1710-1719`**:
```javascript
if (currentUser.role !== 'admin' && currentUser.id !== id) throw new Error('Forbidden');
// ... dan di bawahnya:
const updated = { ...existing, ...uData, id };   // ← bikin role ditimpa
```
Operator cukup memanggil `updateUser` dengan body `{role: 'admin', id: <own-id>}` → berubah jadi admin.

**Rekomendasi:** Whitelist field yang boleh diubah self (nama/email/password); field `role`, `unitKerjaId`, `isActive` hanya untuk admin. Paritas di GAS juga harus diperiksa.

---

### 🟠 [SEC-T6] IDOR — Operator Bisa Membaca Data 42 OPD Lain
**Lokasi:** `gas/Code.gs:506-528` (`readAll`, `getJabatanByUnit`), `:678-680` (`getBulkAnjabByUnit`), serta `server.js:1392-1418, 1462-1478`.

Operator OPD A dapat memanggil `readAll?entity=tugasPokok&parentId=<jabatanId OPD lain>` atau `getBulkAnjabByUnit?unitKerjaId=<OPD lain>` dan server mengembalikan datanya. Tulis relatif aman, tetapi **baca tidak di-scope**.

**Rekomendasi:** Paksa scoping read berdasarkan `currentUser.unitKerjaId` untuk seluruh entitas turunan; tolak unitKerjaId kosong di `getBulkAnjabByUnit_`.

---

### 🟠 [SEC-T7] Rate Limit Memakai IP dari Klien + Password Plaintext Diterima
- `src/app/login/page.tsx:61` memakai `api.ipify.org`; `gas/Code.gs:1971-1986` kunci rate-limit memakai `data.ip` dari client → serangan cukup mengganti field `ip` tiap request untuk bypass.
- `sianjab-db-server/server.js:1238` menerima `storedPass === password` (plaintext compare). Bila user pernah dibuat dengan plaintext di database, password itu tetap sah selamanya.
- `login` endpoint Homeserver tidak punya rate limit sama sekali.

**Rekomendasi:** Rate-limit per `username` + per `clientIp` (dari socket, bukan body). Lakukan lockout eksponensial. Hapus jalur plaintext. Pertimbangkan MFA admin.

---

### 🟠 [SEC-T8] Identitas di Query String + Cache Tidak Dibersihkan saat Logout
- `src/lib/api.ts:495-501` menaruh token di URL setiap request (bisa bocor lewat proxy/log/referer).
- `UserContext.tsx:81-90` `logout()` hanya menghapus `localStorage` & cookie; tidak memanggil `invalidateAllCache()`. Cache memory + IndexedDB (termasuk `getAiConfig` yang berisi API key) tetap tersimpan di browser.

**Rekomendasi:**
1. Kirim token via header `Authorization`, bukan query string.
2. Panggil `invalidateAllCache()` saat logout & login sukses.
3. Cookie dengan `Secure; SameSite=Strict; HttpOnly`.

---

### 🟠 [BE-T1] Konversi Menit→Jam Saling Bertentangan — Verified
Tiga jalur berbeda:
```javascript
// Code.gs:3846-3859 → deteksi hanya bila rata-rata > 480 (komentar bilang "> 8")
// Code.gs:2636-2646 → deteksi jika `waktuSatuan === 'menit'`
// utils.ts:163-167  → >8 per baris dibagi 60
```
**Dampak:** Input identik menghasilkan formasi berbeda tergantung jalur simpan. Draf AI berisi 60 menit dianggap 60 jam. Data legacy tanpa `waktuSatuan` di `saveABK_` tidak dinormalisasi sama sekali. Tes yang ada mengunci **implementasi**, bukan **kebijakan**, jadi "semua test lulus" tidak membuktikan rumus benar.

**Rekomendasi:** Satu helper server `normalisasiWaktuJam(value, satuan)` yang konsisten dipakai di 4 jalur (`saveABK_`, `saveBulkAnjabData_`, `buildAiContext_`, verifikasi formasi), dan tulis test yang menguji kebijakan (input menit → output jam yang benar) bukan implementasi.

---

### 🟠 [BE-T2] Write-Behind Bisa Menimpa Tulisan Pihak Lain
**Lokasi:** `server.js:572-622`. Flush mengirim `PUT` **seluruh node** (`2026/tugasPokok`, bahkan `__ROOT__`) dari snapshot RAM yang bisa berumur menit — bukan PATCH per-record. `pullAllFromRtdb` mengganti `db` lalu `dirtyPaths.clear()` tanpa mengecek antrean yang belum ter-flush.

**Dampak:** Perubahan yang dilakukan GAS/klien RTDB setelah snapshot RAM terakhir bisa hilang permanen; perubahan lokal yang belum flush ikut terpendam saat pull.

**Rekomendasi:**
1. Flush per-record (bukan per-tabel/root).
2. Tolak pull bila `dirtyPaths.size > 0` (persisten buffer lokal tidak boleh dibuang).
3. Gunakan ETag/If-Match atau semantik update.

---

### 🟠 [BE-T3] CacheService sebagai Sumber Kebenaran + Delete-All-Create-Row Pattern
**Lokasi:** `gas/Code.gs:1582-1606, 1719-1739, 1750-1767`. `saveSingleEntity_`/`saveMultiEntity_` membaca `currentData[ent]` dari cache (TTL 300s), lalu menghapus **semua** baris `jabatanId === parentId` dan membuat ulang dengan id acak.

**Dampak:** Baris yang ditambahkan pengguna lain dalam 5 menit terakhir tidak terlihat cache → tidak terhapus → **duplikat permanen**. Id & createdAt berubah setiap simpan. `putLargeCache_` menimpa cache dengan snapshot basi → data "hilang" dari UI selama 5 menit.

**Rekomendasi:**
1. Baca RTDB **di dalam lock** (bukan cache) untuk read-modify-write.
2. PATCH per-baris berdasarkan id; pertahankan id & createdAt.
3. Gunakan versi (`updatedAt`) untuk mendeteksi konflik.

---

### 🟠 [FE-T11/T12/T13] Race Condition & Error State di Halaman Analisis
- **T11** (`operator/analisis/page.tsx:338-359`): `openEditor` tanpa `AbortController`/request-id. Klik A lalu B → respons A bisa menimpa form B; penyimpanan berikutnya masuk ke jabatan yang salah.
- **T12** (sama, baris 772-820): Save optimistis tanpa rollback — server gagal tapi UI sudah tampak tersimpan dan status pohon berubah "terisi".
- **T13** (baris 1251-1446): Modal impor tanpa tombol tutup/ESC; tombol "Selesai" hanya muncul bila semua langkah beres. Kegagalan di tengah → modal terkunci permanen.

**Rekomendasi:** Request-id per openEditor; snapshot + rollback save; jaminan tombol Tutup/Menutup di modal (muncul bila tidak ada proses aktif), dan `currentStepIndex` di-set pada `catch`.

---

### 🟠 [ARC-F2] Duplikasi Full Logika Bisnis GAS ↔ Homeserver
`gas/Code.gs` (5030 baris) vs `sianjab-db-server/server.js` (2466 baris) — token HMAC, RBAC, `getDashboardStats`, `saveBulkAnjabData`, validasi tahun, logika WKE — semuanya disalin manual.

**Divergensi nyata yang bisa saya buktikan:**
- GAS mewajibkan 4 bagian + cek isActive (Code.gs:250-275); Homeserver masih menerima token 3-bagian lama dan tidak selalu cek isActive (server.js:668-674).
- `API_SECRET` GAS = UUID di Script Properties; di Homeserver = `sianjab-secret-key-2024`. Token dibuat di satu sisi tidak valid di sisi lain.
- GAS tolak unitKerja delete dengan anak; Homeserver tidak (server.js:912-942).
- GAS proteksi `BASE_YEAR` di deleteYearData; Homeserver tidak (server.js:1765-1773).

**Dampak:** Perbaikan di satu sisi berisiko lupa sisi lainnya — divergensi diam-diam = bug keamanan & konsistensi data.

**Rekomendasi:** Definisikan kontrak API tunggal (JSON schema / shared types) + **golden-file parity test**: request yang sama → respons harus identik di kedua backend (GAS vs Homeserver). Jalankan di CI.

---

### 🟠 [ARC-F7] Error API Dikembalikan dengan HTTP 200
**Lokasi:** `server.js:2474` — semua `catch` menjadi `sendJson(res, 200, { success: false, error })`. Monitoring (Docker healthcheck, alerting, log parsing) tidak bisa melihat kegagalan dari status code.

**Rekomendasi:** Gunakan status code bermakna (401/403/404/500) di sendJson, tetapi pertahankan body `{success, error}` untuk kompatibilitas klien.

---

## 4. Temuan Sedang — Ringkasan Per-Kategori

**Keamanan (S1-S3):**
- Helper `assertJabatanAccess_` & `assertWritePermission_` melakukan `return` saat currentUser null, alih-alih mencabut akses (fail-open). → ubah ke `throw`.
- Secret admin diterima via query string (`?secret=`) di seluruh endpoint admin & monitoring terbuka tanpa auth.
- Tidak ada CSP / `X-Frame-Options` / `database.rules.json`; keamanan RTDB sepenuhnya dependen pada master secret.

**Frontend (S1-S6):**
- Ganti OPD di laporan tanpa abor → data OPD lama bisa tampil.
- Tidak ada 401-handler untuk ErrorBoundary di beberapa halaman.
- Duplikasi halaman 438 baris difference antara dashboard & operator analisis.
- `AbortController` hilang + abort salah klasifikasi jadi "Request Timeout".

**Backend (S1-S8):**
- Lock global GAS (satu lock untuk seluruh app) + `saveABK_` tanpa lock.
- `verifyFormasiIdeal_` catch kosong + menaikkan volume agar mencapai TPP → data fiktif.
- Batch restore bisa membuat cycle `parentId`.
- Kode verifikasi bisa terbit tanpa terdaftar di server (registrasi gagal hanya `console.error`).

**Arsitektur (F8-F14):**
- 305 `any`, 89 unused vars, 42 `set-state-in-effect` (react-hooks) → banyak pola berisiko yang diharapkan diperbaiki.
- Kode kritis tanpa test: `src/lib/api.ts`, seluruh handler `gas/Code.gs`, `smartExtraction.ts`.
- Homeserver `RAM as primary store` tanpa mekanisme HA / backup on-fail — kehilangan host sebelum flush outbox = kehilangan data hingga 3 menit.
- Env konfigurasi tidak konsisten; `NEXT_PUBLIC_*` tidak didokumentasikan di `.env.local.example`.

---

## 5. Hal yang Sudah Baik (konfirmasi verifikasi)

- `Password dihapus` dari semua endpoint read user (server.js:1151, 1400; Code.gs:1032, 4399).
- Whitelist entitas di `getFirebasePath_` + sanitasi id `[^a-zA-Z0-9_-]` + validasi tahun 4 digit mencegah path injection.
- Self-delete admin dilarang di kedua backend.
- Atomic write `.tmp` + `renameSync` untuk DB/outbox file di Homeserver.
- Secondary index O(1) + outbox + write-behind — arsitektur hemat kuota RTDB yang dipikirkan matang.
- Fail-closed GAS pada `validateToken_`, `assertFirebaseOk_`, `isTokenRevoked_`.
- Circuit breaker di klien + optimistic hydration instan.
- Rumus WKE 1250 jam / kebutuhan / pembulatan / batas jenis-jabatan **identik** di `utils.ts`, `Code.gs`, `server.js` (verified).
- `saveABK_` menghitung ulang di server dan menimpa angka klien (tes B3 membuktikan).
- ErrorBoundary di ketiga layout, skeleton loading, dedup in-flight request, serial write queue.

---

## 6. Roadmap Prioritas

### 🔥 Tahap 1 — Tambalan Keamanan (Urgensi, minggu ini)
1. **SEC-K1** — verifikasi HMAC token Homeserver + hapus bypass admin.  ← dampak terbesar
2. **SEC-K2** — auth pada `/db/*.json`, batasi CORS, bind 127.0.0.1.
3. **SEC-K3** — rotasi semua secret, hapus dari repo + bundle + monitor HTML.
4. **SEC-K4** — validasi token GAS pada action publik; `currentUser = null` bila gagal.
5. **SEC-T5** — whitelist field self-update (larang role/self-promote).
6. **SEC-T7** — hapus jalur password plaintext; rate-limit per username.

### 🟠 Tahap 2 — Integritas Data
7. **BE-K5** — guard kloning: tolak bila tahun tujuan sudah berisi + snapshot.
8. **BE-K6** — restore: skema whitelist, pre-snapshot, PATCH per-node.
9. **BE-T2** — write-behind flush per-record, tolak pull bila outbox belum flush.
10. **BE-T3** — RTDB baca di dalam lock, PATCH per-baris, pertahankan id.
11. **SEC-T6** — scoping read operator (menutup IDOR antar-OPD).
12. **SEC-T9/T10** — otorisasi baris anak & uniqueness kode unitKerja.

### 🟡 Tahap 3 — Kebenaran Logika & UX
13. **FE-K7** — tahun sebagai React Context + indikator tahun di operator.
14. **BE-T1** — satu helper `normalisasiWaktuJam` untuk 4 jalur.
15. **FE-T11/T12/T13** — abort editor, rollback save, modal tak terkunci.
16. **FE-T15** — laporan per OPD termasuk sub-unit.
17. S1-S6 kecil per halaman.

### 🔵 Tahap 4 — Arsitektur & Kualitas
18. **ARC-F2** — kontrak API tunggal + parity test GAS ↔ Homeserver.
19. **ARC-F7** — status code HTTP yang bermakna.
20. **ARC-F8/F9** — kurangi `any`, perbaiki set-state-in-effect.
21. **ARC-F12** — CI: lint + test + build otomatis.
22. **ARC-F14** — backup otomatis + alerting storage error; flush-on-write untuk entitas kritis.

---

## 7. Verifikasi Setelah Perbaikan

1. ✅ `npm run build`, `npm run test:unit`, `npm run test:gas`, `node --test sianjab-db-server/server.test.js`
2. ✅ Test baru: token tanpa HMAC ditolak, `/db/*` 401, self-update role ditolak, IDOR ditolak, kloning tujuan non-kosong ditolak.
3. ✅ `grep` kosong untuk semua secret lama.
4. ✅ Deploy GAS dengan flag `-i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw`.
5. ✅ Uji manual: login operator OPD A ≠ B, logout → cache bersih, kloning tahun, restore, mode switch.

---
*Dokumen ini disimpan di `docs/audit/2026-11-18-audit-menyeluruh.md` sebagai pembaruan dari audit lama (`AUDIT.md`, `PERFORMANCE_AUDIT.md`).*
