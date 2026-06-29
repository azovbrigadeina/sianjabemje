// =============================================
// Sianjab ABK - Google Apps Script Backend
// Koneksi ke Firebase Realtime Database
// =============================================

function testAuth() {
  // Fungsi pancingan untuk memicu layar persetujuan OAuth Google
  UrlFetchApp.fetch("https://google.com");
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙️ Menu Sianjab')
      .addItem('📥 Impor dari Web (Menimpa Sheet)', 'syncToSheet_')
      .addItem('📤 Ekspor ke Web (Menimpa Web)', 'syncFromSheet_')
      .addToUi();
}

// KONFIGURASI - Diambil dari Script Properties
var FIREBASE_URL = PropertiesService.getScriptProperties().getProperty('FIREBASE_URL') || 'YOUR_FIREBASE_URL';
var FIREBASE_SECRET = PropertiesService.getScriptProperties().getProperty('FIREBASE_SECRET') || 'YOUR_FIREBASE_SECRET';
var SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || 'YOUR_SHEET_ID';
var SITPP_FIREBASE_URL = PropertiesService.getScriptProperties().getProperty('SITPP_FIREBASE_URL') || 'YOUR_SITPP_FIREBASE_URL';
var SITPP_SECRET = PropertiesService.getScriptProperties().getProperty('SITPP_SECRET') || 'YOUR_SITPP_SECRET';
// API_SECRET untuk validasi token HMAC — set di Script Properties
// Jika kosong, validasi token dilewati (backward compatible)
var API_SECRET = PropertiesService.getScriptProperties().getProperty('API_SECRET') || '';

// =============================================
// CACHING (GAS CacheService)
// Cache data master agar tidak selalu baca Firebase.
// TTL 5 menit. Otomatis dihapus saat ada operasi write.
// =============================================

var scriptCache_ = CacheService.getScriptCache();

function cachedFbGet_(path, ttlSeconds) {
  var cacheKey = 'fb_' + path;
  var cached = scriptCache_.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // Cache corrupt, lanjut baca Firebase
    }
  }
  var data = fbGet_(path);
  if (data !== null && data !== undefined) {
    try {
      var serialized = JSON.stringify(data);
      // CacheService max value size = 100KB
      if (serialized.length < 100000) {
        scriptCache_.put(cacheKey, serialized, ttlSeconds || 300);
      }
    } catch (e) {
      // Data terlalu besar untuk cache, abaikan
    }
  }
  return data;
}

function invalidateCache_(entity) {
  // Hapus cache untuk entity tertentu + versi dengan tahun
  var keys = [
    'fb_' + entity,
    'fb_' + CURRENT_TAHUN + '/' + entity
  ];
  scriptCache_.removeAll(keys);
}

function invalidateAllCaches_() {
  // Hapus semua cache yang umum digunakan
  var commonKeys = [
    'fb_unitKerja', 'fb_jabatan', 'fb_settings',
    'fb_' + CURRENT_TAHUN + '/unitKerja',
    'fb_' + CURRENT_TAHUN + '/jabatan',
    'fb_users'
  ];
  scriptCache_.removeAll(commonKeys);
}

// =============================================
// AUTH TOKEN VALIDATION
// Token format: base64(username:timestamp) dari loginUser_.
// Jika API_SECRET di-set, validasi token wajib.
// Jika API_SECRET kosong, validasi dilewati (backward compatible).
// =============================================

// Action yang diizinkan TANPA token (public endpoints)
var PUBLIC_ACTIONS_ = ['login', 'autoRegisterOperator', 'getSptSpreadsheetData'];

