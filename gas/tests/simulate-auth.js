/**
 * Simulasi keamanan auth GAS (SEC-K4): getUserFromToken_ dan alur action publik.
 * Jalankan: node gas/tests/simulate-auth.js
 * Exit code 0 = semua lulus.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.error('FAIL: ' + name + (detail ? ' :: ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

// ------------------------------------------------------------
// Sandbox GAS
// ------------------------------------------------------------
const scriptProps = new Map();
scriptProps.set('API_SECRET', 'test-api-secret-untuk-simulasi');

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
    fetch: () => { throw new Error('UrlFetchApp tidak boleh dipanggil dalam simulasi auth'); },
    fetchAll: () => { throw new Error('UrlFetchApp tidak boleh dipanggil dalam simulasi auth'); },
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (s) => ({ setMimeType: () => ({}) , _s: s }),
  },
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'Code.gs' });

// Stub database: satu admin aktif, tidak ada token dicabut.
sandbox.fbGet_ = (p) => {
  if (p === 'users') {
    return { u_admin: { username: 'admin', role: 'admin', isActive: true } };
  }
  if (p === 'users/u_op') {
    return { id: 'u_op', username: 'operator1', nama: 'Operator', role: 'operator', unitKerjaId: 'unit_dinkes', isActive: true };
  }
  return null;
};

// ------------------------------------------------------------
// 1. Token palsu (HMAC salah) harus ditolak validateToken_
// ------------------------------------------------------------
const fakeToken = sandbox.Utilities.base64Encode('admin:0:nonce-palsu:deadbeef');
check('SEC-K4: validateToken_ menolak token dengan HMAC salah', sandbox.validateToken_(fakeToken) === false);

// ------------------------------------------------------------
// 2. Token sah (4 bagian, HMAC benar) harus diterima
// ------------------------------------------------------------
const now = Date.now().toString();
const secret = scriptProps.get('API_SECRET');
const sigOk = sandbox.computeHmacHex_('admin' + ':' + now + ':' + 'nonce-abc', secret);
const goodToken = sandbox.Utilities.base64Encode('admin' + ':' + now + ':' + 'nonce-abc' + ':' + sigOk);
check('SEC-K4: validateToken_ menerima token dengan HMAC sah', sandbox.validateToken_(goodToken) === true);

// ------------------------------------------------------------
// 3. getUserFromToken_ dengan token palsu → null (tidak boleh jadi admin)
// ------------------------------------------------------------
const fakeUser = sandbox.getUserFromToken_(fakeToken);
check('SEC-K4: getUserFromToken_ token palsu → null', fakeUser === null, fakeUser);

// ------------------------------------------------------------
// 4. getUserFromToken_ token sah → user admin
// ------------------------------------------------------------
const okUser = sandbox.getUserFromToken_(goodToken);
check('SEC-K4: getUserFromToken_ token sah → role admin', !!okUser && okUser.role === 'admin', okUser);

// ------------------------------------------------------------
// 5. SEC-T5: self-update operator tidak boleh mengubah role
// ------------------------------------------------------------
let patched = null;
sandbox.fbPatch_ = (_p, data) => { patched = data; };
sandbox.updateUser_({ id: 'u_op', role: 'operator' }, 'u_op', { role: 'admin', isActive: false, nama: 'Nama Aman' });
check('SEC-T5: updateUser_ membuang role/isActive dari self-update', !!patched && patched.role === undefined && patched.isActive === undefined, patched);
check('SEC-T5: updateUser_ tetap mengizinkan field aman (nama)', !!patched && patched.nama === 'Nama Aman', patched);

// ------------------------------------------------------------
// Ringkasan
// ------------------------------------------------------------
console.log('\n================ RINGKASAN ================');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
process.exit(fail > 0 ? 1 : 0);
