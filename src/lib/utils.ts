/**
 * Utility functions for Sianjab ABK
 */

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
  } catch (err) {
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