function validateToken_(token) {
  if (!token) return false;
  try {
    var decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    var parts = decoded.split(':');
    if (parts.length < 2) return false;
    var username = parts[0];
    var timestamp = parseInt(parts[1], 10);
    if (!username || isNaN(timestamp)) return false;
    // Token berlaku 7 hari
    var sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > sevenDaysMs) return false;
    // Verifikasi user masih ada dan aktif
    var users = cachedFbGet_('users', 300);
    if (!users) return false;
    for (var key in users) {
      if (users[key].username === username && users[key].isActive !== false) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}


// =============================================
// KONFIGURASI PERIODE TAHUN & JALUR DATA
// =============================================
var CURRENT_TAHUN = '2026';

function isYearlyEntity_(entity) {
  var nonYearly = ['users', 'settings', 'sianjab_export', 'referensiJabatan', 'security_logs'];
  return nonYearly.indexOf(entity) === -1;
}

function getFirebasePath_(entity, id) {
  var prefix = '';
  if (isYearlyEntity_(entity)) {
    prefix = CURRENT_TAHUN + '/';
  }
  return prefix + entity + (id ? '/' + id : '');
}

// =============================================
// WEB APP ENTRY POINTS
// =============================================

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    var params = e.parameter || {};
    CURRENT_TAHUN = params.tahun || '2026';
    var action = params.action || '';
    var entity = params.entity || '';
    var id = params.id || '';
    var parentId = params.parentId || '';
    var unitId = params.unitId || '';

    // === AUTH TOKEN VALIDATION ===
    // Hanya aktif jika API_SECRET sudah di-set di Script Properties.
    // Public actions (login, autoRegisterOperator, getSptSpreadsheetData) dilewati.
    if (API_SECRET && PUBLIC_ACTIONS_.indexOf(action) === -1) {
      var token = params.token || '';
      if (!validateToken_(token)) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'Token tidak valid atau sudah kadaluarsa. Silakan login ulang.' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    var data = null;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    var result;

    switch (action) {
      case 'create':
        result = createRecord_(entity, data);
        break;
      case 'read':
        result = readRecord_(entity, id);
        break;
      case 'readAll':
        result = readAllRecords_(entity, parentId);
        break;
      case 'update':
        result = updateRecord_(entity, id, data);
        break;
      case 'delete':
        result = deleteRecord_(entity, id);
        break;

      case 'getJabatanFull':
        result = getJabatanFull_(id);
        break;
      case 'getJabatanByUnit':
        result = getJabatanByUnit_(unitId);
        break;
      case 'getUnitKerja':
        result = readAllRecords_('unitKerja', '');
        break;
      case 'getHierarchy':
        result = getJabatanHierarchy_(id);
        break;
      case 'saveSingleEntity':
        result = saveSingleEntity_(entity, parentId, data);
        break;
      case 'saveMultiEntity':
        result = saveMultiEntity_(entity, parentId, data);
        break;
      case 'login':
        result = loginUser_(data);
        break;
      case 'createUser':
        result = createUser_(data);
        break;
      case 'autoRegisterOperator':
        result = autoRegisterOperator_(data);
        break;
      case 'updateUser':
        result = updateUser_(id, data);
        break;
      case 'exportForSitpp':
        result = exportForSitpp_();
        break;
      case 'cloneYearData':
        result = cloneYearData_(params.fromYear, params.toYear);
        break;
      case 'deleteYearData':
        result = deleteYearData_(params.tahun);
        break;
      case 'migrateRootTo2026':
        result = migrateRootTo2026_();
        break;
      case 'generateAnjabWithAI':
        result = generateAnjabWithAI_(params.namaJabatan, params.unitKerja, params.namaOPD);
        break;
      case 'testAiConnection':
        result = testAiConnection_(data.geminiApiKey);
        break;

      case 'syncToSheet':
        result = syncToSheet_();
        break;
      case 'syncFromSheet':
        result = syncFromSheet_();
        break;
      case 'getSptSpreadsheetData':
        result = getSptSpreadsheetData_();
        break;
      case 'saveABK':
        result = saveABK_(parentId, data);
        break;
      case 'getABK':
        result = getABK_(parentId);
        break;
      case 'saveTemplate':
        result = fbPut_('settings/templateDocx', data);
        break;
      case 'getTemplate':
        result = fbGet_('settings/templateDocx');
        break;
      case 'saveTagMappings':
        result = fbPut_('settings/tagMappings', data);
        break;
      case 'getTagMappings':
        result = fbGet_('settings/tagMappings');
        break;
      case 'saveDeadline':
        result = fbPut_('settings/deadline', data);
        break;
      case 'getDeadline':
        result = fbGet_('settings/deadline');
        break;
      default:
        result = { error: 'Aksi tidak dikenal: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// =============================================
// FIREBASE REST API HELPERS
// =============================================

function fbGet_(path) {
  var url = FIREBASE_URL + '/' + path + '.json?auth=' + FIREBASE_SECRET;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  return JSON.parse(res.getContentText());
}

function fbPut_(path, data) {
  var url = FIREBASE_URL + '/' + path + '.json?auth=' + FIREBASE_SECRET;
  var res = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function fbPost_(path, data) {
  var url = FIREBASE_URL + '/' + path + '.json?auth=' + FIREBASE_SECRET;
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function fbPatch_(path, data) {
  var url = FIREBASE_URL + '/' + path + '.json?auth=' + FIREBASE_SECRET;
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function fbDelete_(path) {
  var url = FIREBASE_URL + '/' + path + '.json?auth=' + FIREBASE_SECRET;
  UrlFetchApp.fetch(url, { method: 'delete', muteHttpExceptions: true });
  return { deleted: true };
}

// =============================================
// GENERIC CRUD OPERATIONS
// =============================================

function createRecord_(entity, data) {
  data.createdAt = new Date().toISOString();
  data.updatedAt = new Date().toISOString();
  
  if (entity === 'unitKerja' && data.kode && data.kode.toString().trim() !== "") {
    var id = data.kode.toString().trim().replace(/[^a-zA-Z0-9_]/g, '_');
    fbPut_(getFirebasePath_(entity, id), data);
    invalidateCache_(entity);
    return { id: id, data: data };
  }
  
  var result = fbPost_(getFirebasePath_(entity), data);
  invalidateCache_(entity);
  return { id: result.name, data: data };
}

function readRecord_(entity, id) {
  var record = fbGet_(getFirebasePath_(entity, id));
  if (!record) return null;
  record.id = id;
  return record;
}

function readAllRecords_(entity, parentId) {
  // Gunakan cache untuk entity data master yang sering dibaca
  var cacheable = ['unitKerja', 'jabatan', 'users', 'settings'];
  var path = getFirebasePath_(entity);
  var allData = (cacheable.indexOf(entity) !== -1)
    ? cachedFbGet_(path, 300)
    : fbGet_(path);
  if (!allData) return [];

  var records = Object.keys(allData).map(function (key) {
    var item = allData[key];
    item.id = key;
    if (entity === 'users') {
      delete item.password;
    }
    return item;
  });

  if (parentId) {
    records = records.filter(function (r) {
      return r.jabatanId === parentId || r.unitKerjaId === parentId;
    });
  }

  // Sort by nomorUrut if available (or timestamp descending if security_logs)
  records.sort(function (a, b) {
    if (entity === 'security_logs') {
      var timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      var timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    }
    return (a.nomorUrut || 0) - (b.nomorUrut || 0);
  });

  return records;
}

function updateRecord_(entity, id, data) {
  data.updatedAt = new Date().toISOString();
  fbPatch_(getFirebasePath_(entity, id), data);
  invalidateCache_(entity);
  data.id = id;
  return data;
}

function deleteRecord_(entity, id) {
  fbDelete_(getFirebasePath_(entity, id));
  invalidateCache_(entity);
  return { id: id, deleted: true };
}

// Save/upsert single entity (syaratJabatan, kualifikasi, prestasiKerja, hasilKerja)
function saveSingleEntity_(entity, jabatanId, data) {
  var allData = fbGet_(getFirebasePath_(entity));
  var existingId = null;

  if (allData) {
    var keys = Object.keys(allData);
    for (var i = 0; i < keys.length; i++) {
      if (allData[keys[i]].jabatanId === jabatanId) {
        existingId = keys[i];
        break;
      }
    }
  }

  data.jabatanId = jabatanId;

  if (existingId) {
    return updateRecord_(entity, existingId, data);
  } else {
    return createRecord_(entity, data);
  }
}

// Save multi-row entities (tugasPokok, bahanKerja, perangkatKerja, korelasiJabatan, etc.)
function saveMultiEntity_(entity, parentId, rows) {
  var allData = fbGet_(getFirebasePath_(entity));
  var patchPayload = {};

  // 1. Mark existing records with matching jabatanId for deletion
  if (allData) {
    var keys = Object.keys(allData);
    for (var i = 0; i < keys.length; i++) {
      if (allData[keys[i]].jabatanId === parentId) {
        patchPayload[keys[i]] = null;
      }
    }
  }

  // 2. Add new records with unique keys
  if (rows && Array.isArray(rows)) {
    rows.forEach(function (row) {
      delete row.id; 
      var newId = 'row_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
      row.jabatanId = parentId;
      row.createdAt = new Date().toISOString();
      row.updatedAt = new Date().toISOString();
      patchPayload[newId] = row;
    });
  }

  // 3. Perform atomic patch update
  fbPatch_(getFirebasePath_(entity), patchPayload);
  invalidateCache_(entity);
  return { success: true, count: rows ? rows.length : 0 };
}



// =============================================
// SPECIALIZED QUERIES
// =============================================

function getJabatanByUnit_(unitId) {
  var allJabatan = fbGet_(getFirebasePath_('jabatan'));
  if (!allJabatan) return [];

  return Object.keys(allJabatan)
    .map(function (key) {
      var j = allJabatan[key];
      j.id = key;
      return j;
    })
    .filter(function (j) {
      return j.unitKerjaId === unitId;
    })
    .sort(function (a, b) {
      return (a.level || 0) - (b.level || 0);
    });
}

function getJabatanFull_(jabatanId) {
  var jabatan = fbGet_(getFirebasePath_('jabatan', jabatanId));
  if (!jabatan) return null;
  jabatan.id = jabatanId;

  // Multi-record entities
  var multiEntities = [
    'tugasPokok', 'bahanKerja', 'perangkatKerja',
    'tanggungJawab', 'wewenang', 'korelasiJabatan',
    'kondisiLingkungan', 'risikoBahaya'
  ];

  multiEntities.forEach(function (ent) {
    var data = fbGet_(getFirebasePath_(ent));
    if (data) {
      jabatan[ent] = Object.keys(data)
        .map(function (key) { var d = data[key]; d.id = key; return d; })
        .filter(function (item) { return item.jabatanId === jabatanId; })
        .sort(function (a, b) { return (a.nomorUrut || 0) - (b.nomorUrut || 0); });
    } else {
      jabatan[ent] = [];
    }
  });

  // Single-record entities
  var singleEntities = ['syaratJabatan', 'kualifikasi', 'prestasiKerja', 'hasilKerja'];
  singleEntities.forEach(function (ent) {
    var data = fbGet_(getFirebasePath_(ent));
    if (data) {
      var found = null;
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        if (data[keys[i]].jabatanId === jabatanId) {
          found = data[keys[i]];
          found.id = keys[i];
          break;
        }
      }
      jabatan[ent] = found;
    } else {
      jabatan[ent] = null;
    }
  });

  // Get hierarchy auto-fill
  jabatan.hierarchy = getJabatanHierarchy_(jabatanId);

  return jabatan;
}

function getJabatanHierarchy_(jabatanId) {
  var hierarchy = {
    jptUtama: '', jptMadya: '', jptPratama: '',
    administrator: '', pengawas: '', pelaksana: '',
    jabatanFungsional: ''
  };

  var currentId = jabatanId;
  var visited = {};

  while (currentId && !visited[currentId]) {
    visited[currentId] = true;
    var current = fbGet_(getFirebasePath_('jabatan', currentId));
    if (!current) break;

    var jenis = (current.jenisJabatan || '').toLowerCase();
    if (jenis === 'jpt utama') hierarchy.jptUtama = current.namaJabatan;
    else if (jenis === 'jpt madya') hierarchy.jptMadya = current.namaJabatan;
    else if (jenis === 'jpt pratama') hierarchy.jptPratama = current.namaJabatan;
    else if (jenis === 'administrator') hierarchy.administrator = current.namaJabatan;
    else if (jenis === 'pengawas') hierarchy.pengawas = current.namaJabatan;
    else if (jenis === 'pelaksana') hierarchy.pelaksana = current.namaJabatan;
    else if (jenis === 'fungsional') hierarchy.jabatanFungsional = current.namaJabatan;

    currentId = current.parentId || null;
  }

  return hierarchy;
}

// =============================================
// AUTHENTICATION & USER MANAGEMENT
// =============================================

function hashPassword_(password) {
  var signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  var hexString = '';
  for (var i = 0; i < signature.length; i++) {
    var byte = signature[i];
    if (byte < 0) byte += 256;
    var byteStr = byte.toString(16);
    if (byteStr.length == 1) byteStr = '0' + byteStr;
    hexString += byteStr;
  }
  return hexString;
}

function writeSecurityLog_(username, status, reason, ip, userAgent) {
  try {
    var logData = {
      timestamp: new Date().toISOString(),
      username: username || 'unknown',
      status: status, // "SUCCESS" or "FAILED"
      reason: reason || '',
      ip: ip || 'unknown',
      userAgent: userAgent || 'unknown'
    };
    fbPost_('security_logs', logData);
  } catch (err) {
    console.error("Failed to write security log: " + err.message);
  }
}

function loginUser_(data) {
  var ip = data ? data.ip : 'unknown';
  var userAgent = data ? data.userAgent : 'unknown';

  if (!data || !data.username || !data.password) {
    var attemptedUser = (data && data.username) ? data.username : 'unknown';
    writeSecurityLog_(attemptedUser, 'FAILED', 'Username dan password wajib diisi', ip, userAgent);
    throw new Error("Username dan password wajib diisi");
  }

  var users = fbGet_('users');
  if (!users) {
    // Auto-create initial admin if users node is completely empty
    if (data.username === 'admin' && data.password === 'admin') {
      var initialAdmin = {
        username: 'admin',
        password: hashPassword_('admin'),
        namaLengkap: 'Administrator Utama',
        role: 'admin',
        isActive: true,
        createdAt: new Date().toISOString()
      };
      var res = createRecord_('users', initialAdmin);
      writeSecurityLog_('admin', 'SUCCESS', 'Kanal admin inisial dibuat otomatis', ip, userAgent);
      return { 
        token: 'admin-token-' + new Date().getTime(), 
        user: { id: res.id, username: 'admin', role: 'admin', namaLengkap: 'Administrator Utama' } 
      };
    }
    writeSecurityLog_(data.username, 'FAILED', 'Akun tidak ditemukan (Users kosong)', ip, userAgent);
    throw new Error("Akun tidak ditemukan");
  }

  var foundUserId = null;
  var userKeys = Object.keys(users);
  
  for (var i = 0; i < userKeys.length; i++) {
    if (users[userKeys[i]].username === data.username) {
      foundUserId = userKeys[i];
      break;
    }
  }

  if (!foundUserId) {
    if (data.username === 'admin' && data.password === 'admin') {
      var initialAdmin = {
        username: 'admin',
        password: hashPassword_('admin'),
        namaLengkap: 'Administrator Utama',
        role: 'admin',
        isActive: true,
        createdAt: new Date().toISOString()
      };
      var res = createRecord_('users', initialAdmin);
      writeSecurityLog_('admin', 'SUCCESS', 'Kanal admin inisial dibuat otomatis', ip, userAgent);
      return { 
        token: 'admin-token-' + new Date().getTime(), 
        user: { id: res.id, username: 'admin', role: 'admin', namaLengkap: 'Administrator Utama' } 
      };
    }
    writeSecurityLog_(data.username, 'FAILED', 'Akun tidak ditemukan', ip, userAgent);
    throw new Error("Akun tidak ditemukan");
  }

  var user = users[foundUserId];
  var hashedPassword = hashPassword_(data.password);

  if (user.password !== hashedPassword) {
    writeSecurityLog_(data.username, 'FAILED', 'Password salah', ip, userAgent);
    throw new Error("Password salah");
  }

  if (user.isActive === false) {
    writeSecurityLog_(data.username, 'FAILED', 'Akun ini telah dinonaktifkan', ip, userAgent);
    throw new Error("Akun ini telah dinonaktifkan");
  }

  // Generate a simple token (In production, use JWT. Here we mock it for GAS)
  var token = Utilities.base64Encode(user.username + ':' + Date.now());

  // Return user data without password
  var safeUser = {
    id: foundUserId,
    username: user.username,
    namaLengkap: user.namaLengkap,
    email: user.email || "",
    sptAdminNama: user.sptAdminNama || "",
    sptAdminNip: user.sptAdminNip || "",
    role: user.role,
    unitKerjaId: user.unitKerjaId,
    isActive: user.isActive
  };

  writeSecurityLog_(user.username, 'SUCCESS', 'Login berhasil', ip, userAgent);
  return { token: token, user: safeUser };
}

function createUser_(data) {
  if (!data.username || !data.password || !data.role) {
    throw new Error("Username, password, dan role wajib diisi");
  }

  var users = fbGet_('users') || {};
  
  // Check if username exists
  for (var key in users) {
    if (users[key].username === data.username) {
      throw new Error("Username sudah digunakan");
    }
  }

  var newUser = {
    username: data.username,
    password: hashPassword_(data.password),
    namaLengkap: data.namaLengkap || "",
    email: data.email || "",
    sptAdminNama: data.sptAdminNama || "",
    sptAdminNip: data.sptAdminNip || "",
    role: data.role,
    unitKerjaId: data.unitKerjaId || "",
    isActive: data.isActive !== undefined ? data.isActive : true,
    createdAt: new Date().toISOString()
  };

  var result = fbPost_('users', newUser);
  
  var safeUser = {
    id: result.name,
    username: newUser.username,
    namaLengkap: newUser.namaLengkap,
    email: newUser.email,
    sptAdminNama: newUser.sptAdminNama,
    sptAdminNip: newUser.sptAdminNip,
    role: newUser.role,
    unitKerjaId: newUser.unitKerjaId,
    isActive: newUser.isActive
  };

  return safeUser;
}

function updateUser_(id, data) {
  var existingUser = fbGet_('users/' + id);
  if (!existingUser) throw new Error("User tidak ditemukan");

  if (data.password) {
    data.password = hashPassword_(data.password);
  }
  
  data.updatedAt = new Date().toISOString();
  
  fbPatch_('users/' + id, data);
  
  var updated = Object.assign({}, existingUser, data);
  delete updated.password;
  updated.id = id;
  
  return updated;
}

// =============================================
// INTEGRATION DENGAN SITPP (LIVE)
// =============================================

function exportForSitpp_() {
  Logger.log('[EXPORT] === exportForSitpp_ STARTED ===');
  
  // Baca data root sebagai base/fallback
  var allUnit = fbGet_('unitKerja') || {};
  var allJabatan = fbGet_('jabatan') || {};
  var allABK = fbGet_('abk') || {};
  
  // Daftar tahun untuk discan dan digabungkan (yearly data)
  var years = ['2025', '2026', '2027', '2028', '2029', '2030'];
  
  years.forEach(function(yr) {
    // Merge unitKerja
    var yearlyUnit = fbGet_(yr + '/unitKerja');
    if (yearlyUnit) {
      Object.keys(yearlyUnit).forEach(function(key) {
        if (yearlyUnit[key]) {
          allUnit[key] = yearlyUnit[key];
          allUnit[key].tahun = yr; // Pastikan tahun sesuai folder
        }
      });
    }
    
    // Merge jabatan
    var yearlyJab = fbGet_(yr + '/jabatan');
    if (yearlyJab) {
      Object.keys(yearlyJab).forEach(function(key) {
        if (yearlyJab[key]) {
          allJabatan[key] = yearlyJab[key];
          allJabatan[key].tahun = yr; // Pastikan tahun sesuai folder
        }
      });
    }
    
    // Merge abk
    var yearlyABK = fbGet_(yr + '/abk');
    if (yearlyABK) {
      Object.keys(yearlyABK).forEach(function(key) {
        if (yearlyABK[key]) {
          allABK[key] = yearlyABK[key];
        }
      });
    }
  });

  var unitList = Object.keys(allUnit).map(function(key) {
    var u = allUnit[key]; u.id = key; return u;
  });
  Logger.log('[EXPORT] Total unit kerja combined: ' + unitList.length);
  
  var jabatanList = Object.keys(allJabatan).map(function(key) {
    var j = allJabatan[key]; j.id = key; return j;
  });
  Logger.log('[EXPORT] Total jabatan combined: ' + jabatanList.length);

  var opdListByTahun = {};
  var orgMasterByTahun = {};

  // Pemetaan unit.id ke unit.kode jika tersedia (untuk kompatibilitas key di SiTPP)
  var opdIdMap = {};
  unitList.forEach(function(unit) {
    var opdKey = (unit.kode && unit.kode.toString().trim() !== "") ? unit.kode.toString().trim() : unit.id;
    opdIdMap[unit.id] = opdKey;
  });

  // Kelompokkan OPD berdasarkan tahun
  unitList.forEach(function(unit) {
    var t = unit.tahun || "2026";
    if (!opdListByTahun[t]) opdListByTahun[t] = {};
    var opdKey = opdIdMap[unit.id];
    var parentKey = opdIdMap[unit.parentId] || unit.parentId || "";
    opdListByTahun[t][opdKey] = {
      name: unit.nama || "",
      admin_parent_opd: parentKey
    };
  });

  // Kelompokkan Jabatan berdasarkan tahun
  jabatanList.forEach(function(j) {
    var t = j.tahun || "2026";
    if (!orgMasterByTahun[t]) orgMasterByTahun[t] = {};
    var abkData = allABK[j.id] || {};
    var opdKey = opdIdMap[j.unitKerjaId] || j.unitKerjaId || "";
    orgMasterByTahun[t][j.id] = {
      opd_id: opdKey,
      nama_jabatan: j.namaJabatan || "",
      eselon: j.jenisJabatan || "",
      kelas: j.kelasJabatan || 1,
      parent_id: j.parentId || "",
      urutan: (typeof j.urutan !== 'undefined' && !isNaN(Number(j.urutan))) ? Number(j.urutan) : 0,
      kebutuhan_abk: abkData.totalKebutuhan || 0,
      formasi_abk: abkData.formasiPembulatan || 0
    };
  });

  // Log jumlah per tahun
  Object.keys(opdListByTahun).sort().forEach(function(t) {
    var opdCount = Object.keys(opdListByTahun[t]).length;
    var indukCount = 0;
    Object.keys(opdListByTahun[t]).forEach(function(k) {
      if (!opdListByTahun[t][k].admin_parent_opd) indukCount++;
    });
    var jabCount = orgMasterByTahun[t] ? Object.keys(orgMasterByTahun[t]).length : 0;
    Logger.log('[EXPORT] Tahun ' + t + ': ' + opdCount + ' OPD (' + indukCount + ' induk), ' + jabCount + ' jabatan');
  });

  var exportData = {
    timestamp: new Date().toISOString(),
    opd_list: opdListByTahun,
    org_master: orgMasterByTahun
  };

  // Tulis ke path sianjab_export di Firebase Sianjab
  fbPut_('sianjab_export', exportData);
  Logger.log('[EXPORT] Written to Sianjab Firebase OK');

  // Tulis ke path sianjab_export di Firebase SiTPP (LIVE)
  var sitppUrl = SITPP_FIREBASE_URL || '';
  var sitppSecret = SITPP_SECRET || '';
  var isValidSitpp = sitppUrl && sitppUrl.indexOf('YOUR_') === -1 && sitppUrl.indexOf('http') === 0
                  && sitppSecret && sitppSecret.indexOf('YOUR_') === -1;
  if (isValidSitpp) {
    Logger.log('[SITPP] Publishing to SITPP Firebase: ' + sitppUrl);
    var sitppResult = fbPutSitpp_('sianjab_export', exportData);
    Logger.log('[SITPP] Publish result: ' + JSON.stringify(sitppResult).substring(0, 500));
  } else {
    Logger.log('[SITPP] SKIPPED — SITPP_FIREBASE_URL or SITPP_SECRET not configured or still placeholder. URL="' + sitppUrl + '"');
  }

  Logger.log('[EXPORT] === exportForSitpp_ COMPLETED === timestamp=' + exportData.timestamp);
  return exportData;
}

function fbPutSitpp_(path, data) {
  var url = SITPP_FIREBASE_URL + '/' + path + '.json?auth=' + SITPP_SECRET;
  var payload = JSON.stringify(data);
  Logger.log('[SITPP] PUT ' + url.split('?')[0] + ' payload size: ' + payload.length + ' bytes');
  var res = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: payload,
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code < 200 || code >= 300) {
    Logger.log('[SITPP] ERROR HTTP ' + code + ': ' + body.substring(0, 500));
    throw new Error('SITPP publish gagal (HTTP ' + code + '): ' + body.substring(0, 200));
  }
  Logger.log('[SITPP] SUCCESS HTTP ' + code);
  return JSON.parse(body);
}

/**
 * DIAGNOSTIC: Jalankan manual dari GAS Editor untuk test publish ke SITPP.
 * Akan menjalankan exportForSitpp_() dan menampilkan log detail.
 */
function testPublishSitpp() {
  Logger.log('=== MANUAL PUBLISH TEST ===');
  var result = exportForSitpp_();
  Logger.log('Export timestamp: ' + result.timestamp);
  
  // Verify: baca balik dari Sianjab Firebase
  var verify = fbGet_('sianjab_export/timestamp');
  Logger.log('Verify Sianjab Firebase timestamp: ' + verify);
  
  // Verify: baca balik dari SITPP Firebase
  var sitppUrl = SITPP_FIREBASE_URL || '';
  var sitppSecret = SITPP_SECRET || '';
  if (sitppUrl && sitppUrl.indexOf('YOUR_') === -1) {
    var verifyUrl = sitppUrl + '/sianjab_export/timestamp.json?auth=' + sitppSecret;
    var res = UrlFetchApp.fetch(verifyUrl, { muteHttpExceptions: true });
    Logger.log('Verify SITPP Firebase timestamp: ' + res.getContentText());
    
    // Cek jumlah OPD di SITPP
    var opdUrl = sitppUrl + '/sianjab_export/opd_list/2026.json?auth=' + sitppSecret + '&shallow=true';
    var opdRes = UrlFetchApp.fetch(opdUrl, { muteHttpExceptions: true });
    var opdKeys = JSON.parse(opdRes.getContentText());
    if (opdKeys) {
      Logger.log('SITPP opd_list/2026 keys count: ' + Object.keys(opdKeys).length);
    }
  }
  Logger.log('=== MANUAL PUBLISH TEST SELESAI ===');
}

/**
 * DIAGNOSTIC: Jalankan manual dari GAS Editor untuk test koneksi ke SITPP.
 * Buka Execution Log setelah run untuk lihat hasilnya.
 */
function testSitppConnection() {
  var sitppUrl = SITPP_FIREBASE_URL || '';
  var sitppSecret = SITPP_SECRET || '';
  
  Logger.log('=== SITPP CONNECTION DIAGNOSTIC ===');
  Logger.log('SITPP_FIREBASE_URL = "' + sitppUrl + '"');
  Logger.log('SITPP_SECRET length = ' + sitppSecret.length + ' chars');
  Logger.log('SITPP_SECRET preview = "' + sitppSecret.substring(0, 5) + '..."');
  
  // Check placeholder
  if (sitppUrl.indexOf('YOUR_') !== -1 || sitppSecret.indexOf('YOUR_') !== -1) {
    Logger.log('❌ MASIH PLACEHOLDER! Belum diisi dengan URL/Secret yang benar.');
    return;
  }
  
  if (!sitppUrl || sitppUrl.indexOf('http') !== 0) {
    Logger.log('❌ URL tidak valid. Harus dimulai dengan https://');
    return;
  }
  
  // Test 1: Coba READ dari SITPP
  Logger.log('\n--- Test 1: READ sianjab_export dari SITPP ---');
  try {
    var readUrl = sitppUrl + '/sianjab_export.json?auth=' + sitppSecret + '&shallow=true';
    var readRes = UrlFetchApp.fetch(readUrl, { muteHttpExceptions: true });
    var readCode = readRes.getResponseCode();
    var readBody = readRes.getContentText();
    Logger.log('HTTP ' + readCode + ': ' + readBody.substring(0, 500));
    if (readCode === 200) {
      Logger.log('✅ READ berhasil');
    } else if (readCode === 401) {
      Logger.log('❌ AUTH GAGAL — SITPP_SECRET salah atau expired');
    } else if (readCode === 404) {
      Logger.log('⚠️ Path sianjab_export belum ada di SITPP (normal kalau pertama kali)');
    } else {
      Logger.log('❌ Error tidak terduga');
    }
  } catch (e) {
    Logger.log('❌ Exception: ' + e.message);
  }
  
  // Test 2: Coba WRITE kecil ke SITPP
  Logger.log('\n--- Test 2: WRITE test ke SITPP ---');
  try {
    var testData = { test: true, timestamp: new Date().toISOString(), from: 'sianjab_diagnostic' };
    var writeUrl = sitppUrl + '/sianjab_export/_diagnostic.json?auth=' + sitppSecret;
    var writeRes = UrlFetchApp.fetch(writeUrl, {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify(testData),
      muteHttpExceptions: true
    });
    var writeCode = writeRes.getResponseCode();
    var writeBody = writeRes.getContentText();
    Logger.log('HTTP ' + writeCode + ': ' + writeBody.substring(0, 500));
    if (writeCode === 200) {
      Logger.log('✅ WRITE berhasil — koneksi OK!');
    } else if (writeCode === 401) {
      Logger.log('❌ AUTH GAGAL — Secret tidak punya write access');
    } else if (writeCode === 403) {
      Logger.log('❌ FORBIDDEN — Security Rules SITPP menolak write dari Sianjab');
    } else {
      Logger.log('❌ Error: HTTP ' + writeCode);
    }
  } catch (e) {
    Logger.log('❌ Exception: ' + e.message);
  }
  
  // Test 3: Cek total OPD di Sianjab per tahun
  Logger.log('\n--- Test 3: Jumlah OPD di Sianjab per Tahun ---');
  var allUnit = fbGet_('unitKerja') || {};
  var unitKeys = Object.keys(allUnit);
  Logger.log('Total unit kerja (semua tahun): ' + unitKeys.length);
  
  var perTahun = {};
  unitKeys.forEach(function(key) {
    var t = allUnit[key].tahun || '(kosong)';
    if (!perTahun[t]) perTahun[t] = 0;
    perTahun[t]++;
  });
  Object.keys(perTahun).sort().forEach(function(t) {
    Logger.log('  Tahun ' + t + ': ' + perTahun[t] + ' unit');
  });
  
  // Test 4: Cek data yang sudah ada di sianjab_export
  Logger.log('\n--- Test 4: Data di sianjab_export (Sianjab Firebase) ---');
  var exportedData = fbGet_('sianjab_export') || {};
  Logger.log('timestamp: ' + (exportedData.timestamp || '(belum ada)'));
  var opdList = exportedData.opd_list || {};
  Object.keys(opdList).sort().forEach(function(t) {
    var count = Object.keys(opdList[t] || {}).length;
    Logger.log('  opd_list/' + t + ': ' + count + ' OPD');
  });
  var orgMaster = exportedData.org_master || {};
  Object.keys(orgMaster).sort().forEach(function(t) {
    var count = Object.keys(orgMaster[t] || {}).length;
    Logger.log('  org_master/' + t + ': ' + count + ' jabatan');
  });
  
  // Test 5: Cek data di SITPP Firebase
  Logger.log('\n--- Test 5: Data di sianjab_export (SITPP Firebase) ---');
  try {
    var sitppExportUrl = sitppUrl + '/sianjab_export.json?auth=' + sitppSecret;
    var sitppRes = UrlFetchApp.fetch(sitppExportUrl, { muteHttpExceptions: true });
    if (sitppRes.getResponseCode() === 200) {
      var sitppData = JSON.parse(sitppRes.getContentText()) || {};
      Logger.log('timestamp: ' + (sitppData.timestamp || '(belum ada)'));
      var sitppOpdList = sitppData.opd_list || {};
      Object.keys(sitppOpdList).sort().forEach(function(t) {
        var c = Object.keys(sitppOpdList[t] || {}).length;
        Logger.log('  opd_list/' + t + ': ' + c + ' OPD');
      });
      var sitppOrgMaster = sitppData.org_master || {};
      Object.keys(sitppOrgMaster).sort().forEach(function(t) {
        var c = Object.keys(sitppOrgMaster[t] || {}).length;
        Logger.log('  org_master/' + t + ': ' + c + ' jabatan');
      });
    } else {
      Logger.log('HTTP ' + sitppRes.getResponseCode());
    }
  } catch (e) {
    Logger.log('Error: ' + e.message);
  }
  
  Logger.log('\n=== DIAGNOSTIC SELESAI ===');
}

/**
 * DIAGNOSTIC: List semua OPD induk (tanpa parentId) dari Firebase.
 */
function listOpdInduk() {
  var rootUnit = fbGet_('unitKerja') || {};
  var yearlyUnit = fbGet_('2026/unitKerja') || {};
  
  Logger.log('Root unitKerja count: ' + Object.keys(rootUnit).length);
  Logger.log('2026/unitKerja count: ' + Object.keys(yearlyUnit).length);
  
  var rootJbt = fbGet_('jabatan') || {};
  var yearlyJbt = fbGet_('2026/jabatan') || {};
  
  Logger.log('Root jabatan count: ' + Object.keys(rootJbt).length);
  Logger.log('2026/jabatan count: ' + Object.keys(yearlyJbt).length);
  
  var keys = Object.keys(yearlyUnit);
  var induk = [];
  var sub = [];
  keys.forEach(function(key) {
    var u = yearlyUnit[key];
    var info = { id: key, nama: u.nama || '(tanpa nama)', kode: u.kode || '', parentId: u.parentId || '' };
    if (!u.parentId) {
      induk.push(info);
    } else {
      sub.push(info);
    }
  });
  
  Logger.log('\n=== 2026 OPD INDUK (' + induk.length + ') ===');
  induk.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  induk.forEach(function(u, i) {
    Logger.log((i+1) + '. ' + u.nama + ' [kode=' + u.kode + ', id=' + u.id + ']');
  });
  
  Logger.log('\n=== 2026 SUB UNIT (' + sub.length + ') ===');
  sub.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  sub.forEach(function(u, i) {
    Logger.log((i+1) + '. ' + u.nama + ' [kode=' + u.kode + ', parentId=' + u.parentId + ']');
  });
  
  // Cek apakah ada "percobaan" atau "coba" di 2026/unitKerja
  Logger.log('\n=== SEARCH: unit mengandung "coba" atau "percobaan" di 2026/unitKerja ===');
  keys.forEach(function(key) {
    var nama = (yearlyUnit[key].nama || '').toLowerCase();
    if (nama.indexOf('coba') > -1 || nama.indexOf('percobaan') > -1 || nama.indexOf('test') > -1) {
      Logger.log('FOUND: ' + yearlyUnit[key].nama + ' [id=' + key + ', parentId=' + (yearlyUnit[key].parentId || 'NONE') + ']');
    }
  });
}

// =============================================
// ANALISIS BEBAN KERJA (ABK)
// =============================================

function saveABK_(jabatanId, data) {
  if (!jabatanId) throw new Error("jabatanId wajib diisi");
  data.jabatanId = jabatanId;
  data.updatedAt = new Date().toISOString();
  fbPut_('abk/' + jabatanId, data);
  invalidateCache_('abk');
  return { jabatanId: jabatanId, saved: true };
}

function getABK_(jabatanId) {
  if (!jabatanId) throw new Error("jabatanId wajib diisi");
  var data = fbGet_('abk/' + jabatanId);
  if (!data) return null;
  data.jabatanId = jabatanId;
  return data;
}

// =============================================
// SYNC FIREBASE -> GOOGLE SHEET
// =============================================

function syncToSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  // --- Sheet 1: Daftar Unit Kerja ---
  var sheetUnit = ss.getSheetByName('Unit Kerja') || ss.insertSheet('Unit Kerja');
  var allUnit = fbGet_(getFirebasePath_('unitKerja')) || {};
  var unitRows = [['ID', 'Nama Unit', 'Kode', 'Parent ID', 'Tahun', 'Urutan']];
  
  var uList = Object.keys(allUnit).map(function(k) {
    var u = allUnit[k];
    u.id = k;
    u.children = [];
    return u;
  });
  
  var uMap = {};
  for (var i = 0; i < uList.length; i++) { uMap[uList[i].id] = uList[i]; }
  
  var uRoots = [];
  for (var i = 0; i < uList.length; i++) {
    var u = uList[i];
    if (u.parentId && uMap[u.parentId]) uMap[u.parentId].children.push(u);
    else uRoots.push(u);
  }
  
  function sortUnits(nodes) {
    nodes.sort(function(a, b) { return (Number(a.urutan) || 999) - (Number(b.urutan) || 999); });
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].children.length > 0) sortUnits(nodes[i].children);
    }
  }
  sortUnits(uRoots);
  
  var sortedUList = [];
  function flattenUnits(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      sortedUList.push(nodes[i]);
      flattenUnits(nodes[i].children);
    }
  }
  flattenUnits(uRoots);
  
  for (var i = 0; i < sortedUList.length; i++) {
    var u = sortedUList[i];
    unitRows.push([u.id, u.nama || '', u.kode || '', u.parentId || '', u.tahun || '', u.urutan || 0]);
  }
  
  sheetUnit.clearContents();
  if (unitRows.length > 0) {
    sheetUnit.getRange(1, 1, unitRows.length, unitRows[0].length).setValues(unitRows);
  }

  // --- Sheet 2: Daftar Jabatan ---
  var sheetJbt = ss.getSheetByName('Jabatan') || ss.insertSheet('Jabatan');
  var allJbt = fbGet_(getFirebasePath_('jabatan')) || {};
  var jbtRows = [['ID', 'Nama Jabatan', 'Kode', 'Jenis', 'Kelas', 'Unit Kerja ID', 'Parent ID', 'Urutan']];
  
  var jList = Object.keys(allJbt).map(function(k) {
    var j = allJbt[k];
    j.id = k;
    j.children = [];
    return j;
  });
  
  var jMap = {};
  for (var i = 0; i < jList.length; i++) { jMap[jList[i].id] = jList[i]; }
  
  var jRoots = [];
  for (var i = 0; i < jList.length; i++) {
    var j = jList[i];
    if (j.parentId && jMap[j.parentId]) jMap[j.parentId].children.push(j);
    else jRoots.push(j);
  }

  function getEselonWeight(eselon) {
    var val = (eselon || '').toLowerCase().trim();
    if (val.indexOf('pimpinan tinggi') !== -1) return 5;
    if (val === 'administrator') return 4;
    if (val === 'pengawas') return 3;
    if (val === 'fungsional') return 2;
    if (val === 'pelaksana') return 1;
    return 0;
  }
  
  function sortJabatans(nodes) {
    nodes.sort(function(a, b) {
      var uA = a.unitKerjaId || '';
      var uB = b.unitKerjaId || '';
      if (uA !== uB) return uA.localeCompare(uB);
      
      var urutA = Number(a.urutan) || 999;
      var urutB = Number(b.urutan) || 999;
      if (urutA !== urutB) return urutA - urutB;
      
      var kelasA = Number(a.kelasJabatan) || 0;
      var kelasB = Number(b.kelasJabatan) || 0;
      if (kelasA !== kelasB) return kelasB - kelasA;
      
      var wA = getEselonWeight(a.jenisJabatan);
      var wB = getEselonWeight(b.jenisJabatan);
      if (wA !== wB) return wB - wA;
      
      var labelA = a.namaJabatan || '';
      var labelB = b.namaJabatan || '';
      return labelA.localeCompare(labelB);
    });
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].children.length > 0) sortJabatans(nodes[i].children);
    }
  }
  sortJabatans(jRoots);
  
  var sortedJList = [];
  function flattenJabatans(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      sortedJList.push(nodes[i]);
      flattenJabatans(nodes[i].children);
    }
  }
  flattenJabatans(jRoots);
  
  for (var i = 0; i < sortedJList.length; i++) {
    var j = sortedJList[i];
    jbtRows.push([j.id, j.namaJabatan || '', j.kodeJabatan || '', j.jenisJabatan || '',
      j.kelasJabatan || '', j.unitKerjaId || '', j.parentId || '', j.urutan || 0]);
  }
  
  sheetJbt.clearContents();
  if (jbtRows.length > 0) {
    sheetJbt.getRange(1, 1, jbtRows.length, jbtRows[0].length).setValues(jbtRows);
  }

  // --- Sheet 3: ABK ---
  var sheetABK = ss.getSheetByName('ABK') || ss.insertSheet('ABK');
  var allABK = fbGet_(getFirebasePath_('abk')) || {};
  var abkRows = [['Jabatan ID', 'Nama Jabatan', 'Total Waktu Efektif', 'Total Kebutuhan', 'Formasi Pembulatan', 'WKE']];
  for (var ak in allABK) {
    var a = allABK[ak];
    var jabNama = (allJbt[ak] || {}).namaJabatan || ak;
    abkRows.push([ak, jabNama, a.totalWaktuEfektif || 0, a.totalKebutuhan || 0,
      a.formasiPembulatan || 0, a.wke || 72000]);
  }
  sheetABK.clearContents();
  if (abkRows.length > 0) {
    sheetABK.getRange(1, 1, abkRows.length, abkRows[0].length).setValues(abkRows);
  }

  // Format headers
  [sheetUnit, sheetJbt, sheetABK].forEach(function(sh) {
    if (sh.getLastRow() > 0) {
      var headerRange = sh.getRange(1, 1, 1, sh.getLastColumn());
      headerRange.setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });

  return {
    success: true,
    message: "Data berhasil disinkronkan ke Google Sheet.",
    totalUnit: Object.keys(allUnit).length,
    totalJabatan: Object.keys(allJbt).length,
    totalABK: Object.keys(allABK).length
  };
}

function syncFromSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var batchUpdates = {};
  
  // 1. Proses Sheet "Unit Kerja"
  var sheetUnit = ss.getSheetByName('Unit Kerja');
  var newOpdCount = 0;
  var updatedOpdCount = 0;
  
  if (sheetUnit) {
    var uData = sheetUnit.getDataRange().getValues();
    for (var i = 1; i < uData.length; i++) {
      var row = uData[i];
      var id = (row[0] || '').toString().trim();
      var nama = (row[1] || '').toString().trim();
      if (!nama) continue; 
      
      var opdPayload = {
        nama: nama,
        kode: (row[2] || '').toString().trim(),
        parentId: (row[3] || '').toString().trim() || null,
        tahun: (row[4] || '').toString().trim() || '2026',
        urutan: parseInt(row[5]) || 0,
        updatedAt: new Date().toISOString()
      };
      
      if (!id || id.toString().trim() === "") {
        id = Utilities.getUuid();
        opdPayload.createdAt = new Date().toISOString();
        sheetUnit.getRange(i + 1, 1).setValue(id);
        newOpdCount++;
        batchUpdates['unitKerja/' + id] = opdPayload;
      } else {
        updatedOpdCount++;
        batchUpdates['unitKerja/' + id + '/nama'] = opdPayload.nama;
        batchUpdates['unitKerja/' + id + '/kode'] = opdPayload.kode;
        batchUpdates['unitKerja/' + id + '/parentId'] = opdPayload.parentId;
        batchUpdates['unitKerja/' + id + '/tahun'] = opdPayload.tahun;
        batchUpdates['unitKerja/' + id + '/urutan'] = opdPayload.urutan;
        batchUpdates['unitKerja/' + id + '/updatedAt'] = opdPayload.updatedAt;
      }
    }
  }

  // 2. Proses Sheet "Jabatan"
  var sheetJbt = ss.getSheetByName('Jabatan');
  var newJbtCount = 0;
  var updatedJbtCount = 0;
  
  if (sheetJbt) {
    var jData = sheetJbt.getDataRange().getValues();
    for (var j = 1; j < jData.length; j++) {
      var rowJ = jData[j];
      var idJ = (rowJ[0] || '').toString().trim();
      var namaJ = (rowJ[1] || '').toString().trim();
      if (!namaJ) continue; 
      
      var jbtPayload = {
        namaJabatan: namaJ,
        kodeJabatan: (rowJ[2] || '').toString().trim(),
        jenisJabatan: (rowJ[3] || '').toString().trim() || 'Pelaksana',
        kelasJabatan: parseInt(rowJ[4]) || 1,
        unitKerjaId: (rowJ[5] || '').toString().trim() || null,
        parentId: (rowJ[6] || '').toString().trim() || null,
        urutan: parseInt(rowJ[7]) || 0,
        updatedAt: new Date().toISOString()
      };
      
      if (!idJ || idJ.toString().trim() === "") {
        idJ = Utilities.getUuid();
        jbtPayload.createdAt = new Date().toISOString();
        sheetJbt.getRange(j + 1, 1).setValue(idJ);
        newJbtCount++;
      } else {
        updatedJbtCount++;
      }
      batchUpdates['jabatan/' + idJ] = jbtPayload;
    }
  }

  if (Object.keys(batchUpdates).length > 0) {
    fbPatch_('', batchUpdates);
  }

  syncToSheet_();

  return {
    success: true,
    message: "Berhasil diimpor dari Sheet. Update massal " + Object.keys(batchUpdates).length + " data."
  };
}

