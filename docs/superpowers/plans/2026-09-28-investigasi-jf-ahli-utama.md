# Rencana Implementasi: Deteksi & Penghapusan Anomali JF Jenjang Ahli Utama

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan deteksi audit untuk Jabatan Fungsional jenjang Ahli Utama ke dalam tab Outlier di menu Investigasi & Audit, serta menyediakan tombol Hapus Permanen per baris untuk membersihkan formasi non-kabupaten tersebut beserta cascading datanya.

**Architecture:** Memperluas mesin audit `src/lib/investigasiUtils.ts` dengan tipe anomali baru `OUTLIER_JENJANG_UTAMA` yang mendeteksi jenjang "Ahli Utama" pada jabatan fungsional. Pada `src/app/dashboard/investigasi/page.tsx`, merender tombol aksi `🗑️ Hapus Permanen` pada baris `OUTLIER_JENJANG_UTAMA` yang terhubung ke modal konfirmasi penghapusan cascading `api.deleteEntity('jabatan', id)`.

**Tech Stack:** Next.js (App Router, TypeScript), CSS Modules, Firebase Realtime Database via Google Apps Script (GAS) API.

## Global Constraints
- Tetap mematuhi aturan proyek: Single bulk fetch (`getBulkData`), zero reload reaktif via `setJabatans`, dan pembersihan cache otomatis (`invalidateAllCache`).
- Penghapusan jabatan harus menjaga integritas data: memvalidasi ketiadaan bawahan langsung dan menghapus seluruh entitas turunan terkait (*cascading delete*).

---

### Task 1: Perluasan Tipe dan Algoritma Deteksi di `src/lib/investigasiUtils.ts`

**Files:**
- Modify: `src/lib/investigasiUtils.ts:1-25, 294-365`
- Test: `scripts/test-detect-ahli-utama.ts` (atau verifikasi via script eksekusi langsung)

**Interfaces:**
- Produces: `OUTLIER_JENJANG_UTAMA` di dalam `AnomaliType` dan `AuditResult.anomaliOutlier`.

- [ ] **Step 1: Tulis unit test / skrip verifikasi untuk deteksi Ahli Utama**

Buat file pengujian `scripts/test-detect-ahli-utama.ts`:
```typescript
import { analyzeAnomali } from '../src/lib/investigasiUtils';
import { Jabatan, ReferensiJabatan, UnitKerja } from '../src/lib/types';

const mockUnits: UnitKerja[] = [
  { id: 'u1', nama: 'Dinas Kesehatan', kode: 'DK01' }
];

const mockRefs: ReferensiJabatan[] = [];

const mockJabatans: Jabatan[] = [
  {
    id: 'j1',
    namaJabatan: 'Dokter Ahli Utama',
    jenisJabatan: 'Fungsional',
    kelasJabatan: 13,
    unitKerjaId: 'u1',
    kodeJabatan: 'JF01',
    ikhtisarJabatan: '',
    level: 4,
  },
  {
    id: 'j2',
    namaJabatan: 'Dokter Ahli Pertama',
    jenisJabatan: 'Fungsional',
    kelasJabatan: 9,
    unitKerjaId: 'u1',
    kodeJabatan: 'JF02',
    ikhtisarJabatan: '',
    level: 4,
  }
];

const result = analyzeAnomali(mockJabatans, mockRefs, mockUnits, []);
const jfUtama = result.anomaliOutlier.find(a => a.jabatanId === 'j1');
if (!jfUtama || jfUtama.type !== 'OUTLIER_JENJANG_UTAMA') {
  console.error('FAIL: Dokter Ahli Utama tidak terdeteksi sebagai OUTLIER_JENJANG_UTAMA');
  process.exit(1);
}

const jfPertama = result.anomaliOutlier.find(a => a.jabatanId === 'j2');
if (jfPertama && jfPertama.type === 'OUTLIER_JENJANG_UTAMA') {
  console.error('FAIL: Dokter Ahli Pertama keliru terdeteksi sebagai Ahli Utama');
  process.exit(1);
}

console.log('SUCCESS: Deteksi Ahli Utama berfungsi dengan benar');
```

- [ ] **Step 2: Jalankan skrip tes untuk memastikan gagal (karena belum diimplementasikan)**

Run: `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-detect-ahli-utama.ts`
Expected: FAIL dengan `FAIL: Dokter Ahli Utama tidak terdeteksi sebagai OUTLIER_JENJANG_UTAMA`

- [ ] **Step 3: Implementasikan tipe dan logika deteksi di `src/lib/investigasiUtils.ts`**

1. Tambahkan `'OUTLIER_JENJANG_UTAMA'` ke `AnomaliType`:
```typescript
export type AnomaliType = 'TYPO_SPACE' | 'FUZZY_TYPO' | 'UNREFERENCED' | 'DISPARITAS_KELAS' | 'OUTLIER_STRUKTURAL' | 'OUTLIER_JENJANG_UTAMA' | 'DATA_YATIM';
```

