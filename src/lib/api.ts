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
// CLIENT-SIDE CACHE
// Hanya untuk GET requests. Setiap operasi write
// (create/update/delete/save) langsung MENGHAPUS
// SELURUH cache supaya user selalu lihat data terbaru.
// =============================================

interface CacheEntry {
  data: unknown;
  expiry: number;
}

const API_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 menit

/** Hapus SELURUH cache — dipanggil setiap kali ada operasi write */
function invalidateAllCache() {
  API_CACHE.clear();
}

/** Ambil dari cache jika masih valid */
function getFromCache<T>(key: string): T | null {
  const entry = API_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    API_CACHE.delete(key);
    return null;
  }
  return entry.data as T;
}

/** Simpan ke cache */
function setCache(key: string, data: unknown) {
  API_CACHE.set(key, {
    data,
    expiry: Date.now() + CACHE_TTL_MS,
  });
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

async function apiCall<T = unknown>(
  action: string,
  entity: string,
  options: {
    params?: Record<string, string>;
    data?: unknown;
  } = {}
): Promise<T> {
  if (!API_BASE) {
    console.warn("Warning: NEXT_PUBLIC_GAS_DEPLOYMENT_URL is not configured.");
  }

  const writeActions = ['create', 'update', 'delete', 'saveSingleEntity', 'saveMultiEntity', 'saveABK', 'createUser', 'updateUser', 'deleteUser'];
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

  // Cek cache untuk GET request (non-write)
  if (!isWriteOperation) {
    const cached = getFromCache<T>(url);
    if (cached !== null) {
      return cached;
    }
  }

  // Jika ini operasi write → langsung hapus SELURUH cache
  // supaya setelah save/delete, data yang ditampilkan pasti fresh
  if (isWriteOperation) {
    invalidateAllCache();
  }

  const fetchOpts: RequestInit = {
    method: isWriteOperation ? 'POST' : 'GET',
    headers: isWriteOperation ? { 'Content-Type': 'text/plain' } : undefined,
    redirect: 'follow',
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
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        // Tunggu 2 detik sebelum retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  throw lastError || new Error('API request failed after retry');
}

// =============================================
// EXPORTED API FUNCTIONS
// =============================================

export const api = {
  // -- Unit Kerja --
  getUnitKerja: () =>
    apiCall('readAll', 'unitKerja'),

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

  readAllEntity: (entity: string, jabatanId: string) =>
    apiCall('readAll', entity, { params: { parentId: jabatanId } }),

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

  saveAiConfig: (data: { geminiApiKey: string; geminiModel: string }) =>
    apiCall('update', 'settings', { data, params: { id: 'aiConfig' } }),

  getAiConfig: () =>
    apiCall<{ geminiApiKey?: string; geminiModel?: string } | null>('read', 'settings', { params: { id: 'aiConfig' } }),

  testAiConnection: (data: { geminiApiKey: string; geminiModel: string }) =>
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

  // -- Security Logs --
  getSecurityLogs: () =>
    apiCall<any[]>('readAll', 'security_logs'),
};

