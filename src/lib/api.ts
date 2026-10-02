// =============================================
// Sianjab ABK - API Client
// Calls Next.js API route which proxies to GAS
// =============================================

import { DuplicateUnitKerjaParams } from './types';
import { getActiveYear, DEFAULT_YEAR } from '@/lib/constants';

const API_BASE = process.env.NEXT_PUBLIC_GAS_DEPLOYMENT_URL || '';

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}

// =============================================
// CLIENT-SIDE CACHE (Memory + IndexedDB)
// Hanya untuk GET requests. Setiap operasi write
// (create/update/delete/save) langsung MENGHAPUS
// SELURUH cache supaya user selalu lihat data terbaru.
// Cache bertahan saat F5 refresh dan lintas tab (IndexedDB).
// =============================================

interface CacheEntry {
  data: unknown;
  expiry: number;
}

// In-memory cache (fast primary)
const API_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 menit

const DB_NAME = 'sianjab_cache_db';
const STORE_NAME = 'api_cache';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getIndexedDbVal<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as T) || null);
    });
  } catch (e) {
    console.warn('IndexedDB read error:', e);
    return null;
  }
}

async function setIndexedDbVal<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (e) {
    console.warn('IndexedDB write error:', e);
  }
}

async function clearIndexedDbStore(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (e) {
    console.warn('IndexedDB clear error:', e);
  }
}

/** Hapus SELURUH cache (memory + IndexedDB) — dipanggil setiap kali ada operasi write */
async function invalidateAllCache() {
  API_CACHE.clear();
  await clearIndexedDbStore();
}

/** Hapus entri cache yang cocok dengan prefix tertentu (memory + IndexedDB) */
async function deleteCacheByPrefix(prefix: string): Promise<void> {
  // Clear from in-memory cache
  for (const k of Array.from(API_CACHE.keys())) {
    if (k.includes(prefix)) {
      API_CACHE.delete(k);
    }
  }

  // Clear from IndexedDB
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if (typeof cursor.key === 'string' && cursor.key.includes(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (e) {
    console.warn('IndexedDB delete prefix error:', e);
  }
}

/** Invalidation Terarah (Granular / Targeted) untuk mencegah penghapusan cache yang tidak perlu */
async function invalidateTargetedCache(
  action: string,
  entity: string,
  opts?: { params?: Record<string, string>; data?: unknown }
) {
  const activeYear = getActiveYear();
  const parentId = opts?.params?.parentId || opts?.params?.id || (opts?.data as any)?.jabatanId || (opts?.data as any)?.id;

  // Operasi reset global yang membutuhkan wipe menyeluruh
  const globalResetActions = [
    'cloneYearData', 'deleteYearData', 'restoreFullDatabase',
    'restoreBatchJabatans', 'restoreBatchEntities', 'cleanupOrphanedRecords',
    'duplicateUnitKerja'
  ];

  if (globalResetActions.includes(action) || entity === 'unitKerja') {
    await invalidateAllCache();
    return;
  }

  // H5: Petakan entitas yang terdampak berdasarkan action
  const affectedEntities: string[] = [];
  if (entity) affectedEntities.push(entity);

  if (action === 'saveABK') {
    affectedEntities.push('abk', 'jabatan');
  } else if (action === 'saveBulkAnjabData') {
    affectedEntities.push(
      'tugasPokok', 'syaratJabatan', 'kualifikasi', 'bahanKerja', 'perangkatKerja',
      'tanggungJawab', 'wewenang', 'korelasiJabatan', 'kondisiLingkungan',
      'risikoBahaya', 'prestasiKerja', 'hasilKerja', 'abk', 'jabatan'
    );
  } else if (action === 'registerVerificationCode') {
    affectedEntities.push('verification_logs');
  }

  // Hapus cache entitas spesifik yang terdampak
  for (const ent of affectedEntities) {
    await deleteCacheByPrefix(`entity_${activeYear}_${ent}`);
    await deleteCacheByPrefix(`entity=${ent}`);
  }

  // Jika mutasi terkait jabatan, hapus cache detail jabatan tersebut
  if (parentId) {
    await deleteCacheByPrefix(`jfull_${activeYear}_${parentId}`);
    await deleteCacheByPrefix(`id=${parentId}`);
    await deleteCacheByPrefix(`parentId=${parentId}`);
  }

  // Invalidate ringkasan status dan bulk data yang terpengaruh
  await deleteCacheByPrefix(`getAnjabStatusSummary`);
  await deleteCacheByPrefix(`getBulkData`);
  await deleteCacheByPrefix(`statusSummary`);
  await deleteCacheByPrefix(`getBulkAnjabByUnit`);

  // Hapus dari memori cepat (in-memory)
  for (const key of Array.from(API_CACHE.keys())) {
    const matchesEntity = affectedEntities.some(ent => key.includes(ent));
    if (
      key.includes('getBulkData') ||
      key.includes('getAnjabStatusSummary') ||
      key.includes('getBulkAnjabByUnit') ||
      matchesEntity ||
      (parentId && key.includes(parentId))
    ) {
      API_CACHE.delete(key);
    }
  }
}

/** Ambil dari cache jika masih valid (memory first, then IndexedDB) */
async function getFromCache<T>(key: string): Promise<T | null> {
  // Check memory first (fastest)
  const memEntry = API_CACHE.get(key);
  if (memEntry) {
    if (Date.now() > memEntry.expiry) {
      API_CACHE.delete(key);
    } else {
      return memEntry.data as T;
    }
  }

  // Fallback: check IndexedDB
  const dbEntry = await getIndexedDbVal<CacheEntry>(key);
  if (dbEntry) {
    if (Date.now() <= dbEntry.expiry) {
      // Re-hydrate into memory cache for speed
      API_CACHE.set(key, dbEntry);
      return dbEntry.data as T;
    }
    // Expired — remove it asynchronously
    openDB().then(db => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
    }).catch(() => {});
  }

  return null;
}

/** Simpan ke cache (memory + IndexedDB) dengan LRU eviction limit (max 100 entries) */
async function setCache(key: string, data: unknown) {
  if (API_CACHE.size >= 100 && !API_CACHE.has(key)) {
    const oldestKey = API_CACHE.keys().next().value;
    if (oldestKey) {
      API_CACHE.delete(oldestKey);
    }
  }
  const entry: CacheEntry = {
    data,
    expiry: Date.now() + CACHE_TTL_MS,
  };
  API_CACHE.set(key, entry);
  await setIndexedDbVal(key, entry);
}

// =============================================
// AUTH TOKEN HELPER
// Ambil token login dari cookie untuk dikirim 
// ke GAS sebagai validasi autentikasi.
// =============================================

function getAuthToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)sianjab_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// =============================================
// CORE API CALL
// =============================================

