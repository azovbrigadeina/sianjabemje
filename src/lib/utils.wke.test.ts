import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hitungWaktuEfektif,
  hitungKebutuhanPegawai,
  WKE_DEFAULT_JAM,
  WKE_DEFAULT_MENIT,
} from "./utils.ts";

// ============================================================
// Konstanta WKE (SSOT 1250 jam/tahun = 75000 menit/tahun)
// ============================================================

test("WKE_DEFAULT_JAM fix 1250 jam/tahun", () => {
  assert.equal(WKE_DEFAULT_JAM, 1250);
});

test("WKE_DEFAULT_MENIT = 1250 jam × 60 = 75000 menit/tahun", () => {
  assert.equal(WKE_DEFAULT_MENIT, 75000);
  assert.equal(WKE_DEFAULT_MENIT, WKE_DEFAULT_JAM * 60);
});

// ============================================================
// hitungWaktuEfektif = Waktu × Volume/tahun
// ============================================================

test("waktu efektif = perkalian waktu × volume", () => {
  assert.equal(hitungWaktuEfektif(4, 150), 600);
});

test("waktu efektif dengan volume nol -> 0", () => {
  assert.equal(hitungWaktuEfektif(8, 0), 0);
});

test("waktu efektif dengan waktu nol -> 0", () => {
  assert.equal(hitungWaktuEfektif(0, 200), 0);
});

test("waktu efektif mendukung pecahan (menit)", () => {
  assert.equal(hitungWaktuEfektif(0.5, 12), 6);
});

test("waktu efektif: input NaN diperlakukan 0", () => {
  assert.equal(hitungWaktuEfektif(Number.NaN, 10), 0);
  assert.equal(hitungWaktuEfektif(5, Number.NaN), 0);
});

test("waktu efektif: input string number dikonversi", () => {
  assert.equal(
    hitungWaktuEfektif(Number("3") as unknown as number, Number("10") as unknown as number),
    30
  );
});

// ============================================================
// hitungKebutuhanPegawai = Waktu × Volume ÷ WKE (default 1250)
// ============================================================

test("kebutuhan pegawai pakai WKE default 1250 jam", () => {
  // 4 jam × 150 = 600 jam efektif / 1250 = 0,48 orang
  assert.equal(hitungKebutuhanPegawai(4, 150, WKE_DEFAULT_JAM), 0.48);
});

test("kebutuhan pegawai satuan menit pakai WKE 75000", () => {
  // 240 menit × 150 = 36000 menit efektif / 75000 = 0,48 orang
  assert.equal(hitungKebutuhanPegawai(240, 150, WKE_DEFAULT_MENIT), 0.48);
});

test("jam & menit menghasilkan angka kebutuhan sama", () => {
  const jamResult = hitungKebutuhanPegawai(8, 50, WKE_DEFAULT_JAM);
  const menitResult = hitungKebutuhanPegawai(480, 50, WKE_DEFAULT_MENIT);
  assert.ok(Math.abs(jamResult - menitResult) < 1e-12);
  assert.ok(Math.abs(menitResult - 0.32) < 1e-12);
});

test("kebutuhan = jumlah waktu efektif dibagi WKE", () => {
  const waktuEfektif = hitungWaktuEfektif(2, 300); // 600
  assert.equal(hitungKebutuhanPegawai(2, 300, WKE_DEFAULT_JAM), waktuEfektif / WKE_DEFAULT_JAM);
});

test("kebutuhan pegawai WKE nol -> 0 (hindari Infinity)", () => {
  assert.equal(hitungKebutuhanPegawai(10, 10, 0), 0);
});

test("kebutuhan pegawai WKE negatif -> 0", () => {
  assert.equal(hitungKebutuhanPegawai(10, 10, -5), 0);
});

test("kebutuhan pegawai WKE NaN -> 0", () => {
  assert.equal(hitungKebutuhanPegawai(10, 10, Number.NaN), 0);
});

test("kebutuhan pegawai hasil nol bila waktu/volume nol", () => {
  assert.equal(hitungKebutuhanPegawai(0, 100, WKE_DEFAULT_JAM), 0);
  assert.equal(hitungKebutuhanPegawai(100, 0, WKE_DEFAULT_JAM), 0);
});

test("kebutuhan > 1 karena beban kerja lebih dari 1 pegawai", () => {
  // 1250 jam efektif / 1250 = 1 orang; 2500 / 1250 = 2 orang
  assert.equal(hitungKebutuhanPegawai(1250, 1, WKE_DEFAULT_JAM), 1);
  assert.equal(hitungKebutuhanPegawai(1250, 2, WKE_DEFAULT_JAM), 2);
});

