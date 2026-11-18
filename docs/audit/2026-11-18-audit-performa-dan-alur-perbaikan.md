# Audit Performa & Ide Perbaikan Alur — SIANJAB
**Tanggal:** 18 November 2026
**Versi:** Next.js 16.2.9 (Turbopack) / React 19.2.4 / GAS / Homeserver DB (`sianjab-db-server`)
**Jenis:** Audit statis + verifikasi eksekusi (build & test suite dijalankan)

---

## 1. Ringkasan Eksekutif

Audit sebelumnya (`PERFORMANCE_AUDIT.md` 22 Okt, `AUDIT.md` 20 Okt, audit kuota 28 Okt, serta rencana 9 Nov) **sudah diimplementasikan hampir seluruhnya** dan terverifikasi:

- ✅ Negative-cache token, gzip, `print=silent`, pemisahan `template_docx`, cache RBAC, write-through cache (GAS)
- ✅ Smart Router + Circuit Breaker Homeserver, `CACHE_TTL_MS` 5 menit, `activeYear` di memori (Frontend)
- ✅ Batch `createBatchReferensi`, pra-indeks `Map` laporan, `opdMap` useMemo, `useCallback` users
- ✅ Homeserver DB dengan secondary index O(1), outbox persisten, write-behind, ETag/304, Live Monitor SSE

**Kondisi saat ini: SEHAT, tetapi ada 8 temuan baru yang belum terselesaikan** — 2 di antaranya dapat membuat optimasi besar tidak aktif/terasa, dan 2 bersifat keamanan (kredensial hardcoded).

### Status Verifikasi (bukti nyata)

| Pengujian | Hasil |
| :--- | :--- |
| `npm run test:unit` | ✅ 24/24 lulus |
| `npm run test:gas` | ✅ 118/118 lulus |
| `node --test sianjab-db-server/server.test.js` | ✅ 8/8 lulus |
| `npm run build` | ✅ Sukses, 29/29 rute statis |
| Bundle JS statis | 2,38 MB / 50 file; library berat lazy-loaded (docx 625 KB, xlsx 408 KB, react-dom 227 KB sebagai chunk terpisah) ✅ |

---

## 2. Matriks Temuan Baru

| ID | Kategori | Lokasi | Urgensi | Status |
| :---: | :--- | :--- | :---: | :---: |
| **NF-01** | Konfigurasi / Fungsional | `src/lib/api.ts:10` | **Tinggi** | Baru |
| **NF-02** | Payload / Kuota | 9 halaman `src/app/operator/*` | **Tinggi** | Baru |
| **SEC-01** | Keamanan | `sianjab-db-server/server.js:36-43`, `api.ts:34`, monitor `:2040` | **Kritis** | Baru |
| **SEC-02** | Keamanan | `sianjab-db-server/server.js:2250` | **Tinggi** | Baru |
| **NF-03** | Latensi Hydration | `src/lib/api.ts:653-663` | **Sedang** | Baru |
| **NF-04** | Bandwidth | `src/lib/api.ts` (cache layer) | **Sedang** | Baru |
| **NF-05** | Resilience | `src/lib/api.ts:24, 511-525` | **Sedang** | Baru |
| **NF-06** | Konsistensi / UX | Arsitektur cache + write-behind | **Sedang** | Ide alur |

---

## 3. Rincian Temuan

### 🔴 [SEC-01] Kredensial Hardcoded di Source & Bundle Publik
**Lokasi:** `sianjab-db-server/server.js:36-43`, `src/lib/api.ts:34`, monitor HTML `server.js:2040`

Berikut credential yang tertanam langsung di kode:
```javascript
const HOMESERVER_SECRET = ... || 'sianjab-homeserver-2026';
const API_SECRET        = ... || 'sianjab-secret-key-2024';
const FIREBASE_SECRET   = ... || 'f1xsHZlTBHQUeTpohIubYqdhTsICAvjcVx65yjNG'; // asli
const SITPP_SECRET      = ... || 'jC0c5eC7s0B08bYLPbfSbdH8E6sPyuX1B1e2yLzI';
```
Di sisi klien, fallback secret `'sianjab-homeserver-2026'` ikut ter-bundle di JS publik. Halaman Live Monitor juga mengisi field secret dengan nilai default tersebut.

**Dampak:** Firebase RTDB secret (kredensial produksi) terekspos di repository. Homeserver diekspos via Tailscale Funnel (internet) — siapa pun yang bisa menjangkau endpoint dapat memanggil kontrol `pull-from-rtdb`, `flush-to-rtdb`, dan `mode` memakai secret yang sudah diketahui.

**Rekomendasi:**
1. Pindahkan seluruh secret ke environment variable / Script Properties; **hapus semua nilai fallback hardcoded**.
2. Jangan kirim secret ke browser. Endpoint kontrol sebaiknya diproksi atau memakai session token admin berumur pendek, bukan static secret di JS.
3. Lakukan rotasi Firebase & SiTPP secret karena sudah pernah berada di source.
4. Hapus `value="sianjab-homeserver-2026"` pada input monitor.

---

