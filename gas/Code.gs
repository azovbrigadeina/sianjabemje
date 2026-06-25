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

// KONFIGURASI - Ganti dengan data project Firebase Anda
var FIREBASE_URL = 'YOUR_FIREBASE_URL';
var FIREBASE_SECRET = 'YOUR_FIREBASE_SECRET';
var SHEET_ID = 'YOUR_SHEET_ID';
var SITPP_FIREBASE_URL = 'YOUR_SITPP_FIREBASE_URL';
var SITPP_SECRET = 'YOUR_SITPP_SECRET';

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
    var action = params.action || '';
    var entity = params.entity || '';
    var id = params.id || '';
    var parentId = params.parentId || '';
    var unitId = params.unitId || '';

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
      case 'updateUser':
        result = updateUser_(id, data);
        break;
      case 'exportForSitpp':
        result = exportForSitpp_();
        break;

      case 'syncToSheet':
        result = syncToSheet_();
        break;
      case 'syncFromSheet':
        result = syncFromSheet_();
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
    fbPut_(entity + '/' + id, data);
    return { id: id, data: data };
  }
  
  var result = fbPost_(entity, data);
  return { id: result.name, data: data };
}

function readRecord_(entity, id) {
  var record = fbGet_(entity + '/' + id);
  if (!record) return null;
  record.id = id;
  return record;
}

function readAllRecords_(entity, parentId) {
  var allData = fbGet_(entity);
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

  // Sort by nomorUrut if available
  records.sort(function (a, b) {
    return (a.nomorUrut || 0) - (b.nomorUrut || 0);
  });

  return records;
}

function updateRecord_(entity, id, data) {
  data.updatedAt = new Date().toISOString();
  fbPatch_(entity + '/' + id, data);
  data.id = id;
  return data;
}

function deleteRecord_(entity, id) {
  fbDelete_(entity + '/' + id);
  return { id: id, deleted: true };
}

// Save/upsert single entity (syaratJabatan, kualifikasi, prestasiKerja, hasilKerja)
function saveSingleEntity_(entity, jabatanId, data) {
  var allData = fbGet_(entity);
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
  var allData = fbGet_(entity);
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
  fbPatch_(entity, patchPayload);
  return { success: true, count: rows ? rows.length : 0 };
}



// =============================================
// SPECIALIZED QUERIES
// =============================================

function getJabatanByUnit_(unitId) {
  var allJabatan = fbGet_('jabatan');
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
  var jabatan = fbGet_('jabatan/' + jabatanId);
  if (!jabatan) return null;
  jabatan.id = jabatanId;

  // Multi-record entities
  var multiEntities = [
    'tugasPokok', 'bahanKerja', 'perangkatKerja',
    'tanggungJawab', 'wewenang', 'korelasiJabatan',
    'kondisiLingkungan', 'risikoBahaya'
  ];

  multiEntities.forEach(function (ent) {
    var data = fbGet_(ent);
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
    var data = fbGet_(ent);
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
    var current = fbGet_('jabatan/' + currentId);
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

function loginUser_(data) {
  if (!data || !data.username || !data.password) {
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
      return { 
        token: 'admin-token-' + new Date().getTime(), 
        user: { id: res.id, username: 'admin', role: 'admin', namaLengkap: 'Administrator Utama' } 
      };
    }
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
      return { 
        token: 'admin-token-' + new Date().getTime(), 
        user: { id: res.id, username: 'admin', role: 'admin', namaLengkap: 'Administrator Utama' } 
      };
    }
    throw new Error("Akun tidak ditemukan");
  }

  var user = users[foundUserId];
  var hashedPassword = hashPassword_(data.password);

  if (user.password !== hashedPassword) {
    throw new Error("Password salah");
  }

  if (user.isActive === false) {
    throw new Error("Akun ini telah dinonaktifkan");
  }

  // Generate a simple token (In production, use JWT. Here we mock it for GAS)
  var token = Utilities.base64Encode(user.username + ':' + Date.now());

  // Return user data without password
  var safeUser = {
    id: foundUserId,
    username: user.username,
    namaLengkap: user.namaLengkap,
    role: user.role,
    unitKerjaId: user.unitKerjaId,
    isActive: user.isActive
  };

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
  var allUnit = fbGet_('unitKerja') || {};
  var unitList = Object.keys(allUnit).map(function(key) {
    var u = allUnit[key]; u.id = key; return u;
  });
  var allJabatan = fbGet_('jabatan') || {};
  var jabatanList = Object.keys(allJabatan).map(function(key) {
    var j = allJabatan[key]; j.id = key; return j;
  });
  var allABK = fbGet_('abk') || {};

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

  var exportData = {
    timestamp: new Date().toISOString(),
    opd_list: opdListByTahun,
    org_master: orgMasterByTahun
  };

  // Tulis ke path sianjab_export di Firebase Sianjab
  fbPut_('sianjab_export', exportData);

  // Tulis ke path sianjab_export di Firebase SiTPP (LIVE)
  if (typeof SITPP_FIREBASE_URL !== 'undefined' && SITPP_FIREBASE_URL) {
    fbPutSitpp_('sianjab_export', exportData);
  }

  return exportData;
}

function fbPutSitpp_(path, data) {
  var url = SITPP_FIREBASE_URL + '/' + path + '.json?auth=' + SITPP_SECRET;
  var res = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}



// =============================================
// ANALISIS BEBAN KERJA (ABK)
// =============================================

function saveABK_(jabatanId, data) {
  if (!jabatanId) throw new Error("jabatanId wajib diisi");
  data.jabatanId = jabatanId;
  data.updatedAt = new Date().toISOString();
  fbPut_('abk/' + jabatanId, data);
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
  var allUnit = fbGet_('unitKerja') || {};
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
  var allJbt = fbGet_('jabatan') || {};
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
  var allABK = fbGet_('abk') || {};
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
