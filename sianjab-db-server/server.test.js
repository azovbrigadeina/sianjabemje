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
  BIND_HOST
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
        passwordHash: 'secret123'
      },
      u_op1: {
        id: 'u_op1',
        username: 'op_dinkes',
        nama: 'Operator Dinkes',
        role: 'operator',
        unitKerjaId: 'unit_dinkes',
        salt: 's2',
        passwordHash: 'oppass'
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