// ============================================================
// Integrasi: Σ kebutuhan per baris = kebutuhan total untuk sekian uraian tugas
// Mengikuti rumus kebijakan: waktu efektif = waktu × volume/tahun; WKE fix 1250
// ============================================================

test("penjumlahan kebutuhan beberapa uraian tugas sesuai rumus kebijakan", () => {
  const rows = [
    { waktu: 4, volume: 150 }, // 0,48
    { waktu: 2, volume: 300 }, // 0,48
    { waktu: 8, volume: 50 },  // 0,32
  ];
  const total = rows.reduce((acc, r) => acc + hitungKebutuhanPegawai(r.waktu, r.volume, WKE_DEFAULT_JAM), 0);
  assert.ok(Math.abs(total - 1.28) < 1e-12);
});

test("pembulatan formasi dari total kebutuhan (contoh 1,28 -> 1)", () => {
  const rows = [
    { waktu: 4, volume: 150 },
    { waktu: 2, volume: 300 },
    { waktu: 8, volume: 50 },
  ];
  const total = rows.reduce((acc, r) => acc + hitungKebutuhanPegawai(r.waktu, r.volume, WKE_DEFAULT_JAM), 0);
  const pembulatan = total > 0 ? Math.round(total) : 0; // kebijakan pembulatan standar
  assert.equal(pembulatan, 1);
});

// ============================================================
// Kasus waktu DESIMAL (input bertitik, mis. 2.5 jam / 0.5 menit)
// ============================================================

test("waktu desimal 2.5 jam dihitung penuh (bukan dibulatkan)", () => {
  assert.equal(hitungWaktuEfektif(2.5, 100), 250);
  assert.ok(Math.abs(hitungKebutuhanPegawai(2.5, 100, WKE_DEFAULT_JAM) - 0.2) < 1e-12);
});

test("waktu desimal 0.5 menit dihitung penuh", () => {
  assert.equal(hitungWaktuEfektif(0.5, 20), 10);
  assert.ok(Math.abs(hitungKebutuhanPegawai(0.5, 20, WKE_DEFAULT_MENIT) - 10 / 75000) < 1e-15);
});

test("waktu desimal pecahan siklis 1/3 jam tetap presisi wajar", () => {
  const we = hitungWaktuEfektif(1 / 3, 15); // ~5
  assert.ok(Math.abs(we - 5) < 1e-9);
});

// ============================================================
// KONVERSI SATUAN jam <-> menit: nilai konversi harus dipertahankan
// helper tidak mengonversi, tetapi angka yang dihasilkan konversi
// (waktu × 60 / ÷ 60) harus memberi kebutuhan yang identik.
// ============================================================

test("konversi 2.5 jam -> 150 menit memberi kebutuhan sama", () => {
  const jam = hitungKebutuhanPegawai(2.5, 100, WKE_DEFAULT_JAM);
  const menit = hitungKebutuhanPegawai(2.5 * 60, 100, WKE_DEFAULT_MENIT);
  assert.equal(menit, jam);
  assert.ok(Math.abs(jam - 0.2) < 1e-12);
});

test("konversi 150 menit -> 2.5 jam memberi kebutuhan sama", () => {
  const menit = hitungKebutuhanPegawai(150, 100, WKE_DEFAULT_MENIT);
  const jam = hitungKebutuhanPegawai(150 / 60, 100, WKE_DEFAULT_JAM);
  assert.ok(Math.abs(jam - menit) < 1e-12);
  assert.ok(Math.abs(menit - 0.2) < 1e-12);
});

test("pembulatan 4-desimal konversi menit->jam tetap dalam toleransi kebutuhan", () => {
  // Editor membulatkan ke 4 desimal saat konversi menit->jam:
  // 0.5 menit -> Math.round((0.5/60)*10000)/10000 = 0.0083 jam
  const roundedJam = Math.round((0.5 / 60) * 10000) / 10000;
  const asli = hitungKebutuhanPegawai(0.5, 50, WKE_DEFAULT_MENIT);
  const denganRounded = hitungKebutuhanPegawai(roundedJam, 50, WKE_DEFAULT_JAM);
  // Selisihnya sangat kecil: tidak mengubah pembulatan formasi (0 -> 0)
  assert.ok(Math.abs(asli - denganRounded) < 0.0001);
  assert.equal(Math.round(denganRounded), Math.round(asli)); // formasi sama
});

test("konversi jam->menit (×60) tidak membulatkan nilai riil", () => {
  // 2.5 jam × 60 = 150 (bulat); 1.75 jam × 60 = 105; waktu riil ×60 selalu
  // bulat bila jam sendiri pecahan menit-utuh — diuji tanpa kehilangan.
  assert.equal(2.5 * 60, 150);
  assert.equal(hitungWaktuEfektif(1.75, 4), hitungWaktuEfektif(105, 4) / 60);
});