### 🔴 [NF-01] URL Homeserver Default Menggunakan Port yang Salah
**Lokasi:** `src/lib/api.ts:10`

```typescript
const DEFAULT_HOMESERVER_URL = ... || 'https://bebaa-server-1.tail56d53d.ts.net:10000';
```
Sementara `setup-funnel.sh:9` dan dokumentasi menggunakan **HTTPS port 8443** (`FUNNEL_PORT=8443`).

**Dampak:** Jika mode `HOMESERVER` aktif tetapi URL tidak dikonfigurasi eksplisit, semua request mengarah ke port `10000` yang tidak melayani aplikasi. Circuit breaker lalu membuka dan **diam-diam fallback ke GAS**. Akibatnya optimasi Homeserver (latensi ~10–30 ms, bebas kuota GAS) **tidak pernah aktif** dengan konfigurasi default, dan pengguna tidak melihat gejala apa pun.

**Rekomendasi:** Samakan default ke `:8443`, atau lebih baik baca dari env/Script Properties. Tambahkan health-check (`GET /_homeserver/ping`) saat mode diaktifkan dan **tolak switch** bila tidak sehat, agar kegagalan tidak tersembunyi.

---

### 🟠 [NF-02] Halaman Operator Masih Mengunduh Seluruh Data Kabupaten
**Lokasi:** 9 pemanggilan di `src/app/operator/{page,analisis,beban-kerja,laporan,organisasi,peta-jabatan}/page.tsx`

`api.getBulkData()` sudah mendukung argumen ke-3 `unitKerjaId` (`api.ts:635-642`), dan backend sudah siap: `gas/Code.gs:671` meneruskan `params.unitKerjaId` ke `readMultipleEntities_` yang memfilter pada `gas/Code.gs:4460-4461`. Namun **tidak ada satu pun halaman operator yang memakainya**:
```typescript
const bulkData = await api.getBulkData(['unitKerja', 'jabatan', 'abk']); // tanpa unitKerjaId
```

**Dampak:** Operator OPD (cukup 30–50 jabatan) tetap mengunduh ~5.600 jabatan + 13 tabel anak se-kabupaten. Ini adalah temuan "P3 scoped query" dari audit kuota yang masih belum diadopsi di frontend — payload dan waktu render operator masih berlebih hingga ~90%.

**Rekomendasi:** Teruskan `user.unitKerjaId` dari `UserContext` sebagai argumen ketiga pada semua `getBulkData` di halaman operator. Pastikan `getCachedBulkData` memakai cache key yang menyertakan `unitKerjaId` agar hasil scoped tidak tertukar antar-OPD.

---

### 🟠 [SEC-02] Firebase Secret Diterima sebagai Admin Secret Homeserver
**Lokasi:** `sianjab-db-server/server.js:2250`
```javascript
if (sec === HOMESERVER_SECRET || sec === FIREBASE_SECRET) return true;
```
**Dampak:** Siapa pun yang memiliki Firebase secret (yang juga dipakai klien/GAS, lihat SEC-01) otomatis mendapat akses admin penuh ke endpoint kontrol Homeserver.

**Rekomendasi:** Hapus `|| sec === FIREBASE_SECRET`. Admin harus memakai secret Homeserver yang terpisah (atau token admin berumur pendek).

---

### 🟡 [NF-03] Hydration "Instan 0 ms" Masih Sequential IndexedDB Reads
**Lokasi:** `src/lib/api.ts:653-663`; dipakai di 7 tempat (analisis, beban-kerja, organisasi, layout operator)

```typescript
for (const ent of entities) {
  const cached = await getFromCache<any[]>(`entity_${activeYear}_${ent}`);
  if (!cached) return null;
  result[ent] = cached;
}
```
**Dampak:** 3 entitas = 3 round-trip IndexedDB berurutan saat cache dingin. Fitur yang diklaim "0 ms" justru menambah latensi sebelum render pertama.

**Rekomendasi:** `Promise.all(entities.map(...))`, lalu kembalikan `null` bila ada yang miss. Turunkan latensi dari 3× round-trip menjadi 1× paralel.

---

### 🟡 [NF-04] ETag/304 Didukung Server tetapi Tidak Dipakai Klien
**Lokasi:** `sianjab-db-server/server.test.js:191-210` menguji ETag 304, tetapi `src/lib/api.ts` tidak mengirim `If-None-Match` / menyimpan ETag.

**Dampak:** Setiap cache expiry (5 menit) memicu unduhan body penuh walaupun data tidak berubah. Padahal server sudah mampu menjawab `304 Not Modified` tanpa body.

**Rekomendasi:** Simpan ETag per cache key, kirim `If-None-Match` pada request GET, dan pada 304 cukup perpanjang TTL cache tanpa mengganti data.

---

### 🟡 [NF-05) Deteksi Fallback Circuit Breaker Rapuh & Tidak Persisten
**Lokasi:** `src/lib/api.ts:24, 511-525`

Fallback ke GAS hanya terjadi bila pesan error mengandung salah satu string: `Failed to fetch`, `NetworkError`, `Load failed`, `Request Timeout`, `Homeserver sedang OFF`.

