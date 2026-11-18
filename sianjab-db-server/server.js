/**
 * ============================================================================
 * SIANJAB HOMESERVER DATABASE & WRITE-BEHIND RTDB SYNC SERVER
 * ============================================================================
 * Port Default : 3098 (Tailscale Funnel HTTPS :8443)
 * Fitur Utama  :
 *  1. In-Memory JSON Database + Atomic Disk Persistence (/data/sianjab-db.json)
 *     dengan propagasi error disk yang ketat (tidak menelan kegagalan disk).
 *  2. Secondary Index O(1) di RAM (idxByYearJabatan & idxJabatanByYearUnit)
 *     untuk meniadakan full-table scan saat pengisian serentak 42+ OPD.
 *  3. Persistent Outbox (/data/outbox.json) + Write-Behind Scheduler ke RTDB
 *     (menggunakan ?print=silent & Accept-Encoding: gzip -> hemat >95% kuota).
 *  4. 100% Kompatibel dengan Sianjab Frontend API (src/lib/api.ts: /api?action=...)
 *     dan struktur respons Google Apps Script ({ success: true, data: ... }).
 *  5. Live Monitor Dashboard (GET / & GET /monitor) dengan Server-Sent Events (SSE).
 * ============================================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { URL } = require('url');

// ============================================================================
// KONFIGURASI LINGKUNGAN
// ============================================================================
const PORT = parseInt(process.env.PORT || '3098', 10);
// SEC-K2: default bind 127.0.0.1 — akses publik hanya via Tailscale Funnel.
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'sianjab-db.json');
const OUTBOX_FILE = path.join(DATA_DIR, 'outbox.json');
const STATE_FILE = path.join(DATA_DIR, 'server-state.json');

// SEC-K3: secret WAJIB dari environment — tidak ada fallback hardcoded.
function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

const HOMESERVER_SECRET = requireEnv('HOMESERVER_SECRET');
const API_SECRET = requireEnv('API_SECRET');

const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || 'https://anjabmj-44141-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '');
const FIREBASE_SECRET = requireEnv('FIREBASE_SECRET');

const SITPP_FIREBASE_URL = (process.env.SITPP_FIREBASE_URL || 'https://sitpp-1305b-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '');
const SITPP_SECRET = requireEnv('SITPP_SECRET');

const GAS_DEPLOYMENT_URL = process.env.GAS_DEPLOYMENT_URL || 'https://script.google.com/macros/s/AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw/exec';
const WRITE_BEHIND_INTERVAL_MS = parseInt(process.env.WRITE_BEHIND_INTERVAL_MS || '180000', 10); // Default 3 menit
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES || String(100 * 1024 * 1024), 10); // 100 MB

const ALLOWED_ENTITIES = new Set([
  'unitKerja', 'jabatan', 'tugasPokok', 'bahanKerja', 'perangkatKerja',
  'tanggungJawab', 'wewenang', 'korelasiJabatan', 'kondisiLingkungan',
  'risikoBahaya', 'syaratJabatan', 'kualifikasi', 'prestasiKerja',
  'hasilKerja', 'abk', 'users', 'settings', 'template_docx', 'referensiJabatan',
  'verification_logs', 'verification_codes', 'sianjab_export', 'security_logs',
  'anomaliExclusion', 'revokedTokens'
]);

const NON_YEARLY_ENTITIES = new Set([
  'users', 'settings', 'template_docx', 'referensiJabatan',
  'verification_logs', 'verification_codes', 'sianjab_export', 'security_logs', 'revokedTokens'
]);

const CHILD_ENTITIES = [
  'tugasPokok', 'bahanKerja', 'perangkatKerja', 'tanggungJawab',
  'wewenang', 'korelasiJabatan', 'kondisiLingkungan', 'risikoBahaya',
  'syaratJabatan', 'kualifikasi', 'prestasiKerja', 'hasilKerja', 'abk'
];

const SINGLE_CHILD_ENTITIES = ['kualifikasi', 'syaratJabatan', 'hasilKerja', 'prestasiKerja'];
// SEC-T5: field yang boleh diubah user saat self-update (non-admin).
const SELF_UPDATE_ALLOWED_FIELDS = ['nama', 'email', 'password'];const MULTI_CHILD_ENTITIES = [
  'tugasPokok', 'bahanKerja', 'perangkatKerja', 'tanggungJawab',
  'wewenang', 'korelasiJabatan', 'kondisiLingkungan', 'risikoBahaya'
];

// ============================================================================
// STATE IN-MEMORY & METRIK MONITOR
// ============================================================================
let db = {};
let serverState = {
  mode: 'HOMESERVER', // 'HOMESERVER' | 'RTDB' | 'OFF'
  lastPullFromRtdbAt: null,
  lastFlushToRtdbAt: null,
  lastFlushResult: null,
  storageError: null,
  totalFlushedPaths: 0
};

let dirtyPaths = new Set();
let isFlushingOutbox = false;

// Secondary Index O(1) di RAM
// idxByYearJabatan: Map<"year:entity:jabatanId", Set<recordId>>
const idxByYearJabatan = new Map();
// idxJabatanByYearUnit: Map<"year:unitKerjaId", Set<jabatanId>>
const idxJabatanByYearUnit = new Map();

let stats = {
  startedAt: Date.now(),
  totalRequests: 0,
  totalReads: 0,
  totalWrites: 0,
  bytesIn: 0,
  bytesOut: 0,
  rtdbBytesSavedEstimate: 0
};
const recentActivities = [];
const MAX_RECENT_ACTIVITIES = 80;
const sseClients = new Set();

let saveTimer = null;
let savePending = false;

// ============================================================================
// UTILITAS PERSISTENSI DISK & OUTBOX
// ============================================================================
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeTemplateSeparation() {
  if (db && db.settings && typeof db.settings === 'object' && db.settings.templateDocx) {
    if (!db.template_docx) {
      db.template_docx = db.settings.templateDocx;
    }
    delete db.settings.templateDocx;
    return true;
  }
  return false;
}

function saveStateNow() {
  ensureDataDir();
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(serverState, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function saveOutboxNow() {
  ensureDataDir();
  const tmp = OUTBOX_FILE + '.tmp';
  const payload = {
    updatedAt: new Date().toISOString(),
    dirtyPaths: Array.from(dirtyPaths)
  };
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, OUTBOX_FILE);
}

function saveDbNow() {
  ensureDataDir();
  try {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db), 'utf8');
    fs.renameSync(tmp, DB_FILE);
    savePending = false;
    serverState.storageError = null;
    return { ok: true };
  } catch (err) {
    const msg = 'Disk write failed: ' + (err && err.message ? err.message : String(err));
    serverState.storageError = msg;
    console.error('[SIANJAB-DB] CRITICAL:', msg);
    return { ok: false, error: msg };
  }
}

function scheduleSaveDb() {
  savePending = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (savePending) saveDbNow();
  }, 500);
}

function markDirtyPath(fbPath) {
  const clean = String(fbPath || '').replace(/^\/+|\/+$/g, '');
  if (!clean) {
    dirtyPaths.add('__ROOT__');
  } else {
    const parts = clean.split('/');
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join('/');
      if (dirtyPaths.has(prefix)) return;
    }
    const prefixWithSlash = clean + '/';
    for (const existing of Array.from(dirtyPaths)) {
      if (existing.startsWith(prefixWithSlash)) {
        dirtyPaths.delete(existing);
      }
    }
    dirtyPaths.add(clean);
  }
  try {
    saveOutboxNow();
  } catch (e) {
    console.error('[SIANJAB-DB] Failed saving outbox:', e.message);
  }
}

// ============================================================================
// SECONDARY INDEXES O(1) DI MEMORI
// ============================================================================
function makeChildIdxKey(year, entity, jabatanId) {
  return `${year}:${entity}:${jabatanId}`;
}

function makeUnitIdxKey(year, unitKerjaId) {
  return `${year}:${unitKerjaId}`;
}

function rebuildAllIndexes() {
  idxByYearJabatan.clear();
  idxJabatanByYearUnit.clear();
  if (!db || typeof db !== 'object') return;

  for (const topKey of Object.keys(db)) {
    if (!/^\d{4}$/.test(topKey)) continue;
    const yearNode = db[topKey];
    if (!yearNode || typeof yearNode !== 'object') continue;

    const jabatans = yearNode.jabatan;
    if (jabatans && typeof jabatans === 'object') {
      for (const [jId, jObj] of Object.entries(jabatans)) {
        if (jObj && typeof jObj === 'object' && jObj.unitKerjaId) {
          const uKey = makeUnitIdxKey(topKey, jObj.unitKerjaId);
          let set = idxJabatanByYearUnit.get(uKey);
          if (!set) {
            set = new Set();
            idxJabatanByYearUnit.set(uKey, set);
          }
          set.add(jId);
        }
      }
    }

    for (const ent of CHILD_ENTITIES) {
      const table = yearNode[ent];
      if (!table || typeof table !== 'object') continue;
      for (const [recId, rec] of Object.entries(table)) {
        if (!rec || typeof rec !== 'object') continue;
        const jId = rec.jabatanId || rec.parentId || (ent === 'abk' ? recId : null);
        if (jId) {
          const cKey = makeChildIdxKey(topKey, ent, jId);
          let set = idxByYearJabatan.get(cKey);
          if (!set) {
            set = new Set();
            idxByYearJabatan.set(cKey, set);
          }
          set.add(recId);
        }
      }
    }
  }
}

function indexAddChildRecord(year, entity, recId, rec) {
  if (!rec || typeof rec !== 'object') return;
  const jId = rec.jabatanId || rec.parentId || (entity === 'abk' ? recId : null);
  if (!jId) return;
  const cKey = makeChildIdxKey(year, entity, jId);
  let set = idxByYearJabatan.get(cKey);
  if (!set) {
    set = new Set();
    idxByYearJabatan.set(cKey, set);
  }
  set.add(recId);
}

function indexRemoveChildRecord(year, entity, recId, oldRec) {
  if (!oldRec || typeof oldRec !== 'object') return;
  const jId = oldRec.jabatanId || oldRec.parentId || (entity === 'abk' ? recId : null);
  if (!jId) return;
  const cKey = makeChildIdxKey(year, entity, jId);
  const set = idxByYearJabatan.get(cKey);
  if (set) {
    set.delete(recId);
    if (set.size === 0) idxByYearJabatan.delete(cKey);
  }
}

function indexAddJabatan(year, jId, jObj) {
  if (!jObj || typeof jObj !== 'object' || !jObj.unitKerjaId) return;
  const uKey = makeUnitIdxKey(year, jObj.unitKerjaId);
  let set = idxJabatanByYearUnit.get(uKey);
  if (!set) {
    set = new Set();
    idxJabatanByYearUnit.set(uKey, set);
  }
  set.add(jId);
}

function indexRemoveJabatan(year, jId, oldJObj) {
  if (!oldJObj || typeof oldJObj !== 'object' || !oldJObj.unitKerjaId) return;
  const uKey = makeUnitIdxKey(year, oldJObj.unitKerjaId);
  const set = idxJabatanByYearUnit.get(uKey);
  if (set) {
    set.delete(jId);
    if (set.size === 0) idxJabatanByYearUnit.delete(uKey);
  }
}

function getChildRecordIdsByJabatan(year, entity, jabatanId) {
  const cKey = makeChildIdxKey(year, entity, jabatanId);
  const set = idxByYearJabatan.get(cKey);
  return set ? Array.from(set) : [];
}

function getChildRecordsByJabatan(year, entity, jabatanId) {
  const table = getDbNode(`${year}/${entity}`);
  if (!table || typeof table !== 'object') return [];
  const ids = getChildRecordIdsByJabatan(year, entity, jabatanId);
  const res = [];
  for (const id of ids) {
    if (table[id]) {
      res.push({ ...table[id], id });
    }
  }
  res.sort((a, b) => (Number(a.nomorUrut ?? a.urutan) || 0) - (Number(b.nomorUrut ?? b.urutan) || 0));
  return res;
}

// ============================================================================
// OPERASI POHON JSON IN-MEMORY
// ============================================================================
function splitPath(p) {
  if (!p) return [];
  return String(p).split('/').filter(Boolean);
}

function getDbNode(p) {
  const parts = splitPath(p);
  let cur = db;
  for (const seg of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return null;
    cur = cur[seg];
  }
  return cur === undefined ? null : cur;
}

function pruneEmptyParents(parts) {
  if (parts.length <= 1) return;
  const parentParts = parts.slice(0, -1);
  const parent = getDbNode(parentParts.join('/'));
  if (parent && typeof parent === 'object' && Object.keys(parent).length === 0) {
    setDbNode(parentParts.join('/'), null);
  }
}

function setDbNode(p, val) {
  const parts = splitPath(p);
  if (parts.length === 0) {
    db = (val && typeof val === 'object') ? val : {};
    normalizeTemplateSeparation();
    rebuildAllIndexes();
    return;
  }
  let cur = db;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    if (cur[seg] === null || cur[seg] === undefined || typeof cur[seg] !== 'object') {
      if (val === null || val === undefined) return;
      cur[seg] = {};
    }
    cur = cur[seg];
  }
  const last = parts[parts.length - 1];
  if (val === null || val === undefined) {
    delete cur[last];
    pruneEmptyParents(parts);
  } else {
    cur[last] = val;
  }
}

function patchDbNode(p, patchObj) {
  if (!patchObj || typeof patchObj !== 'object') return;
  const baseParts = splitPath(p);
  for (const [k, v] of Object.entries(patchObj)) {
    const subParts = baseParts.concat(splitPath(k));
    setDbNode(subParts.join('/'), v);
  }
}

function getEntityFirebasePath(entity, year = '2026') {
  if (!ALLOWED_ENTITIES.has(entity)) {
    throw new Error('Invalid entity name: ' + entity);
  }
  if (NON_YEARLY_ENTITIES.has(entity)) {
    return entity;
  }
  const y = String(year || '2026').trim();
  if (!/^\d{4}$/.test(y)) {
    throw new Error('Format tahun tidak valid: ' + y);
  }
  return `${y}/${entity}`;
}

function mapObjectWithIds(obj) {
  if (!obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) return obj.filter(Boolean);
  const res = [];
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object') {
      res.push({ ...val, id: val.id || key });
    }
  }
  return res;
}

// ============================================================================
// INISIALISASI DARI DISK ATAU SEED BACKUP LOKAL
// ============================================================================
function loadFromDisk() {
  ensureDataDir();
  if (fs.existsSync(STATE_FILE)) {
    try {
      const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      serverState = { ...serverState, ...st, storageError: null };
    } catch (e) {
      console.warn('[SIANJAB-DB] Gagal memuat server-state.json:', e.message);
    }
  }
  if (fs.existsSync(OUTBOX_FILE)) {
    try {
      const ob = JSON.parse(fs.readFileSync(OUTBOX_FILE, 'utf8'));
      if (Array.isArray(ob.dirtyPaths)) {
        dirtyPaths = new Set(ob.dirtyPaths);
      }
    } catch (e) {
      console.warn('[SIANJAB-DB] Gagal memuat outbox.json:', e.message);
    }
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      console.log('[SIANJAB-DB] Memuat database dari disk:', DB_FILE);
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) || {};
      if (normalizeTemplateSeparation()) {
        saveDbNow();
      }
      rebuildAllIndexes();
      console.log(`[SIANJAB-DB] Database siap. Top-level keys: ${Object.keys(db).join(', ')}`);
      return;
    } catch (e) {
      console.error('[SIANJAB-DB] Gagal membaca sianjab-db.json:', e.message);
    }
  }

  const defaultBackup = path.resolve(__dirname, '../backups/db_backup_2026-10-02_pre_tahap1.json');
  if (fs.existsSync(defaultBackup)) {
    try {
      console.log('[SIANJAB-DB] Menginisialisasi database awal dari snapshot lokal:', defaultBackup);
      const raw = JSON.parse(fs.readFileSync(defaultBackup, 'utf8')) || {};
      db = (raw.data && typeof raw.data === 'object' && raw.app === 'SIANJAB_ABK') ? raw.data : raw;
      normalizeTemplateSeparation();
      rebuildAllIndexes();
      saveDbNow();
      console.log('[SIANJAB-DB] Seed awal dari snapshot lokal berhasil disimpan ke', DB_FILE);
    } catch (e) {
      console.warn('[SIANJAB-DB] Gagal seed dari snapshot lokal:', e.message);
    }
  }
}

// ============================================================================
// KLIEN HTTP KE FIREBASE RTDB (DENGAN GZIP & PRINT=SILENT)
// ============================================================================
function httpRequestJson(fullUrl, method = 'GET', bodyObj = undefined, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(fullUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const payloadBuf = bodyObj !== undefined ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;

    const headers = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate'
    };
    if (payloadBuf) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = payloadBuf.length;
    }

    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
        timeout: timeoutMs
      },
      (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
          return httpRequestJson(res.headers.location, 'GET', undefined, timeoutMs).then(resolve, reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const rawBuf = Buffer.concat(chunks);
          const encoding = (res.headers['content-encoding'] || '').toLowerCase();
          const finalize = (decodedBuf) => {
            const text = decodedBuf.toString('utf8');
            if (res.statusCode >= 400) {
              return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
            }
            if (!text || res.statusCode === 204) return resolve(null);
            try {
              resolve(JSON.parse(text));
            } catch (err) {
              resolve(text);
            }
          };

          if (encoding === 'gzip') {
            zlib.gunzip(rawBuf, (err, decoded) => (err ? reject(err) : finalize(decoded)));
          } else if (encoding === 'deflate') {
            zlib.inflate(rawBuf, (err, decoded) => (err ? reject(err) : finalize(decoded)));
          } else {
            finalize(rawBuf);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout (${timeoutMs}ms): ${method} ${parsed.pathname}`));
    });
    req.on('error', reject);
    if (payloadBuf) req.write(payloadBuf);
    req.end();
  });
}

function buildRtdbUrl(baseUrl, secret, fbPath, extraQuery = '') {
  const clean = String(fbPath || '').replace(/^\/+|\/+$/g, '');
  const pathPart = clean ? `/${clean}.json` : '/.json';
  const authPart = secret ? `auth=${encodeURIComponent(secret)}` : '';
  const query = [authPart, extraQuery].filter(Boolean).join('&');
  return `${baseUrl}${pathPart}${query ? '?' + query : ''}`;
}

async function pullAllFromRtdb() {
  const url = buildRtdbUrl(FIREBASE_DB_URL, FIREBASE_SECRET, '');
  const remoteData = await httpRequestJson(url, 'GET', undefined, 90000);
  if (!remoteData || typeof remoteData !== 'object') {
    throw new Error('Data dari Firebase RTDB kosong atau tidak valid');
  }
  db = remoteData;
  const separated = normalizeTemplateSeparation();
  rebuildAllIndexes();
  const diskRes = saveDbNow();
  if (!diskRes.ok) {
    throw new Error(diskRes.error);
  }
  dirtyPaths.clear();
  if (separated) {
    dirtyPaths.add('template_docx');
    dirtyPaths.add('settings');
  }
  saveOutboxNow();
  serverState.lastPullFromRtdbAt = new Date().toISOString();
  saveStateNow();
  recordActivity('ADMIN', 'PULL_FROM_RTDB', '/.json', 0);
  return {
    topLevelKeys: Object.keys(db),
    pulledAt: serverState.lastPullFromRtdbAt
  };
}

async function flushOutboxToRtdb() {
  if (isFlushingOutbox) {
    return { status: 'busy', message: 'Sinkronisasi Outbox sedang berjalan' };
  }
  if (dirtyPaths.size === 0) {
    return { status: 'clean', flushedCount: 0, remainingCount: 0 };
  }
  isFlushingOutbox = true;
  const pathsToFlush = Array.from(dirtyPaths);
  let flushedCount = 0;

  try {
    if (dirtyPaths.has('__ROOT__')) {
      const url = buildRtdbUrl(FIREBASE_DB_URL, FIREBASE_SECRET, '', 'print=silent');
      await httpRequestJson(url, 'PUT', db, 120000);
      dirtyPaths.clear();
      flushedCount = 1;
    } else {
      for (const p of pathsToFlush) {
        const val = getDbNode(p);
        const url = buildRtdbUrl(FIREBASE_DB_URL, FIREBASE_SECRET, p, 'print=silent');
        if (val === null || val === undefined) {
          await httpRequestJson(url, 'DELETE', undefined, 45000);
        } else {
          await httpRequestJson(url, 'PUT', val, 60000);
        }
        dirtyPaths.delete(p);
        flushedCount++;
        serverState.totalFlushedPaths = (serverState.totalFlushedPaths || 0) + 1;
      }
    }
    saveOutboxNow();
    serverState.lastFlushToRtdbAt = new Date().toISOString();
    serverState.lastFlushResult = `OK (${flushedCount} path)`;
    saveStateNow();
    recordActivity('SYNC', 'FLUSH_OUTBOX_TO_RTDB', `${flushedCount} path`, 0);
    return {
      status: 'ok',
      flushedCount,
      remainingCount: dirtyPaths.size,
      flushedAt: serverState.lastFlushToRtdbAt
    };
  } catch (err) {
    serverState.lastFlushResult = `ERROR: ${err.message}`;
    saveStateNow();
    saveOutboxNow();
    throw err;
  } finally {
    isFlushingOutbox = false;
  }
}

if (WRITE_BEHIND_INTERVAL_MS > 0) {
  setInterval(() => {
    if (serverState.mode === 'HOMESERVER' && dirtyPaths.size > 0 && !isFlushingOutbox) {
      flushOutboxToRtdb().catch((err) => {
        console.warn('[SIANJAB-DB] Background Write-Behind sync tertunda:', err.message);
      });
    }
  }, WRITE_BEHIND_INTERVAL_MS).unref();
}

// ============================================================================
// AUTENTIKASI, TOKEN HMAC, & RBAC OPERATOR
// ============================================================================
function hashPasswordOld(password) {
  return crypto.createHash('sha256').update(String(password || ''), 'utf8').digest('hex');
}

function hashPasswordHmac(password, username) {
  const salt = `${username || ''}:${API_SECRET}`;
  return crypto.createHmac('sha256', salt).update(String(password || ''), 'utf8').digest('hex');
}

function hashPasswordSha256(password, salt) {
  return crypto.createHash('sha256').update(String(salt || '') + String(password || ''), 'utf8').digest('hex');
}

function generateAuthToken(username) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const data = `${username}:${timestamp}:${nonce}`;
  const signatureHex = crypto.createHmac('sha256', API_SECRET).update(data, 'utf8').digest('hex');
  return Buffer.from(`${data}:${signatureHex}`, 'utf8').toString('base64');
}

function validateAuthToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(String(token), 'base64').toString('utf8');
    const parts = decoded.split(':');
    // SEC-K1: wajib 4 bagian (username:timestamp:nonce:hmac) — paritas GAS.
    if (parts.length !== 4) return null;

    const username = parts[0];
    const timestamp = parts[1];
    const nonce = parts[2];
    const signature = parts[3];
    if (!username || !timestamp || !nonce || !signature) return null;

    // SEC-K1: verifikasi HMAC — token tanpa tanda tangan sah DITOLAK.
    const expected = crypto
      .createHmac('sha256', API_SECRET)
      .update(`${username}:${timestamp}:${nonce}`, 'utf8')
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(String(signature), 'hex');
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

    const tokenAge = Date.now() - parseInt(timestamp, 10);
    if (isNaN(tokenAge) || tokenAge > 86400000 || tokenAge < -300000) {
      return null;
    }

    if (db.revokedTokens && db.revokedTokens[nonce]) {
      return null;
    }

    const users = mapObjectWithIds(db.users);
    const exists = users.some(
      (u) => u && u.isActive !== false && String(u.username || '').toLowerCase() === String(username || '').toLowerCase()
    );
    if (!exists) return null;
    return username;
  } catch (e) {
    return null;
  }
}

function getAuthenticatedUser(token) {
  const username = validateAuthToken(token);
  if (!username) {
    const err = new Error('Token tidak valid atau sudah kadaluarsa. Silakan login ulang.');
    err.statusCode = 401;
    throw err;
  }
  const users = mapObjectWithIds(db.users);
  const found = users.find(
    (u) => u && String(u.username || '').toLowerCase() === String(username).toLowerCase()
  );
  if (!found) {
    const err = new Error('Token tidak valid atau sudah kadaluarsa. Silakan login ulang.');
    err.statusCode = 401;
    throw err;
  }
  return {
    id: found.id,
    username: found.username,
    role: found.role || 'operator',
    unitKerjaId: found.unitKerjaId || ''
  };
}

function getAllowedUnitKerjaIds(rootUnitId, year = '2026') {
  if (!rootUnitId) return new Set();
  const unitsObj = getDbNode(`${year}/unitKerja`) || {};
  const childrenMap = new Map();
  for (const [key, u] of Object.entries(unitsObj)) {
    if (!u || !u.parentId) continue;
    const uId = u.id || key;
    let list = childrenMap.get(u.parentId);
    if (!list) {
      list = [];
      childrenMap.set(u.parentId, list);
    }
    list.push(uId);
  }
  const allowed = new Set([rootUnitId]);
  const queue = [rootUnitId];
  while (queue.length > 0) {
    const curr = queue.shift();
    const children = childrenMap.get(curr) || [];
    for (const childId of children) {
      if (!allowed.has(childId)) {
        allowed.add(childId);
        queue.push(childId);
      }
    }
  }
  return allowed;
}

function assertUnitAccess(user, targetUnitId, year = '2026') {
  if (!user || user.role === 'admin') return;
  if (!user.unitKerjaId || !targetUnitId) {
    throw new Error('Forbidden: Anda tidak memiliki akses ke unit kerja ini.');
  }
  const allowed = getAllowedUnitKerjaIds(user.unitKerjaId, year);
  if (!allowed.has(targetUnitId)) {
    throw new Error('Forbidden: Anda hanya dapat mengelola data pada OPD Anda sendiri.');
  }
}

function assertJabatanAccess(user, jabatanId, year = '2026') {
  if (!user || user.role === 'admin') return;
  if (!jabatanId) throw new Error('Forbidden: ID Jabatan tidak valid.');
  const jab = getDbNode(`${year}/jabatan/${jabatanId}`);
  if (!jab) throw new Error('Jabatan tidak ditemukan.');
  assertUnitAccess(user, jab.unitKerjaId, year);
}

// ============================================================================
// IMPLEMENTASI SIANJAB CRUD & BULK ENGINE (O(1) INDEXED)
// ============================================================================
function anjabRowHasContent(row) {
  if (!row || typeof row !== 'object') return false;
  const meta = new Set(['jabatanId', 'parentId', 'id', 'createdAt', 'updatedAt']);
  const hasVal = (v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim() !== '' && v !== '-';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.values(v).some(hasVal);
    return true;
  };
  for (const [k, v] of Object.entries(row)) {
    if (meta.has(k)) continue;
    if (hasVal(v)) return true;
  }
  return false;
}

function getJabatanHierarchy(jabatanId, allJabatanMap) {
  const hierarchy = {
    jptUtama: '', jptMadya: '', jptPratama: '',
    administrator: '', pengawas: '', pelaksana: '',
    jabatanFungsional: ''
  };
  let currentId = jabatanId;
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const current = allJabatanMap ? allJabatanMap[currentId] : null;
    if (!current) break;
    const jenis = String(current.jenisJabatan || '').toLowerCase();
    const nama = current.namaJabatan || current.nama || '';
    if (jenis === 'jpt utama') hierarchy.jptUtama = nama;
    else if (jenis === 'jpt madya') hierarchy.jptMadya = nama;
    else if (jenis === 'jpt pratama' || jenis === 'jabatan pimpinan tinggi') hierarchy.jptPratama = nama;
    else if (jenis === 'administrator') hierarchy.administrator = nama;
    else if (jenis === 'pengawas') hierarchy.pengawas = nama;
    else if (jenis === 'pelaksana') hierarchy.pelaksana = nama;
    else if (jenis.startsWith('fungsional')) hierarchy.jabatanFungsional = nama;
    currentId = current.parentId || null;
  }
  return hierarchy;
}

function readAllRecords(entity, parentId = '', year = '2026') {
  const fbPath = getEntityFirebasePath(entity, year);
  const data = getDbNode(fbPath);
  if (!data || typeof data !== 'object') return [];

  // Fast-path O(1) menggunakan Secondary Index!
  if (parentId && CHILD_ENTITIES.includes(entity)) {
    return getChildRecordsByJabatan(year, entity, parentId);
  }
  if (parentId && entity === 'jabatan') {
    const uKey = makeUnitIdxKey(year, parentId);
    const jIds = idxJabatanByYearUnit.get(uKey);
    if (!jIds) return [];
    const res = [];
    for (const id of jIds) {
      if (data[id]) res.push({ ...data[id], id });
    }
    res.sort((a, b) => (Number(a.nomorUrut ?? a.urutan) || 0) - (Number(b.nomorUrut ?? b.urutan) || 0));
    return res;
  }

  let records = mapObjectWithIds(data);
  if (parentId) {
    records = records.filter((r) => String(r.jabatanId) === String(parentId) || String(r.unitKerjaId) === String(parentId));
  }
  records.sort((a, b) => {
    if (entity === 'security_logs') {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tB - tA;
    }
    return (Number(a.nomorUrut ?? a.urutan) || 0) - (Number(b.nomorUrut ?? b.urutan) || 0);
  });
  if (entity === 'security_logs' && records.length > 200) {
    records = records.slice(0, 200);
  }
  return records;
}

function createRecord(entity, payload, year = '2026') {
  const now = new Date().toISOString();
  const data = { ...(payload || {}), createdAt: now, updatedAt: now };

  let id = data.id;
  if (entity === 'unitKerja' && data.kode && String(data.kode).trim() !== '') {
    id = String(data.kode).trim().replace(/[^a-zA-Z0-9_]/g, '_');
  }
  if (!id) id = crypto.randomUUID();
  const record = { ...data, id };

  const fbPath = getEntityFirebasePath(entity, year);
  setDbNode(`${fbPath}/${id}`, record);

  if (!NON_YEARLY_ENTITIES.has(entity)) {
    if (entity === 'jabatan') indexAddJabatan(year, id, record);
    else if (CHILD_ENTITIES.includes(entity)) indexAddChildRecord(year, entity, id, record);
  }

  markDirtyPath(`${fbPath}/${id}`);
  scheduleSaveDb();
  return { id, data: record, ...record };
}

function updateRecord(entity, id, payload, year = '2026') {
  if (!id) throw new Error('ID is required for update');
  const fbPath = getEntityFirebasePath(entity, year);
  const existing = getDbNode(`${fbPath}/${id}`) || {};

  if (!NON_YEARLY_ENTITIES.has(entity)) {
    if (entity === 'jabatan') indexRemoveJabatan(year, id, existing);
    else if (CHILD_ENTITIES.includes(entity)) indexRemoveChildRecord(year, entity, id, existing);
  }

  const updated = { ...existing, ...(payload || {}), id, updatedAt: new Date().toISOString() };
  setDbNode(`${fbPath}/${id}`, updated);

  if (!NON_YEARLY_ENTITIES.has(entity)) {
    if (entity === 'jabatan') indexAddJabatan(year, id, updated);
    else if (CHILD_ENTITIES.includes(entity)) indexAddChildRecord(year, entity, id, updated);
  }

  markDirtyPath(`${fbPath}/${id}`);
  scheduleSaveDb();
  return updated;
}

function touchJabatanTimestamp(jabatanId, year = '2026') {
  if (!jabatanId) return;
  const jab = getDbNode(`${year}/jabatan/${jabatanId}`);
  if (jab && typeof jab === 'object') {
    jab.updatedAt = new Date().toISOString();
    markDirtyPath(`${year}/jabatan/${jabatanId}/updatedAt`);
  }
}

function deleteRecord(entity, id, year = '2026') {
  if (!id) throw new Error('ID is required for delete');
  const fbPath = getEntityFirebasePath(entity, year);
  const existing = getDbNode(`${fbPath}/${id}`);

  if (existing) {
    if (!NON_YEARLY_ENTITIES.has(entity)) {
      if (entity === 'jabatan') indexRemoveJabatan(year, id, existing);
      else if (CHILD_ENTITIES.includes(entity)) indexRemoveChildRecord(year, entity, id, existing);
    }
    setDbNode(`${fbPath}/${id}`, null);
    markDirtyPath(`${fbPath}/${id}`);
  }

  // Cascade delete O(1) jika menghapus jabatan
  if (entity === 'jabatan') {
    for (const childEnt of CHILD_ENTITIES) {
      const childIds = getChildRecordIdsByJabatan(year, childEnt, id);
      const childTable = getDbNode(`${year}/${childEnt}`);
      for (const cId of childIds) {
        const oldRec = childTable ? childTable[cId] : null;
        indexRemoveChildRecord(year, childEnt, cId, oldRec);
        setDbNode(`${year}/${childEnt}/${cId}`, null);
        markDirtyPath(`${year}/${childEnt}/${cId}`);
      }
    }
  }

  scheduleSaveDb();
  return { id, deleted: true };
}

function saveSingleEntity(entity, jabatanId, payload, year = '2026') {
  const fbPath = getEntityFirebasePath(entity, year);
  const table = getDbNode(fbPath) || {};
  const oldIds = getChildRecordIdsByJabatan(year, entity, jabatanId);

  if (!anjabRowHasContent(payload)) {
    for (const oldId of oldIds) {
      indexRemoveChildRecord(year, entity, oldId, table[oldId]);
      setDbNode(`${fbPath}/${oldId}`, null);
      markDirtyPath(`${fbPath}/${oldId}`);
    }
    scheduleSaveDb();
    return { deleted: true, jabatanId };
  }

  const existingId = oldIds[0] || (payload && payload.id) || crypto.randomUUID();
  for (let i = 1; i < oldIds.length; i++) {
    const dupId = oldIds[i];
    indexRemoveChildRecord(year, entity, dupId, table[dupId]);
    setDbNode(`${fbPath}/${dupId}`, null);
    markDirtyPath(`${fbPath}/${dupId}`);
  }

  const now = new Date().toISOString();
  const newItem = {
    ...(table[existingId] || {}),
    ...(payload || {}),
    id: existingId,
    jabatanId,
    updatedAt: now,
    createdAt: (table[existingId] && table[existingId].createdAt) || now
  };
  setDbNode(`${fbPath}/${existingId}`, newItem);
  indexAddChildRecord(year, entity, existingId, newItem);
  markDirtyPath(`${fbPath}/${existingId}`);
  touchJabatanTimestamp(jabatanId, year);
  scheduleSaveDb();
  return newItem;
}

function saveMultiEntity(entity, jabatanId, rows, year = '2026') {
  const fbPath = getEntityFirebasePath(entity, year);
  const table = getDbNode(fbPath) || {};
  const oldIds = getChildRecordIdsByJabatan(year, entity, jabatanId);

  for (const oldId of oldIds) {
    indexRemoveChildRecord(year, entity, oldId, table[oldId]);
    setDbNode(`${fbPath}/${oldId}`, null);
    markDirtyPath(`${fbPath}/${oldId}`);
  }

  const now = new Date().toISOString();
  const saved = [];
  (Array.isArray(rows) ? rows : []).forEach((item, index) => {
    const newId = `row_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const newItem = {
      ...item,
      id: newId,
      jabatanId,
      nomorUrut: item.nomorUrut ?? index + 1,
      urutan: item.urutan ?? index + 1,
      createdAt: now,
      updatedAt: now
    };
    setDbNode(`${fbPath}/${newId}`, newItem);
    indexAddChildRecord(year, entity, newId, newItem);
    markDirtyPath(`${fbPath}/${newId}`);
    saved.push(newItem);
  });

  touchJabatanTimestamp(jabatanId, year);
  scheduleSaveDb();
  return { success: true, count: saved.length, items: saved };
}

function saveBulkAnjabData(jabatanId, payload, year = '2026') {
  if (!jabatanId) throw new Error('jabatanId is required for saveBulkAnjabData');
  if (!payload || typeof payload !== 'object') return { success: false, error: 'Payload data kosong' };

  if (payload.jabatan) {
    const existingJab = getDbNode(`${year}/jabatan/${jabatanId}`) || {};
    indexRemoveJabatan(year, jabatanId, existingJab);
    const updatedJab = {
      ...existingJab,
      ...payload.jabatan,
      id: jabatanId,
      updatedAt: new Date().toISOString()
    };
    setDbNode(`${year}/jabatan/${jabatanId}`, updatedJab);
    indexAddJabatan(year, jabatanId, updatedJab);
    markDirtyPath(`${year}/jabatan/${jabatanId}`);
  } else {
    touchJabatanTimestamp(jabatanId, year);
  }

  for (const ent of MULTI_CHILD_ENTITIES) {
    if (payload[ent] !== undefined && Array.isArray(payload[ent])) {
      saveMultiEntity(ent, jabatanId, payload[ent], year);
    }
  }

  for (const ent of SINGLE_CHILD_ENTITIES) {
    if (payload[ent] !== undefined && payload[ent] !== null) {
      if (Array.isArray(payload[ent])) {
        saveMultiEntity(ent, jabatanId, payload[ent], year);
      } else {
        saveSingleEntity(ent, jabatanId, payload[ent], year);
      }
    }
  }

  scheduleSaveDb();
  return { success: true, saved: true, jabatanId };
}

function getJabatanFull(jabatanId, year = '2026') {
  const allJabatanMap = getDbNode(`${year}/jabatan`) || {};
  const rawJabatan = allJabatanMap[jabatanId];
  if (!rawJabatan) return null;

  const jabatan = { ...rawJabatan, id: jabatanId };
  const unitKerja = jabatan.unitKerjaId
    ? getDbNode(`${year}/unitKerja/${jabatan.unitKerjaId}`)
    : null;
  const parentJabatan = jabatan.parentId
    ? allJabatanMap[jabatan.parentId] || null
    : null;

  for (const ent of MULTI_CHILD_ENTITIES) {
    jabatan[ent] = getChildRecordsByJabatan(year, ent, jabatanId);
  }
  for (const ent of SINGLE_CHILD_ENTITIES) {
    const list = getChildRecordsByJabatan(year, ent, jabatanId);
    jabatan[ent] = list[0] || null;
  }
  const abkList = getChildRecordsByJabatan(year, 'abk', jabatanId);
  jabatan.abk = abkList[0] || getDbNode(`${year}/abk/${jabatanId}`) || null;
  jabatan.unitKerja = unitKerja;
  jabatan.parentJabatan = parentJabatan;
  jabatan.hierarchy = getJabatanHierarchy(jabatanId, allJabatanMap);

  return jabatan;
}

function getAnjabStatusSummary(year = '2026') {
  const abkData = getDbNode(`${year}/abk`) || {};
  const abkFilledSet = new Set();
  for (const [k, item] of Object.entries(abkData)) {
    if (!item || typeof item !== 'object') continue;
    const jId = item.jabatanId || k;
    if (jId) abkFilledSet.add(jId);
  }

  const anjabFilledSet = new Set();
  for (const ent of ['tugasPokok', 'syaratJabatan', 'kualifikasi', 'bahanKerja']) {
    const tbl = getDbNode(`${year}/${ent}`) || {};
    for (const row of Object.values(tbl)) {
      if (row && row.jabatanId && anjabRowHasContent(row)) {
        anjabFilledSet.add(row.jabatanId);
      }
    }
  }

  const anjabFilled = Array.from(anjabFilledSet);
  const abkFilled = Array.from(abkFilledSet);
  return {
    anjabFilled,
    abkFilled,
    // Alias untuk kompatibilitas mundur
    filledAnjabJabatanIds: anjabFilled,
    filledAbkJabatanIds: abkFilled
  };
}

function readMultipleEntities(entities, year = '2026', scopedUnitKerjaId = '') {
  const result = {};
  const allowedUnits = scopedUnitKerjaId ? getAllowedUnitKerjaIds(scopedUnitKerjaId, year) : null;
  let allowedJabatanIds = null;

  if (allowedUnits && allowedUnits.size > 0) {
    allowedJabatanIds = new Set();
    for (const uId of allowedUnits) {
      const set = idxJabatanByYearUnit.get(makeUnitIdxKey(year, uId));
      if (set) {
        for (const jId of set) allowedJabatanIds.add(jId);
      }
    }
  }

  for (const ent of entities) {
    if (!ALLOWED_ENTITIES.has(ent)) continue;
    if (allowedUnits && ent === 'jabatan') {
      const table = getDbNode(`${year}/jabatan`) || {};
      const arr = [];
      for (const jId of allowedJabatanIds) {
        if (table[jId]) arr.push({ ...table[jId], id: jId });
      }
      result[ent] = arr;
    } else if (allowedJabatanIds && CHILD_ENTITIES.includes(ent)) {
      const arr = [];
      for (const jId of allowedJabatanIds) {
        const items = getChildRecordsByJabatan(year, ent, jId);
        for (const it of items) arr.push(it);
      }
      result[ent] = arr;
    } else {
      const records = readAllRecords(ent, '', year);
      if (ent === 'users') {
        result[ent] = records.map(({ password, passwordHash, salt, ...safe }) => safe);
      } else {
        result[ent] = records;
      }
    }
  }
  return result;
}

function getBulkAnjabByUnit(unitKerjaId, year = '2026') {
  const allReqEntities = [
    'abk', 'tugasPokok', 'bahanKerja', 'perangkatKerja',
    'tanggungJawab', 'wewenang', 'korelasiJabatan',
    'kondisiLingkungan', 'risikoBahaya', 'syaratJabatan',
    'kualifikasi', 'prestasiKerja', 'hasilKerja'
  ];
  return readMultipleEntities(allReqEntities, year, unitKerjaId);
}

// Perhitungan Formasi ABK (Paritas SSOT dengan gas/Code.gs)
function calculateFormasiPembulatanServer(totalKebutuhan) {
  const val = Number(totalKebutuhan) || 0;
  if (val <= 0) return 0;
  if (val < 1.5) return 1;
  return Math.round(val);
}

function applyFormasiBatasServer(pembulatan, jenisJabatan) {
  const val = Number(pembulatan) || 0;
  const jenis = String(jenisJabatan || '').toLowerCase();
  const isStruktural =
    jenis.includes('pimpinan tinggi') ||
    jenis.includes('administrator') ||
    jenis.includes('pengawas') ||
    jenis.includes('struktural');
  const isPelaksana = jenis.includes('pelaksana');
  const isFungsional = jenis.includes('fungsional');
  if (isStruktural) return val > 0 ? 1 : 0;
  if ((isPelaksana || isFungsional) && val > 0 && val < 2) return 2;
  return val;
}

// ============================================================================
// HANDLER SELURUH ACTION SIANJAB API (100% KOMPATIBEL DENGAN gas/Code.gs)
// ============================================================================
// SEC-T7: rate-limit login in-memory — maks 5 gagal / 15 menit per username+IP socket.
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map();

function loginRateKey(username, clientIp) {
  const u = crypto.createHash('sha256').update(String(username || '').toLowerCase(), 'utf8').digest('hex');
  return `${u}|${clientIp || 'unknown'}`;
}

function checkLoginRateLimit(username, clientIp) {
  const key = loginRateKey(username, clientIp);
  const rec = loginFailures.get(key);
  if (!rec) return;
  if (Date.now() - rec.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return;
  }
  if (rec.count >= LOGIN_MAX_FAILS) {
    const err = new Error('Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit.');
    err.statusCode = 429;
    throw err;
  }
}

function recordLoginFailure(username, clientIp) {
  const key = loginRateKey(username, clientIp);
  const now = Date.now();
  const rec = loginFailures.get(key);
  if (!rec || now - rec.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstAt: now });
  } else {
    rec.count++;
  }
}

function clearLoginFailures(username, clientIp) {
  loginFailures.delete(loginRateKey(username, clientIp));
}

async function handleSianjabAction(action, params, body, clientIp) {
  const year = String(params.tahun || params.year || (body && (body.tahun || body.year)) || '2026').trim();
  const entity = params.entity || (body && body.entity) || '';
  const id = params.id || (body && body.id) || '';
  const parentId = params.parentId || (body && (body.parentId || body.jabatanId)) || '';
  const unitId = params.unitId || params.unitKerjaId || (body && body.unitKerjaId) || '';

  // 1. Public Actions
  if (action === 'ping') {
    return 'pong';
  }

  if (action === 'login') {
    const username = String((body && body.username) || '').trim();
    const password = String((body && body.password) || '');
    if (!username || !password) {
      throw new Error('Username dan password wajib diisi');
    }

    const usersObj = getDbNode('users') || {};
    let foundUserId = null;
    let user = null;
    for (const [uKey, uVal] of Object.entries(usersObj)) {
      if (uVal && String(uVal.username || '').toLowerCase() === username.toLowerCase()) {
        foundUserId = uKey;
        user = uVal;
        break;
      }
    }
    if (!user) throw new Error('Akun tidak ditemukan');

    // SEC-T7: rate-limit per username + IP socket
    checkLoginRateLimit(username, clientIp);

    if (user.isActive === false) {
      throw new Error('Akun ini telah dinonaktifkan. Silakan hubungi Administrator.');
    }

    // SEC-T7: hanya hash HMAC yang diterima — plaintext/sha lama ditolak keras.
    const storedPass = user.password || user.passwordHash || '';
    const saltedHmac = hashPasswordHmac(password, user.username);
    if (storedPass !== saltedHmac) {
      recordLoginFailure(username, clientIp);
      throw new Error('Username atau password salah');
    }
    clearLoginFailures(username, clientIp);

    const token = generateAuthToken(user.username);
    const safeUser = {
      id: user.id || foundUserId,
      username: user.username,
      namaLengkap: user.namaLengkap || user.nama || user.username,
      nama: user.nama || user.namaLengkap || user.username,
      email: user.email || '',
      sptAdminNama: user.sptAdminNama || '',
      sptAdminNip: user.sptAdminNip || '',
      role: user.role || 'operator',
      unitKerjaId: user.unitKerjaId || '',
      isActive: user.isActive !== false
    };

    return {
      token,
      user: safeUser,
      ...safeUser
    };
  }

  if (action === 'logout') {
    const token = (body && body.token) || params.token;
    if (token) {
      try {
        const decoded = Buffer.from(String(token), 'base64').toString('utf8');
        const parts = decoded.split(':');
        if (parts.length >= 4 && parts[2]) {
          const nonce = parts[2];
          setDbNode(`revokedTokens/${nonce}`, {
            revokedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString()
          });
          markDirtyPath(`revokedTokens/${nonce}`);
          scheduleSaveDb();
        }
      } catch {}
    }
    return { success: true, loggedOut: true };
  }

  if (action === 'checkVerificationCode') {
    const code = params.code || (body && body.code) || '';
    if (!code) return null;
    const safeKey = String(code).replace(/[^a-zA-Z0-9_-]/g, '_');
    return getDbNode(`verification_logs/${safeKey}`) || getDbNode(`verification_codes/${safeKey}`) || null;
  }

  if (action === 'getDashboardStats') {
    const bulk = readMultipleEntities(
      ['unitKerja', 'jabatan', 'abk', 'tugasPokok', 'syaratJabatan', 'kualifikasi', 'bahanKerja'],
      year
    );
    const unitKerjas = bulk.unitKerja || [];
    const jabatans = bulk.jabatan || [];
    const abks = bulk.abk || [];
    const tugasPokoks = bulk.tugasPokok || [];
    const syaratList = bulk.syaratJabatan || [];
    const kualifikasiList = bulk.kualifikasi || [];
    const bahanList = bulk.bahanKerja || [];

    const mainOpds = unitKerjas.filter((o) => !o.parentId);
    const subOpds = unitKerjas.filter((o) => o.parentId);

    let jpt = 0, admin = 0, pengawas = 0, pelaksana = 0, fungsional = 0;
    jabatans.forEach((jbt) => {
      const jenis = String(jbt.jenisJabatan || '').trim();
      if (jenis === 'Jabatan Pimpinan Tinggi') jpt++;
      else if (jenis === 'Administrator') admin++;
      else if (jenis === 'Pengawas') pengawas++;
      else if (jenis === 'Pelaksana') pelaksana++;
      else if (jenis.startsWith('Fungsional')) fungsional++;
    });

    const filledSet = new Set();
    tugasPokoks.forEach((tp) => { if (tp.jabatanId) filledSet.add(tp.jabatanId); });
    syaratList.forEach((s) => { if (s.jabatanId) filledSet.add(s.jabatanId); });
    kualifikasiList.forEach((k) => { if (k.jabatanId) filledSet.add(k.jabatanId); });
    bahanList.forEach((b) => { if (b.jabatanId) filledSet.add(b.jabatanId); });

    const anjabSelesai = jabatans.filter((jbt) => {
      const hasIkhtisar = jbt.ikhtisarJabatan && String(jbt.ikhtisarJabatan).trim().length > 5;
      return hasIkhtisar || filledSet.has(jbt.id);
    }).length;

    const abkFilledSet = new Set();
    abks.forEach((a) => {
      const jId = a.jabatanId || a.id;
      if (jId) abkFilledSet.add(jId);
    });

    return {
      totalOpdMain: mainOpds.length,
      totalOpdSub: subOpds.length,
      totalOpd: mainOpds.length,
      totalUnitKerja: unitKerjas.length,
      totalJabatan: jabatans.length,
      totalJPT: jpt,
      totalAdministrator: admin,
      totalPengawas: pengawas,
      totalPelaksana: pelaksana,
      totalFungsional: fungsional,
      opdDisetujui: unitKerjas.filter((o) => o.statusValidasi === 'Disetujui').length,
      opdDiajukan: unitKerjas.filter((o) => o.statusValidasi === 'Diajukan').length,
      opdRevisi: unitKerjas.filter((o) => o.statusValidasi === 'Revisi').length,
      opdDraft: unitKerjas.filter((o) => !o.statusValidasi || o.statusValidasi === 'Draft').length,
      anjabSelesai,
      abkSelesai: abkFilledSet.size,
      anjabComplete: anjabSelesai,
      abkComplete: abkFilledSet.size
    };
  }

  // getBulkData dapat dipanggil publik hanya untuk ['unitKerja', 'jabatan', 'abk']
  const token = (body && body.token) || params.token;
  let currentUser = null;
  if (token) {
    try {
      currentUser = getAuthenticatedUser(token);
    } catch (e) {
      if (action !== 'getBulkData') throw e;
    }
  } else if (action !== 'getBulkData' && action !== 'autoRegisterOperator') {
    throw new Error('Token tidak valid atau sudah kadaluarsa. Silakan login ulang.');
  }

  switch (action) {
    case 'getBulkData': {
      const bulkEntities = String(params.entities || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!currentUser) {
        const allowedPublic = new Set(['unitKerja', 'jabatan', 'abk']);
        for (const ent of bulkEntities) {
          if (!allowedPublic.has(ent)) {
            throw new Error('Akses ditolak: Memerlukan login untuk melihat entitas ' + ent);
          }
        }
      } else if (currentUser.role !== 'admin') {
        for (const ent of bulkEntities) {
          if (['users', 'security_logs', 'verification_logs'].includes(ent)) {
            throw new Error('Akses ditolak: Data ' + ent + ' hanya dapat dilihat oleh Administrator.');
          }
        }
      }
      return readMultipleEntities(bulkEntities, year, unitId);
    }

    case 'read': {
      if (['users', 'security_logs', 'verification_logs'].includes(entity) && currentUser.role !== 'admin') {
        throw new Error('Akses ditolak: Data ' + entity + ' hanya dapat dilihat oleh Administrator.');
      }
      const fbPath = getEntityFirebasePath(entity, year);
      const rec = getDbNode(`${fbPath}/${id}`);
      if (!rec) return null;
      const copy = { ...rec, id };
      if (entity === 'users') {
        delete copy.password;
        delete copy.passwordHash;
        delete copy.salt;
      }
      return copy;
    }

    case 'readAll': {
      if (['users', 'security_logs', 'verification_logs'].includes(entity) && currentUser.role !== 'admin') {
        throw new Error('Akses ditolak: Data ' + entity + ' hanya dapat dilihat oleh Administrator.');
      }
      // SEC-T6: scoping baca — operator tidak boleh membaca baris OPD lain.
      if (currentUser.role !== 'admin') {
        if (CHILD_ENTITIES.includes(entity) && parentId) {
          assertJabatanAccess(currentUser, parentId, year);
        } else if (entity === 'jabatan' && parentId) {
          assertUnitAccess(currentUser, parentId, year);
        }
      }
      const filterId = parentId || params.filterValue || '';
      const list = readAllRecords(entity, filterId, year);
      if (entity === 'users') {
        return list.map(({ password, passwordHash, salt, ...safe }) => safe);
      }
      return list;
    }

    case 'create': {
      const payloadData = (body && body.data !== undefined && body.entity) ? body.data : body;
      if (['users', 'settings'].includes(entity) && currentUser.role !== 'admin') {
        throw new Error('Forbidden: Hanya admin yang dapat menambah data ' + entity);
      }
      if (entity === 'jabatan' && currentUser.role !== 'admin') {
        assertUnitAccess(currentUser, (payloadData || {}).unitKerjaId, year);
      } else if (CHILD_ENTITIES.includes(entity) && currentUser.role !== 'admin') {
        assertJabatanAccess(currentUser, (payloadData || {}).jabatanId, year);
      }
      return createRecord(entity, payloadData || {}, year);
    }

    case 'update': {
      const payloadData = (body && body.data !== undefined && body.entity) ? body.data : body;
      if (['users', 'settings'].includes(entity) && currentUser.role !== 'admin') {
        throw new Error('Forbidden: Hanya admin yang dapat mengubah data ' + entity);
      }
      if (entity === 'unitKerja' && currentUser.role !== 'admin') {
        assertUnitAccess(currentUser, id, year);
      } else if (entity === 'jabatan' && currentUser.role !== 'admin') {
        assertJabatanAccess(currentUser, id, year);
      } else if (CHILD_ENTITIES.includes(entity) && currentUser.role !== 'admin') {
        // SEC-T9: pakai jabatanId record lama bila payload tidak menyertakannya.
        const existingChild = getDbNode(`${getEntityFirebasePath(entity, year)}/${id}`);
        const targetJabatanId = (payloadData || {}).jabatanId || (existingChild && existingChild.jabatanId);
        assertJabatanAccess(currentUser, targetJabatanId, year);
      }
      return updateRecord(entity, id, payloadData || {}, year);
    }

    case 'delete': {
      if (['users', 'settings', 'unitKerja'].includes(entity) && currentUser.role !== 'admin') {
        throw new Error('Forbidden: Hanya admin yang dapat menghapus data ' + entity);
      }
      if (entity === 'jabatan' && currentUser.role !== 'admin') {
        assertJabatanAccess(currentUser, id, year);
      } else if (CHILD_ENTITIES.includes(entity) && currentUser.role !== 'admin') {
        // SEC-T9: otorisasi baris anak saat delete.
        const existingChild = getDbNode(`${getEntityFirebasePath(entity, year)}/${id}`);
        assertJabatanAccess(currentUser, existingChild && existingChild.jabatanId, year);
      }
      return deleteRecord(entity, id, year);
    }

    case 'getJabatanFull':
      if (currentUser.role !== 'admin') assertJabatanAccess(currentUser, id, year);
      return getJabatanFull(id, year);

    case 'getJabatanByUnit':
      // SEC-T6: operator hanya boleh membaca jabatan pada OPD-nya.
      if (currentUser.role !== 'admin') assertUnitAccess(currentUser, unitId, year);
      return readAllRecords('jabatan', unitId, year);

    case 'getUnitKerja':
      return readAllRecords('unitKerja', '', year);

    case 'getHierarchy': {
      if (currentUser.role !== 'admin') assertJabatanAccess(currentUser, id, year);
      const allJabatanMap = getDbNode(`${year}/jabatan`) || {};
      return getJabatanHierarchy(id, allJabatanMap);
    }

    case 'getAnjabStatusSummary':
      return getAnjabStatusSummary(year);

    case 'getBulkAnjabByUnit':
      // SEC-T6: operator wajib menyertakan unitId dan hanya OPD-nya sendiri.
      if (currentUser.role !== 'admin') {
        if (!unitId) throw new Error('Akses ditolak: unitKerjaId wajib disertakan.');
        assertUnitAccess(currentUser, unitId, year);
      }
      return getBulkAnjabByUnit(unitId, year);

    case 'saveSingleEntity': {
      const payloadData = (body && body.data !== undefined && body.entity) ? body.data : body;
      if (currentUser.role !== 'admin') assertJabatanAccess(currentUser, parentId, year);
      return saveSingleEntity(entity, parentId, payloadData || {}, year);
    }

    case 'saveMultiEntity': {
      const rows = Array.isArray(body) ? body : (body && Array.isArray(body.items) ? body.items : []);
      if (currentUser.role !== 'admin') assertJabatanAccess(currentUser, parentId, year);
      return saveMultiEntity(entity, parentId, rows, year);
    }

    case 'saveBulkAnjabData': {
      const bulkPayload = (body && body.payload) ? body.payload : body;
      if (currentUser.role !== 'admin') assertJabatanAccess(currentUser, parentId, year);
      return saveBulkAnjabData(parentId, bulkPayload || {}, year);
    }

    case 'updateUrutanBatch': {
      const updates = Array.isArray(body) ? body : (body && Array.isArray(body.items) ? body.items : []);
      const fbPath = getEntityFirebasePath(entity, year);
      const now = new Date().toISOString();
      let updatedCount = 0;
      for (const item of updates) {
        if (!item || !item.id || typeof item.urutan !== 'number') continue;
        const rec = getDbNode(`${fbPath}/${item.id}`);
        if (rec) {
          rec.urutan = item.urutan;
          rec.updatedAt = now;
          markDirtyPath(`${fbPath}/${item.id}/urutan`);
          markDirtyPath(`${fbPath}/${item.id}/updatedAt`);
          updatedCount++;
        }
      }
      scheduleSaveDb();
      return { success: true, count: updatedCount };
    }

    case 'saveABK': {
      if (currentUser.role !== 'admin') assertJabatanAccess(currentUser, parentId, year);
      const abkPayload = (body && body.data && !Array.isArray(body.rows)) ? { ...body.data } : { ...(body || {}) };
      abkPayload.jabatanId = parentId;
      abkPayload.updatedAt = new Date().toISOString();

      const WKE_FIX_JAM = 1250;
      const rows = Array.isArray(abkPayload.rows) ? abkPayload.rows : [];
      let totalWaktuEfektif = 0;
      const isLegacyMenit = String(abkPayload.waktuSatuan) === 'menit';
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        let waktuR = Number(r.waktu) || 0;
        if (isLegacyMenit && waktuR > 0) {
          waktuR = Math.round((waktuR / 60) * 10000) / 10000;
          rows[i].waktu = waktuR;
        }
        totalWaktuEfektif += waktuR * (Number(r.volume) || 0);
      }
      abkPayload.waktuSatuan = 'jam';
      const kebutuhan = totalWaktuEfektif / WKE_FIX_JAM;
      const jbt = getDbNode(`${year}/jabatan/${parentId}`);
      const jenis = (jbt && jbt.jenisJabatan) ? jbt.jenisJabatan : '';

      abkPayload.totalWaktuEfektif = totalWaktuEfektif;
      abkPayload.totalKebutuhan = kebutuhan;
      abkPayload.formasiPembulatan = applyFormasiBatasServer(
        calculateFormasiPembulatanServer(kebutuhan),
        jenis
      );

      setDbNode(`${year}/abk/${parentId}`, abkPayload);
      indexAddChildRecord(year, 'abk', parentId, abkPayload);
      markDirtyPath(`${year}/abk/${parentId}`);
      touchJabatanTimestamp(parentId, year);
      scheduleSaveDb();
      return { jabatanId: parentId, saved: true };
    }

    case 'getABK': {
      if (currentUser.role !== 'admin') assertJabatanAccess(currentUser, parentId, year);
      const direct = getDbNode(`${year}/abk/${parentId}`);
      if (direct) return { ...direct, jabatanId: parentId };
      const byIdx = getChildRecordsByJabatan(year, 'abk', parentId);
      return byIdx[0] || null;
    }

    case 'saveTemplate': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      const docObj = {
        ...(body || {}),
        updatedAt: new Date().toISOString()
      };
      setDbNode('template_docx', docObj);
      if (db.settings && db.settings.templateDocx) {
        delete db.settings.templateDocx;
        markDirtyPath('settings/templateDocx');
      }
      markDirtyPath('template_docx');
      scheduleSaveDb();
      return docObj;
    }

    case 'getTemplate':
      return getDbNode('template_docx') || getDbNode('settings/templateDocx') || null;

    case 'saveTagMappings': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      setDbNode('settings/tagMappings', body);
      markDirtyPath('settings/tagMappings');
      scheduleSaveDb();
      return body;
    }

    case 'getTagMappings':
      return getDbNode('settings/tagMappings') || null;

    case 'saveDeadline': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      setDbNode('settings/deadline', body);
      markDirtyPath('settings/deadline');
      scheduleSaveDb();
      return body;
    }

    case 'getDeadline':
      return getDbNode('settings/deadline') || null;

    case 'registerVerificationCode': {
      if (!body || !body.code) throw new Error('Verification record invalid');
      const safeKey = String(body.code).replace(/[^a-zA-Z0-9_-]/g, '_');
      setDbNode(`verification_logs/${safeKey}`, body);
      markDirtyPath(`verification_logs/${safeKey}`);
      scheduleSaveDb();
      return { success: true, code: body.code };
    }

    case 'createBatchJabatans': {
      const items = (body && Array.isArray(body.items)) ? body.items : (Array.isArray(body) ? body : []);
      if (currentUser.role !== 'admin') {
        for (const it of items) assertUnitAccess(currentUser, it.unitKerjaId, year);
      }
      const createdItems = [];
      const now = new Date().toISOString();
      for (const data of items) {
        const newId = crypto.randomUUID();
        const rec = { ...data, id: newId, createdAt: now, updatedAt: now };
        setDbNode(`${year}/jabatan/${newId}`, rec);
        indexAddJabatan(year, newId, rec);
        markDirtyPath(`${year}/jabatan/${newId}`);
        createdItems.push(rec);
      }
      scheduleSaveDb();
      return { success: true, count: createdItems.length, items: createdItems };
    }

    case 'createBatchReferensi': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden: Hanya admin yang dapat mengimpor referensi jabatan.');
      const items = (body && Array.isArray(body.items)) ? body.items : (Array.isArray(body) ? body : []);
      const createdItems = [];
      const now = new Date().toISOString();
      for (const data of items) {
        const newId = data.id || crypto.randomUUID();
        const rec = { ...data, id: newId, createdAt: now, updatedAt: now };
        setDbNode(`referensiJabatan/${newId}`, rec);
        markDirtyPath(`referensiJabatan/${newId}`);
        createdItems.push(rec);
      }
      scheduleSaveDb();
      return { success: true, createdCount: createdItems.length, count: createdItems.length, items: createdItems };
    }

    case 'restoreBatchJabatans': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      const items = Array.isArray(body) ? body : (body && Array.isArray(body.items) ? body.items : []);
      for (const it of items) {
        const jId = it.id || crypto.randomUUID();
        const rec = { ...it, id: jId, updatedAt: new Date().toISOString() };
        setDbNode(`${year}/jabatan/${jId}`, rec);
        indexAddJabatan(year, jId, rec);
        markDirtyPath(`${year}/jabatan/${jId}`);
      }
      scheduleSaveDb();
      return { success: true, count: items.length };
    }

    case 'restoreBatchEntities': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      const items = Array.isArray(body) ? body : (body && Array.isArray(body.items) ? body.items : []);
      const fbPath = getEntityFirebasePath(entity, year);
      for (const it of items) {
        const rId = it.id || crypto.randomUUID();
        const rec = { ...it, id: rId, updatedAt: new Date().toISOString() };
        setDbNode(`${fbPath}/${rId}`, rec);
        if (CHILD_ENTITIES.includes(entity)) indexAddChildRecord(year, entity, rId, rec);
        markDirtyPath(`${fbPath}/${rId}`);
      }
      scheduleSaveDb();
      return { success: true, count: items.length };
    }

    case 'createUser': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      const uData = (body && body.data && body.entity) ? body.data : (body || {});
      if (!uData.username || !uData.password || !uData.role) {
        throw new Error('Username, password, dan role wajib diisi');
      }
      const existingUsers = mapObjectWithIds(db.users);
      if (existingUsers.some((u) => u.username === uData.username)) {
        throw new Error('Username sudah digunakan');
      }
      const newId = uData.id || crypto.randomUUID();
      const newUser = {
        id: newId,
        username: uData.username,
        password: hashPasswordHmac(uData.password, uData.username),
        namaLengkap: uData.namaLengkap || uData.nama || '',
        email: uData.email || '',
        sptAdminNama: uData.sptAdminNama || '',
        sptAdminNip: uData.sptAdminNip || '',
        role: uData.role,
        unitKerjaId: uData.unitKerjaId || '',
        isActive: uData.isActive !== undefined ? uData.isActive : true,
        createdAt: new Date().toISOString()
      };
      setDbNode(`users/${newId}`, newUser);
      markDirtyPath(`users/${newId}`);
      scheduleSaveDb();
      const { password, ...safe } = newUser;
      return safe;
    }

    case 'updateUser': {
      if (currentUser.role !== 'admin' && currentUser.id !== id) throw new Error('Forbidden');
      const existing = getDbNode(`users/${id}`);
      if (!existing) throw new Error('User tidak ditemukan');
      const uData = { ...((body && body.data && body.entity) ? body.data : (body || {})) };
      // SEC-T5: self-update non-admin hanya boleh mengubah field aman.
      if (currentUser.role !== 'admin') {
        for (const k of Object.keys(uData)) {
          if (!SELF_UPDATE_ALLOWED_FIELDS.includes(k)) delete uData[k];
        }
      }
      if (uData.password) {
        uData.password = hashPasswordHmac(uData.password, existing.username);
      }
      uData.updatedAt = new Date().toISOString();
      const updated = { ...existing, ...uData, id };
      setDbNode(`users/${id}`, updated);
      markDirtyPath(`users/${id}`);
      scheduleSaveDb();
      const { password, passwordHash, salt, ...safe } = updated;
      return safe;
    }

    case 'cloneYearData': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      const fromYear = params.fromYear || (body && (body.fromYear || body.sourceYear));
      const toYear = params.toYear || (body && (body.toYear || body.targetYear));
      if (!fromYear || !toYear) throw new Error('Tahun sumber dan tahun sasaran wajib diisi.');
      const srcNode = getDbNode(String(fromYear));
      if (!srcNode) throw new Error(`Data tahun sumber (${fromYear}) tidak ditemukan atau kosong.`);
      const cloned = JSON.parse(JSON.stringify(srcNode));
      if (cloned.unitKerja) {
        Object.keys(cloned.unitKerja).forEach((k) => {
          if (cloned.unitKerja[k]) {
            cloned.unitKerja[k].tahun = toYear;
            cloned.unitKerja[k].statusValidasi = 'Draft';
            delete cloned.unitKerja[k].catatanRevisi;
            delete cloned.unitKerja[k].historyValidasi;
            cloned.unitKerja[k].updatedAt = new Date().toISOString();
          }
        });
      }
      if (cloned.jabatan) {
        Object.keys(cloned.jabatan).forEach((k) => {
          if (cloned.jabatan[k]) {
            cloned.jabatan[k].tahun = toYear;
            cloned.jabatan[k].updatedAt = new Date().toISOString();
          }
        });
      }
      setDbNode(String(toYear), cloned);
      rebuildAllIndexes();
      markDirtyPath(String(toYear));
      scheduleSaveDb();
      return {
        success: true,
        cloned: true,
        message: `Kloning data dari tahun ${fromYear} ke tahun ${toYear} berhasil dilakukan.`
      };
    }

    case 'deleteYearData': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      const targetYear = params.tahun || (body && body.targetYear);
      if (!targetYear || !/^\d{4}$/.test(String(targetYear))) {
        throw new Error('Tahun yang akan dihapus tidak valid.');
      }
      setDbNode(String(targetYear), null);
      rebuildAllIndexes();
      markDirtyPath(String(targetYear));
      scheduleSaveDb();
      return {
        success: true,
        deleted: true,
        message: `Seluruh data tahun ${targetYear} berhasil dihapus bersih dari database.`
      };
    }

    case 'cleanupOrphanedRecords': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      const jabatans = getDbNode(`${year}/jabatan`) || {};
      const validJabatanIds = new Set(Object.keys(jabatans));
      let deletedCount = 0;
      for (const ent of CHILD_ENTITIES) {
        const table = getDbNode(`${year}/${ent}`) || {};
        for (const [recId, rec] of Object.entries(table)) {
          const jId = rec ? (rec.jabatanId || rec.parentId) : null;
          if (jId && !validJabatanIds.has(jId)) {
            indexRemoveChildRecord(year, ent, recId, rec);
            setDbNode(`${year}/${ent}/${recId}`, null);
            markDirtyPath(`${year}/${ent}/${recId}`);
            deletedCount++;
          }
        }
      }
      scheduleSaveDb();
      return { success: true, deletedOrphans: deletedCount };
    }

    case 'exportFullDatabase': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      const copy = JSON.parse(JSON.stringify(db));
      if (copy.users && typeof copy.users === 'object') {
        for (const u of Object.values(copy.users)) {
          if (u && u.password) {
            delete u.password;
            u._hasPassword = true;
          }
        }
      }
      return {
        app: 'SIANJAB_ABK',
        version: '1.0',
        timestamp: new Date().toISOString(),
        exportedAt: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        sanitized: true,
        data: copy
      };
    }

    case 'restoreFullDatabase': {
      if (currentUser.role !== 'admin') throw new Error('Forbidden');
      const rawPayload = (body && body.data) ? body.data : body;
      const restoredData = (rawPayload && rawPayload.data && typeof rawPayload.data === 'object')
        ? rawPayload.data
        : rawPayload;
      if (!restoredData || typeof restoredData !== 'object') {
        throw new Error('Payload backup tidak valid.');
      }
      // Preservasi password user lama
      const existingUsers = db.users || {};
      if (restoredData.users && typeof restoredData.users === 'object') {
        for (const [uId, rUser] of Object.entries(restoredData.users)) {
          if (rUser && !rUser.password && existingUsers[uId] && existingUsers[uId].password) {
            rUser.password = existingUsers[uId].password;
          }
          if (rUser) delete rUser._hasPassword;
        }
      }
      db = restoredData;
      normalizeTemplateSeparation();
      rebuildAllIndexes();
      const saved = saveDbNow();
      if (!saved.ok) throw new Error(saved.error);
      markDirtyPath('__ROOT__');
      return {
        success: true,
        message: `Database berhasil dipulihkan (${Object.keys(db).length} node utama ter-update)`,
        restoredKeysCount: Object.keys(db).length
      };
    }

    case 'generateAnjabWithAI':
    case 'testAiConnection':
    case 'exportForSitpp':
    case 'checkSptOpd':
    case 'duplicateUnitKerja':
    case 'migrateRootTo2026': {
      if (['exportForSitpp', 'duplicateUnitKerja', 'migrateRootTo2026'].includes(action) && dirtyPaths.size > 0) {
        await flushOutboxToRtdb();
      }
      const gasUrl = new URL(GAS_DEPLOYMENT_URL);
      for (const [k, v] of Object.entries(params)) {
        gasUrl.searchParams.set(k, v);
      }
      const gasRes = await httpRequestJson(
        gasUrl.toString(),
        body && Object.keys(body).length > 0 ? 'POST' : 'GET',
        body && Object.keys(body).length > 0 ? body : undefined,
        150000
      );
      if (gasRes && gasRes.success === false) {
        throw new Error(gasRes.error || 'GAS Error');
      }
      if (['duplicateUnitKerja', 'migrateRootTo2026'].includes(action)) {
        await pullAllFromRtdb();
      }
      return gasRes && gasRes.data !== undefined ? gasRes.data : gasRes;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ============================================================================
// MONITORING SSE & LOG AKTIVITAS
// ============================================================================
function recordActivity(type, action, target, bytes) {
  const now = new Date();
  const entry = {
    time: now.toISOString(),
    timeWib: now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) + ' WIB',
    type,
    action,
    target,
    bytes
  };
  recentActivities.unshift(entry);
  if (recentActivities.length > MAX_RECENT_ACTIVITIES) {
    recentActivities.pop();
  }
  const msg = `data: ${JSON.stringify({ event: 'activity', entry, summary: getMonitorSummary() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

function getMonitorSummary() {
  const years = Object.keys(db).filter((k) => /^\d{4}$/.test(k)).sort();
  const latestYear = years[years.length - 1] || '2026';
  const yearNode = db[latestYear] || {};
  const unitCount = yearNode.unitKerja ? Object.keys(yearNode.unitKerja).length : 0;
  const jabatanCount = yearNode.jabatan ? Object.keys(yearNode.jabatan).length : 0;
  const tpCount = yearNode.tugasPokok ? Object.keys(yearNode.tugasPokok).length : 0;
  const abkCount = yearNode.abk ? Object.keys(yearNode.abk).length : 0;

  return {
    status: serverState.storageError ? 'degraded' : 'ok',
    mode: serverState.mode,
    activeYearPreview: latestYear,
    yearsAvailable: years,
    counts: {
      unitKerja: unitCount,
      jabatan: jabatanCount,
      tugasPokok: tpCount,
      abk: abkCount,
      users: db.users ? Object.keys(db.users).length : 0
    },
    outbox: {
      dirtyCount: dirtyPaths.size,
      dirtySample: Array.from(dirtyPaths).slice(0, 15),
      isFlushing: isFlushingOutbox,
      writeBehindIntervalMs: WRITE_BEHIND_INTERVAL_MS
    },
    sync: {
      lastPullFromRtdbAt: serverState.lastPullFromRtdbAt,
      lastFlushToRtdbAt: serverState.lastFlushToRtdbAt,
      lastFlushResult: serverState.lastFlushResult,
      totalFlushedPaths: serverState.totalFlushedPaths || 0,
      storageError: serverState.storageError
    },
    traffic: {
      uptimeSec: Math.floor((Date.now() - stats.startedAt) / 1000),
      totalRequests: stats.totalRequests,
      totalReads: stats.totalReads,
      totalWrites: stats.totalWrites,
      bytesIn: stats.bytesIn,
      bytesOut: stats.bytesOut,
      rtdbBytesSavedEstimate: stats.rtdbBytesSavedEstimate
    }
  };
}

// ============================================================================
// DASHBOARD HTML LIVE MONITOR (GET / & GET /monitor)
// ============================================================================
function renderMonitorHtml() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SIANJAB Homeserver DB — Live Monitor</title>
  <style>
    :root {
      --bg: #0b1120;
      --card: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --blue: #3b82f6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 24px;
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg); color: var(--text);
    }
    .container { max-width: 1180px; margin: 0 auto; }
    .header {
      display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center;
      gap: 16px; padding-bottom: 18px; border-bottom: 1px solid var(--border); margin-bottom: 22px;
    }
    .badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 13px;
      background: rgba(16,185,129,0.15); color: var(--emerald); border: 1px solid rgba(16,185,129,0.4);
    }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 20px;
    }
    .card {
      background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px;
    }
    .card h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .val { font-size: 26px; font-weight: 800; margin: 4px 0; }
    .sub { font-size: 12px; color: var(--muted); }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; align-items: center; }
    input[type="password"] {
      background: #0f172a; border: 1px solid var(--border); color: var(--text);
      padding: 9px 12px; border-radius: 8px; font-size: 13px;
    }
    button {
      cursor: pointer; border: none; border-radius: 8px; padding: 9px 15px;
      font-weight: 600; font-size: 13px; color: #fff; transition: opacity 0.15s;
    }
    button:hover { opacity: 0.9; }
    .btn-blue { background: var(--blue); }
    .btn-emerald { background: var(--emerald); }
    .btn-amber { background: var(--amber); color: #111827; }
    .btn-rose { background: var(--rose); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-weight: 600; }
    code { color: #93c5fd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 style="margin:0;font-size:22px;">SIANJAB Homeserver Docker Database</h1>
        <div class="sub" style="margin-top:4px;">In-Memory O(1) Engine + Write-Behind Firebase RTDB Sync (Port ${PORT})</div>
      </div>
      <div id="modeBadge" class="badge">MODE: HOMESERVER</div>
    </div>

    <div class="actions card">
      <input type="password" id="secretInput" placeholder="Homeserver Secret" style="min-width:280px;" />
      <button class="btn-blue" onclick="triggerAction('/_homeserver/pull-from-rtdb')">1. Tarik Data dari RTDB (Seed)</button>
      <button class="btn-emerald" onclick="triggerAction('/_homeserver/flush-to-rtdb')">2. Flush Outbox ke RTDB Sekarang</button>
      <button class="btn-amber" onclick="switchMode('HOMESERVER')">Aktifkan Mode HOMESERVER</button>
      <button class="btn-rose" onclick="switchMode('RTDB')">Safe Switch ke Mode RTDB</button>
      <span id="actionStatus" class="sub" style="margin-left:8px;"></span>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Data di RAM (<span id="yearLabel">2026</span>)</h3>
        <div class="val" id="jabatanVal">0 Jabatan</div>
        <div class="sub" id="unitVal">0 Unit Kerja | 0 Tugas Pokok | 0 ABK</div>
      </div>
      <div class="card">
        <h3>Antrean Outbox (Write-Behind)</h3>
        <div class="val" id="outboxVal">0 Path</div>
        <div class="sub" id="syncVal">Flush Terakhir: -</div>
      </div>
      <div class="card">
        <h3>Trafik Homeserver</h3>
        <div class="val" id="reqVal">0 Request</div>
        <div class="sub" id="rwVal">Baca: 0 | Tulis: 0</div>
      </div>
      <div class="card">
        <h3>Kuota RTDB Dihemat</h3>
        <div class="val" style="color:var(--emerald);" id="savedVal">0 MB</div>
        <div class="sub" id="ioVal">Out: 0 MB | In: 0 MB</div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;">Log Aktivitas Real-Time (SSE)</h3>
      <table>
        <thead>
          <tr><th>Waktu</th><th>Tipe</th><th>Action</th><th>Target</th><th>Ukuran</th></tr>
        </thead>
        <tbody id="logBody"></tbody>
      </table>
    </div>
  </div>

  <script>
    function fmtBytes(b) {
      if (!b) return '0 B';
      if (b < 1024) return b + ' B';
      if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1048576).toFixed(2) + ' MB';
    }
    function renderSummary(s) {
      if (!s) return;
      document.getElementById('modeBadge').textContent = 'MODE: ' + s.mode;
      document.getElementById('yearLabel').textContent = s.activeYearPreview;
      document.getElementById('jabatanVal').textContent = (s.counts.jabatan || 0).toLocaleString('id-ID') + ' Jabatan';
      document.getElementById('unitVal').textContent =
        (s.counts.unitKerja || 0) + ' Unit | ' + (s.counts.tugasPokok || 0) + ' Tugas Pokok | ' + (s.counts.abk || 0) + ' ABK';
      document.getElementById('outboxVal').textContent = (s.outbox.dirtyCount || 0) + ' Path Pending';
      document.getElementById('syncVal').textContent = 'Flush: ' + (s.sync.lastFlushResult || 'Belum pernah');
      document.getElementById('reqVal').textContent = (s.traffic.totalRequests || 0).toLocaleString('id-ID') + ' Req';
      document.getElementById('rwVal').textContent = 'Baca: ' + s.traffic.totalReads + ' | Tulis: ' + s.traffic.totalWrites;
      document.getElementById('savedVal').textContent = fmtBytes(s.traffic.rtdbBytesSavedEstimate || 0);
      document.getElementById('ioVal').textContent = 'Out: ' + fmtBytes(s.traffic.bytesOut) + ' | In: ' + fmtBytes(s.traffic.bytesIn);
    }
    function prependRow(e) {
      const tb = document.getElementById('logBody');
      const tr = document.createElement('tr');
      let timeStr = e.timeWib;
      if (!timeStr) {
        try {
          const d = new Date(e.time);
          timeStr = d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) + ' WIB';
        } catch {
          timeStr = (e.time || '').split('T')[1]?.slice(0,8) || e.time;
        }
      }
      tr.innerHTML = '<td>' + timeStr + '</td><td><b>' + e.type + '</b></td><td><code>' + e.action + '</code></td><td>' + e.target + '</td><td>' + fmtBytes(e.bytes) + '</td>';
      tb.insertBefore(tr, tb.firstChild);
      while (tb.children.length > 40) tb.removeChild(tb.lastChild);
    }
    async function loadInitial() {
      const res = await fetch('/_homeserver/status');
      const data = await res.json();
      renderSummary(data);
      const actRes = await fetch('/_homeserver/activity');
      const actData = await actRes.json();
      (actData.activities || []).slice().reverse().forEach(prependRow);
    }
    async function triggerAction(path) {
      const secret = document.getElementById('secretInput').value;
      const st = document.getElementById('actionStatus');
      st.textContent = 'Memproses...';
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-homeserver-secret': secret },
          body: JSON.stringify({ secret })
        });
        const j = await res.json();
        st.textContent = j.error ? ('Error: ' + j.error) : 'Berhasil!';
        loadInitial();
      } catch (e) {
        st.textContent = 'Gagal: ' + e.message;
      }
    }
    async function switchMode(mode) {
      const secret = document.getElementById('secretInput').value;
      const st = document.getElementById('actionStatus');
      st.textContent = 'Mengubah mode ke ' + mode + '...';
      try {
        const res = await fetch('/_homeserver/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-homeserver-secret': secret },
          body: JSON.stringify({ mode, secret, flushFirst: true })
        });
        const j = await res.json();
        st.textContent = j.error ? ('Error: ' + j.error) : ('Mode aktif: ' + j.mode);
        loadInitial();
      } catch (e) {
        st.textContent = 'Gagal: ' + e.message;
      }
    }
    loadInitial();
    const es = new EventSource('/_homeserver/monitor-stream');
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.summary) renderSummary(d.summary);
        if (d.entry) prependRow(d.entry);
      } catch {}
    };
  </script>
</body>
</html>`;
}

// ============================================================================
// HTTP SERVER & ROUTER UTAMA
// ============================================================================
// SEC-K2: CORS allowlist — echo Origin hanya bila terdaftar di CORS_ALLOWED_ORIGINS.
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,https://anjabmj.web.app,https://anjabmj-44141.web.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

function setCorsHeaders(res, req) {
  const origin = req && req.headers ? req.headers.origin : null;
  if (origin && CORS_ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Homeserver-Secret, If-None-Match');
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
}

function sendJson(req, res, statusCode, obj, enableEtag = false) {
  setCorsHeaders(res, req);
  const jsonStr = JSON.stringify(obj);
  const rawBuf = Buffer.from(jsonStr, 'utf8');

  if (enableEtag && req.method === 'GET' && statusCode === 200) {
    const etag = '"' + crypto.createHash('md5').update(rawBuf).digest('hex') + '"';
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return 0;
    }
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const acceptEnc = String(req.headers['accept-encoding'] || '');
  if (rawBuf.length > 1024 && acceptEnc.includes('gzip')) {
    const gz = zlib.gzipSync(rawBuf);
    res.setHeader('Content-Encoding', 'gzip');
    res.statusCode = statusCode;
    res.end(gz);
    stats.bytesOut += gz.length;
    stats.rtdbBytesSavedEstimate += rawBuf.length;
    return gz.length;
  }

  res.statusCode = statusCode;
  res.end(rawBuf);
  stats.bytesOut += rawBuf.length;
  stats.rtdbBytesSavedEstimate += rawBuf.length;
  return rawBuf.length;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        return reject(new Error('Payload Too Large'));
      }
      chunks.push(c);
    });
    req.on('end', () => {
      stats.bytesIn += total;
      if (total === 0) return resolve({});
      const str = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(str));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function verifyAdminSecret(req, body) {
  const sec =
    req.headers['x-homeserver-secret'] ||
    (body && body.secret) ||
    new URL(req.url, 'http://localhost').searchParams.get('secret');
  if (sec === HOMESERVER_SECRET) return true;
  const token = (body && body.token) || new URL(req.url, 'http://localhost').searchParams.get('token');
  if (token) {
    try {
      const u = getAuthenticatedUser(token);
      if (u && u.role === 'admin') return true;
    } catch {}
  }
  return false;
}

function createAppServer() {
  return http.createServer(async (req, res) => {
    setCorsHeaders(res, req);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    stats.totalRequests++;
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const params = Object.fromEntries(parsedUrl.searchParams.entries());
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    try {
      // 1. Live Monitor UI
      if (req.method === 'GET' && (pathname === '/' || pathname === '/monitor') && !params.action) {
        const html = renderMonitorHtml();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 200;
        return res.end(html);
      }

      // 2. Endpoint Kontrol Homeserver (/_homeserver/*)
      if (pathname === '/_homeserver/ping') {
        return sendJson(req, res, 200, {
          status: 'ok',
          mode: serverState.mode,
          dirtyCount: dirtyPaths.size,
          ts: Date.now()
        });
      }

      if (pathname === '/_homeserver/status') {
        return sendJson(req, res, 200, getMonitorSummary());
      }

      if (pathname === '/_homeserver/activity') {
        return sendJson(req, res, 200, { activities: recentActivities });
      }

      if (pathname === '/_homeserver/monitor-stream') {
        const sseHeaders = {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        };
        const sseOrigin = req.headers.origin;
        if (sseOrigin && CORS_ALLOWED_ORIGINS.includes(sseOrigin)) {
          sseHeaders['Access-Control-Allow-Origin'] = sseOrigin;
          sseHeaders['Vary'] = 'Origin';
        }
        res.writeHead(200, sseHeaders);
        res.write(`data: ${JSON.stringify({ event: 'init', summary: getMonitorSummary() })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if ((pathname === '/_homeserver/pull-from-rtdb' || pathname === '/_homeserver/pull-rtdb') && req.method === 'POST') {
        const body = await readRequestBody(req);
        if (!verifyAdminSecret(req, body)) {
          return sendJson(req, res, 403, { success: false, error: 'Forbidden: Secret Homeserver/Admin tidak valid' });
        }
        const pullRes = await pullAllFromRtdb();
        return sendJson(req, res, 200, { success: true, ok: true, ...pullRes, summary: getMonitorSummary() });
      }

      if ((pathname === '/_homeserver/flush-to-rtdb' || pathname === '/_homeserver/flush-outbox') && req.method === 'POST') {
        const body = await readRequestBody(req);
        if (!verifyAdminSecret(req, body)) {
          return sendJson(req, res, 403, { success: false, error: 'Forbidden: Secret Homeserver/Admin tidak valid' });
        }
        const flushRes = await flushOutboxToRtdb();
        return sendJson(req, res, 200, { success: true, ok: true, ...flushRes, summary: getMonitorSummary() });
      }

      if (pathname === '/_homeserver/mode' && req.method === 'POST') {
        const body = await readRequestBody(req);
        if (!verifyAdminSecret(req, body)) {
          return sendJson(req, res, 403, { success: false, error: 'Forbidden: Secret Homeserver/Admin tidak valid' });
        }
        const nextMode = String(body.mode || '').toUpperCase();
        if (!['HOMESERVER', 'RTDB', 'OFF'].includes(nextMode)) {
          return sendJson(req, res, 400, { success: false, error: 'Mode harus HOMESERVER, RTDB, atau OFF' });
        }
        let flushInfo = null;
        if (nextMode === 'RTDB' && body.flushFirst !== false && dirtyPaths.size > 0) {
          flushInfo = await flushOutboxToRtdb();
        }
        serverState.mode = nextMode;
        saveStateNow();
        recordActivity('ADMIN', 'SWITCH_MODE', nextMode, 0);
        return sendJson(req, res, 200, {
          success: true,
          ok: true,
          mode: serverState.mode,
          flushInfo,
          summary: getMonitorSummary()
        });
      }

      // 3. Firebase RTDB REST-compatible endpoint (/db/<path>.json)
      // SEC-K2: wajib autentikasi — admin secret ATAU token user valid. Root write ditolak.
      if (pathname.startsWith('/db/') && pathname.endsWith('.json')) {
        const fbPath = pathname.slice(4, -5).replace(/^\/+|\/+$/g, '');
        const body = req.method === 'GET' ? {} : await readRequestBody(req);
        const isRoot = fbPath === '';
        const isAdminSecret = verifyAdminSecret(req, body);

        let authedUser = null;
        const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
        const tokenParam = params.token || bearer || (body && body.token) || '';
        if (tokenParam) {
          try { authedUser = getAuthenticatedUser(tokenParam); } catch { authedUser = null; }
        }

        if (!isAdminSecret && !authedUser) {
          return sendJson(req, res, 401, { error: 'Unauthorized: secret admin atau token valid diperlukan' });
        }
        if (req.method !== 'GET' && !isAdminSecret && (!authedUser || authedUser.role !== 'admin')) {
          return sendJson(req, res, 403, { error: 'Forbidden: penulisan /db hanya untuk admin' });
        }
        if (isRoot && req.method !== 'GET') {
          return sendJson(req, res, 400, { error: 'Bad Request: penulisan node root tidak diizinkan' });
        }

        if (req.method === 'GET') {
          stats.totalReads++;
          const val = getDbNode(fbPath);
          const sent = sendJson(req, res, 200, val, true);
          recordActivity('READ', 'RTDB_GET', fbPath || '/', sent);
          return;
        }
        if (serverState.mode === 'OFF') {
          return sendJson(req, res, 503, { error: 'Homeserver sedang dalam mode OFF' });
        }
        stats.totalWrites++;
        if (req.method === 'PUT') {
          setDbNode(fbPath, body);
        } else if (req.method === 'PATCH') {
          patchDbNode(fbPath, body);
        } else if (req.method === 'DELETE') {
          setDbNode(fbPath, null);
        }
        rebuildAllIndexes();
        markDirtyPath(fbPath);
        const saved = saveDbNow();
        if (!saved.ok) return sendJson(req, res, 500, { error: saved.error });
        recordActivity('WRITE', `RTDB_${req.method}`, fbPath || '/', 0);
        if (params.print === 'silent') {
          res.statusCode = 204;
          return res.end();
        }
        return sendJson(req, res, 200, { ok: true });
      }

      // 4. Endpoint Utama Sianjab Action API (/api, /sianjab-api, /exec, atau /?action=...)
      if (pathname === '/api' || pathname === '/sianjab-api' || pathname === '/exec' || params.action) {
        const body = req.method === 'POST' ? await readRequestBody(req) : {};
        // SEC-T8: token via header Authorization pun didukung.
        const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
        if (authHeader && !params.token && !(body && body.token)) params.token = authHeader;
        const action = params.action || (body && body.action);
        if (!action) {
          return sendJson(req, res, 400, { success: false, error: 'Parameter action wajib diisi' });
        }

        if (serverState.mode === 'OFF' && action !== 'ping') {
          return sendJson(req, res, 503, { success: false, error: 'Homeserver sedang OFF, gunakan Firebase RTDB.' });
        }

        const isReadAction =
          req.method === 'GET' ||
          ['read', 'readAll', 'getJabatanFull', 'getJabatanByUnit', 'getDashboardStats',
           'getUnitKerja', 'getHierarchy', 'getABK', 'getTemplate', 'getTagMappings', 'getDeadline',
           'checkVerificationCode', 'getBulkData', 'getAnjabStatusSummary', 'getBulkAnjabByUnit',
           'exportFullDatabase', 'ping'].includes(action);

        if (isReadAction) stats.totalReads++;
        else stats.totalWrites++;

        const data = await handleSianjabAction(action, params, body, clientIp);
        const bytesSent = sendJson(req, res, 200, { success: true, data }, isReadAction);
        recordActivity(
          isReadAction ? 'READ' : 'WRITE',
          action,
          params.entity || (body && body.entity) || params.id || params.parentId || '-',
          bytesSent
        );
        return;
      }

      return sendJson(req, res, 404, { success: false, error: 'Endpoint tidak ditemukan: ' + pathname });
    } catch (err) {
      return sendJson(req, res, err.statusCode || 200, { success: false, error: err.message || String(err) });
    }
  });
}

// ============================================================================
// ENTRYPOINT & EKSPOR UNTUK TESTING
// ============================================================================
loadFromDisk();

// Task 5 (ketahanan bebaa): keputusan pull otomatis saat startup.
// Pull hanya aman bila tidak ada tulisan lokal yang belum ter-flush —
// pull menimpa seluruh `db` dan membuang dirtyPaths (lihat BE-T2).
// dirtyCount/outboxCount = override untuk test; default dari state runtime.
function shouldPullOnStart({ dirtyCount, outboxCount, autoPullEnv } = {}) {
  if (String(autoPullEnv) === 'false') return false;
  const dirty = dirtyCount !== undefined ? dirtyCount : (dirtyPaths ? dirtyPaths.size : 0);
  const outbox = outboxCount !== undefined ? outboxCount : 0;
  return dirty === 0 && outbox === 0;
}

if (require.main === module) {
  const server = createAppServer();
  server.listen(PORT, BIND_HOST, async () => {
    console.log('============================================================');
    console.log(`🚀 SIANJAB HOMESERVER DB BERJALAN DI http://${BIND_HOST}:${PORT}`);
    console.log(`📂 Data Directory : ${DATA_DIR}`);
    console.log(`🔄 Write-Behind   : setiap ${WRITE_BEHIND_INTERVAL_MS / 1000} detik`);
    console.log('============================================================');
    if (Object.keys(db).length === 0 && shouldPullOnStart({ autoPullEnv: process.env.AUTO_PULL_ON_START })) {
      console.log('[SIANJAB-DB] Database lokal masih kosong. Menarik snapshot awal otomatis dari Firebase RTDB...');
      try {
        await pullAllFromRtdb();
        console.log('[SIANJAB-DB] Auto-seed awal dari Firebase RTDB berhasil!');
      } catch (err) {
        console.warn('[SIANJAB-DB] Gagal auto-seed dari Firebase RTDB saat startup:', err.message);
      }
    }
  });

  // Task 5: flush outbox sebelum keluar (docker stop / ctrl-c) supaya
  // tulisan 0-3 menit terakhir tidak hanya hidup di disk lokal.
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SIANJAB-DB] ${signal} diterima, flush outbox sebelum keluar...`);
    const timeout = setTimeout(() => {
      console.error('[SIANJAB-DB] Flush timeout saat shutdown, keluar paksa');
      process.exit(1);
    }, 10000);
    try {
      saveDbNow();
      if (dirtyPaths.size > 0) {
        await flushOutboxToRtdb();
      }
    } catch (e) {
      console.error('[SIANJAB-DB] Gagal flush saat shutdown:', e.message);
    }
    clearTimeout(timeout);
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
  createAppServer,
  getDbNode,
  setDbNode,
  rebuildAllIndexes,
  handleSianjabAction,
  getMonitorSummary,
  dirtyPaths,
  saveDbNow,
  requireEnv,
  verifyAdminSecret,
  generateAuthToken,
  validateAuthToken,
  getAuthenticatedUser,
  CORS_ALLOWED_ORIGINS,
  BIND_HOST,
  shouldPullOnStart,
  SELF_UPDATE_ALLOWED_FIELDS,
  loginFailures,
  hashPasswordHmac
};
