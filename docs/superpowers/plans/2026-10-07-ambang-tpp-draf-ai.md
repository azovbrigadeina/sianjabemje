# Rencana: Ambang TPP pada Draf AI (1.350 Jam/Tahun = 81.000 Menit)

Tanggal: 2026-10-07
Spesifikasi: `docs/superpowers/specs/2026-10-07-ambang-tpp-draf-ai-design.md`
Target: `gas/Code.gs` (backend AI draf) + `gas/tests/simulate-ai-pintar.js`. Tanpa deploy (menunggu perintah pengguna).

## Goal

Draf AI wajib menghasilkan kumulatif waktu efektif seluruh uraian tugas minimal 81.000 menit/tahun (1.350 jam/tahun) — ambang layak TPP — untuk semua jenis jabatan, pada semua provider AI.

## Steps

- [ ] **Step 1: Konstanta ambang di `gas/Code.gs`**
  `AMBANG_TPP_JAM_TAHUN = 1350`, `AMBANG_TPP_MENIT_TAHUN = 81000` di bawah header "DRAF AI PINTAR".

- [ ] **Step 2: Penyeimbang di `verifyFormasiIdeal_`**
  Setelah clamp satuan & clamp 480: bila `0 < total < 81000` → skala `jumlahHasil` proporsional (bulat), nudge baris ber-waktu terbesar +1 hingga ≥ 81000, catat ke `catatanTpp`, gabung ke catatan final. Hapus duplikasi deklarasi `var jenis/isStruktural/...` yang ada.

- [ ] **Step 3: Suntik aturan ke prompt**
  Baris ATURAN ANGKA WAJIB (`buildAiContext_`) + contoh JSON `analisisBebanKerja` (81000 / 1.08 / 1).

- [ ] **Step 4: Perbaiki jalur provider non-Gemini**
  `callOpenAiCompatibleAPI_(endpoint, apiKey, modelName, prompt, ctx)` — teruskan `ctx` sebagai parameter (sebelumnya ReferenceError).

- [ ] **Step 5: Perbarui `gas/tests/simulate-ai-pintar.js`**
  Ekspektasi baru untuk TC1/TC4/TC5/TC6/TC8/TC9/TC11/TC13/TC14/TC15 (kumulatif < 81.000 kini diskalakan) + kasus baru: di-atas-ambang tak tersentuh, WKE 72.000 menit, aturan ambang di prompt, `tugasPokok` kosong.

- [ ] **Step 6: Verifikasi**
  `npm test` — exit 0, semua asersi lama (diperbarui) + asersi baru lulus.

## Deployment (belakangan, bila diminta)

`npx @google/clasp push && npx @google/clasp deploy -i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw -d "Ambang TPP draf AI"`
