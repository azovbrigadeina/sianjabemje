/**
 * Utility functions for Sianjab ABK
 */

/**
 * Normalisasi pesan error menjadi string yang aman ditampilkan ke user.
 * Mencegah toast/alert menampilkan "[object Object]" atau prefix "Error:".
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const anyErr = err as { message?: unknown; error?: unknown };
    if (typeof anyErr.message === "string" && anyErr.message) return anyErr.message;
    if (typeof anyErr.error === "string" && anyErr.error) return anyErr.error;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Returns current timestamp formatted to Western Indonesia Time (WIB)
 * Example output: "2026-06-24 12:05:30 WIB"
 */
export const getWibTimestamp = (): string => {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
    
    const day = getPart("day");
    const month = getPart("month");
    const year = getPart("year");
    const hour = getPart("hour");
    const minute = getPart("minute");
    const second = getPart("second");
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second} WIB`;
  } catch {
    // Basic fallback if Intl is not fully supported or throws an error
    const now = new Date();
    // UTC time + 7 hours for WIB
    const wibDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const isoString = wibDate.toISOString(); // "YYYY-MM-DDTHH:mm:ss.sssZ"
    const datePart = isoString.split('T')[0];
    const timePart = isoString.split('T')[1].substring(0, 8);
    return `${datePart} ${timePart} WIB`;
  }
};

export interface JabatanLike {
  id?: string;
  kodeJabatan?: string;
  unitKerjaId?: string;
  level?: number;
  hierarchy?: Record<string, string>;
  jenisJabatan?: string;
}

export function generateKodeJabatan(jabatan: JabatanLike): string {
  const displayKode = jabatan.kodeJabatan || "";
  if (displayKode && !displayKode.startsWith("jbt_") && displayKode !== "-" && !displayKode.includes("null")) {
    return displayKode;
  }

  const opdCode = jabatan.unitKerjaId
    ? (jabatan.unitKerjaId.replace(/[^0-9]/g, '').slice(-2) || ((jabatan.unitKerjaId.length % 90) + 10).toString())
    : "14";
  
  let levelCode = 2;
  if (jabatan.level !== undefined && jabatan.level !== null && jabatan.level !== 0) {
    levelCode = jabatan.level;
  } else if (jabatan.hierarchy) {
    const h = jabatan.hierarchy;
    let count = 0;
    if (h.jptUtama) count++;
    if (h.jptMadya) count++;
    if (h.jptPratama) count++;
    if (h.administrator) count++;
    if (h.pengawas) count++;
    if (h.pelaksana) count++;
    if (h.jabatanFungsional) count++;
    if (count > 0) {
      levelCode = count;
    }
  }

  const subCode = jabatan.jenisJabatan === "Administrator" ? 1 : 
                  jabatan.jenisJabatan === "Pengawas" ? 2 : 
                  jabatan.jenisJabatan === "Pelaksana" ? 3 : 0;
  
  // Deterministic sequence from ID hash
  let sum = 0;
  const idStr = jabatan.id || "";
  for (let i = 0; i < idStr.length; i++) {
    sum += idStr.charCodeAt(i);
  }
  const seqCode = (sum % 9) + 1;
  return `${opdCode}.${levelCode}.${subCode}.${seqCode}`;
}

export function filterTreeNodes<T extends { label: string; children?: T[] }>(nodes: T[], query: string): T[] {
  if (!query || !query.trim()) return nodes;
  const q = query.toLowerCase().trim();
  
  const filter = (items: T[]): T[] => {
    const result: T[] = [];
    for (const node of items) {
      const matchLabel = (node.label || '').toLowerCase().includes(q);
      const filteredChildren = node.children ? filter(node.children) : [];
      if (matchLabel || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren
        });
      }
    }
    return result;
  };
  
  return filter(nodes);
}

 /**
 * SSOT WKE (Waktu Kerja Efektif) untuk seluruh aplikasi: FIX 1250 jam/tahun
 * (setara 75000 menit/tahun). Rumus kebutuhan pegawai:
 *   Kebutuhan Pegawai per uraian tugas = Waktu (jam) × Volume/tahun ÷ 1250
 *   Kebutuhan Pegawai total           = Σ Kebutuhan per uraian tugas
 *   Pembulatan Formasi                = pembulatan dari total di atas.
 */
export const WKE_DEFAULT_JAM = 1250;

/**
 * Legacy-only: WKE untuk membaca data lama berlabel satuan menit
 * (75000 = 1250 jam × 60). Konsep aktif aplikasi adalah jam; helper ini
 * hanya dipakai saat ekspor/memuat data ekspor legacy (waktuSatuan 'menit').
 */
export function wkeLegacyDariSatuan(satuan?: string): number {
  return satuan === 'menit' ? WKE_DEFAULT_JAM * 60 : WKE_DEFAULT_JAM;
}

/**
 * Normalisasi waktu Anjab ke jam (SSOT satuan tunggal: JAM).
 * Sejak mesin draf AI berpindah ke jam, Anjab memuat jam. Baris legasi
 * berformat menit dideteksi per-baris: nilai > 8 (di atas clamp 8 jam/hari)
 * dianggap menit dan dikonversi ÷60.
 */
export function normalisasiWaktuJam(nilai: number): number {
  const n = Number(nilai) || 0;
  if (n <= 0) return 0;
  return n > 8 ? Math.round((n / 60) * 10000) / 10000 : n;
}

/**
 * Waktu efektif satu uraian tugas = Waktu (per satu hasil kerja) × Volume/tahun.
 * Satuan waktu ikut satuan yang dipilih (jam atau menit), tetap konsisten
 * dengan satuan WKE yang dipakai.
 */
export function hitungWaktuEfektif(waktu: number, volume: number): number {
  return (Number(waktu) || 0) * (Number(volume) || 0);
}

/**
 * Kebutuhan Pegawai per uraian tugas = Waktu × Volume/tahun ÷ WKE (default 1250).
 * Satuan WKE harus sama dengan satuan `waktu` (jam↔jam, menit↔menit).
 */
export function hitungKebutuhanPegawai(waktu: number, volume: number, wke: number): number {
  const w = Number(wke) || 0;
  if (w <= 0) return 0;
  return hitungWaktuEfektif(waktu, volume) / w;
}

/**
 * Calculates formasi pembulatan for ABK:
 * - If totalKebutuhan <= 0 -> 0
 * - If 0 < totalKebutuhan < 1.5 -> 1
 * - If totalKebutuhan >= 1.5 -> Math.round(totalKebutuhan) (standard >= 0.5 threshold)
 */
export function calculateFormasiPembulatan(totalKebutuhan: number): number {
  const val = Number(totalKebutuhan) || 0;
  if (val <= 0) return 0;
  if (val < 1.5) return 1;
  return Math.round(val);
}

/**
 * Klasifikasi kategori jabatan untuk batas formasi (paritas dengan
 * verifyFormasiIdeal_ di gas/Code.gs):
 * - struktural: Pimpinan Tinggi / Administrator / Pengawas -> formasi selalu 1
 * - fungsional / pelaksana: formasi minimal 2, tanpa cap atas
 */
export function getJenisJabatanKategori(jenisJabatan: string): 'struktural' | 'fungsional' | 'pelaksana' | 'lainnya' {
  const j = String(jenisJabatan || "").toLowerCase();
  if (j.indexOf("pimpinan tinggi") !== -1 || j.indexOf("administrator") !== -1 || j.indexOf("pengawas") !== -1) return "struktural";
  if (j.indexOf("fungsional") !== -1) return "fungsional";
  if (j.indexOf("pelaksana") !== -1) return "pelaksana";
  return "lainnya";
}

/**
 * Terapkan batas formasi per jenis jabatan pada hasil pembulatan ABK.
 * Sesuai keputusan pengguna: struktural = 1 orang (satu posisi satu pemangku);
 * pelaksana/fungsional minimal 2 orang (dibantu hierarki di atasnya).
 */
export function applyFormasiBatas(pembulatan: number, jenisJabatan: string): number {
  const val = Number(pembulatan) || 0;
  const kategori = getJenisJabatanKategori(jenisJabatan);
  if (kategori === "struktural") return val > 0 ? 1 : 0;
  if ((kategori === "pelaksana" || kategori === "fungsional") && val > 0 && val < 2) return 2;
  return val;
}

