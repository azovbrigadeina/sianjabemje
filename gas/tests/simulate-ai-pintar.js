/**
 * =============================================================
 * SIMULASI DRAF AI PINTAR (tanpa Apps Script, tanpa Firebase)
 * =============================================================
 * Menguji verifyFormasiIdeal_ dan buildAiContext_ dari gas/Code.gs
 * dengan data uji dummy — validasi konversi satuan jam->menit,
 * pembulatan formasi (paritas dengan calculateFormasiPembulatan
 * di src/lib/utils.ts), scoping satu OPD, dan pipeline
 * normalizeAiAnjabDraft_ -> verifyFormasiIdeal_.
 *
 * Jalankan: node gas/tests/simulate-ai-pintar.js
 * Exit code 0 = semua lulus; 1 = ada kegagalan.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const codeGsPath = path.join(__dirname, '..', 'Code.gs');
const code = fs.readFileSync(codeGsPath, 'utf8');

// ------------------------------------------------------------
// 1. Sandbox + stub layanan GAS (cukup untuk load modul)
// ------------------------------------------------------------
const scriptProps = new Map();
const sandbox = {
  console,
  Logger: { log: () => {} },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (scriptProps.has(k) ? scriptProps.get(k) : null),
      setProperty: (k, v) => { scriptProps.set(k, v); },
    }),
  },
  CacheService: {
    getScriptCache: () => ({
      get: () => null, put: () => {}, putAll: () => {},
      getAll: () => ({}), remove: () => {}, removeAll: () => {},
    }),
  },
  LockService: {
    getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }),
  },
  Utilities: {
    getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
    computeHmacSignature: () => 'hmac-stub',
    sleep: () => {},
  },
  UrlFetchApp: {
    fetch: () => { throw new Error('UrlFetchApp tidak boleh dipanggil dalam simulasi'); },
    fetchAll: () => { throw new Error('UrlFetchApp tidak boleh dipanggil dalam simulasi'); },
  },
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: () => ({ setMimeType: () => ({}) }),
  },
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'Code.gs' });

// ------------------------------------------------------------
// 2. Dummy database (key = path Firebase, CURRENT_TAHUN = '2026')
// ------------------------------------------------------------
const DB = {
  '2026/unitKerja': {
    u_opd:   { id: 'u_opd',   nama: 'Dinas Kesehatan', parentId: '' },
    u_sek:   { id: 'u_sek',   nama: 'Sekretariat', parentId: 'u_opd' },
    u_buk:   { id: 'u_buk',   nama: 'Bidang Pelayanan Kesehatan', parentId: 'u_opd' },
    u_bpeng: { id: 'u_bpeng', nama: 'Bidang Pengendalian & Penyakit Menular', parentId: 'u_opd' },
    u_pend:  { id: 'u_pend',  nama: 'Dinas Pendidikan dan Kebudayaan', parentId: '' },
  },
  '2026/jabatan': {
    j_target: { id: 'j_target', unitKerjaId: 'u_buk', namaJabatan: 'Kepala Bidang Pelayanan Kesehatan', jenisJabatan: 'Jabatan Pimpinan Tinggi Pratama' },
    j_a:      { id: 'j_a',      unitKerjaId: 'u_bpeng', namaJabatan: 'Kepala Bidang Pengendalian', jenisJabatan: 'Jabatan Pimpinan Tinggi Madya' },
    j_b:      { id: 'j_b',      unitKerjaId: 'u_sek', namaJabatan: 'Kepala Sub Bagian Keuangan', jenisJabatan: 'Jabatan Administrator' },
    j_c:      { id: 'j_c',      unitKerjaId: 'u_buk', namaJabatan: 'Penyuluh Kesehatan Pertama', jenisJabatan: 'Jabatan Fungsional' },
    j_x:      { id: 'j_x',      unitKerjaId: 'u_pend', namaJabatan: 'Kepala Bidang Pendidikan', jenisJabatan: 'Jabatan Pimpinan Tinggi Pratama' },
  },
  '2026/abk': {
    j_a: { jabatanId: 'j_a', wke: 75000, totalWaktuEfektif: 315000, totalKebutuhan: 4.2, formasiPembulatan: 4, statusValidasi: 'Disetujui' },
    j_b: { jabatanId: 'j_b', wke: 72000, totalWaktuEfektif: 86400, totalKebutuhan: 1.2, formasiPembulatan: 1 },
    j_x: { jabatanId: 'j_x', wke: 75000, totalWaktuEfektif: 900000, totalKebutuhan: 12, formasiPembulatan: 12, statusValidasi: 'Disetujui' },
  },
  '2026/tugasPokok': {
    t2: { jabatanId: 'j_target', nomorUrut: 2, uraianTugas: 'B'.repeat(140), waktuPenyelesaian: 240 },
    t1: { jabatanId: 'j_target', nomorUrut: 1, uraianTugas: 'Mengkoordinasikan pelaksanaan pelayanan kesehatan', waktuPenyelesaian: 480 },
    t3: { jabatanId: 'j_x', nomorUrut: 1, uraianTugas: 'Tugas OPD lain', waktuPenyelesaian: 60 },
  },
  'referensiJabatan': {
    r1: { jenisJabatan: 'Fungsional', namaBase: 'Penyuluh Kesehatan' },
    r2: { jenisJabatan: 'Pelaksana', namaBase: 'Pengadministrasi Perkantoran' },
  },
};

sandbox.fbGet_ = (p) => {
  if (!(p in DB)) throw new Error('fbGet_: path tidak ada di dummy DB: ' + p);
  return JSON.parse(JSON.stringify(DB[p]));
};

// ------------------------------------------------------------
// 3. Helper asersi
// ------------------------------------------------------------
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  => ' + JSON.stringify(detail) : '')); }
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// ------------------------------------------------------------
// 4. Uji buildAiContext_
// ------------------------------------------------------------
console.log('\n== buildAiContext_ (scoping OPD, prioritas sejawat, truncation) ==');
const ctx = sandbox.buildAiContext_('u_buk', 'j_target', 'Dinas Kesehatan', 'Label Fallback');
const P = ctx.promptBlock;

check('OPD terdeteksi dari root pohon unit', P.indexOf('Perangkat Daerah (OPD): Dinas Kesehatan') !== -1);
check('Bidang jabatan sesuai unit target', P.indexOf('Unit Kerja/Bidang jabatan ini: Bidang Pelayanan Kesehatan') !== -1);
check('Sejawat satu OPD muncul: j_a (Disetujui)', P.indexOf('Kepala Bidang Pengendalian') !== -1);
check('Sejawat satu OPD muncul: j_b (punya ABK)', P.indexOf('Kepala Sub Bagian Keuangan') !== -1);
check('Prioritas: Disetujui (j_a) tampil lebih dulu', P.indexOf('Kepala Bidang Pengendalian') < P.indexOf('Kepala Sub Bagian Keuangan'));
check('Jabatan OPD lain (j_x) TIDAK ikut grounding', P.indexOf('Kepala Bidang Pendidikan') === -1);
check('Tugas eksisting target tampil', P.indexOf('Mengkoordinasikan pelaksanaan pelayanan kesehatan') !== -1);
check('Tugas eksisting OPD lain (t3) TIDAK tampil', P.indexOf('Tugas OPD lain') === -1);
check('Uraian >120 karakter dipotong + "...", tanpa bocor penuh',
  P.indexOf('B'.repeat(117) + '...') !== -1 && P.indexOf('B'.repeat(140)) === -1);
check('WKE referensi diambil dari ABK Disetujui (75000)', ctx.sumber.wkeReferensi === 75000, ctx.sumber);
check('Statistik sumber: 2 sejawat, 1 ABK tervalidasi, 2 referensi',
  ctx.sumber.jabatanSejawat === 2 && ctx.sumber.abkTervalidasi === 1 && ctx.sumber.referensi === 2, ctx.sumber);
check('Referensi nomenklatur ikut di prompt', P.indexOf('Penyuluh Kesehatan (Fungsional)') !== -1);
check('ATURAN ANGKA (menit, jumlahHasil, WKE 1250 jam) tersuntik', P.indexOf('ATURAN ANGKA WAJIB') !== -1 && P.indexOf('75000 menit') !== -1);
check('Status ABK non-Disetujui j_b tidak masuk hitungan tervalidasi', P.indexOf('formasi tersimulasikan 1') !== -1 && ctx.sumber.abkTervalidasi === 1);

// Fallback: unitKerjaId tidak dikenal -> tetap jalan tanpa crash
const ctxUnknown = sandbox.buildAiContext_('u_tidak_ada', 'j_target', 'Dinas Kesehatan', 'Label Fallback');
check('Unit tidak dikenal: fallback label + prompt tanpa sejawat',
  ctxUnknown.promptBlock.indexOf('Unit Kerja/Bidang jabatan ini: Label Fallback') !== -1 &&
  ctxUnknown.promptBlock.indexOf('Belum ada data ABK jabatan lain') !== -1);

// Fallback: fbGet_ gagal -> blok konteks darurat, tidak melempar error
const origFbGet = sandbox.fbGet_;
sandbox.fbGet_ = () => { throw new Error('koneksi putus'); };
const ctxBroken = sandbox.buildAiContext_('u_buk', 'j_target', 'X', 'Y');
sandbox.fbGet_ = origFbGet;
check('fbGet_ gagal: blok darurat, tanpa exception', ctxBroken.promptBlock.indexOf('Data organisasi tidak tersedia') !== -1);

// ------------------------------------------------------------
// 5. Uji verifyFormasiIdeal_ (konversi satuan & pembulatan)
// ------------------------------------------------------------
console.log('\n== verifyFormasiIdeal_ (konversi satuan & pembulatan formasi) ==');
const ctx75000 = { sumber: { wkeReferensi: 75000 } };

// TC1: menit normal, kebutuhan 1.04 -> formasi 1
const d1 = { tugasPokok: [
  { waktuPenyelesaian: 240, jumlahHasil: 150 },
  { waktuPenyelesaian: 300, jumlahHasil: 100 },
  { waktuPenyelesaian: 120, jumlahHasil: 100 },
] };
sandbox.verifyFormasiIdeal_(d1, ctx75000);
check('TC1 totalWaktuEfektif = 78000', d1.analisisBebanKerja.totalWaktuEfektifMenit === 78000, d1.analisisBebanKerja);
check('TC1 kebutuhanPegawaiIdeal = 1.04', near(d1.analisisBebanKerja.kebutuhanPegawaiIdeal, 1.04));
check('TC1 pembulatan <1.5 -> 1', d1.analisisBebanKerja.formasiIdeal === 1);

// TC2: kebutuhan 1.76 -> pembulatan ke atas -> 2
const d2 = { tugasPokok: [
  { waktuPenyelesaian: 480, jumlahHasil: 150 },
  { waktuPenyelesaian: 240, jumlahHasil: 200 },
  { waktuPenyelesaian: 120, jumlahHasil: 100 },
] };
sandbox.verifyFormasiIdeal_(d2, ctx75000);
check('TC2 kebutuhan 1.76 -> formasi 2', d2.analisisBebanKerja.kebutuhanPegawaiIdeal === 1.76 && d2.analisisBebanKerja.formasiIdeal === 2, d2.analisisBebanKerja);

// TC3: batas persis 1.5 -> Math.round(1.5) = 2 (paritas aturan client)
const d3 = { tugasPokok: [
  { waktuPenyelesaian: 480, jumlahHasil: 150 },
  { waktuPenyelesaian: 400, jumlahHasil: 100 },
  { waktuPenyelesaian: 245, jumlahHasil: 1 },
  { waktuPenyelesaian: 255, jumlahHasil: 1 },
] };
sandbox.verifyFormasiIdeal_(d3, ctx75000);
check('TC3 batas 1.5 -> formasi 2 (paritas calculateFormasiPembulatan)',
  near(d3.analisisBebanKerja.kebutuhanPegawaiIdeal, 1.5) && d3.analisisBebanKerja.formasiIdeal === 2, d3.analisisBebanKerja);

// TC4: konversi jam -> menit (rata-rata > 480)
const d4 = { tugasPokok: [
  { waktuPenyelesaian: 600, jumlahHasil: 1 },
  { waktuPenyelesaian: 720, jumlahHasil: 1 },
  { waktuPenyelesaian: 240, jumlahHasil: 1 },
] };
sandbox.verifyFormasiIdeal_(d4, ctx75000);
check('TC4 nilai >480 dikonversi x60 (600 -> 36000)', d4.tugasPokok[0].waktuPenyelesaian === 36000, d4.tugasPokok[0]);
check('TC4 total setelah konversi = 93600', d4.analisisBebanKerja.totalWaktuEfektifMenit === 93600, d4.analisisBebanKerja);
check('TC4 formasi dari 93600/75000 = 1.248 -> 1', d4.analisisBebanKerja.formasiIdeal === 1);

// TC5: jumlahHasil hilang/0/negatif/pecahan -> default bulat >= 1; waktu negatif -> 0
const d5 = { tugasPokok: [
  { waktuPenyelesaian: 120 },
  { waktuPenyelesaian: 60, jumlahHasil: 0 },
  { waktuPenyelesaian: 60, jumlahHasil: -5 },
  { waktuPenyelesaian: -5, jumlahHasil: 2 },
  { waktuPenyelesaian: 60, jumlahHasil: 2.5 },
] };
sandbox.verifyFormasiIdeal_(d5, ctx75000);
check('TC5 jumlahHasil -> [1,1,1,2,3] (bulat, min 1)',
  JSON.stringify(d5.tugasPokok.map((t) => t.jumlahHasil)) === '[1,1,1,2,3]', d5.tugasPokok.map((t) => t.jumlahHasil));
check('TC5 waktu negatif di-clamp ke 0', d5.tugasPokok[3].waktuPenyelesaian === 0);
check('TC5 total = 420, formasi minimal 1', d5.analisisBebanKerja.totalWaktuEfektifMenit === 420 && d5.analisisBebanKerja.formasiIdeal === 1);

// TC6: tanpa WKE referensi -> fallback 75000 (1250 jam/tahun)
const d6 = { tugasPokok: [{ waktuPenyelesaian: 480, jumlahHasil: 100 }] };
sandbox.verifyFormasiIdeal_(d6, { sumber: { wkeReferensi: 0 } });
check('TC6 fallback WKE 75000, kebutuhan 0.64, formasi 1',
  d6.analisisBebanKerja.wkeTersimpan === 75000 && near(d6.analisisBebanKerja.kebutuhanPegawaiIdeal, 0.64) && d6.analisisBebanKerja.formasiIdeal === 1, d6.analisisBebanKerja);

// TC7: tugasPokok bukan array -> tidak crash, data balik apa adanya
const d7 = { tugasPokok: 'bukan-array' };
const out7 = sandbox.verifyFormasiIdeal_(d7, ctx75000);
check('TC7 tugasPokok non-array: identitas objek utuh, tanpa error', out7 === d7 && !out7.analisisBebanKerja);

// TC8 (kasus ambigu, dokumentasi): jam kecil (8/4/2) tidak bisa dibedakan
// dari menit pendek -> dibiarkan sebagai menit sesuai mandat prompt.
const d8 = { tugasPokok: [
  { waktuPenyelesaian: 8, jumlahHasil: 1 },
  { waktuPenyelesaian: 4, jumlahHasil: 1 },
  { waktuPenyelesaian: 2, jumlahHasil: 1 },
] };
sandbox.verifyFormasiIdeal_(d8, ctx75000);
check('TC8 (dokumentasi) jam kecil ambigu: dibiarkan, tidak crash, formasi 1',
  d8.analisisBebanKerja.totalWaktuEfektifMenit === 14 && d8.analisisBebanKerja.formasiIdeal === 1, d8.analisisBebanKerja);

// TC9: pipeline nyata normalizeAiAnjabDraft_ -> verifyFormasiIdeal_
console.log('\n== Pipeline normalizeAiAnjabDraft_ -> verifyFormasiIdeal_ ==');
const aiPayload = {
  ikhtisarJabatan: 'Melaksanakan koordinasi pelayanan kesehatan.',
  kualifikasi: { pendidikanFormal: 'S-1, S-2' },
  tugasPokok: [
    { uraianTugas: 'Tugas A', hasilKerja: 'Dokumen', waktuPenyelesaian: 480, jumlahHasil: 150 },
    { uraianTugas: 'Tugas B', hasilKerja: 'Laporan', waktuPenyelesaian: 240 },
    { uraianTugas: 'Tugas C', hasilKerja: 'Data', waktuPenyelesaian: '300' },
  ],
  hasilKerja: ['H1', 'H2'],
  analisisBebanKerja: { wkeTersimpan: 999, kebutuhanPegawaiIdeal: 42, formasiIdeal: 99, catatan: 'Hitungan AI' },
};
const normalized = sandbox.normalizeAiAnjabDraft_(aiPayload);
const verified = sandbox.verifyFormasiIdeal_(normalized, ctx75000);
check('TC9 angka karangan AI (formasi 99) ditimpa server (formasi 1)',
  verified.analisisBebanKerja.formasiIdeal === 1 && verified.analisisBebanKerja.wkeTersimpan === 75000, verified.analisisBebanKerja);
check('TC9 catatan AI dipertahankan', verified.analisisBebanKerja.catatan === 'Hitungan AI');
check('TC9 waktu string "300" dinormalisasi numerik', verified.tugasPokok[2].waktuPenyelesaian === 300);
check('TC9 jumlahHasil baris tanpa nilai -> 1, total = 72540',
  verified.tugasPokok[1].jumlahHasil === 1 && verified.analisisBebanKerja.totalWaktuEfektifMenit === 72540, verified.analisisBebanKerja);

// ------------------------------------------------------------
// 6. Ringkasan
// ------------------------------------------------------------
console.log('\n================ RINGKASAN ================');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) process.exit(1);
console.log('Semua simulasi lulus. (TC8 = batas heuristik terdokumentasi: nilai jam kecil ambigu dengan menit pendek)');
