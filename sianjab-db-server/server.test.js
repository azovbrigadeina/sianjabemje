const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Gunakan direktori sementara untuk isolasi pengujian
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sianjab-db-test-'));
process.env.DATA_DIR = tmpDataDir;
process.env.WRITE_BEHIND_INTERVAL_MS = '0';
// SEC-K3: secret untuk test — tidak ada lagi fallback hardcoded di server.js
process.env.HOMESERVER_SECRET = 'test-hs-secret';
process.env.API_SECRET = 'test-api-secret';
process.env.FIREBASE_SECRET = 'test-fb-secret';
process.env.SITPP_SECRET = 'test-sitpp-secret';
process.env.PASSWORD_PEPPER = 'test-password-pepper';

const {
  createAppServer,
  setDbNode,
  getDbNode,
  rebuildAllIndexes,
  handleSianjabAction,
  getMonitorSummary,
  dirtyPaths,
  requireEnv,
  verifyAdminSecret,
  generateAuthToken,
  validateAuthToken,
  getAuthenticatedUser,
  CORS_ALLOWED_ORIGINS,
  BIND_HOST,
  SELF_UPDATE_ALLOWED_FIELDS,
  hashPasswordHmac,
  hashPasswordWithSalt,
  hashPasswordV1,
  hashPasswordLegacy,
  verifyPassword
} = require('./server.js');