function getSptSpreadsheetData_() {
  var sptSsId = PropertiesService.getScriptProperties().getProperty('SPT_SPREADSHEET_ID') || "YOUR_SPT_SPREADSHEET_ID";
  var ss = SpreadsheetApp.openById(sptSsId);
  var sheet = ss.getSheetByName("Sheet1");
  var values = sheet.getDataRange().getValues();
  return values;
}

function autoRegisterOperator_(data) {
  // Security Token Check
  var EXPECTED_TOKEN = PropertiesService.getScriptProperties().getProperty('INTEGRATION_TOKEN') || "YOUR_INTEGRATION_TOKEN";
  if (data.token !== EXPECTED_TOKEN) {
    throw new Error("Token keamanan tidak valid");
  }

  if (!data.nip || !data.nama) {
    throw new Error("NIP dan nama wajib diisi");
  }

  var username = String(data.nip).trim();
  
  // 1. Resolve unitKerjaId by opdName
  var unitKerjaId = "";
  if (data.opdName) {
    var allUnit = fbGet_('unitKerja') || {};
    var targetNorm = normalizeOpdName_(data.opdName);
    for (var key in allUnit) {
      var unitNorm = normalizeOpdName_(allUnit[key].nama);
      if (unitNorm === targetNorm || unitNorm.indexOf(targetNorm) !== -1 || targetNorm.indexOf(unitNorm) !== -1) {
        unitKerjaId = key;
        break;
      }
    }
  }

  // 2. Check if user already exists
  var users = fbGet_('users') || {};
  var foundUserId = null;
  for (var key in users) {
    if (users[key].username === username) {
      foundUserId = key;
      break;
    }
  }

  if (foundUserId) {
    // User already exists! We can update their email/namaLengkap/unitKerjaId
    var updatePayload = {
      namaLengkap: data.nama,
      email: data.email || users[foundUserId].email || "",
      isActive: true
    };
    if (unitKerjaId) {
      updatePayload.unitKerjaId = unitKerjaId;
    }
    fbPatch_('users/' + foundUserId, updatePayload);
    return { status: "updated", id: foundUserId, message: "User sudah ada, data diperbarui." };
  }

  // 3. Create new user
  var newUser = {
    username: username,
    password: hashPassword_("sianjabmj2026"), // default password
    namaLengkap: data.nama,
    email: data.email || "",
    role: "operator",
    unitKerjaId: unitKerjaId,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  var result = fbPost_('users', newUser);
  return { status: "created", id: result.name, message: "User berhasil didaftarkan otomatis." };
}

function normalizeOpdName_(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .replace(/[\s\r\n\t]+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/rumahsakitumumdaerah/g, "rs")
    .replace(/rumahsakit/g, "rs")
    .replace(/rsud/g, "rs")
    .replace(/dan/g, "");
}

function cloneYearData_(fromYear, toYear) {
  if (!fromYear || !toYear) {
    throw new Error("Tahun sumber (fromYear) dan tahun sasaran (toYear) wajib diisi.");
  }
  if (fromYear === toYear) {
    throw new Error("Tahun sumber dan tahun sasaran tidak boleh sama.");
  }

  var sourceData = fbGet_(fromYear);
  if (!sourceData) {
    throw new Error("Data tahun sumber (" + fromYear + ") tidak ditemukan atau kosong.");
  }

  // Perbarui field 'tahun' di dalam unit kerja jika ada
  if (sourceData.unitKerja) {
    Object.keys(sourceData.unitKerja).forEach(function(key) {
      if (sourceData.unitKerja[key]) {
        sourceData.unitKerja[key].tahun = toYear;
        sourceData.unitKerja[key].updatedAt = new Date().toISOString();
      }
    });
  }

  // Perbarui field 'tahun' di dalam jabatan jika ada
  if (sourceData.jabatan) {
    Object.keys(sourceData.jabatan).forEach(function(key) {
      if (sourceData.jabatan[key]) {
        sourceData.jabatan[key].tahun = toYear;
        sourceData.jabatan[key].updatedAt = new Date().toISOString();
      }
    });
  }

  // Tulis data yang telah dimodifikasi ke folder tahun target
  fbPut_(toYear, sourceData);

  return {
    success: true,
    message: "Kloning data dari tahun " + fromYear + " ke tahun " + toYear + " berhasil dilakukan."
  };
}

function deleteYearData_(tahun) {
  if (!tahun) {
    throw new Error("Tahun yang akan dihapus wajib ditentukan.");
  }
  if (tahun === '2026') {
    throw new Error("Tahun baseline '2026' dilindungi dan tidak boleh dihapus demi keamanan data.");
  }
  if (tahun === 'users' || tahun === 'settings' || tahun === 'sianjab_export') {
    throw new Error("Jalur data sistem global tidak boleh dihapus.");
  }

  fbDelete_(tahun);

  return {
    success: true,
    message: "Seluruh data tahun " + tahun + " berhasil dihapus bersih dari database."
  };
}

function migrateRootTo2026_() {
  var yearlyEntities = [
    'unitKerja', 'jabatan', 'tugasPokok', 'bahanKerja', 'perangkatKerja',
    'tanggungJawab', 'wewenang', 'korelasiJabatan', 'kondisiLingkungan',
    'risikoBahaya', 'syaratJabatan', 'kualifikasi', 'hasilKerja', 'prestasiKerja', 'abk'
  ];
  
  var migrated = [];
  yearlyEntities.forEach(function(ent) {
    var data = fbGet_(ent); // Read from root
    if (data) {
      // If unitKerja or jabatan, add 'tahun': '2026'
      if (ent === 'unitKerja' || ent === 'jabatan') {
        Object.keys(data).forEach(function(key) {
          if (data[key]) {
            data[key].tahun = '2026';
          }
        });
      }
      fbPut_('2026/' + ent, data); // Write to /2026/{entity}
      migrated.push(ent);
    }
  });
  
  return {
    success: true,
    message: "Migrasi data root ke tahun 2026 berhasil.",
    migratedEntities: migrated
  };
}

function generateAnjabWithAI_(namaJabatan, unitKerja, namaOPD) {
  // Read custom AI configuration from Firebase /settings/aiConfig if available
  var aiConfig = fbGet_('settings/aiConfig') || {};
  var apiKey = aiConfig.geminiApiKey || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
  var modelName = aiConfig.geminiModel || 'gemini-2.5-flash';

  if (!apiKey || apiKey.toString().trim() === "" || apiKey === "YOUR_GEMINI_API_KEY") {
    throw new Error("Kunci API Gemini (API Key) belum dikonfigurasi. Silakan masuk ke menu Pengaturan untuk memasukkan API Key.");
  }

  var prompt = "Buat dokumen Analisis Jabatan (Anjab) Permenpan RB No 1 Tahun 2020 lengkap untuk Jabatan: " + namaJabatan + 
               " yang berada di Unit Kerja: " + unitKerja + 
               " di bawah OPD: " + namaOPD + ".\n\n" +
               "Anda WAJIB memberikan respons dalam format JSON murni tanpa markdown, tanpa ```json, tanpa teks pembuka atau penutup. " +
               "Struktur JSON harus persis seperti berikut (perhatikan tipe data array dan object):\n" +
               "{\n" +
               "  \"ikhtisarJabatan\": \"Melakukan kegiatan penelaahan, analisis, dan penyusunan draf rekomendasi kebijakan teknis...\",\n" +
               "  \"kualifikasi\": {\n" +
               "    \"pendidikanFormal\": [\"S-1 Administrasi Publik\", \"S-1 Kebijakan Publik\"],\n" +
               "    \"pendidikanPelatihan\": [\"Diklat Teknis Analisis Kebijakan\", \"Bimtek Nomenklatur Jabatan\"],\n" +
               "    \"pengalamanKerja\": [\"Minimal 2 tahun di bidang administrasi perkantoran\"]\n" +
               "  },\n" +
               "  \"tugasPokok\": [\n" +
               "    {\n" +
               "      \"nomorUrut\": 1,\n" +
               "      \"uraianTugas\": \"Mengumpulkan bahan, regulasi, dan data terkait pelaksanaan tugas...\",\n" +
               "      \"hasilKerja\": \"Berkas\",\n" +
               "      \"waktuPenyelesaian\": 60\n" +
               "    }\n" +
               "  ],\n" +
               "  \"hasilKerja\": [\"Dokumen kumpulan bahan dan regulasi kebijakan teknis\"],\n" +
               "  \"bahanKerja\": [\n" +
               "    {\n" +
               "      \"nomorUrut\": 1,\n" +
               "      \"namaBahan\": \"Surat Masuk / Memo Dinas\",\n" +
               "      \"penggunaanDalamTugas\": \"Petunjuk pelaksanaan tugas\"\n" +
               "    }\n" +
               "  ],\n" +
               "  \"perangkatKerja\": [\n" +
               "    {\n" +
               "      \"nomorUrut\": 1,\n" +
               "      \"namaPerangkat\": \"Komputer / Laptop\",\n" +
               "      \"penggunaanUntukTugas\": \"Menyusun naskah dan dokumen\"\n" +
               "    }\n" +
               "  ],\n" +
               "  \"tanggungJawab\": [\n" +
               "    {\n" +
               "      \"nomorUrut\": 1,\n" +
               "      \"uraian\": \"Kebenaran data hasil analisis\"\n" +
               "    }\n" +
               "  ],\n" +
               "  \"wewenang\": [\n" +
               "    {\n" +
               "      \"nomorUrut\": 1,\n" +
               "      \"uraian\": \"Meminta data pendukung\"\n" +
               "    }\n" +
               "  ],\n" +
               "  \"korelasiJabatan\": [\n" +
               "    {\n" +
               "      \"nomorUrut\": 1,\n" +
               "      \"namaJabatanTerkait\": \"Kepala Bagian\",\n" +
               "      \"unitKerjaInstansi\": \"Bagian Umum\",\n" +
               "      \"dalamHal\": \"Menerima petunjuk dan arahan\"\n" +
               "    }\n" +
               "  ],\n" +
               "  \"kondisiLingkungan\": [\n" +
               "    {\n" +
               "      \"nomorUrut\": 1,\n" +
               "      \"aspek\": \"Tempat Kerja\",\n" +
               "      \"faktor\": \"Di dalam ruangan\"\n" +
               "    },\n" +
               "    {\n" +
               "      \"nomorUrut\": 2,\n" +
               "      \"aspek\": \"Suhu\",\n" +
               "      \"faktor\": \"Dingin/Sejuk\"\n" +
               "    },\n" +
               "    {\n" +
               "      \"nomorUrut\": 3,\n" +
               "      \"aspek\": \"Udara\",\n" +
               "      \"faktor\": \"Segar/Bersih\"\n" +
               "    },\n" +
               "    {\n" +
               "      \"nomorUrut\": 4,\n" +
               "      \"aspek\": \"Keadaan Ruangan\",\n" +
               "      \"faktor\": \"Nyaman/Cukup\"\n" +
               "    },\n" +
               "    {\n" +
               "      \"nomorUrut\": 5,\n" +
               "      \"aspek\": \"Letak\",\n" +
               "      \"faktor\": \"Datar/Strategis\"\n" +
               "    },\n" +
               "    {\n" +
               "      \"nomorUrut\": 6,\n" +
               "      \"aspek\": \"Penerangan\",\n" +
               "      \"faktor\": \"Terang/Cukup\"\n" +
               "    },\n" +
               "    {\n" +
               "      \"nomorUrut\": 7,\n" +
               "      \"aspek\": \"Suara\",\n" +
               "      \"faktor\": \"Tenang/Sunyi\"\n" +
               "    },\n" +
               "    {\n" +
               "      \"nomorUrut\": 8,\n" +
               "      \"aspek\": \"Keadaan Tempat Kerja\",\n" +
               "      \"faktor\": \"Bersih/Rapi\"\n" +
               "    },\n" +
               "    {\n" +
               "      \"nomorUrut\": 9,\n" +
               "      \"aspek\": \"Getaran\",\n" +
               "      \"faktor\": \"Tidak ada\"\n" +
               "    }\n" +
               "  ],\n" +
               "  \"risikoBahaya\": [\n" +
               "    {\n" +
               "      \"nomorUrut\": 1,\n" +
               "      \"namaRisiko\": \"Kelelahan mata\",\n" +
               "      \"penyebab\": \"Terlalu lama menatap layar komputer\"\n" +
               "    }\n" +
               "  ],\n" +
               "  \"syaratJabatan\": {\n" +
               "    \"keterampilanKerja\": [\"Mengoperasikan komputer\"],\n" +
               "    \"bakatKerja\": [\"G\", \"V\", \"Q\"],\n" +
               "    \"temperamenKerja\": [\"D\", \"F\", \"I\"],\n" +
               "    \"minatKerja\": [\"1b\", \"2b\"],\n" +
               "    \"upayaFisik\": [\"Duduk\", \"Melihat\"],\n" +
               "    \"kondisiFisik\": {\n" +
               "      \"jenisKelamin\": \"Laki-laki / Perempuan\",\n" +
               "      \"umur\": \"Minimal 23 tahun\",\n" +
               "      \"tinggiBadan\": \"155 cm\",\n" +
               "      \"beratBadan\": \"Proporsional\",\n" +
               "      \"posturBadan\": \"Tegak/Biasa\",\n" +
               "      \"penampilan\": \"Rapi dan bersih\"\n" +
               "    },\n" +
               "    \"fungsiPekerjaan\": [\"D2\", \"O6\", \"B7\"]\n" +
               "  },\n" +
               "  \"prestasiKerja\": {\n" +
               "    \"uraian\": \"Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan.\"\n" +
               "  }\n" +
               "}\n\n" +
               "Catatan PENTING:\n" +
               "- WAJIB menghasilkan MINIMAL 5 entri/item untuk tugasPokok, hasilKerja (di root JSON), bahanKerja, perangkatKerja, tanggungJawab, dan wewenang.\n" +
               "- Dalam tugasPokok, kolom hasilKerja harus diisi dengan nama SATUAN singkat saja (misalnya 'Dokumen', 'Berkas', 'Laporan', 'Kegiatan', 'Data', dll).\n" +
               "- Nilai hasilKerja (array di root JSON yang merepresentasikan 7. Hasil Kerja) harus berupa list dari NARASI DESKRIPTIF singkat hasil kerja (bukan satuan/kata tunggal) yang jumlahnya SAMA PERSIS dengan jumlah tugasPokok (berurutan 1-ke-1, minimal 5 item).\n" +
               "- bakatKerja hanya boleh berisi kode dari: G, V, N, S, P, Q, K, F, E, C, M.\n" +
               "- temperamenKerja hanya boleh berisi kode dari: D, F, I, J, M, P, R, S, T, V.\n" +
               "- minatKerja hanya boleh berisi kode dari: 1a, 1b, 2a, 2b, 3a, 3b, 4a, 4b, 5a, 5b.\n" +
               "- upayaFisik hanya boleh berisi nilai dari: Berdiri, Berjalan, Duduk, Mengangkat, Membawa, Mendorong, Menarik, Memanjat, Menyimpan imbangan, Menunduk, Berlutut, Membungkuk, Merangkak, Menjangkau, Memegang, Bekerja dengan jari, Meraba, Berbicara, Mendengar, Melihat.";

  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + apiKey;

  var payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseText = response.getContentText();
    var responseJson = JSON.parse(responseText);

    // Deteksi eror eksplisit dari API Google
    if (responseJson.error) {
      var err = responseJson.error;
      var errMsg = err.message || "";
      var status = err.status || "";
      var code = err.code || 500;

      if (status === "RESOURCE_EXHAUSTED" || code === 429) {
        throw new Error("Kuota API Gemini habis (RESOURCE_EXHAUSTED). Silakan tunggu beberapa saat atau hubungkan kunci API dengan limit yang lebih besar.");
      } else if (code === 400 && errMsg.indexOf("API key not valid") > -1) {
        throw new Error("Kunci API Gemini tidak valid. Harap periksa kembali pengaturan API Key Anda.");
      } else {
        throw new Error("Eror dari Gemini API (" + code + "): " + errMsg);
      }
    }

    if (responseJson.candidates && responseJson.candidates[0].content.parts[0].text) {
      var textResult = responseJson.candidates[0].content.parts[0].text.trim();

      if (textResult.indexOf("```json") === 0) {
        textResult = textResult.substring(7);
      }
      if (textResult.lastIndexOf("```") === textResult.length - 3) {
        textResult = textResult.substring(0, textResult.length - 3);
      }

      var parsedData = JSON.parse(textResult.trim());
      return normalizeAiAnjabDraft_(parsedData);
    } else {
      throw new Error("Respons dari Google Gemini tidak berisi draf teks.");
    }
  } catch (e) {
    // Bubble up if it's already a descriptive error we threw
    if (e.message.indexOf("Kunci API Gemini") > -1 || 
        e.message.indexOf("Kuota API Gemini") > -1 || 
        e.message.indexOf("Eror dari Gemini API") > -1 ||
        e.message.indexOf("Respons dari Google Gemini") > -1) {
      throw e;
    }
    throw new Error("Gagal memanggil Gemini API: " + e.message);
  }
}

