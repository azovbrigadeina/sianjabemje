/**
 * =============================================================
 * SIMULASI DRAF AI PINTAR (tanpa Apps Script, tanpa Firebase)
 * =============================================================
 * Menguji verifyFormasiIdeal_ dan buildAiContext_ dari gas/Code.gs
 * dengan data uji dummy — validasi konversi satuan jam->menit,
 * pembulatan formasi (paritas dengan calculateFormasiPembulatan
 * di src/lib/utils.ts), scoping satu OPD, pipeline
 * normalizeAiAnjabDraft_ -> verifyFormasiIdeal_, dan penyeimbang
 * ambang TPP (kumulatif minimal 1.350 jam/tahun = 81000 menit/tahun).
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
const lockLog = [];
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
    getScriptLock: () => ({
      waitLock: () => { lockLog.push('wait'); },
      tryLock: () => true,
      releaseLock: () => { lockLog.push('release'); },
    }),
  },
  Utilities: {
    getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
    MacAlgorithm: { HMAC_SHA_256: 'HMAC_SHA_256' },
    // Peka input & bebas ':' agar uji tampering bermakna (hex murni)
    computeHmacSignature: (_alg, data, _key) => Buffer.from(String(data), 'utf8').toString('hex'),
    base64Encode: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    base64Decode: (s) => Buffer.from(String(s), 'base64'),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
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
    u_opd:   { id: 'u_opd',   nama: 'Dinas Kesehatan', kode: 'DINKES-01', parentId: '' },
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
  // Konsep tunggal jam (keputusan pengguna 2026-10-12): WKE fix 1250, waktu & total dalam jam
  '2026/abk': {
    j_a: { jabatanId: 'j_a', waktuSatuan: 'jam', wke: 1250, totalWaktuEfektif: 5250, totalKebutuhan: 4.2, formasiPembulatan: 4, statusValidasi: 'Disetujui' },
    j_b: { jabatanId: 'j_b', waktuSatuan: 'jam', wke: 1250, totalWaktuEfektif: 1500, totalKebutuhan: 1.2, formasiPembulatan: 1 },
    j_x: { jabatanId: 'j_x', waktuSatuan: 'jam', wke: 1250, totalWaktuEfektif: 15000, totalKebutuhan: 12, formasiPembulatan: 12, statusValidasi: 'Disetujui' },
  },
  '2026/tugasPokok': {
    // Konsep tunggal jam: waktuPenyelesaian dalam jam (di draf AI & ABK)
    t2: { jabatanId: 'j_target', nomorUrut: 2, uraianTugas: 'B'.repeat(140), waktuPenyelesaian: 4 },
    t1: { jabatanId: 'j_target', nomorUrut: 1, uraianTugas: 'Mengkoordinasikan pelaksanaan pelayanan kesehatan', waktuPenyelesaian: 8 },
    t3: { jabatanId: 'j_x', nomorUrut: 1, uraianTugas: 'Tugas OPD lain', waktuPenyelesaian: 1 },
  },
  'referensiJabatan': {
    r1: { jenisJabatan: 'Fungsional', namaBase: 'Penyuluh Kesehatan' },
    r2: { jenisJabatan: 'Pelaksana', namaBase: 'Pengadministrasi Perkantoran' },
  },
  'users': {},
  'revokedTokens': {},
  'security_logs': {},
};

// autoRegisterOperator_ (A7) membaca path root non-tahunan 'unitKerja'
DB['unitKerja'] = DB['2026/unitKerja'];

sandbox.fbGet_ = (p) => {
  if (p in DB) return JSON.parse(JSON.stringify(DB[p]));
  // Dukung sub-path (mis. '2026/jabatan/j_target' untuk readRecord_)
  const seg = String(p).split('/');
  let base = null, idx = 0;
  for (let n = seg.length; n >= 1; n--) {
    const cand = seg.slice(0, n).join('/');
    if (cand in DB) { base = DB[cand]; idx = n; break; }
  }
  if (!base) throw new Error('fbGet_: path tidak ada di dummy DB: ' + p);
  let node = base;
  for (let i = idx; i < seg.length; i++) {
    if (node == null || typeof node !== 'object') throw new Error('fbGet_: sub-path tidak ada: ' + p);
    node = node[seg[i]];
  }
  return node == null ? null : JSON.parse(JSON.stringify(node));
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
check('Konsep tunggal jam: wkeReferensi tidak lagi dipakai (pembagi selalu 1250)', ctx.sumber.wkeReferensi === 0, ctx.sumber);
check('Statistik sumber: 2 sejawat, 1 ABK tervalidasi, 2 referensi',
  ctx.sumber.jabatanSejawat === 2 && ctx.sumber.abkTervalidasi === 1 && ctx.sumber.referensi === 2, ctx.sumber);
check('Referensi nomenklatur ikut di prompt', P.indexOf('Penyuluh Kesehatan (Fungsional)') !== -1);
check('ATURAN ANGKA (jam, jumlahHasil, pembagi 1250) tersuntik', P.indexOf('ATURAN ANGKA WAJIB') !== -1 && P.indexOf('dalam JAM per satu hasil kerja') !== -1 && P.indexOf('1250 jam/tahun') !== -1);
check('ATURAN AMBANG TPP (1350 jam/tahun) tersuntik', P.indexOf('1350 jam/tahun') !== -1);
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
console.log('\n== verifyFormasiIdeal_ (konsep tunggal JAM: konversi menit->jam, clamp 8, ambang 1350) ==');
const ctxJam = { sumber: { wkeReferensi: 0 } }; // pembagi selalu fix 1250 jam

// TC1 (jam): kumulatif 1350*0.92... -> volume dinaikkan proporsional
// 8x150+10x100+5x100 = 2700 < 1350? tidak — 2700 >= 1350, tak terus TPP
const d1 = { tugasPokok: [
  { waktuPenyelesaian: 8, jumlahHasil: 150 },
  { waktuPenyelesaian: 10, jumlahHasil: 100 },
  { waktuPenyelesaian: 5, jumlahHasil: 100 },
] };
sandbox.verifyFormasiIdeal_(d1, ctxJam);
check('TC1 di atas ambang: volume tak disentuh [150,100,100]',
  JSON.stringify(d1.tugasPokok.map((t) => t.jumlahHasil)) === '[150,100,100]', d1.tugasPokok.map((t) => t.jumlahHasil));
check('TC1 totalWaktuEfektifJam = 2500 (10 di-clamp 8)', d1.analisisBebanKerja.totalWaktuEfektifJam === 2500, d1.analisisBebanKerja);
check('TC1 kebutuhan 2500/1250 = 2', near(d1.analisisBebanKerja.kebutuhanPegawaiIdeal, 2));
check('TC1 pembulatan 2.16 -> 2', d1.analisisBebanKerja.formasiIdeal === 2);
check('TC1 catatan menyebut clamp (>8 jam dibatasi) karena 10 > 8', d1.analisisBebanKerja.catatan.indexOf('> 8 jam') !== -1, d1.analisisBebanKerja.catatan);

// TC2: di bawah ambang TPP -> volume diskalakan proporsional ke 1350 jam
const d2 = { tugasPokok: [
  { waktuPenyelesaian: 4, jumlahHasil: 150 },
  { waktuPenyelesaian: 2, jumlahHasil: 200 },
  { waktuPenyelesaian: 1, jumlahHasil: 100 },
] };
// total 600+400+100=1100 -> faktor 1350/1100 -> jh [184,245,123]
sandbox.verifyFormasiIdeal_(d2, ctxJam);
check('TC2 volume diskalakan ke ambang: [185,245,123] (dibulatkan ke atas per baris)',
  JSON.stringify(d2.tugasPokok.map((t) => t.jumlahHasil)) === '[185,245,123]', d2.tugasPokok.map((t) => t.jumlahHasil));
check('TC2 kebutuhan jadi ~1.08 dekat ambang (1350/1250)', near(d2.analisisBebanKerja.kebutuhanPegawaiIdeal, 1.088, 0.01), d2.analisisBebanKerja);
check('TC2 catatan menyebut ambang TPP', d2.analisisBebanKerja.catatan.indexOf('ambang TPP') !== -1, d2.analisisBebanKerja.catatan);

// TC3: batas persis 1.5 -> Math.round(1.5) = 2 (paritas aturan client)
const d3 = { tugasPokok: [
  { waktuPenyelesaian: 8, jumlahHasil: 150 },
  { waktuPenyelesaian: 6.666, jumlahHasil: 100 },
  { waktuPenyelesaian: 2, jumlahHasil: 1 },
] };
sandbox.verifyFormasiIdeal_(d3, ctxJam); // 1200+666.6+2 = 1868.6/1250 = 1.4949 -> raw 1
check('TC3 kebutuhan di bawah 1.5 -> formasi 1 (pembulatan 1.49 -> 1)',
  d3.analisisBebanKerja.formasiIdeal === 1, d3.analisisBebanKerja);

// TC4: AI mengirim menit (nilai besar, rata2 > 480) -> dikonversi /60 ke jam
const d4 = { tugasPokok: [
  { waktuPenyelesaian: 600, jumlahHasil: 1 },
  { waktuPenyelesaian: 720, jumlahHasil: 1 },
  { waktuPenyelesaian: 240, jumlahHasil: 1 },
] };
sandbox.verifyFormasiIdeal_(d4, ctxJam);
check('TC4 menit 600 -> dikonversi 10 jam -> clamp ke 8', d4.tugasPokok[0].waktuPenyelesaian === 8, d4.tugasPokok[0]);
check('TC4 formasi mengikuti hitung jam', d4.analisisBebanKerja.formasiIdeal === 1, d4.analisisBebanKerja);

// TC5: jumlahHasil hilang/0/negatif/pecahan -> default bulat >= 1; waktu negatif -> 0
const d5 = { tugasPokok: [
  { waktuPenyelesaian: 3 },
  { waktuPenyelesaian: 1, jumlahHasil: 0 },
  { waktuPenyelesaian: 1, jumlahHasil: -5 },
  { waktuPenyelesaian: -5, jumlahHasil: 2 },
  { waktuPenyelesaian: 1, jumlahHasil: 2.5 },
] };
sandbox.verifyFormasiIdeal_(d5, ctxJam);
check('TC5 jumlahHasil guard lalu diskalakan ambang TPP',
  d5.analisisBebanKerja.formasiIdeal >= 1, d5.analisisBebanKerja);
check('TC5 waktu negatif di-clamp ke 0', d5.tugasPokok[3].waktuPenyelesaian === 0);
check('TC5 total di bawah ambang -> dinaikkan ke >= 1350', d5.analisisBebanKerja.totalWaktuEfektifJam >= 1350, d5.analisisBebanKerja);

// TC6: pembagi selalu 1250 jam (tanpa wkeReferensi)
const d6 = { tugasPokok: [{ waktuPenyelesaian: 8, jumlahHasil: 100 }] };
sandbox.verifyFormasiIdeal_(d6, { sumber: { wkeReferensi: 0 } });
check('TC6 pembagi 1250: 800 jam -> diskalakan ke ambang 1350 -> formasi 1, wke 1250 tersimpan',
  d6.analisisBebanKerja.wkeTersimpan === 1250 && d6.analisisBebanKerja.formasiIdeal === 1, d6.analisisBebanKerja);

// TC7: tugasPokok bukan array -> tidak crash, data balik apa adanya
const d7 = { tugasPokok: 'bukan-array' };
const out7 = sandbox.verifyFormasiIdeal_(d7, ctxJam);
check('TC7 tugasPokok non-array: identitas objek utuh, tanpa error', out7 === d7 && !out7.analisisBebanKerja);

// TC8: jam kecil (&lt;8) tidak kena clamp, dihitung sebagai jam; di bawah ambang -> TPP naikkan volume
const d8 = { tugasPokok: [
  { waktuPenyelesaian: 8, jumlahHasil: 1 },
  { waktuPenyelesaian: 4, jumlahHasil: 1 },
  { waktuPenyelesaian: 2, jumlahHasil: 1 },
] };
sandbox.verifyFormasiIdeal_(d8, ctxJam);
check('TC8 total 14 jam di bawah ambang -> diskalakan ke >= 1350 jam, formasi 1 (pembagi 1250)',
  d8.analisisBebanKerja.totalWaktuEfektifJam >= 1350 && d8.analisisBebanKerja.formasiIdeal === 1, d8.analisisBebanKerja);

// TC9: pipeline nyata normalizeAiAnjabDraft_ -> verifyFormasiIdeal_
console.log('\n== Pipeline normalizeAiAnjabDraft_ -> verifyFormasiIdeal_ (jam) ==');
const aiPayload = {
  ikhtisarJabatan: 'Melaksanakan koordinasi pelayanan kesehatan.',
  kualifikasi: { pendidikanFormal: 'S-1, S-2' },
  tugasPokok: [
    { uraianTugas: 'Tugas A', hasilKerja: 'Dokumen', waktuPenyelesaian: 8, jumlahHasil: 150 },
    { uraianTugas: 'Tugas B', hasilKerja: 'Laporan', waktuPenyelesaian: 4 },
    { uraianTugas: 'Tugas C', hasilKerja: 'Data', waktuPenyelesaian: '3' },
  ],
  hasilKerja: ['H1', 'H2'],
  analisisBebanKerja: { wkeTersimpan: 999, kebutuhanPegawaiIdeal: 42, formasiIdeal: 99, catatan: 'Hitungan AI' },
};
const normalized = sandbox.normalizeAiAnjabDraft_(aiPayload);
const verified = sandbox.verifyFormasiIdeal_(normalized, ctxJam);
check('TC9 angka karangan AI (formasi 99) ditimpa server (1236/1250 -> 1)',
  verified.analisisBebanKerja.formasiIdeal === 1 && verified.analisisBebanKerja.wkeTersimpan === 1250, verified.analisisBebanKerja);
check('TC9 catatan AI dipertahankan', verified.analisisBebanKerja.catatan.indexOf('Hitungan AI') !== -1, verified.analisisBebanKerja.catatan);
check('TC9 waktu string "3" dinormalisasi numerik 3 (jam)', verified.tugasPokok[2].waktuPenyelesaian === 3);
check('TC9 total 1236 jam < 1350 -> volume A dinaikkan hingga >= ambang TPP',
  verified.analisisBebanKerja.totalWaktuEfektifJam >= 1350, verified.analisisBebanKerja);

// ------------------------------------------------------------
// 5b. Batas formasi per jenis jabatan (uji laporan pengguna:
//     Sekretaris DPRD = struktural, formasi ideal jangan meledak)
// ------------------------------------------------------------
console.log('\n== Batas formasi per jenis jabatan (struktural=1, pelaksana/fungsional min 2, clamp waktu) ==');

// TC10: reproduksi Sekretaris DPRD — volume/waktu karangan AI raksasa -> struktural tetap 1
const d10 = {
  jenisJabatan: 'Jabatan Pimpinan Tinggi Pratama',
  tugasPokok: [
    { waktuPenyelesaian: 8, jumlahHasil: 400000 },
    { waktuPenyelesaian: 8, jumlahHasil: 200000 },
    { waktuPenyelesaian: 4, jumlahHasil: 100000 },
  ],
};
sandbox.verifyFormasiIdeal_(d10, ctxJam);
check('TC10 kebutuhan mentah dipertahankan (transparan) > 1000', d10.analisisBebanKerja.kebutuhanPegawaiIdeal > 1000, d10.analisisBebanKerja);
check('TC10 formasiIdeal struktural = 1 (bukan ribuan)', d10.analisisBebanKerja.formasiIdeal === 1, d10.analisisBebanKerja);
check('TC10 catatan menyebut batas struktural', d10.analisisBebanKerja.catatan.indexOf('struktural dibatasi 1') !== -1, d10.analisisBebanKerja.catatan);

// TC10b: jenis dari ctx (bukan dari data) juga dihormati
const d10b = { tugasPokok: [{ waktuPenyelesaian: 8, jumlahHasil: 10000 }] };
sandbox.verifyFormasiIdeal_(d10b, { sumber: { wkeReferensi: 0 }, jenisJabatan: 'Jabatan Administrator' });
check('TC10b jenis via ctx: administrator -> formasi 1', d10b.analisisBebanKerja.formasiIdeal === 1, d10b.analisisBebanKerja);

// TC11: pelaksana hitungan kecil -> minimal 2
const d11 = { jenisJabatan: 'Jabatan Pelaksana', tugasPokok: [{ waktuPenyelesaian: 2, jumlahHasil: 100 }] };
sandbox.verifyFormasiIdeal_(d11, ctxJam); // 200/1250 = 0.16 -> raw 1 -> floor 2
check('TC11 pelaksana kecil -> formasi 2', d11.analisisBebanKerja.formasiIdeal === 2, d11.analisisBebanKerja);
check('TC11 catatan menyebut minimal 2', d11.analisisBebanKerja.catatan.indexOf('minimal 2 orang') !== -1);
check('TC11 volume diskalakan tepat ke ambang: 675, kumulatif 1350',
  d11.tugasPokok[0].jumlahHasil === 675 && d11.analisisBebanKerja.totalWaktuEfektifJam === 1350, d11.analisisBebanKerja);

// TC12: fungsional hitungan besar -> tanpa cap atas
const d12 = { jenisJabatan: 'Jabatan Fungsional', tugasPokok: [
  { waktuPenyelesaian: 8, jumlahHasil: 800 },
  { waktuPenyelesaian: 5, jumlahHasil: 300 },
] };
sandbox.verifyFormasiIdeal_(d12, ctxJam); // (8x800 + 5x300) = 7900/1250 = 6.32 -> 6, tanpa cap atas
check('TC12 fungsional besar -> mengikuti hitung (6), tanpa cap atas', d12.analisisBebanKerja.formasiIdeal === 6, d12.analisisBebanKerja);

// TC13: clamp waktu tunggal > 8 jam (tanpa konversi global, rata2 <= 480)
const d13 = { jenisJabatan: 'Jabatan Pelaksana', tugasPokok: [
  { waktuPenyelesaian: 10, jumlahHasil: 10 },
  { waktuPenyelesaian: 2, jumlahHasil: 1 },
] };
sandbox.verifyFormasiIdeal_(d13, ctxJam); // rata2 6 -> tanpa konversi; clamp 10->8
check('TC13 waktu 10 di-clamp 8', d13.tugasPokok[0].waktuPenyelesaian === 8, d13.tugasPokok[0]);
check('TC13 total setelah clamp >= ambang 1350, volume diskalakan',
  d13.analisisBebanKerja.totalWaktuEfektifJam >= 1350, d13.analisisBebanKerja);
check('TC13 catatan menyebut clamp > 8 jam', d13.analisisBebanKerja.catatan.indexOf('> 8 jam') !== -1);

// TC14: AI kirim menit lama (rata2 > 480) -> konversi /60 + clamp kohibit
const d14 = { jenisJabatan: 'Jabatan Pelaksana', tugasPokok: [
  { waktuPenyelesaian: 600, jumlahHasil: 10 },
  { waktuPenyelesaian: 720, jumlahHasil: 10 },
  { waktuPenyelesaian: 240, jumlahHasil: 10 },
] };
sandbox.verifyFormasiIdeal_(d14, ctxJam); // rata2 520>480 -> /60 -> [10,12,4] -> clamp [8,8,4]
check('TC14 semua waktu konversi+clamp: [8,8,4]',
  JSON.stringify(d14.tugasPokok.map((t) => t.waktuPenyelesaian)) === '[8,8,4]', d14.tugasPokok.map((t) => t.waktuPenyelesaian));
check('TC14 total >= ambang 1350 setelah penyeimbang TPP, formasi pelaksana >= 2',
  d14.analisisBebanKerja.totalWaktuEfektifJam >= 1350 && d14.analisisBebanKerja.formasiIdeal >= 2, d14.analisisBebanKerja);

// TC15: fungsional kecil — pastikan floor minimal 2 tetap
const d15 = { jenisJabatan: 'Jabatan Fungsional', tugasPokok: [
  { waktuPenyelesaian: 8, jumlahHasil: 100 },
  { waktuPenyelesaian: 4, jumlahHasil: 50 },
] };
sandbox.verifyFormasiIdeal_(d15, ctxJam); // 800+200 = 1000/1250 = 0.8 -> raw 1 -> floor 2
check('TC15 fungsional kecil -> formasi 2 (floor)', d15.analisisBebanKerja.formasiIdeal === 2, d15.analisisBebanKerja);
check('TC15 volume diskalakan ke >= ambang 1350', d15.analisisBebanKerja.totalWaktuEfektifJam >= 1350, d15.analisisBebanKerja);

// ------------------------------------------------------------
// 5c. Ambang TPP (regulasi): kumulatif minimal 1.350 jam/tahun
// ------------------------------------------------------------
console.log('\n== Ambang TPP (kumulatif minimal 1350 jam/tahun) ==');

// Di atas ambang -> tidak disentuh
const dTppOk = { tugasPokok: [{ waktuPenyelesaian: 8, jumlahHasil: 200 }] }; // 1600 jam
sandbox.verifyFormasiIdeal_(dTppOk, ctxJam);
check('TPP: kumulatif 1600 di atas ambang -> volume tak disentuh, tanpa catatan TPP',
  dTppOk.tugasPokok[0].jumlahHasil === 200 && dTppOk.analisisBebanKerja.totalWaktuEfektifJam === 1600 &&
  dTppOk.analisisBebanKerja.catatan.indexOf('ambang TPP') === -1, dTppOk.analisisBebanKerja);

// Legacy menit dari AI lama (rata2 > 480) -> dikonversi ke jam; konsistensi >= ambang
const dTppMenit = { tugasPokok: [{ waktuPenyelesaian: 48000, jumlahHasil: 1 }] };
sandbox.verifyFormasiIdeal_(dTppMenit, ctxJam);
check('TPP: input menit raksasa (48000) -> konversi 800 jam -> formasi 1',
  dTppMenit.analisisBebanKerja.formasiIdeal === 1, dTppMenit.analisisBebanKerja);

// tugasPokok kosong -> tanpa crash, tidak ada penyeimbangan
const dTppEmpty = { tugasPokok: [] };
sandbox.verifyFormasiIdeal_(dTppEmpty, ctxJam);
check('TPP: tugasPokok kosong -> tidak crash, total 0, formasi 0',
  dTppEmpty.analisisBebanKerja.totalWaktuEfektifJam === 0 && dTppEmpty.analisisBebanKerja.formasiIdeal === 0, dTppEmpty.analisisBebanKerja);

// Struktural dengan kumulatif di bawah ambang: volume tetap disesuaikan, formasi tetap 1
const dTppStruktural = { jenisJabatan: 'Jabatan Pimpinan Tinggi Pratama', tugasPokok: [
  { waktuPenyelesaian: 4, jumlahHasil: 50 },
  { waktuPenyelesaian: 3, jumlahHasil: 40 },
] };
sandbox.verifyFormasiIdeal_(dTppStruktural, ctxJam);
check('TPP: struktural di bawah ambang -> volume diskalakan, kumulatif >= 1350, formasi tetap 1',
  dTppStruktural.analisisBebanKerja.totalWaktuEfektifJam >= 1350 && dTppStruktural.analisisBebanKerja.formasiIdeal === 1, dTppStruktural.analisisBebanKerja);

// ------------------------------------------------------------
// 5d. A6: updateUrutanBatch_ — cek kepemilikan (audit 2026-10-07)
// ------------------------------------------------------------
console.log('\n== A6: updateUrutanBatch_ (kepemilikan baris & fail-closed) ==');

let patchCalls = [], postCalls = [];
const origFbPatch = sandbox.fbPatch_;
const origFbPost = sandbox.fbPost_;
sandbox.fbPatch_ = (path, payload) => { patchCalls.push({ path, payload }); return { patched: true }; };
sandbox.fbPost_ = (path, data) => { postCalls.push({ path, data }); return { name: 'new_' + postCalls.length }; };

const opBuk = { username: 'op_buk', role: 'operator', unitKerjaId: 'u_buk' };
const opPend = { username: 'op_pend', role: 'operator', unitKerjaId: 'u_pend' };
const admin1 = { username: 'admin1', role: 'admin' };

function expectThrow(name, fn, needle) {
  try { fn(); fail++; console.log('  FAIL  ' + name + '  => tidak melempar error'); }
  catch (e) {
    const msg = (e && e.message) || String(e);
    check(name, needle ? msg.indexOf(needle) !== -1 : true, msg);
  }
}

// Sukses: operator u_buk mengurutkan baris milik j_target (unit u_buk)
patchCalls = [];
let rU = sandbox.updateUrutanBatch_(opBuk, 'tugasPokok', [{ id: 't1', urutan: 2 }, { id: 't2', urutan: 1 }]);
check('A6 operator u_buk boleh urutkan baris OPD-nya (t1,t2) -> sukses + patch benar',
  rU.success === true && patchCalls.length === 1 && patchCalls[0].path === '2026/tugasPokok' &&
  patchCalls[0].payload['t1/urutan'] === 2 && patchCalls[0].payload['t2/urutan'] === 1, patchCalls);

// Ditolak: baris milik jabatan OPD lain (t3 -> j_x -> u_pend)
patchCalls = [];
expectThrow('A6 operator u_buk DITOLAK urutkan t3 milik OPD lain',
  () => sandbox.updateUrutanBatch_(opBuk, 'tugasPokok', [{ id: 't3', urutan: 1 }]), 'Akses ditolak');
check('A6 penolakan lintas-OPD tidak menulis apa pun', patchCalls.length === 0, patchCalls.length);

// Batch campuran lintas OPD -> ditolak, tidak ada write parsial
patchCalls = [];
expectThrow('A6 batch campuran (t1 milik sendiri + t3 OPD lain) -> ditolak',
  () => sandbox.updateUrutanBatch_(opBuk, 'tugasPokok', [{ id: 't1', urutan: 1 }, { id: 't3', urutan: 2 }]), 'Akses ditolak');
check('A6 batch campuran tidak menulis apa pun', patchCalls.length === 0, patchCalls.length);

// Operator OPD lain (u_pend) boleh urutkan t3 miliknya
patchCalls = [];
rU = sandbox.updateUrutanBatch_(opPend, 'tugasPokok', [{ id: 't3', urutan: 3 }]);
check('A6 operator u_pend boleh urutkan t3 (miliknya)',
  rU.success === true && patchCalls.length === 1 && patchCalls[0].payload['t3/urutan'] === 3, patchCalls);

// Admin boleh semuanya
patchCalls = [];
rU = sandbox.updateUrutanBatch_(admin1, 'tugasPokok', [{ id: 't3', urutan: 1 }]);
check('A6 admin boleh urutkan baris OPD mana pun', rU.success === true && patchCalls.length === 1, patchCalls);

// Fail-closed: id tak dikenal ditolak (dulu: diabaikan diam-diam)
expectThrow('A6 id tak dikenal -> ditolak (fail-closed)',
  () => sandbox.updateUrutanBatch_(opBuk, 'tugasPokok', [{ id: 't_nope', urutan: 9 }]), 'tidak ditemukan');

// Fail-closed: baris yatim (tanpa jabatanId) -> ditolak
DB['2026/tugasPokok'].t_yatim = { id: 't_yatim', uraianTugas: 'Tanpa pemilik', waktuPenyelesaian: 60 };
expectThrow('A6 baris tanpa jabatanId -> ditolak (fail-closed)',
  () => sandbox.updateUrutanBatch_(opBuk, 'tugasPokok', [{ id: 't_yatim', urutan: 1 }]), 'tidak terikat');
delete DB['2026/tugasPokok'].t_yatim;

sandbox.fbPatch_ = origFbPatch;
sandbox.fbPost_ = origFbPost;

// ------------------------------------------------------------
// 5e. A7: autoRegisterOperator_ — pencocokan OPD diperketat
// ------------------------------------------------------------
console.log('\n== A7: autoRegisterOperator_ (matching OPD: persis -> kode -> substring unik) ==');
scriptProps.set('INTEGRATION_TOKEN', 'test-token');

const origFbPatch7 = sandbox.fbPatch_;
const origFbPost7 = sandbox.fbPost_;
let userPatches = [], userPosts = [];
sandbox.fbPatch_ = (path, payload) => { userPatches.push({ path, payload }); return { patched: true }; };
sandbox.fbPost_ = (path, data) => { userPosts.push({ path, data }); return { name: 'newu_' + userPosts.length }; };

const a7token = 'test-token';
// (a) Persis setelah normalisasi
let reg = sandbox.autoRegisterOperator_({ token: a7token, nip: '198701012010011001', nama: 'Budi', opdName: 'Dinas Kesehatan', password: 'pw123' });
check('A7 nama persis "Dinas Kesehatan" -> terikat u_opd',
  reg.status === 'created' && userPosts[0].data.unitKerjaId === 'u_opd', { reg, d: userPosts[0] && userPosts[0].data });

// (a) Persis walau ada spasi berlebih
reg = sandbox.autoRegisterOperator_({ token: a7token, nip: '198701012010011003', nama: 'Cici', opdName: 'Dinas   Kesehatan ', password: 'pw123' });
check('A7 nama dengan spasi berlebih tetap persis (u_opd)', userPosts[1].data.unitKerjaId === 'u_opd', userPosts[1] && userPosts[1].data);

// (c) Substring ambigu ("Kesehatan" cocok u_opd & u_buk) -> TIDAK diikat
reg = sandbox.autoRegisterOperator_({ token: a7token, nip: '198701012010011004', nama: 'Dedi', opdName: 'Kesehatan', password: 'pw123' });
check('A7 substring ambigu (2 kandidat) -> akun TANPA unit kerja + catatan',
  userPosts[2].data.unitKerjaId === '' && reg.message.indexOf('Catatan:') !== -1 && reg.message.indexOf('tidak diikat') !== -1, reg);

// (c) Substring tepat 1 kandidat ("Pendidikan" hanya u_pend) -> diikat
reg = sandbox.autoRegisterOperator_({ token: a7token, nip: '198701012010011005', nama: 'Eka', opdName: 'Pendidikan', password: 'pw123' });
check('A7 substring tepat-1-kandidat ("Pendidikan") -> diikat u_pend', userPosts[3].data.unitKerjaId === 'u_pend', userPosts[3] && userPosts[3].data);

// (b) Kode OPD saat nama tak dikenal
reg = sandbox.autoRegisterOperator_({ token: a7token, nip: '198701012010011006', nama: 'Feri', opdName: 'Zorg Industries', opdKode: 'DINKES-01', password: 'pw123' });
check('A7 opdKode cocok -> terikat u_opd walau nama tak dikenali', userPosts[4].data.unitKerjaId === 'u_opd', userPosts[4] && userPosts[4].data);

// Tidak ada kandidat sama sekali
reg = sandbox.autoRegisterOperator_({ token: a7token, nip: '198701012010011007', nama: 'Gita', opdName: 'Zorg Industries', password: 'pw123' });
check('A7 nama tak dikenal tanpa kode -> tanpa unit + catatan "tidak ditemukan"',
  userPosts[5].data.unitKerjaId === '' && reg.message.indexOf('tidak ditemukan') !== -1, reg);

// Token salah tetap ditolak (regresi keamanan)
expectThrow('A7 token salah tetap ditolak',
  () => sandbox.autoRegisterOperator_({ token: 'salah', nip: '198701012010011008', nama: 'Hadi', opdName: 'Dinas Kesehatan', password: 'pw123' }), 'Token keamanan tidak valid');

// Jalur update: user lama di-bind ulang ke OPD (persis setelah normalisasi)
DB.users.u_baru = { id: 'u_baru', username: '198805052010011002', namaLengkap: 'User Lama', role: 'operator', unitKerjaId: '', isActive: false };
reg = sandbox.autoRegisterOperator_({ token: a7token, nip: '198805052010011002', nama: 'User Lama', opdName: 'Sekretariat', password: 'pw123' });
check('A7 user lama: status updated + diikat u_sek (persis setelah normalisasi)',
  reg.status === 'updated' && userPatches.length === 1 && userPatches[0].path === 'users/u_baru' &&
  userPatches[0].payload.unitKerjaId === 'u_sek', { reg, p: userPatches[0] });

sandbox.fbPatch_ = origFbPatch7;
sandbox.fbPost_ = origFbPost7;

// ------------------------------------------------------------
// 5f. A8: token nonce + pencabutan saat logout (audit 2026-10-07)
// ------------------------------------------------------------
console.log('\n== A8: token auth (nonce, revocation) ==');

DB.users.budi8 = { id: 'budi8', username: 'budi', namaLengkap: 'Budi', role: 'operator', unitKerjaId: 'u_opd', isActive: true };

const decodeTokenParts = (t) => Buffer.from(String(t), 'base64').toString('utf8').split(':');

const tok = sandbox.generateAuthToken_('budi');
const tok2 = sandbox.generateAuthToken_('budi');
check('A8 token format baru valid', sandbox.validateToken_(tok) === true);
check('A8 token berisi 4 bagian (username:timestamp:nonce:hmac)', decodeTokenParts(tok).length === 4);
check('A8 dua token user sama berbeda (nonce unik)', tok !== tok2 && decodeTokenParts(tok)[2] !== decodeTokenParts(tok2)[2]);

// Tampering nonce tanpa re-sign -> ditolak (nonce ikut di-HMAC)
const p1 = decodeTokenParts(tok);
const tampered = Buffer.from([p1[0], p1[1], 'x-nonce', p1[3]].join(':')).toString('base64');
check('A8 nonce dimanipulasi tanpa re-sign -> ditolak', sandbox.validateToken_(tampered) === false);

// Format lama (3 bagian) -> ditolak; kedaluwarsa -> ditolak
const oldFmt = Buffer.from(['budi', String(Date.now()), 'deadbeef'].join(':')).toString('base64');
check('A8 token format lama (3 bagian) -> ditolak', sandbox.validateToken_(oldFmt) === false);
const expTok = Buffer.from(['budi', String(Date.now() - 25 * 3600 * 1000), 'n-1', 'sig'].join(':')).toString('base64');
check('A8 token >24 jam -> ditolak', sandbox.validateToken_(expTok) === false);

// Logout: token dicabut di server via daftar pencabutan
const origFbPatch8 = sandbox.fbPatch_;
sandbox.fbPatch_ = (path, payload) => {
  if (!(path in DB)) throw new Error('fbPatch_ stub: path dasar tidak ada: ' + path);
  const node = DB[path];
  Object.keys(payload).forEach((k) => {
    if (payload[k] === null) delete node[k];
    else node[k] = JSON.parse(JSON.stringify(payload[k]));
  });
  return { patched: true };
};

const resLogout = sandbox.logoutUser_(tok);
check('A8 logout sukses', resLogout.success === true);
check('A8 nonce masuk daftar pencabutan + expiresAt tercatat',
  !!DB.revokedTokens[p1[2]] && !!DB.revokedTokens[p1[2]].expiresAt, Object.keys(DB.revokedTokens));
check('A8 token yang dicabut ditolak validateToken_', sandbox.validateToken_(tok) === false);
check('A8 token lain (belum di-logout) masih valid', sandbox.validateToken_(tok2) === true);

// Logout token sampah -> idempotent sukses, tanpa menulis
const nKeys = Object.keys(DB.revokedTokens).length;
const resBad = sandbox.logoutUser_('bukan-base64');
check('A8 logout token sampah tetap sukses (idempotent, tanpa write)',
  resBad.success === true && Object.keys(DB.revokedTokens).length === nKeys);

// User dinonaktifkan -> token ditolak (perilaku lama tetap)
DB.users.budi8.isActive = false;
check('A8 user nonaktif -> token ditolak', sandbox.validateToken_(tok2) === false);
DB.users.budi8.isActive = true;

// Prune entri pencabutan kedaluwarsa
DB.revokedTokens.old1 = { username: 'lama', revokedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-02T00:00:00.000Z' };
DB.revokedTokens[p1[2]].expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
sandbox.pruneExpiredRevocations_();
check('A8 prune: entri kedaluwarsa dihapus, yang aktif tetap',
  !('old1' in DB.revokedTokens) && p1[2] in DB.revokedTokens, Object.keys(DB.revokedTokens));

// Fail-closed: daftar pencabutan gagal dibaca -> token dianggap dicabut
const realConsoleError = console.error;
console.error = () => {};
const origFbGet8 = sandbox.fbGet_;
sandbox.fbGet_ = () => { throw new Error('db down'); };
const failClosed = sandbox.isTokenRevoked_('n-xyz');
sandbox.fbGet_ = origFbGet8;
console.error = realConsoleError;
check('A8 fbGet_ gagal -> dianggap dicabut (fail-closed)', failClosed === true);

sandbox.fbPatch_ = origFbPatch8;

// ------------------------------------------------------------
// 5g. A9: checkSptOpd_ fail-closed, tanpa fallback hardcoded
// ------------------------------------------------------------
console.log('\n== A9: checkSptOpd_ (fail-closed tanpa URL/token hardcoded) ==');

expectThrow('A9 tanpa SPT_DIGITAL_URL/TOKEN -> gagal keras',
  () => sandbox.checkSptOpd_('u_opd'), 'belum dikonfigurasi');

scriptProps.set('SPT_DIGITAL_URL', 'https://spt.example/exec');
scriptProps.set('SPT_DIGITAL_TOKEN', 'DINKES-TEST');
let captured = null;
const origUrlFetch = sandbox.UrlFetchApp;
sandbox.UrlFetchApp = {
  fetch: (url) => {
    captured = url;
    return { getContentText: () => JSON.stringify({ status: 'success', hasSubmitted: true, namaAdmin: 'Admin A', nipAdmin: '198701012010011001' }) };
  },
  fetchAll: origUrlFetch.fetchAll,
};
const rSpt = sandbox.checkSptOpd_('u_opd');
sandbox.UrlFetchApp = origUrlFetch;
check('A9 URL & token diambil dari Script Properties (bukan hardcoded)',
  rSpt.hasSubmitted === true && captured !== null &&
  captured.indexOf('https://spt.example/exec?action=checkSpt') === 0 &&
  captured.indexOf('opd=' + encodeURIComponent('Dinas Kesehatan')) !== -1 &&
  captured.indexOf('token=' + encodeURIComponent('DINKES-TEST')) !== -1, { rSpt, captured });
check('A9 token hardcoded lama tidak dipakai', captured.indexOf('sianjab_secure_token_abc123') === -1);

// ------------------------------------------------------------
// 5h. B1-B3: konsolidasi WKE (75000) & formasi server-side final di saveABK_
// ------------------------------------------------------------
console.log('\n== B3: saveABK_ server-side final (formasi & kebutuhan dihitung ulang) ==');

const origFbPut = sandbox.fbPut_;
sandbox.fbPut_ = (path, data) => { DB[path] = JSON.parse(JSON.stringify(data)); return { saved: true }; };

// Struktural (j_target) + angka kirim-an klien yang berbohong -> server yang menang
// Konsep tunggal: satuan legacy 'menit' dinormalisasi server ke jam (480 menit = 8 jam)
sandbox.saveABK_('j_target', {
  rows: [{ waktu: 480, volume: 200 }],
  wke: 75000, waktuSatuan: 'menit',
  totalWaktuEfektif: 1, totalKebutuhan: 99, formasiPembulatan: 99,
});
let savedAbk = DB['2026/abk/j_target'];
check('B3 struktural: legacy menit dinormalisasi (1600 jam, 1.28) & satuan tunggal jam',
  savedAbk.totalWaktuEfektif === 1600 && near(savedAbk.totalKebutuhan, 1.28) && savedAbk.waktuSatuan === 'jam', savedAbk);
check('B3 struktural: formasiPembulatan klien (99) ditimpa server = 1',
  savedAbk.formasiPembulatan === 1, savedAbk);

// Fungsional kecil -> batas minimal 2 (server), bukan 1
sandbox.saveABK_('j_c', { rows: [{ waktu: 480, volume: 50 }], wke: 75000, waktuSatuan: 'menit', formasiPembulatan: 1 });
savedAbk = DB['2026/abk/j_c'];
check('B3 fungsional kecil: server menerapkan batas minimal 2',
  savedAbk.formasiPembulatan === 2, savedAbk);

// Tanpa jenisJabatan -> kategori 'lainnya': mengikuti hitung, tanpa paksaan batas
DB['2026/jabatan'].j_plain = { id: 'j_plain', unitKerjaId: 'u_buk', namaJabatan: 'Staf Umum' };
sandbox.saveABK_('j_plain', { rows: [{ waktu: 480, volume: 188 }], wke: 75000, waktuSatuan: 'menit', formasiPembulatan: 42 });
savedAbk = DB['2026/abk/j_plain'];
check('B3 jabatan tanpa jenis: legacy menit -> 1504 jam, 1.2032 -> pembulatan 1 (tanpa batas)',
  savedAbk.totalWaktuEfektif === 1504 && near(savedAbk.totalKebutuhan, 1.2032) && savedAbk.formasiPembulatan === 1, savedAbk);
delete DB['2026/jabatan'].j_plain;

// Satuan jam + WKE fix 1250: rasio tetap benar (waktu & wke sama-sama dalam jam)
sandbox.saveABK_('j_c', { rows: [{ waktu: 8, volume: 100 }], wke: 1250, waktuSatuan: 'jam', formasiPembulatan: 0 });
savedAbk = DB['2026/abk/j_c'];
check('B3 satuan jam: kebutuhan 800/1250=0.64 -> raw 1 -> batas fungsional 2',
  savedAbk.totalWaktuEfektif === 800 && near(savedAbk.totalKebutuhan, 0.64) && savedAbk.formasiPembulatan === 2, savedAbk);

sandbox.fbPut_ = origFbPut;

// ------------------------------------------------------------
// 5i. C1 & C2: guard self-delete + tolak aju berdasarkan status basi
// ------------------------------------------------------------
console.log('\n== C1/C2: self-delete guard & status basi ==');

// C1 (server): admin tidak dapat menghapus akunnya sendiri
expectThrow('C1 admin menghapus akun sendiri -> ditolak server',
  () => sandbox.assertNotSelfDelete_({ id: 'admin8', role: 'admin' }, 'users', 'admin8'), 'sendiri');
let c1ok = true;
try { sandbox.assertNotSelfDelete_({ id: 'admin8', role: 'admin' }, 'users', 'user_lain'); } catch (e) { c1ok = false; }
try { sandbox.assertNotSelfDelete_({ id: 'admin8', role: 'admin' }, 'jabatan', 'admin8'); } catch (e) { c1ok = false; }
check('C1 hapus user lain / entitas non-users tetap diizinkan', c1ok === true);

// C2: status basi 'Disetujui' tidak boleh ditimpa 'Diajukan'
const origFbPatch10 = sandbox.fbPatch_;
sandbox.fbPatch_ = (path, payload) => {
  const seg = String(path).split('/');
  let base = null, idx = 0;
  for (let n = seg.length; n >= 1; n--) {
    const cand = seg.slice(0, n).join('/');
    if (cand in DB) { base = DB[cand]; idx = n; break; }
  }
  if (!base) throw new Error('fbPatch_ stub: path tidak ada: ' + path);
  let node = base;
  for (let i = idx; i < seg.length; i++) {
    if (node[seg[i]] == null || typeof node[seg[i]] !== 'object') node[seg[i]] = {};
    node = node[seg[i]];
  }
  Object.keys(payload).forEach((k) => {
    if (payload[k] === null) delete node[k];
    else node[k] = JSON.parse(JSON.stringify(payload[k]));
  });
  return { patched: true };
};

DB['2026/unitKerja'].u_app = { id: 'u_app', nama: 'OPD Sudah Disetujui', statusValidasi: 'Disetujui', parentId: '' };
expectThrow('C2 aju "Diajukan" saat status "Disetujui" -> ditolak server',
  () => sandbox.updateRecord_('unitKerja', 'u_app', { statusValidasi: 'Diajukan' }), 'DISSETUJUI');

DB['2026/unitKerja'].u_rev = { id: 'u_rev', nama: 'OPD Revisi', statusValidasi: 'Revisi', parentId: '' };
const rC2 = sandbox.updateRecord_('unitKerja', 'u_rev', { statusValidasi: 'Diajukan' });
check('C2 aju "Diajukan" dari "Revisi" -> diizinkan', rC2.statusValidasi === 'Diajukan');
const rC2b = sandbox.updateRecord_('unitKerja', 'u_rev', { statusValidasi: 'Disetujui' });
check('C2 admin menyetujui ("Disetujui") -> diizinkan', rC2b.statusValidasi === 'Disetujui');

delete DB['2026/unitKerja'].u_app;
delete DB['2026/unitKerja'].u_rev;
sandbox.fbPatch_ = origFbPatch10;

// ------------------------------------------------------------
// 5j. A10: rotasi security_logs & lock kloning/duplikasi
// ------------------------------------------------------------
console.log('\n== A10: rotasi security_logs & lock kloning/duplikasi ==');

// Stub fbPost_/fbPatch_ (menulis/menghapus di DB dummy) dipasang di awal
// karena rotateSecurityLogs_ butuh fbPatch_ nyata-simulasi untuk memangkas.
const origFbPost10 = sandbox.fbPost_;
const origFbPatch10b = sandbox.fbPatch_;
sandbox.fbPost_ = (path, data) => {
  const k = 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  DB[path][k] = JSON.parse(JSON.stringify(data));
  return { name: k };
};
sandbox.fbPatch_ = (path, payload) => {
  const seg = String(path).split('/');
  let base = null, idx = 0;
  for (let n = seg.length; n >= 1; n--) {
    const cand = seg.slice(0, n).join('/');
    if (cand in DB) { base = DB[cand]; idx = n; break; }
  }
  if (!base) throw new Error('fbPatch_ stub: path tidak ada: ' + path);
  let node = base;
  for (let i = idx; i < seg.length; i++) {
    if (node[seg[i]] == null || typeof node[seg[i]] !== 'object') node[seg[i]] = {};
    node = node[seg[i]];
  }
  Object.keys(payload).forEach((k) => {
    if (payload[k] === null) delete node[k];
    else node[k] = JSON.parse(JSON.stringify(payload[k]));
  });
  return { patched: true };
};

// Rotasi: node 520 entri -> dipangkas ke 400 terbaru
DB['security_logs'] = {};
for (let i = 0; i < 520; i++) {
  DB['security_logs']['log_' + String(i).padStart(4, '0')] = {
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    username: 'u' + i, status: 'SUCCESS'
  };
}
sandbox.rotateSecurityLogs_();
check('A10 rotasi: 520 entri -> 400 terbaru yang tersisa',
  Object.keys(DB['security_logs']).length === 400, Object.keys(DB['security_logs']).length);
check('A10 rotasi: entri tertua (log_0000) terhapus, terbaru (log_0519) tersisa',
  !('log_0000' in DB['security_logs']) && 'log_0519' in DB['security_logs']);

// Node kecil -> tidak disentuh
sandbox.rotateSecurityLogs_();
check('A10 rotasi: node <= MAX_KEEP tidak diubah', Object.keys(DB['security_logs']).length === 400);

// writeSecurityLog_ ikut merotasi setelah menulis
for (let i = 0; i < 105; i++) sandbox.writeSecurityLog_('op' + i, 'SUCCESS', '', '1.2.3.4', 'UA');
const nLogs = Object.keys(DB['security_logs']).length;
check('A10 writeSecurityLog_ menjaga node kecil (400-405; tanpa rotasi akan 505)',
  nLogs >= 400 && nLogs <= 405, nLogs);
sandbox.fbPost_ = origFbPost10;
sandbox.fbPatch_ = origFbPatch10b;

// Lock: cloneYearData_ & duplicateUnitKerja_ mengunci (wait+release berpasangan walau error)
lockLog.length = 0;
expectThrow('A10 cloneYearData_ tanpa argumen -> error (setelah lock)',
  () => sandbox.cloneYearData_('', ''), 'wajib diisi');
check('A10 cloneYearData_: waitLock+releaseLock berpasangan',
  lockLog.join(',') === 'wait,release', lockLog);

lockLog.length = 0;
expectThrow('A10 duplicateUnitKerja_ tanpa params -> error (setelah lock)',
  () => sandbox.duplicateUnitKerja_(null), 'Parameter duplikasi');
check('A10 duplicateUnitKerja_: waitLock+releaseLock berpasangan',
  lockLog.join(',') === 'wait,release', lockLog);

// ------------------------------------------------------------
// 5k. Reset isian & statistik Anjab (laporan 2026-10-07)
// ------------------------------------------------------------
console.log('\n== Reset isian: record kosong tidak dihitung terisi & dihapus server ==');

// Record KOSONG milik j_c — persis seperti jejak reset lama
DB['2026/kualifikasi'] = { q_empty: { jabatanId: 'j_c', pendidikanFormal: [], pendidikanPelatihan: [], pengalamanKerja: [] } };
DB['2026/syaratJabatan'] = { s_empty: { jabatanId: 'j_c', kondisiFisik: { jenisKelamin: '-', umur: '-', tinggiBadan: '-' } } };
DB['2026/bahanKerja'] = {};
DB['2026/hasilKerja'] = {};
DB['2026/prestasiKerja'] = {};

const origUrlFetch11 = sandbox.UrlFetchApp;
const resolveBase = (urlPath, createMissing) => {
  const clean = urlPath.split('?')[0].replace(/\.json$/, '');
  const cands = Object.keys(DB)
    .filter((k) => clean === k || clean.endsWith('/' + k) || clean.indexOf('/' + k + '/') !== -1)
    .sort((a, b) => b.length - a.length);
  let base = cands[0] || null;
  if (!base && createMissing) {
    // Firebase: PATCH/POST ke path baru cukup membuatnya
    const segs = clean.split('/');
    base = /^20\d\d$/.test(segs[segs.length - 2]) ? segs.slice(-2).join('/') : segs[segs.length - 1];
    if (!(base in DB)) DB[base] = {};
  }
  if (!base) return { base: null, rest: [] };
  const pos = clean.indexOf('/' + base + '/');
  let restStr = '';
  if (pos !== -1) restStr = clean.slice(pos + base.length + 2);
  return { base, rest: restStr.split('/').filter(Boolean) };
};
sandbox.UrlFetchApp = {
  fetch: origUrlFetch11.fetch,
  fetchAll: (reqs) => reqs.map((r) => {
    const method = r.method || 'get';
    let { base, rest } = resolveBase(r.url);
    if (method === 'get') {
      let node = base ? DB[base] : null;
      for (const s of rest) {
        if (node == null || typeof node !== 'object') { node = null; break; }
        node = node[s];
      }
      return { getResponseCode: () => 200, getContentText: () => (node == null ? 'null' : JSON.stringify(node)) };
    }
    if (method === 'patch') {
      ({ base, rest } = resolveBase(r.url, true));
      if (!base) throw new Error('stub patch: path tidak dikenal: ' + r.url);
      const payload = JSON.parse(r.payload);
      let node = DB[base];
      for (let i = 0; i < rest.length; i++) {
        const s = rest[i];
        if (i === rest.length - 1) {
          if (node[s] == null || typeof node[s] !== 'object') node[s] = {};
          node = node[s];
        } else {
          node = node[s];
        }
      }
      Object.keys(payload).forEach((k) => {
        if (payload[k] === null) delete node[k];
        else node[k] = JSON.parse(JSON.stringify(payload[k]));
      });
      return { getResponseCode: () => 200, getContentText: () => 'null' };
    }
    // post
    ({ base, rest } = resolveBase(r.url, true));
    if (!base) throw new Error('stub post: path tidak dikenal: ' + r.url);
    if (rest.length > 0) throw new Error('stub post: POST ke sub-path tidak didukung: ' + r.url);
    const nk = 'stub_' + Math.random().toString(36).slice(2);
    DB[base][nk] = JSON.parse(r.payload);
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ name: nk }) };
  }),
};

// Statistik: record kosong j_c TIDAK dihitung; yang punya tugas riil tetap dihitung
const sumBefore = sandbox.getAnjabStatusSummary_();
check('Reset/statistik: record kualifikasi+syarat KOSONG tidak dihitung terisi (j_c)',
  !sumBefore.anjabFilled.includes('j_c'), sumBefore.anjabFilled);
check('Reset/statistik: jabatan dengan tugas riil tetap dihitung (j_target, j_x)',
  sumBefore.anjabFilled.includes('j_target') && sumBefore.anjabFilled.includes('j_x'), sumBefore.anjabFilled);

// Reset via saveBulkAnjabData_: payload kosong -> record lama DIHAPUS server
sandbox.saveBulkAnjabData_('j_c', {
  kualifikasi: { pendidikanFormal: [], pendidikanPelatihan: [], pengalamanKerja: [] },
  syaratJabatan: { keterampilanKerja: [], kondisiFisik: { umur: '-' } },
  tugasPokok: [], bahanKerja: [], perangkatKerja: [], tanggungJawab: [],
  wewenang: [], korelasiJabatan: [], kondisiLingkungan: [], risikoBahaya: [],
  hasilKerja: { uraian: '' }, prestasiKerja: { uraian: '' },
});
check('Reset: record kualifikasi kosong j_c DIHAPUS server',
  !Object.keys(DB['2026/kualifikasi']).some((k) => (DB['2026/kualifikasi'][k] || {}).jabatanId === 'j_c'), DB['2026/kualifikasi']);
check('Reset: record syaratJabatan kosong j_c DIHAPUS server',
  !Object.keys(DB['2026/syaratJabatan']).some((k) => (DB['2026/syaratJabatan'][k] || {}).jabatanId === 'j_c'), DB['2026/syaratJabatan']);

// Isi ulang non-kosong -> record tersimpan & statistik menghitung lagi
sandbox.saveBulkAnjabData_('j_c', { kualifikasi: { pendidikanFormal: [{ jenjang: 'S-1' }] } });
const hasKual = Object.keys(DB['2026/kualifikasi']).some((k) => (DB['2026/kualifikasi'][k] || {}).jabatanId === 'j_c');
check('Reset->isi ulang: kualifikasi non-kosong tersimpan kembali', hasKual === true);
const sumAfter = sandbox.getAnjabStatusSummary_();
check('Reset->isi ulang: j_c kembali dihitung terisi', sumAfter.anjabFilled.includes('j_c'), sumAfter.anjabFilled);

sandbox.UrlFetchApp = origUrlFetch11;
delete DB['2026/kualifikasi'];
delete DB['2026/syaratJabatan'];
delete DB['2026/bahanKerja'];
delete DB['2026/hasilKerja'];
delete DB['2026/prestasiKerja'];

// ------------------------------------------------------------
// 6. Ringkasan
// ------------------------------------------------------------
console.log('\n================ RINGKASAN ================');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) process.exit(1);
console.log('Semua simulasi lulus. (TC8 = heuristik jam kecil ambigu; penyeimbang TPP menyetel volume, bukan waktu)');