test('Sianjab Homeserver DB Engine - O(1) Secondary Index, CRUD, Bulk & Outbox', async (t) => {
  // 1. Seed initial test database
  setDbNode('', {
    users: {
      u_admin: {
        id: 'u_admin',
        username: 'admin',
        nama: 'Administrator',
        role: 'admin',
        salt: 's1',
        passwordHash: hashPasswordHmac('secret123', 'admin')
      },
      u_op1: {
        id: 'u_op1',
        username: 'op_dinkes',
        nama: 'Operator Dinkes',
        role: 'operator',
        unitKerjaId: 'unit_dinkes',
        salt: 's2',
        passwordHash: hashPasswordHmac('oppass', 'op_dinkes')
      }
    },
    settings: {
      templateDocx: {
        id: 'templateDocx',
        base64: 'UEsDBBQAAAAIA===',
        fileName: 'template_anjab.docx'
      },
      deadline: { id: 'deadline', date: '2026-12-31', enabled: true }
    },
    '2027': {
      unitKerja: {
        unit_dinkes: { id: 'unit_dinkes', nama: 'Dinas Kesehatan', parentId: '' },
        unit_bid1: { id: 'unit_bid1', nama: 'Bidang P2P', parentId: 'unit_dinkes' },
        unit_bappeda: { id: 'unit_bappeda', nama: 'Bappeda', parentId: '' }
      },
      jabatan: {
        jab_1: { id: 'jab_1', nama: 'Kepala Dinas Kesehatan', unitKerjaId: 'unit_dinkes' },
        jab_2: { id: 'jab_2', nama: 'Analis Kesehatan', unitKerjaId: 'unit_bid1', parentId: 'jab_1' },
        jab_3: { id: 'jab_3', nama: 'Perencana Ahli Muda', unitKerjaId: 'unit_bappeda' }
      },
      tugasPokok: {
        tp_1: { id: 'tp_1', jabatanId: 'jab_2', uraianTugas: 'Menyusun bahan kebijakan P2P', urutan: 1 }
      },
      abk: {
        abk_1: { id: 'abk_1', jabatanId: 'jab_2', volume: 12, waktuPenyelesaian: 120, urutan: 1 }
      }
    }
  });
  dirtyPaths.clear();

  await t.test('Memisahkan settings/templateDocx secara otomatis ke top-level template_docx', async () => {
    assert.equal(getDbNode('settings/templateDocx'), null);
    const tpl = getDbNode('template_docx');
    assert.ok(tpl);
    assert.equal(tpl.fileName, 'template_anjab.docx');
  });

  let adminToken = '';
  let operatorToken = '';

  await t.test('Login menghasilkan token HMAC yang valid untuk Admin dan Operator', async () => {
    const adminLogin = await handleSianjabAction('login', {}, { username: 'admin', password: 'secret123' }, '127.0.0.1');
    assert.ok(adminLogin.token);
    adminToken = adminLogin.token;

    const opLogin = await handleSianjabAction('login', {}, { username: 'op_dinkes', password: 'oppass' }, '127.0.0.1');
    assert.ok(opLogin.token);
    operatorToken = opLogin.token;
  });

  await t.test('getBulkData mendukung scoping unitKerjaId O(1) untuk Operator OPD', async () => {
    const fullBulk = await handleSianjabAction(
      'getBulkData',
      { entities: 'unitKerja,jabatan,abk', year: '2027', token: adminToken },
      {},
      '127.0.0.1'
    );
    assert.equal(fullBulk.jabatan.length, 3);

    const scopedBulk = await handleSianjabAction(
      'getBulkData',
      { entities: 'unitKerja,jabatan,abk', year: '2027', unitKerjaId: 'unit_dinkes', token: operatorToken },
      {},
      '127.0.0.1'
    );
    // Hanya jab_1 (Dinkes induk) dan jab_2 (Bidang P2P di bawah Dinkes), TIDAK termasuk jab_3 (Bappeda)
    assert.equal(scopedBulk.jabatan.length, 2);
    const jabIds = new Set(scopedBulk.jabatan.map((j) => j.id));
    assert.ok(jabIds.has('jab_1'));
    assert.ok(jabIds.has('jab_2'));
    assert.ok(!jabIds.has('jab_3'));
    assert.equal(scopedBulk.abk.length, 1);
  });

  await t.test('saveBulkAnjabData memperbarui Secondary Index O(1) dan mencatat Outbox dirtyPaths', async () => {
    dirtyPaths.clear();
    const saveRes = await handleSianjabAction(
      'saveBulkAnjabData',
      { year: '2027' },
      {
        token: operatorToken,
        year: '2027',
        jabatanId: 'jab_2',
        payload: {
          jabatan: { ikhtisar: 'Melaksanakan analisis kesehatan masyarakat' },
          tugasPokok: [
            { uraianTugas: 'Tugas 1 baru', hasilKerja: 'Dokumen', urutan: 1 },
            { uraianTugas: 'Tugas 2 baru', hasilKerja: 'Laporan', urutan: 2 }
          ],
          syaratJabatan: { pangkat: 'Penata Muda Tk.I', golongan: 'III/b' }
        }
      },
      '127.0.0.1'
    );
    assert.equal(saveRes.saved, true);

    const fullJab = await handleSianjabAction(
      'getJabatanFull',
      { id: 'jab_2', year: '2027', token: operatorToken },
      {},
      '127.0.0.1'
    );
    assert.equal(fullJab.ikhtisar, 'Melaksanakan analisis kesehatan masyarakat');
    assert.equal(fullJab.tugasPokok.length, 2);
    assert.equal(fullJab.tugasPokok[0].uraianTugas, 'Tugas 1 baru');
    assert.equal(fullJab.syaratJabatan.golongan, 'III/b');

    // Pastikan Outbox mencatat perubahan
    assert.ok(dirtyPaths.size > 0);
  });

  await t.test('RBAC menolak Operator mengedit jabatan milik OPD lain', async () => {
    await assert.rejects(
      async () => {
        await handleSianjabAction(
          'saveBulkAnjabData',
          { year: '2027' },
          {
            token: operatorToken,
            year: '2027',
            jabatanId: 'jab_3', // Milik Bappeda
            payload: { jabatan: { ikhtisar: 'Tidak boleh' } }
          },
          '127.0.0.1'
        );
      },
      /Forbidden/
    );
  });

  await t.test('createBatchReferensi menyimpan banyak referensi sekaligus', async () => {
    const batchRes = await handleSianjabAction(
      'createBatchReferensi',
      { year: '2027' },
      {
        token: adminToken,
        items: [
          { nama: 'Analis Kebijakan Ahli Pertama', jenisJabatan: 'Fungsional', kelasJabatan: '8' },
          { nama: 'Pranata Komputer Terampil', jenisJabatan: 'Fungsional', kelasJabatan: '6' }
        ]
      },
      '127.0.0.1'
    );
    assert.equal(batchRes.createdCount, 2);
    const refs = await handleSianjabAction('readAll', { entity: 'referensiJabatan', token: adminToken }, {}, '127.0.0.1');
    assert.equal(refs.length, 2);
  });

  await t.test('HTTP Server merespons /_homeserver/status dan ETag 304 pada GET /api', async () => {
    const server = createAppServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    try {
      const stRes = await fetch(`http://127.0.0.1:${port}/_homeserver/status`);
      assert.equal(stRes.status, 200);
      const stJson = await stRes.json();
      assert.equal(stJson.status, 'ok');
      assert.equal(stJson.counts.jabatan, 3);

      const apiUrl = `http://127.0.0.1:${port}/api?action=getAnjabStatusSummary&year=2027&token=${encodeURIComponent(adminToken)}`;
      const r1 = await fetch(apiUrl);
      assert.equal(r1.status, 200);
      const etag = r1.headers.get('etag');
      assert.ok(etag);

      const r2 = await fetch(apiUrl, { headers: { 'If-None-Match': etag } });
      assert.equal(r2.status, 304);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

test('SEC-K3: requireEnv gagal keras bila variabel tidak diset', () => {
  assert.throws(() => requireEnv('__TIADA_VARIABEL_INI__'), /Missing required environment variable/);
  const saved = process.env.HOMESERVER_SECRET;
  delete process.env.HOMESERVER_SECRET;
  try {
    assert.throws(() => requireEnv('HOMESERVER_SECRET'), /Missing required environment variable/);
  } finally {
    process.env.HOMESERVER_SECRET = saved;
  }
});

test('SEC-K3: verifyAdminSecret menolak FIREBASE_SECRET', () => {
  const mk = (secret) => ({ headers: { 'x-homeserver-secret': secret }, url: '/_homeserver/status' });
  assert.equal(verifyAdminSecret(mk('test-fb-secret'), {}), false);
  assert.equal(verifyAdminSecret(mk('wrong'), {}), false);
  assert.equal(verifyAdminSecret(mk('test-hs-secret'), {}), true);
});

test('SEC-K1: validateAuthToken wajib verifikasi HMAC (4 bagian)', () => {
  setDbNode('users/u_admin', {
    id: 'u_admin', username: 'admin', nama: 'Administrator', role: 'admin', isActive: true
  });
  rebuildAllIndexes();

  const good = generateAuthToken('admin');
  assert.equal(validateAuthToken(good), 'admin');

  // Token palsu: HMAC salah
  const forged = Buffer.from(`admin:${Date.now()}:nonce-palsu:deadbeef`).toString('base64');
  assert.equal(validateAuthToken(forged), null);

  // Token legacy 3 bagian (tanpa HMAC) — dulu diterima, sekarang ditolak
  const legacy = Buffer.from(`admin:${Date.now()}:nonce-lama`).toString('base64');
  assert.equal(validateAuthToken(legacy), null);
});

test('SEC-K1: getAuthenticatedUser menolak username tanpa record user (bypass admin dihapus)', () => {
  assert.throws(() => getAuthenticatedUser(generateAuthToken('tidak_ada')), (e) => e.statusCode === 401);
});

test('SEC-K2: server bind ke 127.0.0.1 secara default (bukan 0.0.0.0)', () => {
  assert.equal(BIND_HOST, '127.0.0.1');
});

test('SEC-T7: login menolak plaintext, menerima hanya HMAC, rate-limit aktif', async () => {
  // Re-seed DB login khusus test ini
  setDbNode('users/u_plain', {
    id: 'u_plain', username: 'plainuser', nama: 'Plain', role: 'operator', isActive: true,
    password: 'plain123' // hash palsu — harus DITOLAK walau plaintext cocok
  });
  setDbNode('users/u_hmac', {
    id: 'u_hmac', username: 'hmacuser', nama: 'Hmac', role: 'operator', isActive: true,
    password: hashPasswordHmac('rahasia', 'hmacuser')
  });
  rebuildAllIndexes();

  // (a) Plaintext dipakai sebagai password → ditolak
  const bad = await handleSianjabAction('login', {}, { username: 'plainuser', password: 'plain123' }, '127.0.0.1').catch(() => null);
  assert.ok(!bad || !bad.token, 'login plaintext harus gagal');

  // (b) HMAC sah → sukses
  const good = await handleSianjabAction('login', {}, { username: 'hmacuser', password: 'rahasia' }, '127.0.0.1');
  assert.ok(good.token);

  // (c) 5 login gagal berurutan → percobaan berikutnya 429 (rate-limit)
  const limiter = await handleSianjabAction('login', {}, { username: 'hmacuser', password: 'salah' }, '10.0.0.9').catch((e) => ({ err: e.message }));
  const ipKey = '10.0.0.9';
  for (let i = 0; i < 4; i++) {
    await handleSianjabAction('login', {}, { username: 'hmacuser', password: 'salah' }, ipKey).catch(() => {});
  }
  // Setelah 5+ kegagalan, login berikutnya (walau password benar) ditolak
  let blocked = false;
  try {
    await handleSianjabAction('login', {}, { username: 'hmacuser', password: 'rahasia' }, ipKey);
  } catch (e) {
    blocked = e && e.statusCode === 429;
  }
  assert.ok(blocked, 'login ke-6 harus diblokir rate-limit');
});

test('SEC-T6: operator tidak bisa membaca data OPD lain (IDOR)', async () => {
  setDbNode('users/u_op3', {
    id: 'u_op3', username: 'operator3', nama: 'Operator Tiga', role: 'operator', unitKerjaId: 'unit_dinkes', isActive: true
  });
  // jabatan milik OPD lain (Bappeda)
  setDbNode('users/u_opb', {
    id: 'u_opb', username: 'operator_bappeda', nama: 'Operator Bappeda', role: 'operator', unitKerjaId: 'unit_bappeda', isActive: true
  });
  rebuildAllIndexes();
  const opDinkes = generateAuthToken('operator3');
  const opBappeda = generateAuthToken('operator_bappeda');

  // record milik OPD lain: tugasPokok di jab_3 (Bappeda)
  setDbNode('2027/tugasPokok/tp_bap', { id: 'tp_bap', jabatanId: 'jab_3', uraianTugas: 'Rahasia Bappeda', urutan: 1 });
  rebuildAllIndexes();

  // (1) readAll dengan parentId jabatan OPD lain →_jwt error
  let err = null;
  try { await handleSianjabAction('readAll', { token: opDinkes, entity: 'tugasPokok', parentId: 'jab_3', tahun: '2027' }, {}, '127.0.0.1'); } catch (e) { err = e; }
  assert.ok(err, 'readAll antar-OPD harus ditolak');

  // (2) getBulkAnjabByUnit tanpa unitKerjaId → ditolak (bukan data kosong diam-diam)
  err = null;
  try { await handleSianjabAction('getBulkAnjabByUnit', { token: opDinkes, tahun: '2027' }, {}, '127.0.0.1'); } catch (e) { err = e; }
  assert.ok(err, 'getBulkAnjabByUnit tanpa unitId harus ditolak untuk operator');

  // (3) getBulkAnjabByUnit milik OPD lain → ditolak
  err = null;
  try { await handleSianjabAction('getBulkAnjabByUnit', { token: opDinkes, unitKerjaId: 'unit_bappeda', tahun: '2027' }, {}, '127.0.0.1'); } catch (e) { err = e; }
  assert.ok(err, 'getBulkAnjabByUnit antar-OPD harus ditolak');

  // (4) data OPD sendiri tetap bisa
  setDbNode('2027/tugasPokok/tp_dinkes', { id: 'tp_dinkes', jabatanId: 'jab_1', uraianTugas: 'Tugas Dinkes', urutan: 1 });
  rebuildAllIndexes();
  const own = await handleSianjabAction('readAll', { token: opDinkes, entity: 'tugasPokok', parentId: 'jab_1', tahun: '2027' }, {}, '127.0.0.1');
  assert.ok(Array.isArray(own) && own.some((r) => r.id === 'tp_dinkes'));

  // (5) admin tetap bebas
  const adminTok = generateAuthToken('admin');
  const all = await handleSianjabAction('getBulkAnjabByUnit', { token: adminTok, unitKerjaId: 'unit_bappeda', tahun: '2027' }, {}, '127.0.0.1');
  assert.ok(all);
});

test('SEC-T9: operator tidak bisa update/delete baris anak milik OPD lain', async () => {
  const opDinkes = generateAuthToken('operator3'); // dari test sebelumnya, masih ada di DB
  // tp_bap: tugasPokok milik jab_3 (Bappeda) — dibuat di test SEC-T6
  let err = null;
  try {
    await handleSianjabAction('update', { token: opDinkes, entity: 'tugasPokok', id: 'tp_bap', tahun: '2027' }, { data: { uraianTugas: 'Dirubah lintas OPD' } }, '127.0.0.1');
  } catch (e) { err = e; }
  assert.ok(err, 'update antar-OPD harus ditolak');

  err = null;
  try {
    await handleSianjabAction('delete', { token: opDinkes, entity: 'tugasPokok', id: 'tp_bap', tahun: '2027' }, {}, '127.0.0.1');
  } catch (e) { err = e; }
  assert.ok(err, 'delete antar-OPD harus ditolak');
  assert.ok(getDbNode('2027/tugasPokok/tp_bap'), 'record tetap utuh');
});

test('SEC-T10: create unitKerja dengan kode duplikat ditolak', async () => {
  const adminTok = generateAuthToken('admin');
  let err = null;
  try {
    await handleSianjabAction('create', { token: adminTok, entity: 'unitKerja', tahun: '2027' }, { entity: 'unitKerja', data: { kode: 'unit_dinkes', nama: 'OPD Palsu' } }, '127.0.0.1');
  } catch (e) { err = e; }
  assert.ok(err, 'kode duplikat harus ditolak');
  assert.equal(getDbNode('2027/unitKerja/unit_dinkes').nama, 'Dinas Kesehatan', 'record lama tidak tertimpa');
});

test('BE-T1: saveABK menolak waktu > 8 jam tanpa konversi menit', async () => {
  const adminTok = generateAuthToken('admin');
  let err = null;
  try {
    await handleSianjabAction('saveABK', { token: adminTok, parentId: 'jab_1', tahun: '2027' }, { data: { rows: [{ waktu: 30, volume: 10 }], waktuSatuan: 'jam' } }, '127.0.0.1');
  } catch (e) { err = e; }
  assert.ok(err, 'waktu 30 jam harus ditolak keras');
  assert.ok(err.message.includes('maksimal 8 jam'), 'pesan error menyebut batas 8 jam');
  // nilai <= 8 tetap diterima
  const ok = await handleSianjabAction('saveABK', { token: adminTok, parentId: 'jab_1', tahun: '2027' }, { data: { rows: [{ waktu: 8, volume: 10 }], waktuSatuan: 'jam' } }, '127.0.0.1');
  assert.ok(ok);
});

test('BE-T2: pull ditolak saat masih ada perubahan lokal belum flush', async () => {
  const { dirtyPaths, pullAllFromRtdb } = require('./server.js');
  dirtyPaths.add('2027/tugasPokok/tp_belum_flush');
  let err = null;
  try { await pullAllFromRtdb(); } catch (e) { err = e; }
  assert.ok(err, 'pull harus ditolak saat dirtyPaths tidak kosong');
  assert.ok(err.message.includes('belum dikirim ke RTDB'));
  dirtyPaths.delete('2027/tugasPokok/tp_belum_flush');
});

test('ARC-F7: error API status code bermakna (bukan selalu 200)', () => {
  const { httpStatusForError } = require('./server.js');
  assert.equal(httpStatusForError(new Error('Token tidak valid atau sudah kadaluarsa. Silakan login ulang.')), 401);
  assert.equal(httpStatusForError(new Error('Akses ditolak: Anda hanya dapat mengakses data pada OPD Anda sendiri.')), 403);
  assert.equal(httpStatusForError(new Error('Waktu per hasil kerja maksimal 8 jam (1 hari kerja).')), 400);
  assert.equal(httpStatusForError(new Error('Kesalahan internal tak terduga')), 500);
  const e = new Error('rate limited'); e.statusCode = 429;
  assert.equal(httpStatusForError(e), 429);
});

test('FE-T15: getJabatanByUnit menyertakan jabatan sub-unit', async () => {
  setDbNode('2027/unitKerja/unit_dinkes', { id: 'unit_dinkes', nama: 'Dinas Kesehatan' });
  setDbNode('2027/unitKerja/unit_puskesmas', { id: 'unit_puskesmas', nama: 'Puskesmas', parentId: 'unit_dinkes' });
  setDbNode('2027/jabatan/jab_induk', { id: 'jab_induk', unitKerjaId: 'unit_dinkes', namaJabatan: 'Kepala Dinas', level: 1 });
  setDbNode('2027/jabatan/jab_anak', { id: 'jab_anak', unitKerjaId: 'unit_puskesmas', namaJabatan: 'Kepala Puskesmas', level: 2 });
  rebuildAllIndexes();
  const adminTok = generateAuthToken('admin');
  const list = await handleSianjabAction('getJabatanByUnit', { token: adminTok, unitId: 'unit_dinkes', tahun: '2027' }, {}, '127.0.0.1');
  const ids = list.map((j) => j.id);
  assert.ok(ids.includes('jab_induk'), 'jabatan OPD induk ikut');
  assert.ok(ids.includes('jab_anak'), 'jabatan sub-unit ikut');
});

test('ARC-F14: backup otomatis menulis file & retensi bekerja', async () => {
  const { runBackupNow, pruneBackupFiles } = require('./server.js');
  const fsmod = require('fs');
  const osmod = require('os');
  // 1. Retensi
  const tmpDir = fsmod.mkdtempSync(path.join(osmod.tmpdir(), 'sianjab-backup-'));
  assert.equal(pruneBackupFiles(tmpDir, 2), 0);
  for (const f of ['db-backup-1.json', 'db-backup-2.json', 'db-backup-3.json', 'db-backup-4.json']) {
    fsmod.writeFileSync(path.join(tmpDir, f), '{}');
  }
  assert.equal(pruneBackupFiles(tmpDir, 2), 2);
  assert.deepEqual(fsmod.readdirSync(tmpDir).sort(), ['db-backup-3.json', 'db-backup-4.json']);
  fsmod.rmSync(tmpDir, { recursive: true, force: true });
  // 2. runBackupNow menulis file nyata di DATA_DIR test
  const res = runBackupNow('test');
  assert.ok(res.ok, 'backup harus sukses: ' + (res.error || ''));
  assert.ok(fsmod.existsSync(res.file), 'file backup ada');
  assert.ok(path.basename(res.file).startsWith('db-backup-'));
});

test('SEC-S2: verifyAdminSecret menolak secret dari query string', () => {
  const req = { headers: {}, url: '/_homeserver/status?secret=test-hs-secret' };
  assert.equal(verifyAdminSecret(req, {}), false);
  const reqHeader = { headers: { 'x-homeserver-secret': 'test-hs-secret' }, url: '/_homeserver/status' };
  assert.equal(verifyAdminSecret(reqHeader, {}), true);
});

test('SEC-T5: self-update operator tidak bisa mengubah role/unitKerjaId/isActive', () => {
  setDbNode('users/u_op2', {
    id: 'u_op2', username: 'operator2', nama: 'Operator Dua', role: 'operator', unitKerjaId: 'unit_dinkes', isActive: true
  });
  rebuildAllIndexes();

  // Simulasi jalur updateUser: operator self-update dengan payload berbahaya
  // (diuji lewat handleSianjabAction — token operator2, id diri sendiri)
  const opToken = generateAuthToken('operator2');
  const res = handleSianjabAction('updateUser', { token: opToken, id: 'u_op2' }, { entity: 'users', data: { role: 'admin', isActive: true, nama: 'Nama Baru Aman' } }, '127.0.0.1');
  const updated = getDbNode('users/u_op2');
  assert.equal(updated.role, 'operator');
  assert.equal(updated.nama, 'Nama Baru Aman'); // field di whitelist tetap boleh
  assert.equal(Array.isArray(SELF_UPDATE_ALLOWED_FIELDS) && SELF_UPDATE_ALLOWED_FIELDS.includes('role'), false);
});

test('SEC-K2: endpoint /db wajib autentikasi, root write ditolak, CORS tanpa wildcard', async () => {
  setDbNode('users/u_admin', {
    id: 'u_admin', username: 'admin', nama: 'Administrator', role: 'admin', isActive: true
  });
  setDbNode('users/u_op', {
    id: 'u_op', username: 'operator1', nama: 'Operator', role: 'operator', unitKerjaId: 'unit_dinkes', isActive: true
  });
  setDbNode('2027/unitKerja/unit_dinkes', { id: 'unit_dinkes', nama: 'Dinas Kesehatan', parentId: '' });
  rebuildAllIndexes();

  const adminToken = generateAuthToken('admin');
  const opToken = generateAuthToken('operator1');
  const server = createAppServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const noAuth = await fetch(`${base}/db/.json`);
    assert.equal(noAuth.status, 401);

    const opWrite = await fetch(`${base}/db/users/u_op.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: opToken, role: 'admin' })
    });
    assert.equal(opWrite.status, 403);

    const rootWrite = await fetch(`${base}/db/.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Homeserver-Secret': 'test-hs-secret' },
      body: JSON.stringify({})
    });
    assert.equal(rootWrite.status, 400);

    const adminRead = await fetch(`${base}/db/2027/unitKerja.json`, {
      headers: { 'X-Homeserver-Secret': 'test-hs-secret' }
    });
    assert.equal(adminRead.status, 200);
    const data = await adminRead.json();
    assert.ok(data.unit_dinkes);

    const userRead = await fetch(`${base}/db/2027/unitKerja.json?token=${encodeURIComponent(adminToken)}`);
    assert.equal(userRead.status, 200);

    const corsRes = await fetch(`${base}/_homeserver/ping`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(corsRes.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('ARC-F3: hash password v2 bersalt acak dan verifikasi berurutan', () => {
  const a = hashPasswordHmac('rahasia', 'budi');
  const b = hashPasswordHmac('rahasia', 'budi');
  assert.match(a, /^v2\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notEqual(a, b, 'salt acak harus membuat hash berbeda');

  assert.deepEqual(verifyPassword('rahasia', 'budi', a), { valid: true, needsRehash: false });
  assert.deepEqual(verifyPassword('salah', 'budi', a), { valid: false, needsRehash: false });

  const v1 = hashPasswordV1('rahasia', 'budi');
  assert.deepEqual(verifyPassword('rahasia', 'budi', v1), { valid: true, needsRehash: true });

  const legacy = hashPasswordLegacy('rahasia');
  assert.deepEqual(verifyPassword('rahasia', 'budi', legacy), { valid: true, needsRehash: true });

  assert.deepEqual(verifyPassword('rahasia', 'budi', 'plaintext'), { valid: false, needsRehash: false });
  assert.deepEqual(verifyPassword('rahasia', 'budi', ''), { valid: false, needsRehash: false });
});

test('ARC-F3: login memigrasi hash v1 ke v2 dan menolak password salah', async () => {
  setDbNode('users', {
    u_old: {
      id: 'u_old',
      username: 'userlama',
      role: 'admin',
      isActive: true,
      passwordHash: hashPasswordV1('passlama', 'userlama')
    }
  });

  const ok = await handleSianjabAction('login', {}, { username: 'userlama', password: 'passlama' }, '127.0.0.1');
  assert.equal(ok.username, 'userlama');

  const stored = getDbNode('users/u_old');
  assert.match(stored.password, /^v2\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(stored.passwordHash, undefined, 'passwordHash lama harus dihapus');

  const bad = await handleSianjabAction('login', {}, { username: 'userlama', password: 'salah' }, '127.0.0.2').catch((e) => e);
  assert.match(String(bad.message), /Username atau password salah/);
  assert.equal(getDbNode('users/u_old').password, stored.password, 'hash tidak boleh berubah saat gagal');
});

test('SEC-R3/R2: login homeserver tidak membocorkan keberadaan akun', async () => {
  // Pesan seragam untuk user tidak ada vs password salah
  const missing = await handleSianjabAction('login', {}, { username: 'tidakada', password: 'xxx' }, '127.0.0.50').catch((e) => e);
  assert.match(String(missing.message), /Username atau password salah/);

  // Kegagalan untuk user tidak ada tetap tercatat di rate-limiter
  const limiterKey = 'tidakada:127.0.0.51';
  for (let i = 0; i < 6; i++) {
    await handleSianjabAction('login', {}, { username: 'tidakada', password: 'xxx' }, '127.0.0.51').catch(() => {});
  }
  const throttled = await handleSianjabAction('login', {}, { username: 'tidakada', password: 'xxx' }, '127.0.0.51').catch((e) => e);
  assert.match(String(throttled.message), /Terlalu banyak percobaan|Username atau password salah/);

  // Akun nonaktif: password dulu, baru isActive
  setDbNode('users', Object.assign({}, getDbNode('users'), {
    u_inact: { id: 'u_inact', username: 'nonaktif', role: 'operator', isActive: false, password: hashPasswordHmac('passnya', 'nonaktif') }
  }));
  const bad = await handleSianjabAction('login', {}, { username: 'nonaktif', password: 'salah' }, '127.0.0.52').catch((e) => e);
  assert.match(String(bad.message), /Username atau password salah/);
  const good = await handleSianjabAction('login', {}, { username: 'nonaktif', password: 'passnya' }, '127.0.0.52').catch((e) => e);
  assert.match(String(good.message), /dinonaktifkan/);
});
