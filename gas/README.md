# Google Apps Script — Panduan Deployment

## Prasyarat

1. **Firebase Realtime Database** — Buat project di [Firebase Console](https://console.firebase.google.com)
2. **Google Apps Script** — Buka [script.google.com](https://script.google.com)

## Langkah Setup

### 1. Setup Firebase

1. Buat project baru di Firebase Console
2. Aktifkan **Realtime Database** (bukan Firestore)
3. Set rules ke mode test (sementara):
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
4. Catat **Database URL** (format: `https://your-project.firebaseio.com`)
5. Buka **Project Settings > Service Accounts > Database Secrets** — catat secret-nya

### 2. Deploy Google Apps Script

1. Buka [script.google.com](https://script.google.com) → **New Project**
2. Salin seluruh isi file `Code.gs` ke editor
3. Ganti `FIREBASE_URL` dan `FIREBASE_SECRET` di baris 6-7 dengan data Anda
4. Klik **Deploy > New Deployment**
5. Pilih type: **Web App**
6. Pengaturan:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Klik **Deploy** → Salin URL deployment

### 3. Konfigurasi Next.js

1. Salin `.env.local.example` menjadi `.env.local`
2. Isi `GAS_DEPLOYMENT_URL` dengan URL deployment dari langkah 2.7

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
├── unitKerja/
│   └── {id}: { nama, kode, parentId }
├── jabatan/
│   └── {id}: { namaJabatan, kodeJabatan, unitKerjaId, ... }
├── tugasPokok/
│   └── {id}: { jabatanId, nomorUrut, uraianTugas, ... }
├── bahanKerja/
│   └── {id}: { jabatanId, nomorUrut, namaBahan, ... }
├── perangkatKerja/
│   └── {id}: { jabatanId, nomorUrut, namaPerangkat, ... }
├── tanggungJawab/
│   └── {id}: { jabatanId, nomorUrut, uraian }
├── wewenang/
│   └── {id}: { jabatanId, nomorUrut, uraian }
├── korelasiJabatan/
│   └── {id}: { jabatanId, nomorUrut, namaJabatanTerkait, ... }
├── kondisiLingkungan/
│   └── {id}: { jabatanId, nomorUrut, aspek, faktor }
├── risikoBahaya/
│   └── {id}: { jabatanId, nomorUrut, namaRisiko, penyebab }
├── syaratJabatan/
│   └── {id}: { jabatanId, bakatKerja[], temperamenKerja[], ... }
├── kualifikasi/
│   └── {id}: { jabatanId, pendidikanFormal[], ... }
├── hasilKerja/
│   └── {id}: { jabatanId, uraian }
└── prestasiKerja/
    └── {id}: { jabatanId, uraian }
```
