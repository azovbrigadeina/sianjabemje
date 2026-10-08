# Google Apps Script — Panduan Deployment

## Prasyarat

1. **Firebase Realtime Database** — Buat project di [Firebase Console](https://console.firebase.google.com)
2. **Google Apps Script** — Buka [script.google.com](https://script.google.com)

## Model Keamanan (WAJIB DIBACA)

Semua akses data dari klien berlangsung melalui Apps Script (`Code.gs`), yang
menangani sendiri:

- **Autentikasi token HMAC** (login, token 24 jam + nonce, dicabut saat logout),
- **RBAC** (admin vs operator, cakupan per-OPD, entitas sensitif khusus admin),
- **Whitelist entitas & format tahun**.

Karena itu rules Firebase **tidak boleh dibuka untuk publik** — mereka hanya
pelindung terakhir. Akses server memakai REST dengan Database Secret
(`?auth=...`) yang melewati rules; pastikan secret itu tidak pernah bocor.

## Langkah Setup

### 1. Setup Firebase

1. Buat project baru di Firebase Console
2. Aktifkan **Realtime Database** (bukan Firestore)
3. Set rules ke **default-deny** (JANGAN gunakan mode test yang terbuka):
   ```json
   {
     "rules": {
       ".read": false,
       ".write": false
     }
   }
   ```
   Seluruh traffic data berlangsung lewat Apps Script; tidak ada klien yang
   perlu membaca/menulis langsung ke Firebase.
4. Catat **Database URL** (format: `https://your-project.firebaseio.com`)
5. Buka **Project Settings > Service Accounts > Database Secrets** — catat secret-nya.
   ⚠️ Secret ini setara akses penuh ke database:
   - Jangan pernah di-commit ke git atau dibagikan;
   - Simpan hanya di Script Properties / environment server;
   - **Rotasi** secret bila pernah terekspos (dan periksa log akses).

### 2. Deploy Google Apps Script

1. Buka [script.google.com](https://script.google.com) → **New Project**
2. Salin seluruh isi file `Code.gs` ke editor (atau push via `clasp` — lihat
   [CHECKLIST-DEPLOY.md](CHECKLIST-DEPLOY.md))
3. Lengkapi **Script Properties** (Project Settings > Script Properties) —
   seluruh konfigurasi dibaca dari sini, tidak ada yang di-hardcode:
   - `FIREBASE_URL` & `FIREBASE_SECRET` (wajib — koneksi database utama)
   - `SITPP_FIREBASE_URL` & `SITPP_SECRET` (untuk integrasi SiTPP)
   - `API_SECRET` (opsional — dibuat otomatis bila kosong; dasar HMAC token)
   - `INTEGRATION_TOKEN` (wajib untuk fitur auto-register operator dari SiTPP)
   - `SPT_DIGITAL_URL` & `SPT_DIGITAL_TOKEN` (wajib untuk cek SPT Digital —
     tanpa ini fitur gagal keras, tidak ada fallback)
   - `BASE_YEAR` (opsional, default `2026`)
   - Kunci AI (`GEMINI_API_KEY` / `OPENAI_API_KEY` / dst.) sebagai fallback
     bila tidak diisi lewat halaman Pengaturan AI
4. Klik **Deploy > New Deployment**
5. Pilih type: **Web App**
6. Pengaturan:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Klik **Deploy** → Salin URL deployment

### 3. Konfigurasi Next.js

1. Salin `.env.local.example` menjadi `.env.local`
2. Isi `GAS_DEPLOYMENT_URL` dengan URL deployment dari langkah 2.8

```bash
cp .env.local.example .env.local
# Edit .env.local dan isi URL
```

### 4. Jalankan Aplikasi

```bash
npm run dev
```

## Struktur Data Firebase

```
sianjab-abk/
├── 2026/                     # data tahunan (prefix CURRENT_TAHUN)
│   ├── unitKerja/
│   │   └── {id}: { nama, kode, parentId }
│   ├── jabatan/
│   │   └── {id}: { namaJabatan, kodeJabatan, unitKerjaId, ... }
│   ├── tugasPokok/
│   │   └── {id}: { jabatanId, nomorUrut, uraianTugas, ... }
│   ├── bahanKerja/
│   │   └── {id}: { jabatanId, nomorUrut, namaBahan, ... }
│   ├── perangkatKerja/
│   │   └── {id}: { jabatanId, nomorUrut, namaPerangkat, ... }
│   ├── tanggungJawab/
│   │   └── {id}: { jabatanId, nomorUrut, uraian }
│   ├── wewenang/
│   │   └── {id}: { jabatanId, nomorUrut, uraian }
│   ├── korelasiJabatan/
│   │   └── {id}: { jabatanId, nomorUrut, namaJabatanTerkait, ... }
│   ├── kondisiLingkungan/
│   │   └── {id}: { jabatanId, nomorUrut, aspek, faktor }
│   ├── risikoBahaya/
│   │   └── {id}: { jabatanId, nomorUrut, namaRisiko, penyebab }
│   ├── syaratJabatan/
│   │   └── {id}: { jabatanId, bakatKerja[], temperamenKerja[], ... }
│   ├── kualifikasi/
│   │   └── {id}: { jabatanId, pendidikanFormal[], ... }
│   ├── hasilKerja/
│   │   └── {id}: { jabatanId, uraian }
│   ├── prestasiKerja/
│   │   └── {id}: { jabatanId, uraian }
│   └── abk/
│       └── {jabatanId}: { rows, wke, totalKebutuhan, formasiPembulatan, ... }
├── users/                    # non-tahunan
├── settings/
├── security_logs/            # dirotasi otomatis (±400 entri terbaru)
├── verification_logs/
└── revokedTokens/            # daftar pencabutan token (dibersihkan otomatis)
```
