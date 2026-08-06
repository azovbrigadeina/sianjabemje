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

/** Simpan ke cache (memory + IndexedDB) */
async function setCache(key: string, data: unknown) {
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

async function executeActualRequest<T = unknown>(
  url: string,
  isWriteOperation: boolean,
  options: {
    data?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const timeoutMs = 30000; // 30 detik timeout default
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let signalToUse = options.signal;

  if (!signalToUse) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(new Error('Server tidak merespons dalam 30 detik (Timeout)')), timeoutMs);
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
          throw new Error(json.error || 'API request failed');
        }

        // Simpan ke cache jika ini GET request
        if (!isWriteOperation) {
          await setCache(url, json.data);
        }

        // Setelah write berhasil, hapus cache lagi untuk memastikan
        // GET berikutnya ambil data segar dari server
        if (isWriteOperation) {
          await invalidateAllCache();
        }

        return json.data;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Request Timeout: Backend GAS tidak merespons dalam 30 detik.');
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === 0) {
          // Tunggu 500ms sebelum retry
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

  const writeActions = ['create', 'update', 'delete', 'saveSingleEntity', 'saveMultiEntity', 'saveABK', 'createUser', 'updateUser', 'deleteUser', 'saveBulkAnjabData', 'syncFromSheet', 'syncToSheet'];
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

  // Cek cache untuk GET request (non-write) — memory + IndexedDB
  if (!isWriteOperation) {
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

  // Jika ini operasi write → langsung hapus SELURUH cache
  // supaya setelah save/delete, data yang ditampilkan pasti fresh
  if (isWriteOperation) {
    await invalidateAllCache();
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

  syncFromSheet: (clean?: boolean) =>
    apiCall<{success: boolean, message: string}>('syncFromSheet', '', { params: clean ? { clean: 'true' } : undefined }),

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

  // -- Year Cloning and Deletion --
  cloneYear: (fromYear: string, toYear: string) =>
    apiCall<{ success: boolean; message: string }>('cloneYearData', '', { params: { fromYear, toYear } }),

  deleteYear: (tahun: string) =>
    apiCall<{ success: boolean; message: string }>('deleteYearData', '', { params: { tahun } }),

  // -- AI Generation --
  generateAnjabWithAI: async (namaJabatan: string, unitKerja: string, namaOPD: string) => {
    try {
      // 1. Dapatkan konfigurasi AI saat ini (biasanya ter-cache/cepat)
      const aiConfig = await api.getAiConfig();
      if (!aiConfig) {
        throw new Error("Konfigurasi AI tidak ditemukan.");
      }

      const activeProvider = aiConfig.activeProvider || 'gemini';
      const prompt = (aiConfig.customPromptTemplate && aiConfig.customPromptTemplate.toString().trim() !== "")
        ? aiConfig.customPromptTemplate
        : DEFAULT_ANJAB_PROMPT;

      const promptText = prompt
        .replace(/{namaJabatan}/g, namaJabatan)
        .replace(/{unitKerja}/g, unitKerja)
        .replace(/{namaOPD}/g, namaOPD);

      let parsedData: any = null;

      if (activeProvider === 'gemini') {
        const apiKey = aiConfig.geminiApiKey || "";
        const modelName = aiConfig.geminiModel || 'gemini-2.5-flash';

        if (!apiKey || apiKey.toString().trim() === "" || apiKey === "YOUR_GEMINI_API_KEY") {
          throw new Error("Kunci API Gemini tidak dikonfigurasi di browser.");
        }

        parsedData = await callGeminiDirect(apiKey, modelName, promptText);
      } else {
        let apiKey = "";
        let modelName = "";
        let endpoint = "";

        if (activeProvider === 'openai') {
          apiKey = aiConfig.openaiApiKey || "";
          modelName = aiConfig.openaiModel || 'gpt-4o-mini';
          endpoint = "https://api.openai.com/v1/chat/completions";
        } else if (activeProvider === 'deepseek') {
          apiKey = aiConfig.deepseekApiKey || "";
          modelName = aiConfig.deepseekModel || 'deepseek-chat';
          endpoint = "https://api.deepseek.com/v1/chat/completions";
        } else if (activeProvider === 'groq') {
          apiKey = aiConfig.groqApiKey || "";
          modelName = aiConfig.groqModel || 'llama-3.3-70b-versatile';
          endpoint = "https://api.groq.com/openai/v1/chat/completions";
        } else if (activeProvider === 'openrouter') {
          apiKey = aiConfig.openrouterApiKey || "";
          modelName = aiConfig.openrouterModel || 'google/gemini-2.5-flash';
          endpoint = "https://openrouter.ai/api/v1/chat/completions";
        } else if (activeProvider === 'openai-compatible') {
          apiKey = aiConfig.openaiCompatibleApiKey || '';
          modelName = aiConfig.openaiCompatibleModel || 'gpt-4o-mini';
          let baseUrl = aiConfig.openaiCompatibleBaseUrl || 'https://api.openai.com/v1';
          baseUrl = baseUrl.replace(/\/$/, "");
          endpoint = baseUrl + "/chat/completions";
        }

        if (!apiKey && activeProvider !== 'openai-compatible') {
          throw new Error(`Kunci API untuk provider ${activeProvider} tidak dikonfigurasi di browser.`);
        }

        parsedData = await callOpenAiCompatibleDirect(endpoint, apiKey, modelName, promptText);
      }

      if (parsedData) {
        return normalizeAiAnjabDraft(parsedData);
      } else {
        throw new Error("Gagal memperoleh data draf dari direct API call.");
      }
    } catch (err: any) {
      console.warn("Direct client-side AI drafting failed/skipped, falling back to GAS backend:", err);
      // Fallback ke pemanggilan GAS seperti semula
      return apiCall<any>('generateAnjabWithAI', '', { params: { namaJabatan, unitKerja, namaOPD } });
    }
  },

  saveBulkAnjabData: (jabatanId: string, data: unknown) =>
    apiCall<any>('saveBulkAnjabData', '', { data, params: { parentId: jabatanId } }),

  // -- Security Logs --
  getSecurityLogs: () =>
    apiCall<any[]>('readAll', 'security_logs'),

  warmUpGas: () => {
    if (typeof window === 'undefined') return;
    const activeYear = localStorage.getItem('sianjab_active_year') || '2026';
    const url = `${API_BASE}?action=ping&tahun=${activeYear}`;
    fetch(url, { method: 'GET', redirect: 'follow' })
      .then(res => res.json())
      .catch(() => {});
  }
};

// ============================================================================
// HELPER DAN TEMPLATE DRAF AI KLIEN (DIRECT CALL OPTIMIZATION)
// ============================================================================

const DEFAULT_ANJAB_PROMPT = `Buat dokumen Analisis Jabatan (Anjab) Permenpan RB No 1 Tahun 2020 lengkap untuk Jabatan: {namaJabatan} yang berada di Unit Kerja: {unitKerja} di bawah OPD: {namaOPD}.

Anda WAJIB memberikan respons dalam format JSON murni tanpa markdown, tanpa \`\`\`json, tanpa teks pembuka atau penutup. Struktur JSON harus persis seperti berikut (perhatikan tipe data array dan object):
{
  "ikhtisarJabatan": "Melakukan kegiatan penelaahan, analisis, dan penyusunan draf rekomendasi kebijakan teknis...",
  "kualifikasi": {
    "pendidikanFormal": ["S-1 Administrasi Publik", "S-1 Kebijakan Publik"],
    "pendidikanPelatihan": ["Diklat Teknis Analisis Kebijakan", "Bimtek Nomenklatur Jabatan"],
    "pengalamanKerja": ["Minimal 2 tahun di bidang administrasi perkantoran"]
  },
  "tugasPokok": [
    {
      "nomorUrut": 1,
      "uraianTugas": "Mengumpulkan bahan, regulasi, dan data terkait pelaksanaan tugas...",
      "hasilKerja": "Berkas",
      "waktuPenyelesaian": 60
    }
  ],
  "hasilKerja": ["Dokumen kumpulan bahan dan regulasi kebijakan teknis"],
  "bahanKerja": [
    {
      "nomorUrut": 1,
      "namaBahan": "Surat Masuk / Memo Dinas",
      "penggunaanDalamTugas": "Petunjuk pelaksanaan tugas"
    }
  ],
  "perangkatKerja": [
    {
      "nomorUrut": 1,
      "namaPerangkat": "Komputer / Laptop",
      "penggunaanUntukTugas": "Menyusun naskah dan dokumen"
    }
  ],
  "tanggungJawab": [
    {
      "nomorUrut": 1,
      "uraian": "Kebenaran data hasil analisis"
    }
  ],
  "wewenang": [
    {
      "nomorUrut": 1,
      "uraian": "Meminta data pendukung"
    }
  ],
  "korelasiJabatan": [
    {
      "nomorUrut": 1,
      "namaJabatanTerkait": "Kepala Bagian",
      "unitKerjaInstansi": "Bagian Umum",
      "dalamHal": "Menerima petunjuk dan arahan"
    }
  ],
  "kondisiLingkungan": [
    {
      "nomorUrut": 1,
      "aspek": "Tempat Kerja",
      "faktor": "Di dalam ruangan"
    },
    {
      "nomorUrut": 2,
      "aspek": "Suhu",
      "faktor": "Dingin/Sejuk"
    },
    {
      "nomorUrut": 3,
      "aspek": "Udara",
      "faktor": "Segar/Bersih"
    },
    {
      "nomorUrut": 4,
      "aspek": "Keadaan Ruangan",
      "faktor": "Nyaman/Cukup"
    },
    {
      "nomorUrut": 5,
      "aspek": "Letak",
      "faktor": "Datar/Strategis"
    },
    {
      "nomorUrut": 6,
      "aspek": "Penerangan",
      "faktor": "Terang/Cukup"
    },
    {
      "nomorUrut": 7,
      "aspek": "Suara",
      "faktor": "Tenang/Sunyi"
    },
    {
      "nomorUrut": 8,
      "aspek": "Keadaan Tempat Kerja",
      "faktor": "Bersih/Rapi"
    },
    {
      "nomorUrut": 9,
      "aspek": "Getaran",
      "faktor": "Tidak ada"
    }
  ],
  "risikoBahaya": [
    {
      "nomorUrut": 1,
      "namaRisiko": "Kelelahan mata",
      "penyebab": "Terlalu lama menatap layar komputer"
    }
  ],
  "syaratJabatan": {
    "keterampilanKerja": ["Mengoperasikan komputer"],
    "bakatKerja": ["G", "V", "Q"],
    "temperamenKerja": ["D", "F", "I"],
    "minatKerja": ["1b", "2b"],
    "upayaFisik": ["Duduk", "Melihat"],
    "kondisiFisik": {
      "jenisKelamin": "Laki-laki / Perempuan",
      "umur": "Minimal 23 tahun",
      "tinggiBadan": "155 cm",
      "beratBadan": "Proporsional",
      "posturBadan": "Tegak/Biasa",
      "penampilan": "Rapi dan bersih"
    },
    "fungsiPekerjaan": ["D2", "O6", "B7"]
  },
  "prestasiKerja": {
    "uraian": "Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan."
  }
}

Catatan PENTING:
- WAJIB menghasilkan MINIMAL 5 entri/item untuk tugasPokok, hasilKerja (di root JSON), bahanKerja, perangkatKerja, tanggungJawab, dan wewenang.
- Dalam tugasPokok, kolom hasilKerja harus diisi dengan nama SATUAN singkat saja (misalnya 'Dokumen', 'Berkas', 'Laporan', 'Kegiatan', 'Data', dll).
- Nilai hasilKerja (array di root JSON yang merepresentasikan 7. Hasil Kerja) harus berupa list dari NARASI DESKRIPTIF singkat hasil kerja (bukan satuan/kata tunggal) yang jumlahnya SAMA PERSIS dengan jumlah tugasPokok (berurutan 1-ke-1, minimal 5 item).
- Setiap 'uraianTugas' dalam 'tugasPokok' WAJIB mengandung unsur Bagaimana cara mengerjakan (How) (contoh: 'Sesuai dengan peraturan perundangan yang berlaku', 'Sesuai dengan tugas dan fungsi jabatan', 'Berdasarkan rencana kerja yang ditetapkan') DAN unsur Dalam rangka apa/tujuan (Why) (contoh: 'agar diperoleh kinerja yang diharapkan', 'untuk ketepatan dan kelancaran pelaksanaan tugas', 'demi kelancaran tugas jabatan') yang disesuaikan secara logis dengan level jabatannya.
- Uraian tugas WAJIB disesuaikan dengan Level Jabatan yang dideteksi dari nama jabatan:
  1. Jabatan Pimpinan Tinggi (Eselon I/II) (Fokus: Strategi, kepemimpinan, kebijakan, pengambilan keputusan). Kata kerja utama: Merumuskan, Mengambil (keputusan strategis), Memimpin, Mengkoordinasikan, Mengevaluasi (dan mengendalikan). Contoh: 'Merumuskan kebijakan strategis bidang...'
  2. Jabatan Administrator (Eselon III) (Fokus: Manajemen operasional, perencanaan, pengawasan menengah). Kata kerja utama: Merencanakan, Mengatur, Mengawasi, Mengkoordinasikan, Melaporkan.
  3. Jabatan Pengawas (Eselon IV) (Fokus: Pengawasan langsung, pembinaan, penjaminan kualitas). Kata kerja utama: Mengawasi, Membina, Memantau, Menilai, Mengendalikan.
  4. Jabatan Pelaksana (Fokus: Pelaksanaan teknis, operasional sehari-hari, tugas konkret). Kata kerja utama: Melaksanakan, Menyusun, Mengolah, Menyelesaikan, Mendokumentasikan. Contoh: 'Melaksanakan verifikasi data sesuai prosedur...'
  5. Jabatan Fungsional (Fokus: Keahlian teknis/profesional, analisis mendalam, kompetensi khusus). Kata kerja utama: Menganalisis, Menyusun (laporan/rekomendasi), Melakukan (penelitian/pemeriksaan/pengembangan), Memberikan (rekomendasi/konsultasi), Mengembangkan (metode/sistem/standar).
- bakatKerja hanya boleh berisi kode dari: G, V, N, S, P, Q, K, F, E, C, M.
- temperamenKerja hanya boleh berisi kode dari: D, F, I, J, M, P, R, S, T, V.
- minatKerja hanya boleh berisi kode dari: 1a, 1b, 2a, 2b, 3a, 3b, 4a, 4b, 5a, 5b.
- upayaFisik hanya boleh berisi nilai dari: Berdiri, Berjalan, Duduk, Mengangkat, Membawa, Mendorong, Menarik, Memanjat, Menyimpan imbangan, Menunduk, Berlutut, Membungkuk, Merangkak, Menjangkau, Memegang, Bekerja dengan jari, Meraba, Berbicara, Mendengar, Melihat.`;

async function callGeminiDirect(apiKey: string, modelName: string, promptText: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`;
  
  const responseSchema = {
    type: "OBJECT",
    properties: {
      ikhtisarJabatan: { type: "STRING" },
      kualifikasi: {
        type: "OBJECT",
        properties: {
          pendidikanFormal: { type: "ARRAY", items: { type: "STRING" } },
          pendidikanPelatihan: { type: "ARRAY", items: { type: "STRING" } },
          pengalamanKerja: { type: "ARRAY", items: { type: "STRING" } }
        },
        required: ["pendidikanFormal", "pendidikanPelatihan", "pengalamanKerja"]
      },
      tugasPokok: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            nomorUrut: { type: "INTEGER" },
            uraianTugas: { type: "STRING" },
            hasilKerja: { type: "STRING" },
            waktuPenyelesaian: { type: "INTEGER" }
          },
          required: ["nomorUrut", "uraianTugas", "hasilKerja", "waktuPenyelesaian"]
        }
      },
      hasilKerja: { type: "ARRAY", items: { type: "STRING" } },
      bahanKerja: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            nomorUrut: { type: "INTEGER" },
            namaBahan: { type: "STRING" },
            penggunaanDalamTugas: { type: "STRING" }
          },
          required: ["nomorUrut", "namaBahan", "penggunaanDalamTugas"]
        }
      },
      perangkatKerja: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            nomorUrut: { type: "INTEGER" },
            namaPerangkat: { type: "STRING" },
            penggunaanUntukTugas: { type: "STRING" }
          },
          required: ["nomorUrut", "namaPerangkat", "penggunaanUntukTugas"]
        }
      },
      tanggungJawab: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            nomorUrut: { type: "INTEGER" },
            uraian: { type: "STRING" }
          },
          required: ["nomorUrut", "uraian"]
        }
      },
      wewenang: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            nomorUrut: { type: "INTEGER" },
            uraian: { type: "STRING" }
          },
          required: ["nomorUrut", "uraian"]
        }
      },
      korelasiJabatan: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            nomorUrut: { type: "INTEGER" },
            namaJabatanTerkait: { type: "STRING" },
            unitKerjaInstansi: { type: "STRING" },
            dalamHal: { type: "STRING" }
          },
          required: ["nomorUrut", "namaJabatanTerkait", "unitKerjaInstansi", "dalamHal"]
        }
      },
      kondisiLingkungan: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            nomorUrut: { type: "INTEGER" },
            aspek: { type: "STRING" },
            faktor: { type: "STRING" }
          },
          required: ["nomorUrut", "aspek", "faktor"]
        }
      },
      risikoBahaya: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            nomorUrut: { type: "INTEGER" },
            namaRisiko: { type: "STRING" },
            penyebab: { type: "STRING" }
          },
          required: ["nomorUrut", "namaRisiko", "penyebab"]
        }
      },
      syaratJabatan: {
        type: "OBJECT",
        properties: {
          keterampilanKerja: { type: "ARRAY", items: { type: "STRING" } },
          bakatKerja: { type: "ARRAY", items: { type: "STRING" } },
          temperamenKerja: { type: "ARRAY", items: { type: "STRING" } },
          minatKerja: { type: "ARRAY", items: { type: "STRING" } },
          upayaFisik: { type: "ARRAY", items: { type: "STRING" } },
          kondisiFisik: {
            type: "OBJECT",
            properties: {
              jenisKelamin: { type: "STRING" },
              umur: { type: "STRING" },
              tinggiBadan: { type: "STRING" },
              beratBadan: { type: "STRING" },
              posturBadan: { type: "STRING" },
              penampilan: { type: "STRING" }
            },
            required: ["jenisKelamin", "umur", "tinggiBadan", "beratBadan", "posturBadan", "penampilan"]
          },
          fungsiPekerjaan: { type: "ARRAY", items: { type: "STRING" } }
        },
        required: ["keterampilanKerja", "bakatKerja", "temperamenKerja", "minatKerja", "upayaFisik", "kondisiFisik", "fungsiPekerjaan"]
      },
      prestasiKerja: {
        type: "OBJECT",
        properties: {
          uraian: { type: "STRING" }
        },
        required: ["uraian"]
      }
    },
    required: [
      "ikhtisarJabatan", "kualifikasi", "tugasPokok", "hasilKerja", "bahanKerja",
      "perangkatKerja", "tanggungJawab", "wewenang", "korelasiJabatan",
      "kondisiLingkungan", "risikoBahaya", "syaratJabatan", "prestasiKerja"
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: promptText }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
  }

  const json = await response.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Respons Gemini kosong.");
  return JSON.parse(rawText.trim());
}

async function callOpenAiCompatibleDirect(endpoint: string, apiKey: string, modelName: string, promptText: string) {
  const jsonSchema = {
    name: "AnjabDraft",
    strict: false,
    schema: {
      type: "object",
      properties: {
        ikhtisarJabatan: { type: "string" },
        kualifikasi: {
          type: "object",
          properties: {
            pendidikanFormal: { type: "array", items: { type: "string" } },
            pendidikanPelatihan: { type: "array", items: { type: "string" } },
            pengalamanKerja: { type: "array", items: { type: "string" } }
          },
          required: ["pendidikanFormal", "pendidikanPelatihan", "pengalamanKerja"]
        },
        tugasPokok: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nomorUrut: { type: "integer" },
              uraianTugas: { type: "string" },
              hasilKerja: { type: "string" },
              waktuPenyelesaian: { type: "integer" }
            },
            required: ["nomorUrut", "uraianTugas", "hasilKerja", "waktuPenyelesaian"]
          }
        },
        hasilKerja: { type: "array", items: { type: "string" } },
        bahanKerja: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nomorUrut: { type: "integer" },
              namaBahan: { type: "string" },
              penggunaanDalamTugas: { type: "string" }
            },
            required: ["nomorUrut", "namaBahan", "penggunaanDalamTugas"]
          }
        },
        perangkatKerja: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nomorUrut: { type: "integer" },
              namaPerangkat: { type: "string" },
              penggunaanUntukTugas: { type: "string" }
            },
            required: ["nomorUrut", "namaPerangkat", "penggunaanUntukTugas"]
          }
        },
        tanggungJawab: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nomorUrut: { type: "integer" },
              uraian: { type: "string" }
            },
            required: ["nomorUrut", "uraian"]
          }
        },
        wewenang: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nomorUrut: { type: "integer" },
              uraian: { type: "string" }
            },
            required: ["nomorUrut", "uraian"]
          }
        },
        korelasiJabatan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nomorUrut: { type: "integer" },
              namaJabatanTerkait: { type: "string" },
              unitKerjaInstansi: { type: "string" },
              dalamHal: { type: "string" }
            },
            required: ["nomorUrut", "namaJabatanTerkait", "unitKerjaInstansi", "dalamHal"]
          }
        },
        kondisiLingkungan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nomorUrut: { type: "integer" },
              aspek: { type: "string" },
              faktor: { type: "string" }
            },
            required: ["nomorUrut", "aspek", "faktor"]
          }
        },
        risikoBahaya: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nomorUrut: { type: "integer" },
              namaRisiko: { type: "string" },
              penyebab: { type: "string" }
            },
            required: ["nomorUrut", "namaRisiko", "penyebab"]
          }
        },
        syaratJabatan: {
          type: "object",
          properties: {
            keterampilanKerja: { type: "array", items: { type: "string" } },
            bakatKerja: { type: "array", items: { type: "string" } },
            temperamenKerja: { type: "array", items: { type: "string" } },
            minatKerja: { type: "array", items: { type: "string" } },
            upayaFisik: { type: "array", items: { type: "string" } },
            kondisiFisik: {
              type: "object",
              properties: {
                jenisKelamin: { type: "string" },
                umur: { type: "string" },
                tinggiBadan: { type: "string" },
                beratBadan: { type: "string" },
                posturBadan: { type: "string" },
                penampilan: { type: "string" }
              },
              required: ["jenisKelamin", "umur", "tinggiBadan", "beratBadan", "posturBadan", "penampilan"]
            },
            fungsiPekerjaan: { type: "array", items: { type: "string" } }
          },
          required: ["keterampilanKerja", "bakatKerja", "temperamenKerja", "minatKerja", "upayaFisik", "kondisiFisik", "fungsiPekerjaan"]
        },
        prestasiKerja: {
          type: "object",
          properties: {
            uraian: { type: "string" }
          },
          required: ["uraian"]
        }
      },
      required: [
        "ikhtisarJabatan", "kualifikasi", "tugasPokok", "hasilKerja", "bahanKerja",
        "perangkatKerja", "tanggungJawab", "wewenang", "korelasiJabatan",
        "kondisiLingkungan", "risikoBahaya", "syaratJabatan", "prestasiKerja"
      ]
    }
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "user",
          content: promptText
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: jsonSchema
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  const json = await response.json();
  const rawText = json.choices?.[0]?.message?.content;
  if (!rawText) throw new Error("Respons API kosong.");
  return JSON.parse(rawText.trim());
}

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