function testAiConnection_(apiKey) {
  if (!apiKey || apiKey.toString().trim() === "" || apiKey === "YOUR_GEMINI_API_KEY") {
    return { success: false, error: "Kunci API Gemini belum diisi." };
  }

  var url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey;
  var options = {
    method: "get",
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseText = response.getContentText();
    var responseJson = JSON.parse(responseText);

    if (responseJson.error) {
      var err = responseJson.error;
      var status = err.status || "";
      var code = err.code || 500;
      var errMsg = err.message || "";

      if (status === "RESOURCE_EXHAUSTED" || code === 429) {
        return { 
          success: false, 
          code: 429, 
          status: "RESOURCE_EXHAUSTED", 
          error: "Kuota habis (RESOURCE_EXHAUSTED). Limit harian/menit tercapai." 
        };
      } else if (code === 400 && errMsg.indexOf("API key not valid") > -1) {
        return { 
          success: false, 
          code: 400, 
          status: "INVALID_KEY", 
          error: "Kunci API tidak valid. Silakan periksa kembali." 
        };
      } else {
        return { 
          success: false, 
          code: code, 
          status: status, 
          error: "Eror (" + code + "): " + errMsg 
        };
      }
    }

    if (responseJson.models && responseJson.models.length > 0) {
      var availableModels = [];
      for (var i = 0; i < responseJson.models.length; i++) {
        var model = responseJson.models[i];
        if (model.supportedGenerationMethods && model.supportedGenerationMethods.indexOf("generateContent") > -1) {
          var cleanName = model.name.replace(/^models\//, "");
          var displayName = model.displayName || cleanName;
          
          availableModels.push({
            name: cleanName,
            displayName: displayName
          });
        }
      }
      
      return { 
        success: true, 
        message: "Koneksi berhasil! Kunci API aktif dan siap digunakan.",
        models: availableModels
      };
    } else {
      return { success: false, error: "Tidak ada model yang ditemukan untuk kunci API ini." };
    }
  } catch (e) {
    return { success: false, error: "Gagal terhubung ke API Google: " + e.message };
  }
}

function normalizeAiAnjabDraft_(data) {
  if (!data) return null;

  var toArray = function(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      return val.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }
    return [];
  };

  // Normalize Kualifikasi
  if (data.kualifikasi) {
    data.kualifikasi.pendidikanFormal = toArray(data.kualifikasi.pendidikanFormal);
    data.kualifikasi.pendidikanPelatihan = toArray(data.kualifikasi.pendidikanPelatihan);
    data.kualifikasi.pengalamanKerja = toArray(data.kualifikasi.pengalamanKerja);
  } else {
    data.kualifikasi = { pendidikanFormal: [], pendidikanPelatihan: [], pengalamanKerja: [] };
  }

  // Normalize Syarat Jabatan
  if (data.syaratJabatan) {
    data.syaratJabatan.keterampilanKerja = toArray(data.syaratJabatan.keterampilanKerja);
    data.syaratJabatan.bakatKerja = toArray(data.syaratJabatan.bakatKerja);
    data.syaratJabatan.temperamenKerja = toArray(data.syaratJabatan.temperamenKerja);
    data.syaratJabatan.minatKerja = toArray(data.syaratJabatan.minatKerja);
    data.syaratJabatan.upayaFisik = toArray(data.syaratJabatan.upayaFisik);
    data.syaratJabatan.fungsiPekerjaan = toArray(data.syaratJabatan.fungsiPekerjaan);

    if (!data.syaratJabatan.kondisiFisik || typeof data.syaratJabatan.kondisiFisik !== 'object') {
      data.syaratJabatan.kondisiFisik = {
        jenisKelamin: "Laki-laki / Perempuan",
        umur: "Bebas",
        tinggiBadan: "Bebas",
        beratBadan: "Bebas",
        posturBadan: "Tegak",
        penampilan: "Rapi"
      };
    }
  } else {
    data.syaratJabatan = {
      keterampilanKerja: [],
      bakatKerja: [],
      temperamenKerja: [],
      minatKerja: [],
      upayaFisik: [],
      kondisiFisik: { jenisKelamin: "Bebas", umur: "Bebas", tinggiBadan: "Bebas", beratBadan: "Bebas", posturBadan: "Bebas", penampilan: "Bebas" },
      fungsiPekerjaan: []
    };
  }

  // Normalize Hasil Kerja (Single Entity)
  if (!data.hasilKerja) {
    data.hasilKerja = { uraian: JSON.stringify([]) };
  } else if (Array.isArray(data.hasilKerja)) {
    data.hasilKerja = { uraian: JSON.stringify(data.hasilKerja) };
  } else if (typeof data.hasilKerja === 'string') {
    try {
      JSON.parse(data.hasilKerja);
      data.hasilKerja = { uraian: data.hasilKerja };
    } catch(e) {
      data.hasilKerja = { uraian: JSON.stringify([data.hasilKerja]) };
    }
  } else if (data.hasilKerja.uraian) {
    try {
      JSON.parse(data.hasilKerja.uraian);
    } catch(e) {
      data.hasilKerja.uraian = JSON.stringify([data.hasilKerja.uraian]);
    }
  } else {
    data.hasilKerja = { uraian: JSON.stringify([]) };
  }

  // Normalize Prestasi Kerja (Single Entity)
  if (!data.prestasiKerja) {
    data.prestasiKerja = { uraian: "Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan." };
  } else if (typeof data.prestasiKerja === 'string') {
    data.prestasiKerja = { uraian: data.prestasiKerja };
  } else if (typeof data.prestasiKerja === 'object' && !data.prestasiKerja.uraian) {
    data.prestasiKerja = { uraian: "Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan." };
  }

  // Normalize Multi-Row Entities
  var toArrayOfObjects = function(val) {
    return Array.isArray(val) ? val : [];
  };
  data.tugasPokok = toArrayOfObjects(data.tugasPokok);
  data.bahanKerja = toArrayOfObjects(data.bahanKerja);
  data.perangkatKerja = toArrayOfObjects(data.perangkatKerja);
  data.tanggungJawab = toArrayOfObjects(data.tanggungJawab);
  data.wewenang = toArrayOfObjects(data.wewenang);
  data.korelasiJabatan = toArrayOfObjects(data.korelasiJabatan);
  data.kondisiLingkungan = toArrayOfObjects(data.kondisiLingkungan);
  data.risikoBahaya = toArrayOfObjects(data.risikoBahaya);

  return data;
}

