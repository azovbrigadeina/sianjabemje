# Spesifikasi Desain Tahap 2: Reliabilitas Eksekusi, Keamanan Arsip Database, & Eliminasi Ketergantungan Spreadsheet (N4, N6, N7, N8)

Tanggal: 2 Oktober 2026  
Status: Disetujui  
Target: Sistem Sianjab (Next.js & Google Apps Script Backend)

---

## 1. Latar Belakang & Tujuan

Tahap 2 berfokus pada penguatan keandalan eksekusi proses server, integritas data arsip/backup, dan penyederhanaan arsitektur sistem.
- **N4:** Timeout client 30 detik memutus panggilan operasi berat (generate AI LLM, ekspor SiTPP, pemulihan database).
- **N6 & N7:** File backup database JSON mengekspos hash password dan kunci API mentah, serta proses pemulihan database (`restoreFullDatabase_`) belum memiliki proteksi mutex (`LockService`) dan berisiko mengunci pengguna (lockout).
- **N8 & Eliminasi Spreadsheet:** Menghapus seluruh mekanisme sinkronisasi Google Spreadsheet yang usang, merapikan antarmuka organisasi, dan memantapkan Firebase Realtime Database sebagai *Single Source of Truth* (SSOT) tunggal.

---

## 2. Arsitektur & Spesifikasi Teknis

### A. Dynamic Timeout Klien (`src/lib/api.ts` — N4)
Operasi berat yang melibatkan pemanggilan model AI eksternal atau transfer data massal membutuhkan batas waktu respons lebih panjang daripada operasi CRUD standar.

- **Daftar Action dengan Timeout Diperpanjang:**
  ```typescript
  const EXTENDED_TIMEOUT_ACTIONS: Record<string, number> = {
    generateAnjabWithAI: 150000, // 2.5 menit (LLM via backend GAS)
    testAiConnection: 60000,     // 1 menit
    restoreFullDatabase: 180000, // 3 menit
    exportFullDatabase: 120000,  // 2 menit
    exportForSitpp: 120000       // 2 menit
  };
  ```
- **Implementasi `executeActualRequest`:**
  - Evaluasi `context?.action` terhadap `EXTENDED_TIMEOUT_ACTIONS`. Default timeout tetap 30.000 ms (30 detik).
  - Pesan error saat timeout disesuaikan secara informatif:
    `"Server membutuhkan waktu lebih lama untuk memproses ${action}. (Batas waktu: ${timeoutMs / 1000} detik)"`.

---

### B. Sanitasi & Preservasi Kredensial Database (`gas/Code.gs` — N7)

#### 1. Ekspor Cadangan Aman (`exportFullDatabase_`):
- Membaca snapshot data root dari Firebase (`fbGet_('')`).
- **Sanitasi Pengguna (`users`):**
  - Untuk setiap record user, hapus properti `password`.
  - Tambahkan flag `_hasPassword: true` agar antarmuka mengetahui akun tersebut memiliki sandi aktif tanpa mengekspos hash-nya.
- **Sanitasi Pengaturan AI (`settings.ai`):**
  - Hapus properti `*ApiKey` dan array `savedKeys`.
  - Konfigurasi publik (pilihan model, template prompt, penyedia aktif) tetap disertakan.
- Menghasilkan file JSON yang aman diunduh dan disimpan di media lokal tanpa risiko kebocoran kredensial negara/daerah.

#### 2. Peringatan Keamanan UI (`src/app/dashboard/backup-database/page.tsx`):
- Menampilkan banner peringatan resmi berbingkai tegas pada area unduh backup:
  > ⚠️ **PERINGATAN RESMI ARSIP DATABASE:**  
  > Berkas JSON ini memuat seluruh data kepegawaian, formasi jabatan, dan beban kerja Pemerintah Kabupaten Muaro Jambi. Harap simpan berkas di media penyimpanan resmi yang aman. Demi standar keamanan, kredensial sensitif (kunci API AI & hash password) secara otomatis disanitasi oleh sistem saat diunduh.

#### 3. Preservasi Kredensial saat Pemulihan (`restoreFullDatabase_`):
- Sebelum menimpa data, server membaca data aktif:
  - `existingUsers = fbGet_('users') || {}`
  - `existingAiSettings = fbGet_('settings/ai') || {}`
- Saat menulis kembali data pengguna (`users`):
  - Jika user pada payload backup tidak memiliki `password`, tetapi user ID tersebut sudah terdaftar di `existingUsers`, salin kembali `existingUsers[userId].password`.
  - Mencegah pengguna aktif dan administrator terkunci keluar (*account lockout*) pasca-pemulihan.
- Saat menulis pengaturan AI (`settings/ai`):
  - Jika file backup tidak memuat kunci API, pertahankan kunci API aktif dari `existingAiSettings`.

---

### C. Atomisitas & Lock Transaksi (`gas/Code.gs` — N6)
- **Script Mutex Lock:**
  - Sebelum pemulihan berjalan, minta lock eksklusif:
    ```javascript
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      throw new Error("Server sedang sibuk memproses transaksi database lain. Silakan coba beberapa saat lagi.");
    }
    ```
  - Seluruh penulisan node dilakukan di dalam blok `try...finally` dengan `lock.releaseLock()` di blok `finally`.
- **Invalidasi Cache & Audit Log:**
  - Panggil `invalidateAllCaches_()` setelah restore tuntas.
  - Catat event `RESTORE_DATABASE` ke node `security_logs`.

---

### D. Eliminasi Total Sinkronisasi Google Spreadsheet (N8 & Pembersihan Legacy)

Selaras dengan keputusan strategis menjadikan Firebase Realtime Database sebagai SSOT tunggal:
1. **Frontend (`src/app/dashboard/organisasi/page.tsx` & `src/app/operator/organisasi/page.tsx`):**
   - Hapus fungsi `handleSyncToSheet` dan `handleSyncFromSheet`.
   - Hapus elemen UI tombol: "Sync ke Sheet", "Tarik dari Sheet", dan "Sync Bersih".
2. **Klien API (`src/lib/api.ts`):**
   - Hapus method `syncToSheet` dan `syncFromSheet`.
   - Bersihkan dari daftar `writeActions` dan `cacheableEntities`.
3. **Backend GAS (`gas/Code.gs`):**
   - Hapus aksi `syncToSheet`, `syncFromSheet`, dan `getSptSpreadsheetData` dari `ADMIN_ONLY_ACTIONS_` dan switch `handleRequest_`.
   - Hapus fungsi: `syncToSheet_`, `syncFromSheet_`, `syncFromSheetClean_`, dan `getSptSpreadsheetData_`.
   - Bersihkan menu Spreadsheet di `onOpen`.

---

## 3. Rencana Pengujian & Verifikasi

1. **Automated Checks:**
   - Typecheck: `npx tsc --noEmit --incremental false` (0 error).
   - Static Build: `npm run build` (29 halaman sukses tanpa error).
2. **Pengujian Kredensial Backup/Restore:**
   - Panggil `exportFullDatabase` → pastikan JSON tidak memuat string password hash dan kunci API.
   - Panggil `restoreFullDatabase` dengan backup tersanitasi → pastikan user aktif tetap dapat login (password tidak hilang).
3. **Pengujian Mutex Lock:**
   - Verifikasi lock acquired dan released secara andal tanpa deadlock.
4. **Pengujian UI:**
   - Buka halaman Organisasi di Admin dan Operator → pastikan tombol Spreadsheet telah bersih dan tidak ada console error.
   - Buka halaman Backup Database → pastikan banner peringatan keamanan tampil rapi.
