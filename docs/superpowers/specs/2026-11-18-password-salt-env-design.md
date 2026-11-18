# Desain: Salt Acak Password + Penyelarasan Env (ARC-F3, ARC-F11)

**Tanggal:** 18 November 2026
**Status:** menunggu persetujuan
**Konteks:** pekerjaan pra-deploy di branch `security-phase1`.

## Intent

Dua temuan audit yang tersisa sebelum deploy:

- **ARC-F3** — hash password deterministik tanpa salt acak: `HMAC-SHA256(password, username:API_SECRET)` di `gas/Code.gs:1978` dan `sianjab-db-server/server.js:715`. Satu password yang sama menghasilkan hash identik di semua akun, sehingga kebocoran RTDB bisa dipecahkan dengan tabel rainbow lintas user.
- **ARC-F11** — contoh env tidak mencerminkan env yang benar-benar dibaca kode, baik di server maupun frontend.

## Tujuan

1. Setiap hash password memakai salt acak per user; password sama → hash berbeda.
2. User lama tetap bisa login; hash lama otomatis dimigrasi ke format baru saat login sukses.
3. GAS dan Homeserver menghasilkan hash identik untuk input identik (paritas diuji).
4. Contoh env lengkap dan cocok dengan kode, plus contoh env frontend yang sebelumnya tidak ada.

## Non-tujuan

- Menambah iterasi (keputusan user: kecepatan login diprioritaskan; GAS tidak punya PBKDF2 native).
- Mengubah format token auth, alur login, atau rate limit.
- Memindahkan verifikasi password ke Homeserver.
- Reset massal password user.

## Anti-tujuan

- Login melambat terasa (target tetap < 50 ms di Homeserver, < 1 s di GAS).
- User lama terkunci karena hash lama tidak dikenali.
- GAS dan Homeserver menyimpang diam-diam (harus tertangkap parity test).

## Kendala

- GAS tidak punya PBKDF2/scrypt; hanya `Utilities.computeHmacSignature` dan `Utilities.getUuid`.
- `API_SECRET` saat ini berfungsi ganda: penanda tangan token **dan** pepper hash password. Merotasinya menginvalidasi semua hash lama. Ini bertabrakan dengan rencana rotasi secret pra-deploy.
- Hash tersimpan di RTDB dan dibaca dua sisi; format harus bisa diparse tanpa metadata tambahan.
- Tidak boleh ada password plaintext yang diterima (SEC-T7 sudah berlaku).

## Pendekatan yang dipertimbangkan

1. **Salt acak per user, HMAC satu putaran (dipilih).** Biaya sama seperti sekarang, menghapus determinisme, migrasi otomatis. Iterasi tetap 1.
2. **Salt acak + 1.000 iterasi.** Proteksi offline lebih tinggi, tetapi GAS butuh 0,5–1 detik per login karena tiap iterasi satu panggilan API.
3. **Iterasi 10.000 hanya di Homeserver, GAS delegasi verifikasi.** Proteksi terkuat, tetapi GAS kehilangan mode mandiri dan login mati saat Homeserver down.

Opsi 1 dipilih user atas rekomendasi: kemenangan utama melawan kebocoran RTDB adalah salt acak, bukan iterasi yang di GAS justru memperlambat login.

## Desain

### Format hash

```
v2$<salt>$<hashHex>
```

- `salt`: 32 karakter hex (16 byte acak). GAS: `Utilities.getUuid()` tanpa tanda hubung. Homeserver: `crypto.randomBytes(16).toString('hex')`.
- `hashHex`: `HMAC-SHA256(password, salt + ':' + username + ':' + pepper)` dalam hex huruf kecil.
- `pepper`: properti baru `PASSWORD_PEPPER`; bila kosong, jatuh ke `API_SECRET` (kompatibilitas).

### Verifikasi (dua sisi, urutan sama)

1. `v2$...` → hitung ulang dengan salt tersimpan, bandingkan constant-time.
2. Format v1 (64 hex tanpa prefix) → `HMAC-SHA256(password, username:API_SECRET)`.
3. Format legacy (64 hex, sha256 polos) → `SHA256(password)`.
4. Bila cocok lewat jalur 2 atau 3 → tulis ulang hash v2 (migrasi otomatis), lalu lanjut login.

### Titik perubahan

| Berkas | Perubahan |
|---|---|
| `gas/Code.gs` | `hashPassword_` → v2; tambah `verifyPassword_`; login pakai verifikasi berurutan + migrasi; pembuatan/update/reset user pakai v2; `getPasswordPepper_` |
| `sianjab-db-server/server.js` | `hashPasswordHmac` → v2; tambah `verifyPassword`; login + migrasi; create/update user pakai v2; ekspor untuk test |
| `gas/tests/parity-gas-homeserver.js` | Kasus paritas hash dengan salt tetap; verifikasi v1 & legacy tetap diterima |
| `sianjab-db-server/server.test.js` | Login user v1 → sukses + hash berubah ke v2; login v2; password salah ditolak |
| `sianjab-db-server/.env.example` | Tambah `PASSWORD_PEPPER`, `BACKUP_INTERVAL_MS`, `BACKUP_RETENTION`, `BIND_HOST`, `CORS_ALLOWED_ORIGINS`, `DATA_DIR`, `PORT` |
| `.env.local.example` (baru) | `NEXT_PUBLIC_GAS_DEPLOYMENT_URL`, `NEXT_PUBLIC_HOMESERVER_URL`, `NEXT_PUBLIC_SITE_URL` |
| `.gitignore` | `!.env.local.example` |

### Urutan deploy yang aman (konsekuensi desain)

Karena hash v1 memakai `API_SECRET` sebagai pepper, rotasi `API_SECRET` **sebelum** user dimigrasi akan mengunci semua akun. Urutan wajib:

1. Deploy kode v2 (GAS + Homeserver) dengan `API_SECRET` lama.
2. Biarkan user login sekali agar hash termigrasi ke v2 (atau jalankan skrip migrasi admin).
3. Baru rotasi `API_SECRET`; `PASSWORD_PEPPER` sebaiknya diisi nilai terpisah dan **tidak** ikut dirotasi.

## Yang diserahkan ke pelaksana

- Nama fungsi persis, nama test, dan pemecahan commit.

## Keputusan setelah builder check

1. **`PASSWORD_PEPPER` wajib terisi sebelum deploy v2** — di GAS Script Properties dan homeserver `.env`, nilainya sama, dan **tidak** ikut rotasi `API_SECRET`. Fallback ke `API_SECRET` hanya dipakai untuk memverifikasi hash v1 lama, bukan untuk membuat hash v2 baru. Homeserver menolak start bila `PASSWORD_PEPPER` kosong (setara `SEC-K3`).
2. **Field hash** — baca `user.password || user.passwordHash`; saat migrasi tulis ke `password` dan hapus `passwordHash` bila ada.
3. **`bootstrapInitialAdmin_`** ikut format v2.
4. **Parity test** memakai HMAC asli (bukan stub hex) agar benar-benar menguji kesamaan hash; salt disuntikkan tetap agar deterministik.
5. **Migrasi** login-first; tidak ada skrip admin massal di rilis ini.