2. Pada loop pengecekan outlier di `analyzeAnomali`:
```typescript
    // Cek Deteksi Jabatan Fungsional Jenjang Ahli Utama (Tidak untuk level Kabupaten)
    const parsed = parseJenjangJabatan(j.namaJabatan);
    const isAhliUtama = parsed.jenjang === 'Ahli Utama' || (/\bahli\s+utama\b/i.test(j.namaJabatan) && !isJpt);

    if (isAhliUtama) {
      rawAnomaliOutlier.push({
        id: `outlier-utama-${j.id}`,
        jabatanId: j.id,
        unitKerjaId: j.unitKerjaId,
        opdNama,
        namaJabatan: j.namaJabatan,
        jenisJabatan: j.jenisJabatan || 'Fungsional',
        kelasJabatan: kelas,
        type: 'OUTLIER_JENJANG_UTAMA',
        severity: 'Tinggi',
        pesan: 'Jabatan Fungsional jenjang Ahli Utama tidak diperkenankan pada instansi tingkat Kabupaten',
        rekomendasi: 'Hapus jabatan ini jika tidak ada formasi di Kabupaten, atau sesuaikan ke jenjang Madya/Muda/Pertama',
        parsedJenjang: 'Ahli Utama',
      });
    }
```

- [ ] **Step 4: Jalankan kembali skrip pengujian untuk verifikasi lolos**

Run: `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-detect-ahli-utama.ts`
Expected: PASS dengan output `SUCCESS: Deteksi Ahli Utama berfungsi dengan benar`
Hapus skrip temporer setelah tes berhasil: `rm scripts/test-detect-ahli-utama.ts`

- [ ] **Step 5: Commit perubahan Task 1**

```bash
git add src/lib/investigasiUtils.ts
git commit -m "feat(investigasi): tambahkan deteksi anomali JF jenjang Ahli Utama"
```

---

### Task 2: Integrasi Tombol Hapus Permanen di Halaman Investigasi (`src/app/dashboard/investigasi/page.tsx`)

**Files:**
- Modify: `src/app/dashboard/investigasi/page.tsx:470-485`

**Interfaces:**
- Consumes: `item.type === 'OUTLIER_JENJANG_UTAMA'` dari `AnomaliItem`.
- Produces: Membuka modal `setDeletingAnomali(item)` dan mengeksekusi `handleDeletePermanent`.

- [ ] **Step 1: Perbarui rendering tombol aksi pada tabel temuan**

Pada `src/app/dashboard/investigasi/page.tsx`, ubah logika tombol aksi agar `item.type === 'OUTLIER_JENJANG_UTAMA'` memunculkan tombol `🗑️ Hapus Permanen`:
```tsx
                          {item.type === 'DATA_YATIM' || item.type === 'OUTLIER_JENJANG_UTAMA' ? (
                            <button
                              className={styles.actionBtnDelete}
                              onClick={() => setDeletingAnomali(item)}
                              title={item.type === 'OUTLIER_JENJANG_UTAMA' 
                                ? "Hapus permanen jabatan fungsional Ahli Utama ini dari database"
                                : "Hapus permanen data jabatan yatim ini dari database"}
                            >
                              🗑️ Hapus Permanen
                            </button>
                          ) : null}
                          {item.type !== 'DATA_YATIM' && (
                            <Link href={`/dashboard/organisasi?unitId=${item.unitKerjaId}`} className={styles.actionBtn} style={{ background: '#6b7280', textDecoration: 'none' }}>
                              🗺️ Peta
                            </Link>
                          )}
```

- [ ] **Step 2: Sesuaikan teks pada Modal Konfirmasi Hapus Permanen**

Pastikan modal konfirmasi hapus permanen menampilkan konteks yang jelas:
```tsx
      {deletingAnomali && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h3 style={{ color: '#dc2626' }}>🗑️ Hapus Permanen Jabatan</h3>
            <p style={{ fontSize: '0.9rem', color: '#4b5563', lineHeight: '1.5' }}>
              Apakah Anda yakin ingin menghapus permanen jabatan <strong>"{deletingAnomali.namaJabatan}"</strong> dari unit <strong>"{deletingAnomali.opdNama}"</strong>?
            </p>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#991b1b', margin: '1rem 0' }}>
              ⚠️ <strong>Peringatan Penting:</strong> Aksi ini tidak dapat dibatalkan. Seluruh data ABK, Kualifikasi, Tugas Pokok, dan data turunan yang terikat pada jabatan ini akan ikut terhapus.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className={styles.cancelBtn}
                onClick={() => setDeletingAnomali(null)}
                disabled={deleting}
              >
                Batal
              </button>
              <button
                className={styles.actionBtnDelete}
                onClick={handleDeletePermanent}
                disabled={deleting}
                style={{ padding: '0.5rem 1rem' }}
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus Permanen'}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Uji compile TypeScript**

Run: `npx tsc --noEmit`
Expected: Sukses tanpa error.

- [ ] **Step 4: Commit perubahan Task 2**

```bash
git add src/app/dashboard/investigasi/page.tsx
git commit -m "feat(investigasi): sediakan aksi hapus permanen untuk temuan JF Ahli Utama"
```

---

### Task 3: Verifikasi Sistem & Kompilasi Build Akhir

**Files:**
- Test & Verify: Seluruh workspace Sianjab

- [ ] **Step 1: Jalankan typecheck penuh**

Run: `npx tsc --noEmit`
Expected: Exit code 0.

- [ ] **Step 2: Jalankan proses build Next.js**

Run: `npm run build`
Expected: Build sukses menghasilkan output static `out/` tanpa warning/error fatal.

- [ ] **Step 3: Review git status dan log**

Run: `git status && git log -n 3 --oneline`
Expected: Clean working tree dengan commit yang rapi.