**Dampak:**
- Error bisnis/validasi yang kebetulan memuat kata tersebut memicu fallback yang salah (write bisa terkirim ke dua backend).
- Error jaringan dengan bentuk lain (mis. HTTP 502/503) justru dilempar ke pengguna tanpa fallback.
- State circuit breaker hanya di memori modul → setelah refresh, langsung mencoba Homeserver yang masih mati (thrashing).

**Rekomendasi:** Deteksi berdasarkan `error.name === 'TypeError'` atau status HTTP, bukan pencocokan string. Simpan state di `sessionStorage`, tambahkan exponential backoff + half-open probe.

---

### 🟡 [NF-06] Jendela Inkonsistensi Write-Behind Tidak Terlihat Pengguna
**Lokasi:** Arsitektur `server.js` (write-behind default 180 detik) + cache 5 menit di klien.

Perubahan tersimpan instan di Homeserver, baru masuk RTDB tiap 3 menit. Sementara itu, cache 5 menit hanya di-invalidasi di **tab yang melakukan write** — tab lain dan OPD lain melihat data basi hingga 5 menit.

**Dampak:** Operator bisa melihat status validasi/ABK yang berbeda antar-tab, dan tidak ada indikator apakah data sudah tersinkron ke cloud.

**Rekomendasi:** Lihat ide alur di bagian 4.

---

## 4. Ide & Alur yang Perlu Ditingkatkan

### 🔄 Alur A — Invalidasi Cache Push (SSE + BroadcastChannel)
Server sudah memiliki Live Monitor SSE. Manfaatkan kanal yang sama untuk **mengirim event `data-changed`** ke semua klien saat sebuah write terjadi. Di klien:
```
write → Homeserver → SSE broadcast { entity, unitKerjaId }
                          ↓
        BroadcastChannel (sync antar-tab)
                          ↓
   hapus cache entity terkait → re-fetch ringan → UI terbaru
```
Menggantikan invalidasi buta 5 menit dengan propagasi instan, tanpa polling.

### 🔄 Alur B — Offline-First Write Queue
Saat Homeserver mati **dan** GAS tidak terjangkau, write saat ini gagal total. Tambahkan outbox di IndexedDB:
```
write → gagal jaringan → simpan ke outbox (idempotent, client-generated ID)
                       → status "Tertunda" di UI
                       → flush otomatis saat koneksi pulih
```
Memberikan jaminan tidak ada data hilang saat jaringan OPD putus.

### 🔄 Alur C — Indikator Status Sinkronisasi
Tampilkan badge di header: **"Tersinkron" / "Menunggu sinkron (N antrean)"**, bersumber dari `/_homeserver/status` (`dirtyPaths`). Untuk aksi kritis (persetujuan validasi, restore/backup), lakukan **flush langsung** alih-alih menunggu 3 menit.

### 🔄 Alur D — Health Gate saat Switching Mode
Sebelum mengubah mode ke HOMESERVER: ping + cek seed → bila gagal, **tolak switch** dan tampilkan alasan. Mencegah kondisi "mode aktif tapi diam-diam fallback" seperti NF-01.

### 🔄 Alur E — Observability dari Deploy ke Runtime
Tambahkan satu panel ringkas (dashboard) yang menampilkan: latensi p95 per endpoint, rasio cache hit, jumlah fallback circuit breaker, dan `pendingSyncCount`. Ini mengubah audit dari statis menjadi **berkelanjutan**.

---

## 5. Roadmap Prioritas

### Tahap 1 — Keamanan & Fungsional (segera)
1. **SEC-01** — Pindahkan secret ke env, hapus fallback, rotasi kredensial.
2. **SEC-02** — Hapus `FIREBASE_SECRET` dari `verifyAdminSecret_`.
3. **NF-01** — Perbaiki port default `8443` + health gate (Alur D).

### Tahap 2 — Dampak Performa Nyata
4. **NF-02** — Aktifkan scoped `unitKerjaId` di seluruh halaman operator.
5. **NF-03** — `Promise.all` pada `getCachedBulkData`.
6. **NF-05** — Perbaiki deteksi circuit breaker + persist state.

### Tahap 3 — Efisiensi & Alur
7. **NF-04** — Dukungan ETag/If-None-Match di klien.
8. **NF-06 / Alur A–E** — Push invalidation, offline queue, indikator sinkron, observability.

---

## 6. Catatan

- Semua perbaikan di atas **tidak mengubah kontrak API** `src/lib/api.ts`, sehingga risiko regresi rendah.
- Temuan lama (`PRF-02`–`PRF-15`, `BUG-01`, `SEC-01` lama, `ARC-01`, dll.) **sudah terselesaikan** dan tidak diulang di dokumen ini.
- Verifikasi wajib sebelum deploy: `npm run build`, `npm run test:unit`, `npm run test:gas`, `node --test sianjab-db-server/server.test.js`, lalu deploy GAS dengan flag `-i <deploymentId>` yang benar (lihat `AGENTS.md`).

---
*Dokumen ini disimpan di `docs/audit/2026-11-18-audit-performa-dan-alur-perbaikan.md` sebagai acuan tim.*
