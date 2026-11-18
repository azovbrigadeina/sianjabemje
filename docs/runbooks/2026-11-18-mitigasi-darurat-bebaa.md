# Runbook Darurat — Tutup Celah `/db` di bebaa-server-1

**Tanggal:** 18 Nov 2026
**Kondisi:** `GET https://bebaa-server-1.tail56d53d.ts.net:10000/db/.json` mengembalikan seluruh database tanpa autentikasi (termasuk hash password). Funnel aktif di port **10000**, bukan 8443.

Jalankan berurutan. Jangan lewati Langkah 1.

---

## Langkah 1 — Tutup akses publik (SEKARANG, ±1 menit)

Di mesin **bebaa-server-1** (SSH/login langsung):

```bash
sudo tailscale funnel status
sudo tailscale funnel --bg --https=10000 off
sudo tailscale funnel status
```

Verifikasi dari mesin lain (boleh dari laptop ini):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://bebaa-server-1.tail56d53d.ts.net:10000/db/.json
```

Harus **bukan 200** (502/404/connection refused). Kalau masih 200, ulangi dan cek `tailscale funnel status`.

**Dampak:** user yang sedang mode HOMESERVER otomatis fallback ke RTDB setelah circuit breaker 20 detik. Data tidak hilang (tersimpan di disk bebaa + outbox).

---

## Langkah 2 — Backup data Homeserver di bebaa (±2 menit)

```bash
# cari lokasi project
docker inspect sianjab-db-server --format '{{ range .Mounts }}{{ .Source }} -> {{ .Destination }}{{ "\n" }}{{ end }}'

# ganti PATH_DATA dengan hasil mount di atas (biasanya .../sianjab-db-server/data)
cd /path/ke/sianjab-db-server
tar -czf ~/backup_hs_data_$(date +%Y%m%d_%H%M%S).tar.gz data/
ls -lh ~/backup_hs_data_*.tar.gz
```

Salin ke mesin kedua (dari laptop ini, setelah tahu IP/user bebaa):

```bash
scp rizanoar@bebaa-server-1:~/backup_hs_data_*.tar.gz ~/Documents/Proyek\ Sianjab/backups/
```

---

## Langkah 3 — Rotasi secret (setelah Langkah 1 & 2 selesai)

Buat nilai baru (jangan tempel ke chat):

```bash
openssl rand -hex 32   # API_SECRET baru
openssl rand -hex 32   # HOMESERVER_SECRET baru
```

Urutan supaya tidak saling mengunci:

1. **GAS** → Project Settings → Script Properties:
   - `API_SECRET` = nilai baru (sama dengan homeserver)
   - `FIREBASE_SECRET` = secret Firebase baru (setelah dibuat di Firebase Console)
2. **Firebase Console** → Project Settings → Service Accounts → Database secrets → buat secret baru, hapus yang lama.
3. **Homeserver** di bebaa → file `.env` (atau `docker-compose.yml` sementara):
   ```
   API_SECRET=<sama dengan GAS>
   HOMESERVER_SECRET=<baru>
   FIREBASE_SECRET=<baru>
   SITPP_SECRET=<baru>
   ```
   lalu `docker compose up -d` (recreate).
4. **backup.sh** di repo: hapus baris `FIREBASE_SECRET="..."`, pakai env.
5. Setelah kode Task 1 terpasang, semua fallback hardcoded hilang.

**Peringatan:** rotasi `API_SECRET` membuat semua sesi login tidak valid. Semua user harus login ulang. Lakukan di luar jam sibuk.

---

## Langkah 4 — Verifikasi

```bash
# dari luar
curl -s -o /dev/null -w "%{http_code}\n" https://bebaa-server-1.tail56d53d.ts.net:10000/db/.json   # bukan 200
# di bebaa
ss -tlnp | grep 3098        # harus 127.0.0.1:3098
docker ps --filter name=sianjab-db-server
```

Setelah kode Task 3 terpasang, endpoint `/db` boleh diaktifkan kembali lewat Funnel — dengan autentikasi.
