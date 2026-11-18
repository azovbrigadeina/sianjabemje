# Runbook — Mode RTDB saat Homeserver (bebaa) Offline

**Tanggal:** 18 Nov 2026
**Konteks:** Frontend memakai smart routing: mode `HOMESERVER` (default per-browser bisa `RTDB`). Login selalu lewat GAS. Bila homeserver tidak terjangkau, request otomatis fallback ke GAS + RTDB.

---

## 1. Perilaku yang diharapkan saat bebaa offline

| Operasi | Perilaku |
|---|---|
| Login | Tetap jalan (selalu lewat GAS) |
| Baca data | Fallback ke GAS + RTDB setelah circuit breaker 20 detik |
| Tulis data | Masuk ke GAS + RTDB (user tidak terblokir) |
| Data yang dibaca | Hasil flush terakhir ke RTDB — bisa tertinggal sampai interval write-behind (default 3 menit) atau lebih |

Fallback hanya dipicu oleh **gangguan jaringan**: `Failed to fetch`, `NetworkError`, `Load failed`, `Request Timeout`, `Homeserver sedang OFF`, status **0**, atau **HTTP 5xx** (termasuk 502/503/504 dari Tailscale Funnel), dan respons non-JSON (HTML error dari proxy).

Error bisnis **tidak** di-fallback: 400/401/403/429 tetap dilempar ke UI.

---

## 2. Verifikasi cepat saat bebaa dicurigai mati

Dari mesin lain:

```bash
curl -s -m 15 -o /dev/null -w "%{http_code}\n" https://bebaa-server-1.tail56d53d.ts.net:8443/_homeserver/ping
```

- `200` + `{"status":"ok",...}` → homeserver hidup.
- `502`/`503`/`504` → funnel hidup tapi backend mati → frontend fallback (diharapkan).
- `000` / connection refused → funnel mati → frontend fallback (diharapkan).

Cek data di RTDB (tanpa mencetak secret):

```bash
curl -s "https://anjabmj-44141-default-rtdb.asia-southeast1.firebasedatabase.app/2026/unitKerja.json?auth=$FIREBASE_SECRET&shallow=true" | head -c 200
```

---

## 3. Setelah bebaa pulih — WAJIB, berurutan

Tulis saat outage masuk ke **RTDB**, bukan ke homeserver. Homeserver yang hidup lagi masih memegang salinan lama. Jangan langsung pakai tanpa rekonsiliasi.

1. Cek status homeserver:
   ```bash
   curl -s https://bebaa-server-1.tail56d53d.ts.net:8443/_homeserver/status
   ```
   Perhatikan `dirtyCount` dan `alerts.storageError`.

2. **Flush outbox dulu** (menu Dashboard → Backup & Restore Database → "Flush Outbox ke RTDB Sekarang", atau endpoint admin `POST /_homeserver/flush` dengan secret).

3. Pastikan `dirtyCount` = 0. Auto-pull saat startup **ditolak** bila masih ada tulisan lokal yang belum ter-flush.

4. **Tarik RTDB → homeserver** (menu "Tarik Data RTDB ke Homeserver (Seed)") supaya tulisan yang terjadi saat outage masuk ke homeserver.

5. Spot-check: jumlah `unitKerja`/`jabatan` di `/_homeserver/status` sama dengan yang terlihat di UI.

---

## 4. Jangan lakukan

- Jangan rotasi `API_SECRET` saat masih ada user ber-hash v1 — verifikasi v1 memakai `API_SECRET`, semua login akan gagal. Rotasi hanya setelah semua user login sekali (hash jadi `v2$`).
- Jangan rotasi `PASSWORD_PEPPER` — semua password harus direset.
- Jangan mengandalkan RTDB sebagai sumber kebenaran jangka panjang saat homeserver hidup; RTDB adalah cadangan (write-behind).

---

## 5. Catatan teknis

- Circuit breaker: 20 detik (`homeserverCircuitOpenUntil` di `src/lib/api.ts`).
- Klasifikasi kegagalan: `src/lib/homeserver-failure.ts` (diuji `src/lib/homeserver-failure.test.ts`).
- Default URL homeserver: `NEXT_PUBLIC_HOMESERVER_URL` (funnel `:8443`). Placeholder lama `:10000` sudah diperbaiki.
- Mode disimpan per-browser di `localStorage` (`sianjab_db_mode`, `sianjab_homeserver_url`).
