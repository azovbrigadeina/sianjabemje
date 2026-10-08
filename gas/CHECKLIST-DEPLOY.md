# Checklist Deployment GAS — SI-ANJAB

Pendamping [README.md](README.md). Centang tiap butir berurutan; jangan lewati
bagian uji pasca-deploy — deploy sukses (push ok) ≠ aplikasi bekerja.

> ⚠️ Perubahan besar di rilis ini: **format token baru (4 bagian: username :
> timestamp : nonce : hmac)**. Semua token lama otomatis mati setelah push →
> semua user harus login ulang. Komunikasikan dulu ke pengguna.

## 0. Pra-push (lokal)

- [ ] `npm test` — harus **PASS 109 / FAIL 0, exit 0** (simulasi A1–A10, B, C)
- [ ] `npx tsc --noEmit` — exit 0 (frontend tidak rusak oleh perubahan env)
- [ ] `git status` bersih / perubahan ter-commit — jangan push dari working
      tree yang setengah selesai

## 1. Push via clasp

- [ ] Prasyarat: `clasp` terpasang (`npm i -g @google/clasp`) dan
      `clasp login` sudah dilakukan dengan akun pemilik script
- [ ] `gas/.clasp.json` menunjuk **scriptId** project GAS yang benar
      (periksa di script.google.com → Project Settings → Script ID)
- [ ] **Backup kode yang sedang online dulu**: `clasp pull` (salin hasilnya ke
      folder cadangan) — `clasp push` menimpa apa pun yang ada di editor online
- [ ] Pastikan `.claspignore` tetap mengecualikan `tests/**` (folder uji Node
      bukan bagian Apps Script)
- [ ] Jalankan dari folder `gas/`:
      ```bash
      cd gas && clasp push
      ```
- [ ] Verifikasi: `clasp open` → editor menampilkan `Code.gs` terbaru (cari
      string `rotateSecurityLogs_` — penanda rilis ini)
- [ ] Hanya jika perlu uji cepat di editor: jalankan fungsi `testAuth()` sekali
      untuk memicu layar persetujuan OAuth

## 2. Script Properties (Project Settings > Script Properties)

| Properti | Wajib? | Dipakai untuk | Efek bila kosong |
|---|---|---|---|
| `FIREBASE_URL` | ✅ | Koneksi RTDB utama | Semua request gagal |
| `FIREBASE_SECRET` | ✅ | Auth REST ke RTDB | Semua request gagal |
| `SITPP_FIREBASE_URL`, `SITPP_SECRET` | Jika pakai SiTPP | `exportForSitpp` | Publish SiTPP gagal |
| `API_SECRET` | Opsional | Dasar HMAC token login | Dibuat otomatis saat login pertama |
| `INTEGRATION_TOKEN` | ✅ (jika pakai auto-register) | `autoRegisterOperator` | Fitur gagal keras "INTEGRATION_TOKEN belum dikonfigurasi" |
| `SPT_DIGITAL_URL`, `SPT_DIGITAL_TOKEN` | ✅ (jika pakai cek SPT) | `checkSptOpd` | Fitur gagal keras "belum dikonfigurasi" (A9 — tidak ada fallback) |
| `BASE_YEAR` | Opsional | Tahun baseline | Default `2026` |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / dll. | Opsional | Draf AI (fallback Pengaturan AI) | AI memakai key dari halaman Pengaturan AI |

- [ ] Semua properti bertanda ✅ terisi
- [ ] Secret diisi langsung di UI GAS — jangan pernah lewat chat/commit

## 3. Deploy versi

- [ ] **URL lama harus tetap?** → **Manage deployments** → pilih deployment
      aktif → ✏️ Edit → Version: **New version** → Deploy. URL tidak berubah.
- [ ] **URL baru tidak masalah?** → **Deploy > New deployment** (Web App,
      Execute as: Me, Who has access: Anyone) → salin URL baru
- [ ] Jika URL berubah: perbarui `NEXT_PUBLIC_GAS_DEPLOYMENT_URL` di
      `.env.local` / hosting frontend, lalu redeploy frontend

## 4. Uji pasca-deploy (wajib, berurutan)

Lakukan via browser (DevTools → Network) atau `curl` terhadap URL deployment.

### 4.1 Smoke dasar
- [ ] `GET {URL}?action=ping&tahun=2026` → `"pong"`

### 4.2 Login & format token baru
- [ ] Login di aplikasi dengan kredensial sah → berhasil masuk dashboard
- [ ] Ambil token dari cookie `sianjab_token` (DevTools → Application), decode
      base64 → **4 bagian**: `username:timestamp:nonce:hmac`
      (token lama 3 bagian harus ditolak — tes opsional: request dengan token
      lama → error "Token tidak valid atau sudah kadaluarsa")
- [ ] Login dengan password salah → pesan gagal + entri `FAILED` baru muncul
      di node `security_logs` (Firebase Console)

### 4.3 Pencabutan token (A8)
- [ ] Salin token sesi aktif, panggil `GET {URL}?action=logout&tahun=2026&token=...`
      → respons sukses
- [ ] Firebase Console: node `revokedTokens/` berisi nonce token tadi
      (dengan `expiresAt` ≈ 24 jam sekarang)
- [ ] Pakai ulang token itu untuk aksi terproteksi (mis. `readAll` unitKerja)
      → **ditolak** "Token tidak valid atau sudah kadaluarsa"
- [ ] Login lagi → token baru berfungsi normal

### 4.4 Rotasi security_logs (A10)
- [ ] Catat jumlah entri node `security_logs` di Firebase Console
- [ ] Jika ingin uji paksa: picu ±100 login gagal (script kecil / brute manual),
      tulis login sah beberapa kali → node kembali **≤ ~500 entri** (prune ke
      400 terbaru); entri paling lama hilang, terbaru ada
- [ ] Tanpa uji paksa: cukup pastikan ukuran node wajar (< 501)

### 4.5 Fitur lain (spot-check cepat)
- [ ] Simpan ABK satu jabatan → di Firebase, `abk/{jabatanId}` memuat
      `formasiPembulatan` hasil hitungan server (bukan angka mentah klien)
- [ ] Admin coba hapus akunnya sendiri (Manajemen User) → **ditolak** dengan
      pesan (C1); hapus user lain → berhasil
- [ ] Operator kirim validasi pada OPD berstatus `Disetujui` → **ditolak**
      "sudah DISSETUJUI oleh Admin" (C2); dari `Revisi` → berhasil
- [ ] Cek SPT Digital satu OPD → bekerja (bukan error "belum dikonfigurasi")
- [ ] Kloning tahun (bila dipakai) → sukses sekali tanpa dobel kode unit

## 5. Rollback (bila ada yang rusak)

- [ ] **Manage deployments** → pilih versi sebelumnya sebagai versi aktif
      (URL tetap, tidak perlu ubah frontend), **atau**
- [ ] `clasp push` dari folder backup hasil `clasp pull` di langkah 1
- [ ] Catat gejala + waktu di log Eksekusi (Executions) GAS untuk investigasi

## 6. Setelah stabil

- [ ] Kabari semua user: "login ulang diperlukan" (token lama mati — diharapkan)
- [ ] Arsipkan URL deployment + tanggal rilis + commit hash di catatan tim
- [ ] Hapus folder backup `clasp pull` setelah ±1 minggu stabil
