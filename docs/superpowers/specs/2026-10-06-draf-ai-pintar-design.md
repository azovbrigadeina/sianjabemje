# Spesifikasi: Draf AI Pintar (Konteks OPD + Formasi Ideal)

Tanggal: 2026-10-06
Status: Diimplementasikan pada iterasi ini (keputusan: tetap per jabatan, AI hitung formasi ideal dengan rumus resmi, badge inline)

## Latar Belakang

Draf AI saat ini (`generateAnjabWithAI_`) hanya menerima tiga string: nama jabatan, unit kerja, dan nama OPD. Prompt meminta AI mengarang beban kerja dari nama jabatan saja. Sementara database sudah menyimpan data yang jauh lebih kaya:

- Pohon organisasi (`unitKerja`): OPD → bidang → sub-bidang (field `parentId`, `nama`).
- Tabel Anjab eksisting per jabatan (`tugasPokok`).
- Data ABK per jabatan (`abk`: `wke`, `rows` berisi waktu & volume, `totalKebutuhan`, `formasiPembulatan`).
- Master nomenklatur (`referensiJabatan`).

Tujuan fitur: draf AI otomatis memakai fakta organisasi dan beban kerja riil OPD sebagai grounding sehingga tugas, waktu penyelesaian, dan kebutuhan pegawai yang diusulkan mendekati kondisi eksisting, lalu diverifikasi dengan rumus resmi Permenpan RB 1/2020 di server.

## Keputusan Desain

1. **Alur tetap per jabatan** (keputusan pengguna): tombol "Draf AI" yang ada tetap dipakai; tidak ada job/batch baru. Perubahan hanya pada kualitas konteks dan output.
2. **Sumber angka**: AI menghitung formasi ideal langsung di draf, TETAPI server menghitung ulang dengan rumus resmi (kebutuhan = Σ(waktuPenyelesaian × jumlahHasil) ÷ WKE; pembulatan `calculateFormasiPembulatan`) dan menormalkan angka AI. AI tidak boleh mengarang WKE.
3. **Badge inline** (keputusan pengguna): tidak ada modul laporan baru. Setelah draf tersimpan, editor menampilkan badge "Formasi Ideal vs Eksisting" di header editor.

## Arsitektur

```
Client (dashboard/operator analisis)
  ├─ handleTriggerAI: kirim { namaJabatan, unitKerjaId, jabatanId }
  ├─ Progress log menampilkan sumber konteks (bidang, jumlah jabatan sejawat, ABK grounding)
  └─ Setelah simpan: tampilkan badge ideal vs eksisting (dari aiDraft.analisisBebanKerja)

GAS generateAnjabWithAI_(params)
  ├─ 1. Kumpulkan konteks: pohon unit (unit → OPD induk), jumlah pegawai per unit
  │     (dari abk.pegawaiSaatIni), tugasPokok eksisting, ABK sejawat satu OPD
  │     (maks 10 jabatan, prioritas status Disetujui), referensi nomenklatur (maks 15)
  ├─ 2. Susun prompt grounded (BLOK KONTEKS) + aturan baru:
  │     - waktuPenyelesaian WAJIB konsisten satuan menit
  │     - formasiIdeal WAJIB = Σ(waktu × jumlahHasil) / wke, dibulatkan
  │     - analisisBebanKerja: { wkeTersimpan, totalWaktuEfektifMenit, kebutuhanPegawaiIdeal,
  │         formasiIdeal, jumlahPegawaiEksisting, catatan }
  └─ 3. Verifikasi server (SSOT):
        - Ulang hitung totalWaktuEfektif & kebutuhan dari tugasPokok hasil AI
        - Timpa angka AI dengan hasil hitung server
        - Guard satuan: jika rata-rata waktu > 480 menit (8 jam) → anggap jam, konversi ×60
        - normalizeAiAnjabDraft_ memastikan field analisisBebanKerja lengkap (fallback 0/null)
```

## Perubahan Per File

### `gas/Code.gs`
- Baru: `buildAiContext_(unitKerjaId, jabatanId)` → objek konteks (unitTree, siblingAbk, existingTasks, referensi, pegawaiRiil).
- `generateAnjabWithAI_(namaJabatan, unitKerjaId, namaOPD, jabatanId)`:
  - menerima id unit (bukan label) untuk lookup pohon;
  - injeksi blok konteks ke prompt (tetap hormati `customPromptTemplate` — placeholder tambahan `{konteksAbk}` opsional);
  - setelah normalisasi: `verifyFormasiIdeal_` menghitung ulang dan menimpa `analisisBebanKerja`;
  - `handleRequest_` case `generateAnjabWithAI` membaca `params.unitKerjaId` & `params.jabatanId`.
- Baru: `verifyFormasiIdeal_(data)` — hitung ulang, konversi satuan bila terdeteksi, tulis `analisisBebanKerja`.
- `normalizeAiAnjabDraft_`: tambah guard `analisisBebanKerja` + `jumlahHasil` default 1.

### `src/lib/api.ts`
- `generateAnjabWithAI(namaJabatan, unitKerjaId, namaOPD, jabatanId?)` — kirim `unitKerjaId` + `jabatanId` sebagai params; guard `analisisBebanKerja` di `ensureAiAnjabDraft`.

### `src/app/dashboard/analisis/page.tsx` & `src/app/operator/analisis/page.tsx`
- `handleTriggerAI` kirim `unitKerjaId` (label tetap untuk log).
- Simpan hasil `aiDraft.analisisBebanKerja` ke state `formasiBadge`.
- Progress log diperkaya (sumber konteks).

### `src/app/dashboard/analisis/components/EditorHeader.tsx` (dan salinan operator)
- Prop baru `formasiBadge?: { formasiIdeal: number; jumlahPegawaiEksisting: number | null } | null`.
- Badge inline gradient ungu di sisi status ABK: "🎯 Ideal: N org · Eksisting: M org".

## Rumus (SSOT server)

- `waktuEfektifRow = waktuPenyelesaian (menit) × (jumlahHasil || 1)`
- `totalWaktuEfektif = Σ waktuEfektifRow`
- `kebutuhanPegawaiIdeal = totalWaktuEfektif / wke` (wke default 75000 menit = 1250 jam/tahun sesuai Permenpan, bila tidak ada WKE referensi dari ABK Disetujui di OPD)
- `formasiIdeal = calculateFormasiPembulatan(kebutuhanPegawaiIdeal)` (≤1.5 → 1; ≥1.5 → round)
- Guard satuan AI: rata-rata `waktuPenyelesaian` > 480 → dianggap jam → semua dikali 60.

## Non-Goals

- Tidak ada antrean batch / generasi otomatis saat create jabatan.
- Tidak ada modul laporan gap analysis baru (badge inline saja).
- Tidak mengubah jalur penyimpanan `saveBulkAnjabData` (tetap satu round-trip).
- Kunci API tetap server-side (audit N1 tetap berlaku); konteks tidak mengandung kredensial.

## Risiko & Mitigasi

- **Prompt membesar** → konteks dibatasi (maks 10 jabatan sejawat, 15 referensi, uraian tugas dipotong 120 karakter).
- **AI mengarang satuan jam/menit** → guard satuan server + konversi deterministik.
- **Data ABK OPD masih kosong** → konteks mendegradasi gracefully (prompt tetap jalan, badge eksisting menampilkan null).
- **Operator menyentuh OPD lain** → server hanya membaca konteks; penulisan tetap via `saveBulkAnjabData` (guard kepemilikan menyusul dari audit backlog).
