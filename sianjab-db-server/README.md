# Sianjab Homeserver Database Container (`sianjab-db-server`)

Kontainer database lokal berkecepatan tinggi untuk **SIANJAB** dengan arsitektur:
- **In-Memory JSON Database + Atomic Disk Persistence (`/data/sianjab-db.json`)**
- **Secondary Index $O(1)$ di RAM** (`idxByYearJabatan` untuk 13 tabel anak Anjab/ABK, `idxJabatanByYearUnit` untuk hirarki OPD) — menghilangkan *full-table scan* saat pengisian serentak 42+ OPD.
- **Persistent Outbox (`/data/outbox.json`) + Write-Behind Batch Sync ke Firebase RTDB** — seluruh perubahan disimpan seketika di Homeserver (~5–15ms) dan disinkronkan ke Firebase RTDB secara berkala (default tiap 3 menit) dengan `?print=silent` dan `Accept-Encoding: gzip` sehingga kuota RTDB hemat >95%.
- **100% Kompatibel dengan Frontend Sianjab (`src/lib/api.ts`)** — mendukung seluruh endpoint `?action=...` secara langsung (tanpa terkena batas 30 concurrent execution Google Apps Script).
- **Live Monitor Dashboard (`GET /`)** — pantauan trafik *real-time* (SSE), status antrean Outbox, jumlah entitas, tombol Tarik dari RTDB, tombol Flush ke RTDB, dan Saklar Mode (`HOMESERVER` ↔ `RTDB` ↔ `OFF`).

---

## 1. Menjalankan Server (Docker Compose)

```bash
cd sianjab-db-server
docker compose up -d --build
```

Atau jalankan langsung dengan Node.js (untuk pengujian cepat):
```bash
cd sianjab-db-server
node server.js
```

Server berjalan di `http://127.0.0.1:3098`.

---

## 2. Mengaktifkan Tailscale Funnel (Port `8443`)

Karena port `443` pada Tailscale Funnel sudah digunakan oleh `sitpp-failover` (`3099`), `sianjab-db-server` menggunakan port resmi Tailscale Funnel **`8443`** (`https://<hostname>.tail56d53d.ts.net:8443` -> `http://127.0.0.1:3098`) sehingga keduanya berjalan berdampingan tanpa bentrok.

Jalankan skrip otomatis:
```bash
chmod +x setup-funnel.sh
./setup-funnel.sh
```

Atau jalankan perintah manual:
```bash
sudo tailscale funnel --bg --https=8443 http://127.0.0.1:3098
tailscale funnel status
```

URL Funnel yang dihasilkan:
- Di mesin `falconxtra`: `https://falconxtra.tail56d53d.ts.net:8443`
- Di mesin `bebaa-server-1`: `https://bebaa-server-1.tail56d53d.ts.net:8443`

---

## 3. Alur Pengisian Serentak 42+ OPD

1. **Seed Awal (Sebelum Pengisian Serentak)**:
   Buka Dashboard Sianjab → menu **Backup & Restore Database** (atau buka Live Monitor `https://<hostname>.tail56d53d.ts.net:8443/`), lalu klik **"1. Tarik Data RTDB ke Homeserver (Seed)"**.
2. **Aktifkan Mode Homeserver**:
   Klik **"3. Gunakan Homeserver Docker (Utama)"**. Seluruh 42+ OPD kini membaca dan menulis langsung ke Homeserver dengan latensi ~10–25ms dan kuota baca RTDB = 0.
3. **Sinkronisasi Otomatis ke RTDB (Cadangan)**:
   Setiap perubahan dari OPD otomatis dicatat di `outbox.json` dan di-*flush* ke Firebase RTDB setiap 3 menit di latar belakang. Anda juga dapat menekan **"2. Flush Outbox ke RTDB Sekarang"** kapan saja.
4. **Kembali ke Mode RTDB (Safe Switch)**:
   Klik **"Kembali ke Mode Firebase RTDB"**. Sistem otomatis mem-*flush* seluruh antrean Outbox ke RTDB dan meng-invalidasi cache GAS sebelum mengalihkan trafik kembali ke Cloud.

## Ketahanan saat server mati (bebaa)

- Saat `docker stop` / SIGTERM, server mem-flush outbox ke RTDB (maks 10 detik) sebelum keluar.
- Saat startup, auto-pull dari RTDB hanya dijalankan bila **tidak ada** tulisan lokal yang belum ter-flush. Set `AUTO_PULL_ON_START=false` untuk mematikan.
- Backup disk harian (disarankan, jalankan di bebaa):
  ```bash
  rsync -a /path/ke/sianjab-db-server/data/ user@falconxtra:/path/backup/sianjab-data/
  ```
