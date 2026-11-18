/**
 * =============================================================
 * PARITY TEST: LOGIKA BISNIS GAS ↔ HOMESERVER ↔ KLIEN (ARC-F2)
 * =============================================================
 * Logika formasi ABK terduplikasi di tiga tempat:
 *   - gas/Code.gs            : calculateFormasiPembulatanServer_ / applyFormasiBatasServer_ / saveABK_
 *   - sianjab-db-server      : calculateFormasiPembulatanServer / applyFormasiBatasServer / saveABK
 *   - src/lib/utils.ts       : calculateFormasiPembulatan / applyFormasiBatas / hitungKebutuhanPegawai
 * Test ini memastikan ketiganya menghasilkan angka identik untuk input yang sama,
 * sehingga perubahan di satu sisi tidak diam-diam menyimpang dari sisi lain.
 *
 * Jalankan: node gas/tests/parity-gas-homeserver.js
 * Exit code 0 = semua lulus; 1 = ada kegagalan.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.error('FAIL: ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

// ------------------------------------------------------------
// 1. Sandbox GAS (stub layanan Apps Script)
// ------------------------------------------------------------
const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const scriptProps = new Map();
const sandbox = {
  console: { log: () => {}, error: () => {}, warn: () => {} },
  Logger: { log: () => {} },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (scriptProps.has(k) ? scriptProps.get(k) : null),
      setProperty: (k, v) => { scriptProps.set(k, v); },
    }),
  },
  CacheService: {
    getScriptCache: () => ({ get: () => null, put: () => {}, putAll: () => {}, getAll: () => ({}), remove: () => {}, removeAll: () => {} }),
  },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
  Utilities: {
    getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
    MacAlgorithm: { HMAC_SHA_256: 'HMAC_SHA_256' },
    computeHmacSignature: (_a, data, _k) => Buffer.from(String(data), 'utf8').toString('hex'),
    base64Encode: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    base64Decode: (s) => Buffer.from(String(s), 'base64'),
    newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    sleep: () => {},
  },
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  UrlFetchApp: {
    fetch: () => { throw new Error('UrlFetchApp tidak boleh dipanggil dalam parity test'); },
    fetchAll: () => { throw new Error('UrlFetchApp tidak boleh dipanggil dalam parity test'); },
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: () => ({ setMimeType: () => ({}) }),
  },
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'Code.gs' });

// ------------------------------------------------------------
// 2. Homeserver (require server.js dengan env test)
// ------------------------------------------------------------
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sianjab-parity-'));
process.env.DATA_DIR = tmpDataDir;
process.env.WRITE_BEHIND_INTERVAL_MS = '0';
process.env.BACKUP_INTERVAL_MS = '0';
process.env.HOMESERVER_SECRET = 'parity-hs-secret';
process.env.API_SECRET = 'parity-api-secret';
process.env.FIREBASE_SECRET = 'parity-fb-secret';
process.env.SITPP_SECRET = 'parity-sitpp-secret';
process.env.PASSWORD_PEPPER = 'parity-password-pepper';

const server = require('../../sianjab-db-server/server.js');

async function main() {
  // ----------------------------------------------------------
  // 3. Klien (src/lib/utils.ts) — Node 26 strip types otomatis
  // ----------------------------------------------------------
  const utils = await import('../../src/lib/utils.ts');

  // ----------------------------------------------------------
  // 4. Paritas konstanta WKE
  // ----------------------------------------------------------
  check('ARC-F2: WKE server = 1250', server.WKE_FIX_JAM === 1250, server.WKE_FIX_JAM);
  check('ARC-F2: WKE klien = 1250', utils.WKE_DEFAULT_JAM === 1250, utils.WKE_DEFAULT_JAM);
  check('ARC-F2: WKE server = WKE klien', server.WKE_FIX_JAM === utils.WKE_DEFAULT_JAM);

  // ----------------------------------------------------------
  // 5. Paritas calculateFormasiPembulatan
  // ----------------------------------------------------------
  const pembulatanInputs = [-5, 0, 0.1, 0.49, 0.5, 1, 1.49, 1.5, 1.51, 2, 2.4, 2.5, 3.5, 4.2, 12, 100.5, NaN, null, undefined, '3.7'];
  for (const input of pembulatanInputs) {
    const gas = sandbox.calculateFormasiPembulatanServer_(input);
    const hs = server.calculateFormasiPembulatanServer(input);
    const klien = utils.calculateFormasiPembulatan(input);
    check(
      `ARC-F2: pembulatan(${String(input)}) GAS=${gas} HS=${hs} klien=${klien}`,
      gas === hs && hs === klien,
      { gas, hs, klien }
    );
  }

  // ----------------------------------------------------------
  // 6. Paritas applyFormasiBatas
  // ----------------------------------------------------------
  const jenisList = [
    'Jabatan Pimpinan Tinggi Pratama',
    'Jabatan Administrator',
    'Jabatan Pengawas',
    'Jabatan Struktural',
    'Jabatan Fungsional',
    'Jabatan Pelaksana',
    'Jabatan Fungsional Umum',
    'Jabatan Pelaksana Teknis',
    '',
    null,
    undefined,
  ];
  const nilaiList = [0, 0.4, 1, 1.5, 2, 3.7, 12];
  for (const jenis of jenisList) {
    for (const nilai of nilaiList) {
      const gas = sandbox.applyFormasiBatasServer_(nilai, jenis);
      const hs = server.applyFormasiBatasServer(nilai, jenis);
      const klien = utils.applyFormasiBatas(nilai, jenis);
      check(
        `ARC-F2: batas(${nilai}, ${JSON.stringify(jenis)}) GAS=${gas} HS=${hs} klien=${klien}`,
        gas === hs && hs === klien,
        { gas, hs, klien }
      );
    }
  }

  // ----------------------------------------------------------
  // 7. Paritas pipeline saveABK (rumus WKE + pembulatan + batas)
  // ----------------------------------------------------------
  const rows = [
    { waktu: 4, volume: 150 },   // 600 jam
    { waktu: 2.5, volume: 40 },  // 100 jam
    { waktu: 8, volume: 10 },    // 80 jam
  ];
  const totalWaktu = rows.reduce((s, r) => s + r.waktu * r.volume, 0); // 780
  const kebutuhan = totalWaktu / 1250; // 0.624

  // GAS: saveABK_ dengan stub Firebase
  let gasSaved = null;
  sandbox.fbGet_ = (p) => {
    if (p === '2026/jabatan/j_parity') return { id: 'j_parity', jenisJabatan: 'Jabatan Fungsional' };
    return null;
  };
  sandbox.fbPut_ = (p, data) => { gasSaved = { path: p, data }; };
  sandbox.saveABK_('j_parity', { rows: rows.map((r) => ({ ...r })) });

  // Homeserver: handleSianjabAction('saveABK') dengan admin
  server.setDbNode('users', { u_admin: { id: 'u_admin', username: 'admin', role: 'admin', isActive: true } });
  server.setDbNode('2026/jabatan/j_parity', { id: 'j_parity', jenisJabatan: 'Jabatan Fungsional' });
  const token = server.generateAuthToken('admin');
  await server.handleSianjabAction(
    'saveABK',
    { tahun: '2026', parentId: 'j_parity' },
    { token, data: { rows: rows.map((r) => ({ ...r })) } },
    '127.0.0.1'
  );
  const hsSaved = server.getDbNode('2026/abk/j_parity');

  // Klien: pipeline util
  const klienKebutuhan = rows.reduce((s, r) => s + utils.hitungKebutuhanPegawai(r.waktu, r.volume, utils.WKE_DEFAULT_JAM), 0);
  const klienFormasi = utils.applyFormasiBatas(utils.calculateFormasiPembulatan(klienKebutuhan), 'Jabatan Fungsional');

  check('ARC-F2: saveABK totalWaktuEfektif GAS = HS', gasSaved.data.totalWaktuEfektif === hsSaved.totalWaktuEfektif, { gas: gasSaved.data.totalWaktuEfektif, hs: hsSaved.totalWaktuEfektif });
  check('ARC-F2: saveABK totalWaktuEfektif = 780', hsSaved.totalWaktuEfektif === totalWaktu, hsSaved.totalWaktuEfektif);
  check('ARC-F2: saveABK totalKebutuhan GAS = HS', gasSaved.data.totalKebutuhan === hsSaved.totalKebutuhan, { gas: gasSaved.data.totalKebutuhan, hs: hsSaved.totalKebutuhan });
  check('ARC-F2: saveABK totalKebutuhan = klien', Math.abs(hsSaved.totalKebutuhan - klienKebutuhan) < 1e-12, { hs: hsSaved.totalKebutuhan, klien: klienKebutuhan });
  check('ARC-F2: saveABK totalKebutuhan = 0.624', Math.abs(hsSaved.totalKebutuhan - kebutuhan) < 1e-12, hsSaved.totalKebutuhan);
  check('ARC-F2: saveABK formasiPembulatan GAS = HS', gasSaved.data.formasiPembulatan === hsSaved.formasiPembulatan, { gas: gasSaved.data.formasiPembulatan, hs: hsSaved.formasiPembulatan });
  check('ARC-F2: saveABK formasiPembulatan = klien', hsSaved.formasiPembulatan === klienFormasi, { hs: hsSaved.formasiPembulatan, klien: klienFormasi });
  check('ARC-F2: saveABK formasiPembulatan = 2 (fungsional min 2)', hsSaved.formasiPembulatan === 2, hsSaved.formasiPembulatan);
  check('ARC-F2: saveABK waktuSatuan = jam (GAS & HS)', gasSaved.data.waktuSatuan === 'jam' && hsSaved.waktuSatuan === 'jam', { gas: gasSaved.data.waktuSatuan, hs: hsSaved.waktuSatuan });

  // ----------------------------------------------------------
  // 8. Paritas penolakan waktu > 8 jam (BE-T1)
  // ----------------------------------------------------------
  let gasThrew = false;
  try {
    sandbox.saveABK_('j_parity', { rows: [{ waktu: 9, volume: 1 }] });
  } catch (e) {
    gasThrew = /maksimal 8 jam/.test(String(e && e.message));
  }
  let hsThrew = false;
  try {
    await server.handleSianjabAction(
      'saveABK',
      { tahun: '2026', parentId: 'j_parity' },
      { token, data: { rows: [{ waktu: 9, volume: 1 }] } },
      '127.0.0.1'
    );
  } catch (e) {
    hsThrew = /maksimal 8 jam/.test(String(e && e.message));
  }
  const klienValid = utils.validasiWaktuJam(9);
  check('ARC-F2: tolak waktu 9 jam — GAS', gasThrew);
  check('ARC-F2: tolak waktu 9 jam — Homeserver', hsThrew);
  check('ARC-F2: tolak waktu 9 jam — klien', klienValid.valid === false, klienValid);

  // ----------------------------------------------------------
  // 9. Paritas ambang TPP (konstanta GAS = 1350 jam/tahun)
  // ----------------------------------------------------------
  check('ARC-F2: AMBANG_TPP_JAM_TAHUN GAS = 1350', sandbox.AMBANG_TPP_JAM_TAHUN === 1350, sandbox.AMBANG_TPP_JAM_TAHUN);
  check('ARC-F2: AMBANG_TPP_MENIT_TAHUN = 81000', sandbox.AMBANG_TPP_MENIT_TAHUN === 81000, sandbox.AMBANG_TPP_MENIT_TAHUN);

  // ----------------------------------------------------------
  // Ringkasan
  // ----------------------------------------------------------
  console.log(`\nPASS: ${pass}  FAIL: ${fail}`);
  fs.rmSync(tmpDataDir, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err && err.stack ? err.stack : err);
  process.exit(1);
});
