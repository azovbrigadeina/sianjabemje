import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hitungWaktuEfektif,
  hitungKebutuhanPegawai,
  normalisasiWaktuJam,
  WKE_DEFAULT_JAM,
} from "./utils.ts";

// ============================================================
// Konstanta WKE (SSOT: 1250 jam kerja efektif per tahun)
// ============================================================

test("WKE_DEFAULT_JAM fix 1250 jam/tahun", () => {
  assert.equal(WKE_DEFAULT_JAM, 1250);
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

test("waktu efektif mendukung pecahan jam", () => {
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
// hitungKebutuhanPegawai = Waktu × Volume ÷ WKE (default 1250 jam)
// ============================================================

test("kebutuhan pegawai pakai WKE default 1250 jam", () => {
  // 4 jam × 150 = 600 jam efektif / 1250 = 0,48 orang
  assert.equal(hitungKebutuhanPegawai(4, 150, WKE_DEFAULT_JAM), 0.48);
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
// Kasus waktu DESIMAL (input bertitik, mis. 2.5 jam)
// ============================================================

test("waktu desimal 2.5 jam dihitung penuh (bukan dibulatkan)", () => {
  assert.equal(hitungWaktuEfektif(2.5, 100), 250);
  assert.ok(Math.abs(hitungKebutuhanPegawai(2.5, 100, WKE_DEFAULT_JAM) - 0.2) < 1e-12);
});

test("waktu desimal pecahan siklis 1/3 jam tetap presisi wajar", () => {
  const we = hitungWaktuEfektif(1 / 3, 15); // ~5
  assert.ok(Math.abs(we - 5) < 1e-9);
});

// ============================================================
// normalisasiWaktuJam: satuan tunggal JAM, baris legasi menit (>8) ÷60
// ============================================================

test("normalisasi: waktu ≤ 8 jam diteruskan apa adanya", () => {
  assert.equal(normalisasiWaktuJam(2), 2);
  assert.equal(normalisasiWaktuJam(8), 8);
  assert.equal(normalisasiWaktuJam(0.5), 0.5);
});

test("normalisasi: nilai > 8 dianggap legasi menit, dikonversi ÷60", () => {
  // 30 menit = 0,5 jam; 45 menit = 0,75 jam
  assert.equal(normalisasiWaktuJam(30), Math.round((30 / 60) * 10000) / 10000);
  assert.equal(normalisasiWaktuJam(480), 8);
});

test("normalisasi: nol / negatif / NaN -> 0", () => {
  assert.equal(normalisasiWaktuJam(0), 0);
  assert.equal(normalisasiWaktuJam(-3), 0);
  assert.equal(normalisasiWaktuJam(Number.NaN), 0);
});

test("normalisasi: baris legasi menit memberi kebutuhan yang benar", () => {
  // 30 menit (legasi) -> 0,5 jam; 0,5 jam × 100 ÷ 1250 = 0,04 orang
  const jam = normalisasiWaktuJam(30);
  assert.equal(hitungKebutuhanPegawai(jam, 100, WKE_DEFAULT_JAM), 0.04);
});

// ============================================================
// Kompatibilitas satuan jam↔menit (konsep dua-satuan lama tetap identik)
// ============================================================

test("konversi 2.5 jam <-> 150 menit memberi kebutuhan sama", () => {
  const jam = hitungKebutuhanPegawai(2.5, 100, WKE_DEFAULT_JAM);
  const menit = hitungKebutuhanPegawai(150, 100, WKE_DEFAULT_JAM * 60);
  assert.equal(menit, jam);
  assert.ok(Math.abs(jam - 0.2) < 1e-12);
});

test("asal 75000 menit = 1250 jam (identitas satuan), tanpa konstanta menit", () => {
  // Rumus konversi dipertahankan dalam pengujian saja, agar perhitungan
  // data legasi lama (menit) tetap bisa direproduksi saat audit.
  const ekuivalenMenit = WKE_DEFAULT_JAM * 60;
  assert.equal(ekuivalenMenit, 75000);
  assert.equal(hitungKebutuhanPegawai(240, 150, ekuivalenMenit), 0.48); // 4 jam × 150
});