// Queue hanya untuk WRITE operations (serialize writes, parallelkan reads)
let writeQueuePromise = Promise.resolve();

// In-flight deduplication untuk GET requests (cegah duplicate fetch yang sama)
const inFlightRequests = new Map<string, Promise<unknown>>();

// N4: Extended timeout per-action untuk proses berat
const EXTENDED_TIMEOUT_ACTIONS: Record<string, number> = {
  generateAnjabWithAI: 150000,
  testAiConnection: 60000,
  restoreFullDatabase: 180000,
  exportFullDatabase: 120000,
  exportForSitpp: 120000,
};

async function executeActualRequest<T = unknown>(
  url: string,
  isWriteOperation: boolean,
  options: {
    data?: unknown;
    signal?: AbortSignal;
  } = {},
  context?: {
    action: string;
    entity: string;
    opts: any;
  }
): Promise<T> {
  const timeoutMs = (context?.action && EXTENDED_TIMEOUT_ACTIONS[context.action])
    ? EXTENDED_TIMEOUT_ACTIONS[context.action]
    : 30000;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let signalToUse = options.signal;

  if (!signalToUse) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(new Error(`Server membutuhkan waktu lebih lama untuk memproses ${context?.action || 'permintaan'}. (Batas waktu: ${timeoutMs / 1000}s)`)), timeoutMs);
    signalToUse = controller.signal;
  }

  const fetchOpts: RequestInit = {
    method: isWriteOperation ? 'POST' : 'GET',
    headers: isWriteOperation ? { 'Content-Type': 'text/plain' } : undefined,
    redirect: 'follow',
    signal: signalToUse,
  };
  if (options.data) {
    fetchOpts.body = JSON.stringify(options.data);
  }

  // Fetch with 1x retry on failure
  let lastError: Error | null = null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, fetchOpts);
        const json: ApiResponse<T> = await res.json();

        if (!json.success) {
          const errMsg = json.error || 'API request failed';
          // M5: Tangani token tidak valid / kadaluarsa -> bersihkan sesi dan redirect
          if (
            errMsg.toLowerCase().includes('token tidak valid') ||
            errMsg.toLowerCase().includes('sudah kadaluarsa') ||
            errMsg.toLowerCase().includes('silakan login ulang')
          ) {
            if (typeof window !== 'undefined') {
              document.cookie = "sianjab_token=; Max-Age=0; path=/";
              localStorage.removeItem('sianjab_user');
              if (!window.location.pathname.startsWith('/login')) {
                window.location.href = '/login?expired=1';
              }
            }
          }
          throw new Error(errMsg);
        }

        // Simpan ke cache jika ini GET request yang cacheable
        if (!isWriteOperation) {
          await setCache(url, json.data);
          const activeYear = getActiveYear();
          if (context?.action === 'getBulkData' && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
            for (const [entName, entData] of Object.entries(json.data)) {
              await setCache(`entity_${activeYear}_${entName}`, entData);
            }
          } else if (context?.action === 'getJabatanFull' && json.data && (json.data as any).id) {
            await setCache(`jfull_${activeYear}_${(json.data as any).id}`, json.data);
          } else if (context?.action === 'getAnjabStatusSummary' && json.data) {
            await setCache(`statusSummary_${activeYear}`, json.data);
          }
        }

        // Setelah write berhasil, hapus cache terarah
        if (isWriteOperation) {
          if (context) {
            await invalidateTargetedCache(context.action, context.entity, context.opts);
          } else {
            await invalidateAllCache();
          }
        }

        return json.data;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Request Timeout: Backend GAS tidak merespons dalam ${timeoutMs / 1000} detik.`);
        }
        lastError = err instanceof Error ? err : new Error(String(err));

        // H3: Operasi tulis (write) TIDAK BOLEH di-retry untuk mencegah duplikasi rekod
        if (isWriteOperation) {
          throw lastError;
        }

        if (attempt === 0) {
          // Tunggu 500ms sebelum retry pembacaan (GET)
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    throw lastError || new Error('API request failed after retry');
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function apiCall<T = unknown>(
  action: string,
  entityOrOptions: string | { params?: Record<string, string>; data?: unknown; signal?: AbortSignal } = '',
  options: {
    params?: Record<string, string>;
    data?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  if (!API_BASE) {
    console.warn("Warning: NEXT_PUBLIC_GAS_DEPLOYMENT_URL is not configured.");
  }

  let entity = '';
  let opts = options;
  if (typeof entityOrOptions === 'string') {
    entity = entityOrOptions;
  } else if (typeof entityOrOptions === 'object' && entityOrOptions !== null) {
    opts = entityOrOptions;
  }

  const writeActions = [
    'create', 'update', 'delete', 'saveSingleEntity', 'saveMultiEntity', 'updateUrutanBatch', 'saveABK',
    'createUser', 'updateUser', 'deleteUser', 'saveBulkAnjabData',
    'cloneYearData', 'deleteYearData', 'cleanupOrphanedRecords',
    'migrateRootTo2026', 'restoreBatchJabatans', 'restoreBatchEntities',
    'exportForSitpp', 'generateAnjabWithAI', 'saveTemplate', 'saveTagMappings',
    'saveDeadline', 'registerVerificationCode', 'restoreFullDatabase',
    'duplicateUnitKerja', 'createBatchJabatans'
  ];
  const isWriteOperation = writeActions.includes(action) || !!opts.data;
  const activeYear = getActiveYear();
  const searchParams = new URLSearchParams({ action, entity, tahun: activeYear });
  if (opts.params) {
    Object.entries(opts.params).forEach(([k, v]) => searchParams.set(k, v));
  }

  // Sertakan auth token untuk semua request kecuali login
  const authToken = getAuthToken();
  if (authToken && action !== 'login') {
    searchParams.set('token', authToken);
  }

  const url = `${API_BASE}?${searchParams.toString()}`;

  // Cek cache untuk GET request (non-write) — memory + IndexedDB
  if (!isWriteOperation) {
    if (action === 'getJabatanFull' && opts.params?.id) {
      const cached = await getFromCache<T>(`jfull_${activeYear}_${opts.params.id}`);
      if (cached !== null) return cached;
    }
    if (action === 'getAnjabStatusSummary') {
      const cached = await getFromCache<T>(`statusSummary_${activeYear}`);
      if (cached !== null) return cached;
    }

    const cached = await getFromCache<T>(url);
    if (cached !== null) {
      return cached;
    }

    // Dedup: jika request yang sama sedang in-flight, tunggu hasilnya
    const inFlight = inFlightRequests.get(url);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
  }

  // Jika ini operasi write → langsung bersihkan cache terkait & antrikan secara serial
  if (isWriteOperation) {
    await invalidateTargetedCache(action, entity, opts);

    // WRITE: serialisasikan (antri satu per satu) untuk mencegah race condition (H4)
    const run = () => executeActualRequest<T>(url, true, opts, { action, entity, opts });
    const result = new Promise<T>((resolve, reject) => {
      writeQueuePromise = writeQueuePromise.then(run).then(resolve, reject);
    });
    return result;
  } else {
    // READ: jalankan langsung (paralel), dengan in-flight deduplication
    const requestPromise = executeActualRequest<T>(url, false, opts, { action, entity, opts })
      .finally(() => {
        inFlightRequests.delete(url);
      });
    inFlightRequests.set(url, requestPromise);
    return requestPromise;
  }
}

// =============================================
// EXPORTED API FUNCTIONS
// =============================================

export const api = {
  // -- Unit Kerja --
  getUnitKerja: (signal?: AbortSignal) =>
    apiCall('readAll', 'unitKerja', { signal }),

  createUnitKerja: (data: unknown) =>
    apiCall('create', 'unitKerja', { data }),

  updateUnitKerja: (id: string, data: unknown) =>
    apiCall('update', 'unitKerja', { data, params: { id } }),

  deleteUnitKerja: (id: string) =>
    apiCall('delete', 'unitKerja', { params: { id } }),

  // -- Jabatan --
  getJabatanByUnit: (unitId: string) =>
    apiCall('getJabatanByUnit', 'jabatan', { params: { unitId } }),

  getJabatanFull: (id: string) =>
    apiCall('getJabatanFull', 'jabatan', { params: { id } }),

  createJabatan: (data: unknown) =>
    apiCall('create', 'jabatan', { data }),

  createBatchJabatans: (items: any[]) =>
    apiCall<{ success: boolean; count: number; items: any[] }>(
      'createBatchJabatans',
      'jabatan',
      { data: { items } }
    ),

  updateJabatan: (id: string, data: unknown) =>
    apiCall('update', 'jabatan', { data, params: { id } }),

  deleteJabatan: (id: string) =>
    apiCall('delete', 'jabatan', { params: { id } }),

  getHierarchy: (id: string) =>
    apiCall('getHierarchy', 'jabatan', { params: { id } }),

  // -- Multi-row Entities (generic CRUD) --
  createEntity: <T = unknown>(entity: string, data: unknown) =>
    apiCall<{ id: string; data: T }>('create', entity, { data }),

  readAllEntity: (entity: string, jabatanId: string, signal?: AbortSignal) =>
    apiCall('readAll', entity, { params: { parentId: jabatanId }, signal }),

  // -- Bulk Data (read-only) --
  // Fetch beberapa entity sekaligus dalam 1 request ke GAS.
  // Mengurangi jumlah round-trip secara drastis.
  getBulkData: <T = Record<string, any[]>>(entities: string[], signal?: AbortSignal) =>
    apiCall<T>('getBulkData', '', { params: { entities: entities.join(',') }, signal }),

  // -- Ringkasan Status Anjab/ABK (Payload Ringan untuk Render Instan Pohon) --
  getAnjabStatusSummary: (signal?: AbortSignal) =>
    apiCall<{ anjabFilled: string[]; abkFilled: string[] }>('getAnjabStatusSummary', '', { signal }),

  // -- Bulk Anjab per Unit Kerja (Untuk Cetak Laporan Cepat Tanpa Muat Seluruh Kabupaten) --
  getBulkAnjabByUnit: (unitKerjaId: string, signal?: AbortSignal) =>
    apiCall<Record<string, any[]>>('getBulkAnjabByUnit', '', { params: { unitKerjaId }, signal }),

  // -- Optimistic Hydration Helpers (Render Instan 0ms dari Cache Lokal) --
  getCachedBulkData: async <T = Record<string, any[]>>(entities: string[]): Promise<T | null> => {
    if (typeof window === 'undefined') return null;
    const activeYear = getActiveYear();
    const result: Record<string, any[]> = {};
    for (const ent of entities) {
      const cached = await getFromCache<any[]>(`entity_${activeYear}_${ent}`);
      if (!cached) return null;
      result[ent] = cached;
    }
    return result as T;
  },

  getCachedJabatanFull: async (jabatanId: string): Promise<any | null> => {
    if (typeof window === 'undefined' || !jabatanId) return null;
    const activeYear = getActiveYear();
    return getFromCache<any>(`jfull_${activeYear}_${jabatanId}`);
  },

  getCachedStatusSummary: async (): Promise<{ anjabFilled: string[]; abkFilled: string[] } | null> => {
    if (typeof window === 'undefined') return null;
    const activeYear = getActiveYear();
    return getFromCache<{ anjabFilled: string[]; abkFilled: string[] }>(`statusSummary_${activeYear}`);
  },


  getDashboardStats: (signal?: AbortSignal) =>
    apiCall<{
      totalOpdMain: number;
      totalOpdSub: number;
      totalJabatan: number;
      totalJPT: number;
      totalAdministrator: number;
      totalPengawas: number;
      totalPelaksana: number;
      totalFungsional: number;
      opdDisetujui: number;
      opdDiajukan: number;
      opdRevisi: number;
      opdDraft: number;
      anjabSelesai: number;
      abkSelesai: number;
    }>('getDashboardStats', 'dashboard', { signal }),

  updateEntity: (entity: string, id: string, data: unknown) =>
    apiCall('update', entity, { data, params: { id } }),

  deleteEntity: (entity: string, id: string) =>
    apiCall('delete', entity, { params: { id } }),

  // -- Single-row Entities (syaratJabatan, kualifikasi, etc.) --
  saveSingleEntity: (entity: string, jabatanId: string, data: unknown) =>
    apiCall('saveSingleEntity', entity, { data, params: { parentId: jabatanId } }),

  // -- Multi-row Entities Atomic Save --
  saveMultiEntity: (entity: string, jabatanId: string, data: unknown) =>
    apiCall('saveMultiEntity', entity, { data, params: { parentId: jabatanId } }),

  // -- Batch Update Urutan (Reordering) --
  updateUrutanBatch: (entity: string, updates: Array<{ id: string; urutan: number }>) =>
    apiCall('updateUrutanBatch', entity, { data: updates }),

  // -- Auth & Users --
  login: (data: unknown) =>
    apiCall('login', 'users', { data }),

  createUser: (data: unknown) =>
    apiCall('createUser', 'users', { data }),

  updateUser: (id: string, data: unknown) =>
    apiCall('updateUser', 'users', { data, params: { id } }),

  getUsers: () =>
    apiCall('readAll', 'users'),

  deleteUser: (id: string) =>
    apiCall('delete', 'users', { params: { id } }),

  // -- SiTPP Integration --
  exportForSitpp: () =>
    apiCall('exportForSitpp', ''),

  // -- ABK --
  saveABK: (jabatanId: string, data: unknown) =>
    apiCall('saveABK', '', { data, params: { parentId: jabatanId } }),

  getABK: (jabatanId: string) =>
    apiCall('getABK', '', { params: { parentId: jabatanId } }),

  // -- Word Template & Tag Manager --
  saveTemplate: (data: { base64: string; filename: string }) =>
    apiCall('saveTemplate', 'settings', { data }),

  getTemplate: () =>
    apiCall<{ base64: string; filename: string } | null>('getTemplate', 'settings'),

  saveTagMappings: (data: Record<string, any>) =>
    apiCall('saveTagMappings', 'settings', { data }),

  getTagMappings: () =>
    apiCall<Record<string, any> | null>('getTagMappings', 'settings'),

  saveDeadline: (data: { deadline: string; enabled: boolean; message?: string; customDeadlines: Record<string, string> }) =>
    apiCall('saveDeadline', 'settings', { data }),

  getDeadline: () =>
    apiCall<{ deadline: string; enabled: boolean; message?: string; customDeadlines?: Record<string, string> } | null>('getDeadline', 'settings'),

  saveOrgSetting: (data: { enabled: boolean }) =>
    apiCall('update', 'settings', { data, params: { id: 'orgSetting' } }),

  getOrgSetting: () =>
    apiCall<{ enabled: boolean } | null>('read', 'settings', { params: { id: 'orgSetting' } }),

  saveAiConfig: (data: any) =>
    apiCall('update', 'settings', { data, params: { id: 'aiConfig' } }),

  getAiConfig: () =>
    apiCall<any | null>('read', 'settings', { params: { id: 'aiConfig' } }),

  testAiConnection: (data: any) =>
    apiCall<{ success: boolean; message?: string; error?: string; code?: number; status?: string; models?: { name: string; displayName: string }[] }>('testAiConnection', '', { data }),

  saveFooterSetting: (data: { showSlavaUkraini: boolean }) =>
    apiCall('update', 'settings', { data, params: { id: 'footerSetting' } }),

  getFooterSetting: () =>
    apiCall<{ showSlavaUkraini: boolean } | null>('read', 'settings', { params: { id: 'footerSetting' } }),

  saveThemeSetting: (data: { colorTheme: 'theme1' | 'theme2' }) =>
    apiCall('update', 'settings', { data, params: { id: 'themeSetting' } }),

  getThemeSetting: () =>
    apiCall<{ colorTheme: 'theme1' | 'theme2' } | null>('read', 'settings', { params: { id: 'themeSetting' } }),

  saveActiveYearSetting: (data: { activeYear: string }) =>
    apiCall('update', 'settings', { data, params: { id: 'activeYearSetting' } }),

  getActiveYearSetting: () =>
    apiCall<{ activeYear: string } | null>('read', 'settings', { params: { id: 'activeYearSetting' } }),

  // -- Year Cloning and Deletion & Maintenance --
  cloneYear: (fromYear: string, toYear: string) =>
    apiCall<{ success: boolean; message: string }>('cloneYearData', '', { params: { fromYear, toYear } }),

  deleteYear: (tahun: string) =>
    apiCall<{ success: boolean; message: string }>('deleteYearData', '', { params: { tahun } }),

  cleanupOrphanedRecords: () =>
    apiCall<{ success: boolean; deletedOrphans: number }>('cleanupOrphanedRecords', ''),

  duplicateUnitKerja: (data: DuplicateUnitKerjaParams) =>
    apiCall<{ success: boolean; message: string; targetUnitId: string; totalJabatans: number }>(
      'duplicateUnitKerja',
      'unitKerja',
      { data }
    ),

  // -- AI Generation --
  generateAnjabWithAI: async (namaJabatan: string, unitKerja: string, namaOPD: string) => {
    const raw = await apiCall<any>('generateAnjabWithAI', '', { params: { namaJabatan, unitKerja, namaOPD } });
    return normalizeAiAnjabDraft(raw);
  },

  saveBulkAnjabData: (jabatanId: string, data: unknown) =>
    apiCall<any>('saveBulkAnjabData', '', { data, params: { parentId: jabatanId } }),

  // -- Security Logs --
  getSecurityLogs: () =>
    apiCall<any[]>('readAll', 'security_logs'),

  // -- Full Database Backup & Restore --
  exportFullDatabase: async () => {
    return await apiCall('exportFullDatabase');
  },

  restoreFullDatabase: async (backupPayload: any) => {
    return await apiCall('restoreFullDatabase', { data: backupPayload });
  },

  // -- Document Verification --
  registerVerificationCode: (record: unknown) =>
    apiCall<{ success: boolean; code: string }>('registerVerificationCode', '', { data: record }),

  checkVerificationCode: (code: string) =>
    apiCall<any>('checkVerificationCode', '', { params: { code } }),

  warmUpGas: () => {
    if (typeof window === 'undefined') return;
    const activeYear = getActiveYear();
    const url = `${API_BASE}?action=ping&tahun=${activeYear}`;
    fetch(url, { method: 'GET', redirect: 'follow' })
      .then(res => res.json())
      .catch(() => {});
  }
};

// ============================================================================
// HELPER NORMALISASI DRAF AI
// ============================================================================

function normalizeAiAnjabDraft(data: any): any {
  if (!data) return null;

  const toArray = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      return val.split(',').map((s: string) => s.trim()).filter(Boolean);
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
  } else if (typeof data.prestasiKerja === 'object') {
    data.prestasiKerja = { uraian: data.prestasiKerja.uraian || "Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan." };
  }

  // Normalize Multi-Row Entities
  const toArrayOfObjects = (val: any) => {
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