function getMockAiAnjab_(namaJabatan, unitKerja, namaOPD) {
  var normalizedName = (namaJabatan || '').toLowerCase();
  
  var isFinancial = normalizedName.indexOf('keuangan') !== -1 || normalizedName.indexOf('bendahara') !== -1 || normalizedName.indexOf('akuntansi') !== -1;
  var isPolicy = normalizedName.indexOf('kebijakan') !== -1 || normalizedName.indexOf('penelaah') !== -1;

  if (isPolicy) {
    return {
      ikhtisarJabatan: "Melakukan kegiatan penelaahan, analisis, dan penyusunan draf rekomendasi kebijakan teknis di bidang " + unitKerja + " pada " + namaOPD + " sesuai ketentuan peraturan perundang-undangan agar pelayanan berjalan lancar.",
      kualifikasi: {
        pendidikanFormal: ["S-1 Administrasi Publik", "S-1 Kebijakan Publik", "S-1 Hukum", "S-1 Ilmu Sosial"],
        pendidikanPelatihan: ["Diklat Teknis Analisis Kebijakan", "Bimtek Penyusunan Nomenklatur Jabatan"],
        pengalamanKerja: ["Minimal 2 tahun di bidang analisis kebijakan atau administrasi publik"]
      },
      tugasPokok: [
        { nomorUrut: 1, uraianTugas: "Mengumpulkan bahan-bahan kerja dan regulasi terkait penelaahan kebijakan teknis di lingkungan " + unitKerja + ".", hasilKerja: "Berkas", waktuPenyelesaian: 45 },
        { nomorUrut: 2, uraianTugas: "Melakukan penelaahan dan identifikasi permasalahan kebijakan berdasarkan data empiris lapangan.", hasilKerja: "Dokumen", waktuPenyelesaian: 90 },
        { nomorUrut: 3, uraianTugas: "Menyusun draf rekomendasi dan usulan naskah kebijakan teknis untuk diajukan kepada atasan.", hasilKerja: "Naskah", waktuPenyelesaian: 120 },
        { nomorUrut: 4, uraianTugas: "Mengevaluasi pelaksanaan kebijakan teknis secara berkala untuk perbaikan masa depan.", hasilKerja: "Laporan", waktuPenyelesaian: 60 },
        { nomorUrut: 5, uraianTugas: "Melaporkan hasil pelaksanaan tugas secara berkala kepada atasan langsung.", hasilKerja: "Laporan", waktuPenyelesaian: 30 }
      ],
      hasilKerja: [
        "Dokumen hasil pengumpulan bahan dan regulasi kebijakan teknis",
        "Dokumen catatan penelaahan dan identifikasi permasalahan kebijakan",
        "Naskah draf rekomendasi kebijakan teknis",
        "Laporan evaluasi dan monitoring pelaksanaan kebijakan",
        "Laporan berkala hasil pelaksanaan tugas kepada pimpinan"
      ],
      bahanKerja: [
        { nomorUrut: 1, namaBahan: "Data dan Informasi Kebijakan", penggunaanDalamTugas: "Bahan penelaahan regulasi" },
        { nomorUrut: 2, namaBahan: "Instruksi Pimpinan", penggunaanDalamTugas: "Petunjuk arahan pelaksanaan tugas" },
        { nomorUrut: 3, namaBahan: "Laporan Kinerja Unit", penggunaanDalamTugas: "Bahan evaluasi kebijakan" },
        { nomorUrut: 4, namaBahan: "Peraturan Perundang-undangan", penggunaanDalamTugas: "Referensi hukum analisis" },
        { nomorUrut: 5, namaBahan: "Surat Masuk dan Disposisi", penggunaanDalamTugas: "Dasar penugasan analisis" }
      ],
      perangkatKerja: [
        { nomorUrut: 1, namaPerangkat: "Laptop dan Internet", penggunaanUntukTugas: "Menganalisis regulasi dan menyusun laporan" },
        { nomorUrut: 2, namaPerangkat: "Alat Tulis Kantor", penggunaanUntukTugas: "Mencatat poin penting telaahan" },
        { nomorUrut: 3, namaPerangkat: "SOP Pengelolaan Analisis", penggunaanUntukTugas: "Pedoman alur penelaahan" },
        { nomorUrut: 4, namaPerangkat: "Printer dan Scanner", penggunaanUntukTugas: "Mencetak dan memindai draf naskah" },
        { nomorUrut: 5, namaPerangkat: "Lemari Arsip Dokumen", penggunaanUntukTugas: "Menyimpan berkas fisik telaahan" }
      ],
      tanggungJawab: [
        { nomorUrut: 1, uraian: "Ketetapan rekomendasi kebijakan yang diusulkan" },
        { nomorUrut: 2, uraian: "Kerahasiaan dokumen dan kelancaran tugas penelaahan" },
        { nomorUrut: 3, uraian: "Akurasi data pendukung yang dianalisis" },
        { nomorUrut: 4, uraian: "Ketepatan waktu penyelesaian laporan evaluasi" },
        { nomorUrut: 5, uraian: "Kerapian penyimpanan berkas regulasi" }
      ],
      wewenang: [
        { nomorUrut: 1, uraian: "Meminta data pendukung ke unit terkait" },
        { nomorUrut: 2, uraian: "Memberikan masukan teknis kepada pimpinan" },
        { nomorUrut: 3, uraian: "Menolak data analisis yang tidak valid" },
        { nomorUrut: 4, uraian: "Mengatur tata letak penyimpanan arsip dinamis" },
        { nomorUrut: 5, uraian: "Memaraf draf surat rekomendasi kebijakan" }
      ],
      korelasiJabatan: [
        { nomorUrut: 1, namaJabatanTerkait: "Kepala Unit Kerja / Atasan", unitKerjaInstansi: unitKerja, dalamHal: "Menerima disposisi dan melaporkan hasil kerja" }
      ],
      kondisiLingkungan: [
        { nomorUrut: 1, aspek: "Tempat Kerja", faktor: "Di dalam ruangan" },
        { nomorUrut: 2, aspek: "Suhu", faktor: "Dingin/Sejuk" },
        { nomorUrut: 3, aspek: "Udara", faktor: "Segar" },
        { nomorUrut: 4, aspek: "Keadaan Ruangan", faktor: "Cukup Nyaman" },
        { nomorUrut: 5, aspek: "Letak", faktor: "Strategis" },
        { nomorUrut: 6, aspek: "Penerangan", faktor: "Terang" },
        { nomorUrut: 7, aspek: "Suara", faktor: "Tenang" },
        { nomorUrut: 8, aspek: "Keadaan Tempat Kerja", faktor: "Rapi" },
        { nomorUrut: 9, aspek: "Getaran", faktor: "Tidak ada" }
      ],
      risikoBahaya: [
        { nomorUrut: 1, namaRisiko: "Kelelahan mata dan otot punggung", penyebab: "Duduk terlalu lama bekerja di depan laptop" }
      ],
      syaratJabatan: {
        keterampilanKerja: ["Mengoperasikan komputer", "Menganalisis regulasi hukum", "Menulis laporan telaahan"],
        bakatKerja: ["G", "V", "Q"],
        temperamenKerja: ["D", "F", "I"],
        minatKerja: ["1b", "2b"],
        upayaFisik: ["Duduk", "Melihat", "Berbicara"],
        kondisiFisik: {
          jenisKelamin: "Laki-laki / Perempuan",
          umur: "Minimal 23 tahun",
          tinggiBadan: "155 cm",
          beratBadan: "Proporsional",
          posturBadan: "Tegak",
          penampilan: "Rapi"
        },
        fungsiPekerjaan: ["D2", "O6", "B7"]
      },
      prestasiKerja: {
        uraian: "Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan."
      }
    };
  } else if (isFinancial) {
    return {
      ikhtisarJabatan: "Mengelola administrasi penatausahaan keuangan, pembukuan, dan penyusunan laporan pertanggungjawaban anggaran di lingkungan " + unitKerja + " pada " + namaOPD + " secara transparan dan akuntabel.",
      kualifikasi: {
        pendidikanFormal: ["S-1 Akuntansi", "S-1 Manajemen Keuangan", "D-III Perpajakan"],
        pendidikanPelatihan: ["Bimtek Penatausahaan SIPD-RI", "Pelatihan Pengelolaan Keuangan Daerah"],
        pengalamanKerja: ["Minimal 2 tahun di bidang administrasi keuangan atau perbendaharaan"]
      },
      tugasPokok: [
        { nomorUrut: 1, uraianTugas: "Menerima, mencatat, dan memverifikasi kelengkapan berkas Surat Pertanggungjawaban (SPJ) pengeluaran.", hasilKerja: "Berkas", waktuPenyelesaian: 30 },
        { nomorUrut: 2, uraianTugas: "Memasukkan data transaksi penerimaan dan pengeluaran ke dalam sistem informasi aplikasi keuangan daerah (SIPD).", hasilKerja: "Data", waktuPenyelesaian: 60 },
        { nomorUrut: 3, uraianTugas: "Menyusun draf laporan realisasi anggaran bulanan dan tahunan sebagai bahan pertanggungjawaban.", hasilKerja: "Dokumen", waktuPenyelesaian: 150 },
        { nomorUrut: 4, uraianTugas: "Mengarsipkan dokumen transaksi belanja daerah secara teratur untuk mempermudah audit keuangan.", hasilKerja: "Berkas", waktuPenyelesaian: 45 },
        { nomorUrut: 5, uraianTugas: "Melaporkan hasil pelaksanaan penatausahaan keuangan secara berkala kepada atasan.", hasilKerja: "Laporan", waktuPenyelesaian: 30 }
      ],
      hasilKerja: [
        "Berkas Surat Pertanggungjawaban (SPJ) pengeluaran terverifikasi lengkap",
        "Buku pembukuan transaksi digital (SIPD) terisi lengkap",
        "Dokumen Laporan Realisasi Anggaran (LRA) bulanan/tahunan",
        "Arsip dokumen transaksi belanja daerah yang tertata rapi",
        "Laporan berkala penatausahaan keuangan kepada pimpinan"
      ],
      bahanKerja: [
        { nomorUrut: 1, namaBahan: "Berkas Kuitansi dan Nota Belanja", penggunaanDalamTugas: "Bahan verifikasi SPJ" },
        { nomorUrut: 2, namaBahan: "DPA (Dokumen Pelaksanaan Anggaran)", penggunaanDalamTugas: "Rujukan plafon anggaran belanja" },
        { nomorUrut: 3, namaBahan: "Buku Rekening Koran Bank", penggunaanDalamTugas: "Bahan rekonsiliasi kas" },
        { nomorUrut: 4, namaBahan: "Surat Perintah Membayar (SPM)", penggunaanDalamTugas: "Referensi pencairan dana" },
        { nomorUrut: 5, namaBahan: "Peraturan Kepala Daerah tentang APBD", penggunaanDalamTugas: "Dasar hukum alokasi belanja" }
      ],
      perangkatKerja: [
        { nomorUrut: 1, namaPerangkat: "Aplikasi SIPD / Penatausahaan Keuangan", penggunaanUntukTugas: "Input transaksi belanja" },
        { nomorUrut: 2, namaPerangkat: "Kalkulator dan Alat Tulis", penggunaanUntukTugas: "Menghitung nominal dan rekap manual" },
        { nomorUrut: 3, namaPerangkat: "Komputer dan Jaringan Internet", penggunaanUntukTugas: "Mengakses aplikasi keuangan daerah" },
        { nomorUrut: 4, namaPerangkat: "SOP Penatausahaan Keuangan", penggunaanUntukTugas: "Pedoman alur verifikasi berkas" },
        { nomorUrut: 5, namaPerangkat: "Stempel / Cap Dinas", penggunaanUntukTugas: "Validasi keabsahan dokumen" }
      ],
      tanggungJawab: [
        { nomorUrut: 1, uraian: "Keabsahan berkas kuitansi dan SPJ yang disetujui" },
        { nomorUrut: 2, uraian: "Kesesuaian saldo buku kas dengan saldo fisik kas" },
        { nomorUrut: 3, uraian: "Keamanan penyimpanan uang kas di brankas" },
        { nomorUrut: 4, uraian: "Ketepatan waktu pembayaran tagihan pihak ketiga" },
        { nomorUrut: 5, uraian: "Kerapian pengarsipan dokumen SPJ keuangan" }
      ],
      wewenang: [
        { nomorUrut: 1, uraian: "Menolak berkas pencairan anggaran yang tidak lengkap" },
        { nomorUrut: 2, uraian: "Meminta bukti pendukung pengeluaran riil" },
        { nomorUrut: 3, uraian: "Melakukan verifikasi kelayakan transaksi" },
        { nomorUrut: 4, uraian: "Mengatur brankas penyimpanan kas kecil" },
        { nomorUrut: 5, uraian: "Menandatangani kuitansi tanda terima dana" }
      ],
      korelasiJabatan: [
        { nomorUrut: 1, namaJabatanTerkait: "Pejabat Penatausahaan Keuangan (PPK)", unitKerjaInstansi: unitKerja, dalamHal: "Koordinasi verifikasi dan pengesahan SPJ" }
      ],
      kondisiLingkungan: [
        { nomorUrut: 1, aspek: "Tempat Kerja", faktor: "Di dalam ruangan" },
        { nomorUrut: 2, aspek: "Suhu", faktor: "Dingin/Sejuk" },
        { nomorUrut: 3, aspek: "Udara", faktor: "Bersih" },
        { nomorUrut: 4, aspek: "Keadaan Ruangan", faktor: "Nyaman" },
        { nomorUrut: 5, aspek: "Letak", faktor: "Datar" },
        { nomorUrut: 6, aspek: "Penerangan", faktor: "Terang" },
        { nomorUrut: 7, aspek: "Suara", faktor: "Tenang" },
        { nomorUrut: 8, aspek: "Keadaan Tempat Kerja", faktor: "Rapi" },
        { nomorUrut: 9, aspek: "Getaran", faktor: "Tidak ada" }
      ],
      risikoBahaya: [
        { nomorUrut: 1, namaRisiko: "Kelelahan mata dan stres", penyebab: "Beban kerja tinggi saat akhir tahun anggaran" }
      ],
      syaratJabatan: {
        keterampilanKerja: ["Mengoperasikan Excel tingkat lanjut", "Penatausahaan transaksi keuangan", "Rekonsiliasi bank"],
        bakatKerja: ["G", "N", "Q"],
        temperamenKerja: ["M", "T"],
        minatKerja: ["3a", "1b"],
        upayaFisik: ["Duduk", "Melihat", "Berbicara"],
        kondisiFisik: {
          jenisKelamin: "Laki-laki / Perempuan",
          umur: "Minimal 23 tahun",
          tinggiBadan: "155 cm",
          beratBadan: "Proporsional",
          posturBadan: "Tegak",
          penampilan: "Rapi"
        },
        fungsiPekerjaan: ["D2", "O6", "B7"]
      },
      prestasiKerja: {
        uraian: "Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan."
      }
    };
  } else {
    return {
      ikhtisarJabatan: "Melaksanakan kegiatan dukungan administrasi perkantoran, pengarsipan, pelayanan surat-menyurat di lingkungan " + unitKerja + " pada " + namaOPD + " sesuai petunjuk teknis.",
      kualifikasi: {
        pendidikanFormal: ["S-1 Manajemen", "S-1 Administrasi Negara", "D-III Perkantoran"],
        pendidikanPelatihan: ["Pelatihan Tata Naskah Dinas", "Bimtek Kearsipan Modern"],
        pengalamanKerja: ["Minimal 1 tahun di bidang kesekretariatan atau administrasi kantor"]
      },
      tugasPokok: [
        { nomorUrut: 1, uraianTugas: "Menerima, mencatat, dan menyortir surat masuk dan keluar sesuai dengan klasifikasi tata kearsipan.", hasilKerja: "Berkas", waktuPenyelesaian: 20 },
        { nomorUrut: 2, uraianTugas: "Menyusun draf surat undangan, nota dinas, dan administrasi surat keluar berdasarkan instruksi pimpinan.", hasilKerja: "Dokumen", waktuPenyelesaian: 45 },
        { nomorUrut: 3, uraianTugas: "Menyiapkan ruang rapat dan kelengkapan dokumen pendukung pertemuan koordinasi internal.", hasilKerja: "Kegiatan", waktuPenyelesaian: 60 },
        { nomorUrut: 4, uraianTugas: "Membuat laporan bulanan pelaksanaan kegiatan administrasi tata usaha untuk diserahkan ke atasan.", hasilKerja: "Laporan", waktuPenyelesaian: 90 },
        { nomorUrut: 5, uraianTugas: "Melakukan pengarsipan berkas dinas dan dokumen kepegawaian agar tertata rapi.", hasilKerja: "Arsip", waktuPenyelesaian: 30 }
      ],
      hasilKerja: [
        "Berkas pencatatan surat masuk dan surat keluar",
        "Dokumen draf surat undangan dan nota dinas",
        "Kegiatan fasilitasi sarana pertemuan rapat koordinasi",
        "Laporan bulanan pelaksanaan tata usaha",
        "Berkas dokumen arsip aktif yang tersusun rapi"
      ],
      bahanKerja: [
        { nomorUrut: 1, namaBahan: "Surat Masuk / Undangan dari OPD lain", penggunaanDalamTugas: "Bahan pencatatan agenda" },
        { nomorUrut: 2, namaBahan: "Konsep Memo dari Atasan", penggunaanDalamTugas: "Bahan pengetikan surat resmi" },
        { nomorUrut: 3, namaBahan: "Daftar Hadir Rapat", penggunaanDalamTugas: "Bahan rekap kehadiran pertemuan" },
        { nomorUrut: 4, namaBahan: "Berkas Surat Keluar", penggunaanDalamTugas: "Bahan registrasi nomor agenda" },
        { nomorUrut: 5, namaBahan: "Regulasi Tata Naskah Dinas", penggunaanDalamTugas: "Acuan format surat menyurat" }
      ],
      perangkatKerja: [
        { nomorUrut: 1, namaPerangkat: "Komputer dan Printer", penggunaanUntukTugas: "Mengetik dan mencetak surat dinas" },
        { nomorUrut: 2, namaPerangkat: "Buku Agenda Surat", penggunaanUntukTugas: "Registrasi fisik surat masuk/keluar" },
        { nomorUrut: 3, namaPerangkat: "Mesin Fotokopi / Scanner", penggunaanUntukTugas: "Menggandakan berkas pertemuan" },
        { nomorUrut: 4, namaPerangkat: "Jaringan Internet", penggunaanUntukTugas: "Mengirim email dinas eksternal" },
        { nomorUrut: 5, namaPerangkat: "Lemari / Map Snelhechter", penggunaanUntukTugas: "Menyimpan fisik surat dinas" }
      ],
      tanggungJawab: [
        { nomorUrut: 1, uraian: "Kerapian penyimpanan arsip surat dinas" },
        { nomorUrut: 2, uraian: "Ketepatan penyampaian surat masuk ke atasan" },
        { nomorUrut: 3, uraian: "Keamanan berkas penting kepegawaian" },
        { nomorUrut: 4, uraian: "Ketersediaan fasilitas ruang pertemuan" },
        { nomorUrut: 5, uraian: "Kecepatan distribusi surat keluar" }
      ],
      wewenang: [
        { nomorUrut: 1, uraian: "Meminta nomor surat dinas ke sekretariat" },
        { nomorUrut: 2, uraian: "Mengatur tata letak berkas arsip aktif" },
        { nomorUrut: 3, uraian: "Menolak menerima surat masuk tanpa tanda pengirim" },
        { nomorUrut: 4, uraian: "Mengatur jadwal penggunaan ruang rapat" },
        { nomorUrut: 5, uraian: "Meminta ATK untuk kebutuhan administrasi" }
      ],
      korelasiJabatan: [
        { nomorUrut: 1, namaJabatanTerkait: "Kepala Sub Bagian Umum", unitKerjaInstansi: unitKerja, dalamHal: "Menerima tugas harian dan melaporkan berkas" }
      ],
      kondisiLingkungan: [
        { nomorUrut: 1, aspek: "Tempat Kerja", faktor: "Di dalam ruangan" },
        { nomorUrut: 2, aspek: "Suhu", faktor: "Dingin/Sejuk" },
        { nomorUrut: 3, aspek: "Udara", faktor: "Segar" },
        { nomorUrut: 4, aspek: "Keadaan Ruangan", faktor: "Nyaman" },
        { nomorUrut: 5, aspek: "Letak", faktor: "Datar" },
        { nomorUrut: 6, aspek: "Penerangan", faktor: "Terang" },
        { nomorUrut: 7, aspek: "Suara", faktor: "Tenang" },
        { nomorUrut: 8, aspek: "Keadaan Tempat Kerja", faktor: "Rapi" },
        { nomorUrut: 9, aspek: "Getaran", faktor: "Tidak ada" }
      ],
      risikoBahaya: [
        { nomorUrut: 1, namaRisiko: "Kelelahan mata dan otot punggung", penyebab: "Bekerja di depan layar komputer secara rutin" }
      ],
      syaratJabatan: {
        keterampilanKerja: ["Korespondensi surat menyurat", "Pengarsipan arsip dinamis", "Komunikasi interpersonal"],
        bakatKerja: ["G", "V", "Q"],
        temperamenKerja: ["R", "T"],
        minatKerja: ["3a", "1a"],
        upayaFisik: ["Duduk", "Berjalan", "Mendengar", "Melihat"],
        kondisiFisik: {
          jenisKelamin: "Laki-laki / Perempuan",
          umur: "Minimal 20 tahun",
          tinggiBadan: "155 cm",
          beratBadan: "Proporsional",
          posturBadan: "Tegak",
          penampilan: "Rapi"
        },
        fungsiPekerjaan: ["D2", "O6", "B7"]
      },
      prestasiKerja: {
        uraian: "Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan."
      }
    };
  }
}


