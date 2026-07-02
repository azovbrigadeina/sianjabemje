// =============================================
// Sianjab ABK - API Client
// Calls Next.js API route which proxies to GAS
// =============================================

const API_BASE = process.env.NEXT_PUBLIC_GAS_DEPLOYMENT_URL || '';

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}

// =============================================
// CLIENT-SIDE CACHE (Memory + SessionStorage)
// Hanya untuk GET requests. Setiap operasi write
// (create/update/delete/save) langsung MENGHAPUS
// SELURUH cache supaya user selalu lihat data terbaru.
// Cache bertahan saat F5 refresh (sessionStorage),
// tapi hilang saat tab ditutup.
// =============================================

interface CacheEntry {
  data: unknown;
  expiry: number;
}

// In-memory cache (fast primary)
const API_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 menit
const SESSION_CACHE_PREFIX = 'sianjab_api_cache_';

/** Hapus SELURUH cache (memory + sessionStorage) — dipanggil setiap kali ada operasi write */
function invalidateAllCache() {
  API_CACHE.clear();
  if (typeof sessionStorage !== 'undefined') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(SESSION_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
  }
}

/** Ambil dari cache jika masih valid (memory first, then sessionStorage) */
function getFromCache<T>(key: string): T | null {
  // Check memory first (fastest)
  const memEntry = API_CACHE.get(key);
  if (memEntry) {
    if (Date.now() > memEntry.expiry) {
      API_CACHE.delete(key);
    } else {
      return memEntry.data as T;
    }
  }

  // Fallback: check sessionStorage (survives F5 refresh)
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
      if (raw) {
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() <= entry.expiry) {
          // Re-hydrate into memory cache for speed
          API_CACHE.set(key, entry);
          return entry.data as T;
        }
        sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
      }
    } catch {
      // Ignore parse errors or quota exceeded
    }
  }

  return null;
}

/** Simpan ke cache (memory + sessionStorage) */
function setCache(key: string, data: unknown) {
  const entry: CacheEntry = {
    data,
    expiry: Date.now() + CACHE_TTL_MS,
  };
  API_CACHE.set(key, entry);

  // Persist to sessionStorage (survives F5 refresh)
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Quota exceeded — silently skip, memory cache still works
    }
  }
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

async function executeActualRequest<T = unknown>(
  url: string,
  isWriteOperation: boolean,
  options: {
    data?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const fetchOpts: RequestInit = {
    method: isWriteOperation ? 'POST' : 'GET',
    headers: isWriteOperation ? { 'Content-Type': 'text/plain' } : undefined,
    redirect: 'follow',
    signal: options.signal,
  };
  if (options.data) {
    fetchOpts.body = JSON.stringify(options.data);
  }

  // Fetch with 1x retry on failure
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, fetchOpts);
      const json: ApiResponse<T> = await res.json();

      if (!json.success) {
        throw new Error(json.error || 'API request failed');
      }

      // Simpan ke cache jika ini GET request
      if (!isWriteOperation) {
        setCache(url, json.data);
      }

      // Setelah write berhasil, hapus cache lagi untuk memastikan
      // GET berikutnya ambil data segar dari server
      if (isWriteOperation) {
        invalidateAllCache();
      }

      return json.data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        // Tunggu 500ms sebelum retry (turun dari 2 detik)
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  throw lastError || new Error('API request failed after retry');
}

