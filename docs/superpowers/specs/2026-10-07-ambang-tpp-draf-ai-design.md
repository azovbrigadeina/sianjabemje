# Spesifikasi: Ambang TPP pada Draf AI (Kumulatif 1.350 Jam/Tahun)

Tanggal: 2026-10-07
Status: Diimplementasikan pada iterasi ini.

## Latar Belakang

Regulasi TPP: satu jabatan berhak mendapat TPP bila **kumulatif waktu efektif seluruh uraian tugas minimal 1.350 jam/tahun** (beban kerja penuh); lebih dari itu tetap layak. Draf AI saat ini belum diarahkan/paksa menghasilkan angka kumulatif yang mencapai ambang tersebut — hasil generate sering jauh di bawah (contoh kasus uji lama: 420 menit, 1.440 menit, 7.800 menit) sehingga draf tidak layak TPP sebelum diedit manual.

Keputusan pengguna:
1. Ambang dinyatakan dalam jam: **1.350 jam/tahun**. Ketika OPD memakai satuan menit, dipakai padanannya yang setara: **81.000 menit/tahun** (1350 × 60).
2. Berlaku untuk **semua jenis jabatan, termasuk struktural** (Pimpinan Tinggi/Administrator/Pengawas).
3. Draf AI harus **memastikan** (bukan hanya mengharapkan) waktu & volume ideal menghasilkan angka tersebut.

## Keputusan Desain

1. **Target tunggal server: 81.000 menit/tahun** — konstan untuk semua konfigurasi WKE (1250 jam/tahun = 75.000 menit maupun satuan menit 72.000 menit/tahun). Ambang tidak diubah-ubah mengikuti WKE; WKE hanya dipakai untuk hitung `kebutuhanPegawaiIdeal`.
2. **Prompt** (`buildAiContext_`, baris ATURAN ANGKA WAJIB) diarahkan menghasilkan kumulatif ≥ 81.000 menit sejak awal: AI diminta menaikkan `jumlahHasil` (volume/tahun) hingga kumulatif sedikit di atas ambang. Contoh JSON `analisisBebanKerja` di prompt ikut diganti menjadi contoh yang patuh ambang (81000 / 1.08 / 1).
3. **Penjaminan server (SSOT)** di `verifyFormasiIdeal_`: setelah clamp satuan & clamp 480 menit/baris, bila `0 < totalWaktuEfektif < 81000` maka:
   - `jumlahHasil` tiap baris dinaikkan proporsional (faktor = 81.000 ÷ total), dibulatkan;
   - efek pembulatan ditutup dengan penyesuaian minimal: baris ber-`waktuPenyelesaian` terbesar +1 berulang hingga kumulatif ≥ 81.000 (deterministik, konvergen cepat);
   - `waktuPenyelesaian` tidak pernah diubah oleh penyeimbang (waktu per hasil kerja tetap realistis; volume adalah tuas penyetel).
   - catatan draf ditambah: "Kumulatif waktu efektif draf AI di bawah ambang TPP; volume hasil (jumlahHasil) dinaikkan proporsional hingga kumulatif minimal 1.350 jam/tahun (81.000 menit) agar layak TPP."
4. **Di atas ambang tidak disentuh** — sesuai regulasi, lebih dari 1.350 jam tetap layak; tidak ada penurunan volume.
5. **Bug ditemukan & ikut diperbaiki**: `callOpenAiCompatibleAPI_` memakai `ctx` yang tidak pernah diterima (ReferenceError → jalur non-Gemini gagal verifikasi). Sekarang `ctx` diteruskan sebagai parameter sehingga ambang TPP aktif di semua provider (gemini/openai/deepseek/groq/openrouter/openai-compatible).
6. Nilai `analisisBebanKerja` hasil akhir tetap dihitung dari total terbarukan: `kebutuhanPegawaiIdeal = total ÷ WKE` (WKE referensi ABK Disetujui, fallback 75.000 menit), `formasiIdeal` mengikuti pembulatan + batas per jenis jabatan yang sudah ada.

## Rumus

- `totalWaktuEfektif = Σ(waktuPenyelesaian menit × jumlahHasil)` (setelah guard satuan & clamp 480/hasil)
- Bila `0 < totalWaktuEfektif < 81.000`: skala `jumlahHasil` proporsional + nudge baris terbesar hingga `totalWaktuEfektif ≥ 81.000`
- `kebutuhanPegawaiIdeal = totalWaktuEfektif / WKE` → contoh: WKE 75.000 → ≥ 1,08; WKE 72.000 → ≥ 1,125 → keduanya ≥ 1,0 → jabatan layak TPP di konfigurasi mana pun.

## Non-Goals

- Tidak mengubah modul ABK, ekspor DOCX/SIASN, atau integrasi SiTPP.
- Tidak menurunkan kumulatif yang sudah melebihi ambang.
- Tidak menambah pengaturan ambang di UI (konstanta server; nilai bisa diubah satu tempat).

## Verifikasi (npm test)

Skrip `gas/tests/simulate-ai-pintar.js` diperbarui: seluruh kasus dengan kumulatif di bawah 81.000 menit kini memuat ekspektasi penyeimbangan volume, plus kasus baru: di-atas-ambang tak tersentuh, WKE 72.000 menit, prompt menyuntik aturan ambang, `tugasPokok` kosong tanpa crash.