async function apiCall<T = unknown>(
  action: string,
  entity: string,
  options: {
    params?: Record<string, string>;
    data?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  if (!API_BASE) {
    console.warn("Warning: NEXT_PUBLIC_GAS_DEPLOYMENT_URL is not configured.");
  }

  const writeActions = ['create', 'update', 'delete', 'saveSingleEntity', 'saveMultiEntity', 'saveABK', 'createUser', 'updateUser', 'deleteUser', 'saveBulkAnjabData'];
  const isWriteOperation = writeActions.includes(action) || !!options.data;
  const activeYear = (typeof window !== 'undefined' ? localStorage.getItem('sianjab_active_year') : null) || '2026';
  const searchParams = new URLSearchParams({ action, entity, tahun: activeYear });
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => searchParams.set(k, v));
  }

  // Sertakan auth token untuk semua request kecuali login
  const authToken = getAuthToken();
  if (authToken && action !== 'login') {
    searchParams.set('token', authToken);
  }

  const url = `${API_BASE}?${searchParams.toString()}`;

  // Cek cache untuk GET request (non-write) — memory + sessionStorage
  if (!isWriteOperation) {
    const cached = getFromCache<T>(url);
    if (cached !== null) {
      return cached;
    }

    // Dedup: jika request yang sama sedang in-flight, tunggu hasilnya
    const inFlight = inFlightRequests.get(url);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
  }

  // Jika ini operasi write → langsung hapus SELURUH cache
  // supaya setelah save/delete, data yang ditampilkan pasti fresh
  if (isWriteOperation) {
    invalidateAllCache();
  }

  if (isWriteOperation) {
    // WRITE: serialisasikan (antri satu per satu) untuk mencegah race condition
    const result = await new Promise<T>((resolve, reject) => {
      writeQueuePromise = writeQueuePromise.then(async () => {
        try {
          const resData = await executeActualRequest<T>(url, true, options);
          resolve(resData);
        } catch (err) {
          reject(err);
        }
      }).catch(async () => {
        try {
          const resData = await executeActualRequest<T>(url, true, options);
          resolve(resData);
        } catch (err) {
          reject(err);
        }
      });
    });
    return result;
  } else {
    // READ: jalankan langsung (paralel), dengan in-flight deduplication
    const requestPromise = executeActualRequest<T>(url, false, options)
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

  updateJabatan: (id: string, data: unknown) =>
    apiCall('update', 'jabatan', { data, params: { id } }),

  deleteJabatan: (id: string) =>
    apiCall('delete', 'jabatan', { params: { id } }),

  getHierarchy: (id: string) =>
    apiCall('getHierarchy', 'jabatan', { params: { id } }),

  // -- Multi-row Entities (generic CRUD) --
  createEntity: (entity: string, data: unknown) =>
    apiCall('create', entity, { data }),

  readAllEntity: (entity: string, jabatanId: string, signal?: AbortSignal) =>
    apiCall('readAll', entity, { params: { parentId: jabatanId }, signal }),

  // -- Bulk Data (read-only) --
  // Fetch beberapa entity sekaligus dalam 1 request ke GAS.
  // Mengurangi jumlah round-trip secara drastis.
  getBulkData: <T = Record<string, any[]>>(entities: string[], signal?: AbortSignal) =>
    apiCall<T>('getBulkData', '', { params: { entities: entities.join(',') }, signal }),


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

  // -- Google Sheet Integration --
  syncToSheet: () =>
    apiCall<{success: boolean, message: string}>('syncToSheet', ''),

  syncFromSheet: () =>
    apiCall<{success: boolean, message: string}>('syncFromSheet', ''),

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

  // -- Year Cloning and Deletion --
  cloneYear: (fromYear: string, toYear: string) =>
    apiCall<{ success: boolean; message: string }>('cloneYearData', '', { params: { fromYear, toYear } }),

  deleteYear: (tahun: string) =>
    apiCall<{ success: boolean; message: string }>('deleteYearData', '', { params: { tahun } }),

  // -- AI Generation --
  generateAnjabWithAI: (namaJabatan: string, unitKerja: string, namaOPD: string) =>
    apiCall<any>('generateAnjabWithAI', '', { params: { namaJabatan, unitKerja, namaOPD } }),

  saveBulkAnjabData: (jabatanId: string, data: unknown) =>
    apiCall<any>('saveBulkAnjabData', '', { data, params: { parentId: jabatanId } }),

  // -- Security Logs --
  getSecurityLogs: () =>
    apiCall<any[]>('readAll', 'security_logs'),
};

