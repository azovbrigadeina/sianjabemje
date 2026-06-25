import * as XLSX from 'xlsx';
import {
  parseBakatKerja,
  parseTemperamenKerja,
  parseMinatKerja,
  parseUpayaFisik,
  mapFungsiPekerjaan
} from './importXlsx';

const SECTION_KEYWORDS = [
  "nama jabatan", "iktisar jabatan", "ikhtisar jabatan",
  "tugas pokok", "tanggung jawab", "wewenang",
  "bahan kerja", "perangkat kerja", "korelasi jabatan",
  "kondisi lingkungan", "resiko bahaya"
];

function findNamaJabatan(rows: any[][]): string | null {
  const numRows = rows.length;
  for (let r = 0; r < Math.min(numRows, 30); r++) {
    const row = rows[r] || [];
    const numCols = row.length;
    for (let c = 0; c < Math.min(numCols, 6); c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      if (v.toString().trim().toLowerCase() === "nama jabatan") {
        for (let offset = 1; offset <= 8; offset++) {
          if (c + offset < numCols) {
            const nv = row[c + offset];
            if (nv !== undefined && nv !== null && nv !== '') {
              const vs = nv.toString().trim();
              if (vs && vs !== ":") return vs;
            }
          }
        }
      }
    }
  }
  return null;
}

function findIktisar(rows: any[][]): string | null {
  const numRows = rows.length;
  for (let r = 0; r < Math.min(numRows, 30); r++) {
    const row = rows[r] || [];
    const numCols = row.length;
    for (let c = 0; c < Math.min(numCols, 6); c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase();
      if (s === "iktisar jabatan" || s === "ikhtisar jabatan") {
        for (let offset = 1; offset <= 8; offset++) {
          if (c + offset < numCols) {
            const nv = row[c + offset];
            if (nv !== undefined && nv !== null && nv !== '') {
              const vs = nv.toString().trim();
              if (vs && vs !== ":") return vs;
            }
          }
        }
      }
    }
  }
  return null;
}

export function scoreSheet(rows: any[][], sheetName: string) {
  let score = 0;
  const info: any = { nama_jabatan: null, iktisar: null, keywords: 0, is_template: false };

  const foundKw = new Set<string>();
  let nonEmpty = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      nonEmpty++;
      const s = v.toString().trim().toLowerCase();
      for (const kw of SECTION_KEYWORDS) {
        if (s === kw) {
          foundKw.add(kw);
        }
      }
    }
  }
  info.keywords = foundKw.size;
  score += foundKw.size;

  const nama = findNamaJabatan(rows);
  info.nama_jabatan = nama;
  if (nama) {
    if (nama.toLowerCase().includes("lihat petunjuk") || nama.toLowerCase().includes("petunjuk")) {
      score -= 50;
      info.is_template = true;
    } else {
      score += 20;
    }
  }

  const iktisar = findIktisar(rows);
  info.iktisar = iktisar;
  if (iktisar && iktisar.length > 10) {
    score += 15;
  }

  const sn = sheetName.toLowerCase();
  if (sn.includes("petunjuk")) {
    score -= 100;
  }
  if (sn === "sheet1" || sn === "sheet2" || sn === "sheet3") {
    score -= 10;
  }

  if (nonEmpty > 300) {
    score += 5;
  }

  return { score, info };
}

export function analyzeSheets(wb: XLSX.WorkBook) {
  const results: any[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    const { score, info } = scoreSheet(rows, name);
    results.push({ name, score, info });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

export function formatSheetLabel(name: string, score: number, info: any) {
  const maxScore = 50;
  const pct = Math.max(0, Math.min(100, Math.floor((score / maxScore) * 100)));
  const nama = info.nama_jabatan || "—";
  const displayNama = nama.length > 40 ? nama.substring(0, 37) + "..." : nama;

  if (info.is_template) {
    return `⚠️ ${name} — ${pct}% — "${displayNama}" (template)`;
  } else if (score <= 0) {
    return `❌ ${name} — ${pct}% — sheet kosong/panduan`;
  } else {
    return `✅ ${name} — ${pct}% — "${displayNama}"`;
  }
}

export function findSectionByText(rows: any[][], labelText: string): [number, number] | [null, null] {
  const numRows = rows.length;
  const labelLower = labelText.toLowerCase().trim();
  
  const withNumber: [number, number][] = [];
  const withoutNumber: [number, number][] = [];
  
  for (let r = 0; r < numRows; r++) {
    const row = rows[r] || [];
    const numCols = row.length;
    for (let c = 0; c < Math.min(numCols, 8); c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      if (v.toString().trim().toLowerCase() === labelLower) {
        let hasNum = false;
        if (c > 0) {
          const prev = row[c - 1];
          if (prev !== undefined && prev !== null && prev !== '') {
            const prevStr = prev.toString().trim();
            if (/^\d+$/.test(prevStr)) {
              hasNum = true;
            }
          }
        }
        if (hasNum) {
          withNumber.push([r, c]);
        } else {
          withoutNumber.push([r, c]);
        }
      }
    }
  }
  
  if (withNumber.length > 0) {
    return withNumber.reduce((min, cur) => cur[1] < min[1] ? cur : min, withNumber[0]);
  }
  
  if (withoutNumber.length > 0) {
    return withoutNumber.reduce((min, cur) => cur[1] < min[1] ? cur : min, withoutNumber[0]);
  }
  
  const fallback: [number, number][] = [];
  for (let r = 0; r < numRows; r++) {
    const row = rows[r] || [];
    const numCols = row.length;
    for (let c = 0; c < Math.min(numCols, 6); c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase();
      if (s.includes(labelLower) && s.length < labelLower.length + 15) {
        fallback.push([r, c]);
      }
    }
  }
  if (fallback.length > 0) {
    return fallback.reduce((min, cur) => cur[1] < min[1] ? cur : min, fallback[0]);
  }
  
  return [null, null];
}

export function extractSingleValue(rows: any[][], labels: string | string[], logMsgs?: string[]): string | null {
  const numRows = rows.length;
  const labelList = Array.isArray(labels) ? labels : [labels];
  const labelsLower = labelList.map(l => l.toLowerCase().trim());
  
  for (let r = 0; r < numRows; r++) {
    const row = rows[r] || [];
    const numCols = row.length;
    for (let c = 0; c < Math.min(numCols, 8); c++) {
      const val = row[c];
      if (val === undefined || val === null || val === '') continue;
      const s = val.toString().trim().toLowerCase();
      if (labelsLower.includes(s)) {
        for (let offset = 1; offset <= 8; offset++) {
          if (c + offset >= numCols) break;
          const nv = row[c + offset];
          if (nv === undefined || nv === null || nv === '') continue;
          const vs = nv.toString().trim();
          if (vs === ":") continue;
          if (vs) {
            if (logMsgs) {
              logMsgs.push(`✅ '${labelList[0]}' ditemukan (baris ${r + 1}).`);
            }
            return vs;
          }
        }
      }
    }
  }
  
  if (logMsgs) {
    logMsgs.push(`⚠️ '${labelList[0]}' tidak ditemukan.`);
  }
  return null;
}

export function extractMultiValueExact(rows: any[][], label: string, rightOffset: number, downOffset: number, logMsgs?: string[]): string[] {
  const numRows = rows.length;
  const labelLower = label.toLowerCase().trim();
  const found: [number, number][] = [];
  
  for (let r = 0; r < numRows; r++) {
    const row = rows[r] || [];
    const numCols = row.length;
    for (let c = 0; c < Math.min(numCols, 8); c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      if (v.toString().trim().toLowerCase() === labelLower) {
        found.push([r, c]);
      }
    }
  }
  
  if (found.length === 0) {
    if (logMsgs) {
      logMsgs.push(`⚠️ Label '${label}' tidak ditemukan.`);
    }
    return [];
  }
  
  const [r, c] = found[found.length - 1];
  const startRow = r + downOffset;
  const startCol = c + rightOffset;
  const results: string[] = [];
  let firstFound = false;
  
  for (let rr = startRow; rr < numRows; rr++) {
    const row = rows[rr] || [];
    if (startCol >= row.length) break;
    const v = row[startCol];
    if (!firstFound) {
      if (v === undefined || v === null || v.toString().trim() === "") continue;
      firstFound = true;
    }
    if (firstFound) {
      if (v === undefined || v === null || v.toString().trim() === "") break;
      results.push(v.toString().trim());
    }
  }
  
  if (logMsgs) {
    logMsgs.push(`✅ '${label}' ditemukan (baris ${r + 1}, kolom ${c + 1}) — ${results.length} data.`);
  }
  return results;
}

export function extractTugasPokokSmart(rows: any[][], logMsgs?: string[]) {
  const numRows = rows.length;
  let tpRow: number | null = null;
  let tpCol: number | null = null;
  
  for (let r = 0; r < numRows; r++) {
    const row = rows[r] || [];
    const numCols = row.length;
    for (let c = 0; c < Math.min(numCols, 8); c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      if (v.toString().trim().toLowerCase() === "tugas pokok") {
        tpRow = r;
        tpCol = c;
        break;
      }
    }
    if (tpRow !== null) break;
  }
  
  if (tpRow === null || tpCol === null) {
    if (logMsgs) {
      logMsgs.push("⚠️ Label 'Tugas Pokok' tidak ditemukan.");
    }
    return { uraian: [], satuan: [], beban: [], waktuEfektif: [], waktuSelesai: [] };
  }
  
  let colUraian = tpCol + 3;
  let colSatuan = tpCol + 6;
  let colBeban = tpCol + 7;
  let colWaktuEfektif = tpCol + 9;
  let colWaktuSelesai = tpCol + 8;
  
  const headerKeywords = ["uraian", "satuan", "beban", "waktu", "hasil kerja", "jumlah"];
  let detectedHeaderRow: number | null = null;
  
  for (let scanR = tpRow + 1; scanR < Math.min(tpRow + 5, numRows); scanR++) {
    const row = rows[scanR] || [];
    for (let scanC = 0; scanC < row.length; scanC++) {
      const v = row[scanC];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase();
      if (s.includes("uraian") && s.includes("tugas")) {
        colUraian = scanC;
        detectedHeaderRow = scanR;
      } else if (s === "satuan hasil kerja" || s === "satuan hasil" || s === "satuan" || s === "hasil kerja") {
        colSatuan = scanC;
      } else if (s.includes("beban kerja") || s.includes("jumlah hasil")) {
        colBeban = scanC;
      } else if (s.includes("waktu kerja efektif") || s.includes("waktu efektif")) {
        colWaktuEfektif = scanC;
      } else if (s.includes("waktu penyelesaian")) {
        colWaktuSelesai = scanC;
      }
    }
  }
  
  let dataStart = detectedHeaderRow !== null ? detectedHeaderRow + 1 : tpRow + 3;
  
  for (let scanR = dataStart; scanR < Math.min(dataStart + 5, numRows); scanR++) {
    const row = rows[scanR] || [];
    if (colUraian < row.length && row[colUraian] !== undefined && row[colUraian] !== null) {
      const val = row[colUraian].toString().trim().toLowerCase();
      if (headerKeywords.some(kw => val.includes(kw))) {
        continue;
      }
      if (val.length > 5) {
        dataStart = scanR;
        break;
      }
    }
  }
  
  const extractCol = (colIdx: number): string[] => {
    const results: string[] = [];
    let firstFound = false;
    for (let rr = dataStart; rr < numRows; rr++) {
      const row = rows[rr] || [];
      if (colIdx >= row.length) break;
      const v = row[colIdx];
      if (!firstFound) {
        if (v === undefined || v === null || v.toString().trim() === "") continue;
        firstFound = true;
      }
      if (firstFound) {
        if (v === undefined || v === null || v.toString().trim() === "") break;
        results.push(v.toString().trim());
      }
    }
    return results;
  };
  
  const uraian = extractCol(colUraian);
  const satuan = extractCol(colSatuan);
  const beban = extractCol(colBeban);
  const waktuEfektif = extractCol(colWaktuEfektif);
  const waktuSelesai = extractCol(colWaktuSelesai);
  
  if (logMsgs) {
    logMsgs.push(`✅ 'Tugas Pokok' ditemukan (baris ${tpRow + 1}) — ${uraian.length} uraian tugas.`);
  }
  
  return { uraian, satuan, beban, waktuEfektif, waktuSelesai };
}

export interface BahanPerangkatExtracted {
  name: string;
  use: string;
}

export function extractBahanKerja(rows: any[][], logMsgs?: string[]): BahanPerangkatExtracted[] {
  const numRows = rows.length;
  const [labelRow, labelCol] = findSectionByText(rows, "bahan kerja");
  
  if (labelRow === null || labelCol === null) {
    if (logMsgs) {
      logMsgs.push("⚠️ Label 'Bahan Kerja' tidak ditemukan.");
    }
    return [];
  }
  
  let nameCol = labelCol + 3;
  let useCol = labelCol + 7;
  let startRow = labelRow + 2;
  
  for (let rr = labelRow + 1; rr < Math.min(labelRow + 4, numRows); rr++) {
    const row = rows[rr] || [];
    for (let cc = 0; cc < row.length; cc++) {
      const v = row[cc];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase();
      if (s === "bahan kerja" || s === "nama bahan") {
        nameCol = cc;
        startRow = rr + 1;
      } else if (s.includes("penggunaan") || s.includes("dalam tugas")) {
        useCol = cc;
      }
    }
  }
  
  const results: BahanPerangkatExtracted[] = [];
  let firstFound = false;
  
  for (let rr = startRow; rr < numRows; rr++) {
    const row = rows[rr] || [];
    if (nameCol >= row.length) break;
    const nVal = row[nameCol];
    const uVal = useCol < row.length ? row[useCol] : '';
    
    const nStr = nVal !== undefined && nVal !== null ? nVal.toString().trim() : '';
    const uStr = uVal !== undefined && uVal !== null ? uVal.toString().trim() : 'Sesuai tugas';
    
    if (!firstFound) {
      if (nStr === '') continue;
      firstFound = true;
    }
    
    if (firstFound) {
      if (nStr === '') break;
      results.push({ name: nStr, use: uStr || 'Sesuai tugas' });
    }
  }
  
  if (logMsgs) {
    logMsgs.push(`✅ 'Bahan Kerja' ditemukan (baris ${labelRow + 1}) — ${results.length} data.`);
  }
  return results;
}

export function extractPerangkatKerja(rows: any[][], logMsgs?: string[]): BahanPerangkatExtracted[] {
  const numRows = rows.length;
  const [labelRow, labelCol] = findSectionByText(rows, "perangkat kerja");
  
  if (labelRow === null || labelCol === null) {
    if (logMsgs) {
      logMsgs.push("⚠️ Label 'Perangkat Kerja' tidak ditemukan.");
    }
    return [];
  }
  
  let nameCol = labelCol + 3;
  let useCol = labelCol + 7;
  let startRow = labelRow + 2;
  
  for (let rr = labelRow + 1; rr < Math.min(labelRow + 4, numRows); rr++) {
    const row = rows[rr] || [];
    for (let cc = 0; cc < row.length; cc++) {
      const v = row[cc];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase();
      if (s === "perangkat kerja" || s === "nama perangkat") {
        nameCol = cc;
        startRow = rr + 1;
      } else if (s.includes("penggunaan") || s.includes("untuk tugas")) {
        useCol = cc;
      }
    }
  }
  
  const results: BahanPerangkatExtracted[] = [];
  let firstFound = false;
  
  for (let rr = startRow; rr < numRows; rr++) {
    const row = rows[rr] || [];
    if (nameCol >= row.length) break;
    const nVal = row[nameCol];
    const uVal = useCol < row.length ? row[useCol] : '';
    
    const nStr = nVal !== undefined && nVal !== null ? nVal.toString().trim() : '';
    const uStr = uVal !== undefined && uVal !== null ? uVal.toString().trim() : 'Alat penyelesaian tugas';
    
    if (!firstFound) {
      if (nStr === '') continue;
      firstFound = true;
    }
    
    if (firstFound) {
      if (nStr === '') break;
      results.push({ name: nStr, use: uStr || 'Alat penyelesaian tugas' });
    }
  }
  
  if (logMsgs) {
    logMsgs.push(`✅ 'Perangkat Kerja' ditemukan (baris ${labelRow + 1}) — ${results.length} data.`);
  }
  return results;
}

export interface KorelasiExtracted {
  jabatanTerkait: string;
  unitKerja: string;
  dalamHal: string;
}

export function extractKorelasiJabatan(rows: any[][], logMsgs?: string[]): KorelasiExtracted[] {
  const numRows = rows.length;
  const [labelRow, labelCol] = findSectionByText(rows, "korelasi jabatan");
  
  if (labelRow === null || labelCol === null) {
    if (logMsgs) {
      logMsgs.push("⚠️ Label 'Korelasi Jabatan' tidak ditemukan.");
    }
    return [];
  }
  
  let jabCol = labelCol + 3;
  let unitCol = labelCol + 6;
  let halCol = labelCol + 8;
  let startRow = labelRow + 2;
  let foundHeaders = false;
  
  for (let rr = labelRow + 1; rr < Math.min(labelRow + 12, numRows); rr++) {
    const row = rows[rr] || [];
    let tempJab = -1, tempUnit = -1, tempHal = -1;
    for (let cc = 0; cc < row.length; cc++) {
      const v = row[cc];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase().replace(/\s+/g, "").replace("/", "");
      if (s === "jabatan" || s === "jabatanterkait") {
        tempJab = cc;
      } else if (s.includes("unitkerja") || s.includes("instansi")) {
        tempUnit = cc;
      } else if (s.includes("dalamhal") || s === "hal") {
        tempHal = cc;
      }
    }
    if (tempJab !== -1 && tempUnit !== -1) {
      jabCol = tempJab;
      unitCol = tempUnit;
      if (tempHal !== -1) halCol = tempHal;
      startRow = rr + 1;
      foundHeaders = true;
      break;
    }
  }
  
  if (!foundHeaders && logMsgs) {
    logMsgs.push("ℹ️ Header Korelasi tidak ditemukan, menggunakan fallback posisi.");
  }
  
  const results: KorelasiExtracted[] = [];
  for (let rr = startRow; rr < numRows; rr++) {
    const row = rows[rr] || [];
    if (jabCol >= row.length) break;
    
    const jVal = row[jabCol];
    const uVal = unitCol < row.length ? row[unitCol] : '';
    const hVal = halCol < row.length ? row[halCol] : '';
    
    const jStr = jVal !== undefined && jVal !== null ? jVal.toString().trim() : '';
    const uStr = uVal !== undefined && uVal !== null ? uVal.toString().trim() : '';
    const hStr = hVal !== undefined && hVal !== null ? hVal.toString().trim() : '';
    
    if (jStr === '' && uStr === '' && hStr === '') break;
    if (jStr !== '') {
      results.push({
        jabatanTerkait: jStr,
        unitKerja: uStr,
        dalamHal: hStr
      });
    }
  }
  
  if (logMsgs) {
    logMsgs.push(`✅ 'Korelasi Jabatan' ditemukan (baris ${labelRow + 1}) — ${results.length} data.`);
  }
  return results;
}

export interface LingkunganExtracted {
  aspek: string;
  faktor: string;
}

export function extractKondisiLingkungan(rows: any[][], logMsgs?: string[]): LingkunganExtracted[] {
  const numRows = rows.length;
  let labelRow: number | null = null;
  let labelCol: number | null = null;
  
  for (let r = 0; r < numRows; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < Math.min(row.length, 8); c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase().replace(":", "").trim();
      if (s === "kondisi lingkungan kerja" || s === "kondisi lingkungan") {
        labelRow = r;
        labelCol = c;
        break;
      }
    }
    if (labelRow !== null) break;
  }
  
  if (labelRow === null || labelCol === null) {
    if (logMsgs) {
      logMsgs.push("⚠️ Label 'Kondisi Lingkungan Kerja' tidak ditemukan.");
    }
    return [];
  }
  
  let aspekCol = labelCol + 3;
  let faktorCol = labelCol + 7;
  let startRow = labelRow + 2;
  
  for (let rr = labelRow + 1; rr < Math.min(labelRow + 4, numRows); rr++) {
    const row = rows[rr] || [];
    for (let cc = 0; cc < row.length; cc++) {
      const v = row[cc];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase();
      if (s === "aspek") {
        aspekCol = cc;
        startRow = rr + 1;
      } else if (s === "faktor") {
        faktorCol = cc;
      }
    }
  }
  
  const results: LingkunganExtracted[] = [];
  for (let rr = startRow; rr < numRows; rr++) {
    const row = rows[rr] || [];
    if (aspekCol >= row.length) break;
    const aVal = row[aspekCol];
    const fVal = faktorCol < row.length ? row[faktorCol] : '';
    
    const aStr = aVal !== undefined && aVal !== null ? aVal.toString().trim() : '';
    const fStr = fVal !== undefined && fVal !== null ? fVal.toString().trim() : '';
    
    if (aStr === '' && fStr === '') break;
    if (aStr !== '') {
      results.push({ aspek: aStr, faktor: fStr });
    }
  }
  
  if (logMsgs) {
    logMsgs.push(`✅ 'Kondisi Lingkungan' ditemukan (baris ${labelRow + 1}) — ${results.length} data.`);
  }
  return results;
}

export interface RisikoExtracted {
  resiko: string;
  penyebab: string;
}

export function extractRisikoBahaya(rows: any[][], logMsgs?: string[]): RisikoExtracted[] {
  const numRows = rows.length;
  let labelRow: number | null = null;
  let labelCol: number | null = null;
  
  for (let r = 0; r < numRows; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < Math.min(row.length, 8); c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase();
      if (s === "resiko bahaya" || s === "risiko bahaya") {
        labelRow = r;
        labelCol = c;
        break;
      }
    }
    if (labelRow !== null) break;
  }
  
  if (labelRow === null || labelCol === null) {
    if (logMsgs) {
      logMsgs.push("⚠️ Label 'Resiko Bahaya' tidak ditemukan.");
    }
    return [];
  }
  
  let resikoCol = labelCol + 3;
  let penyebabCol = labelCol + 6;
  let startRow = labelRow + 2;
  
  for (let rr = labelRow + 1; rr < Math.min(labelRow + 4, numRows); rr++) {
    const row = rows[rr] || [];
    for (let cc = 0; cc < row.length; cc++) {
      const v = row[cc];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase();
      if (s === "resiko" || s === "risiko" || (s.includes("nama") && s.includes("ris"))) {
        resikoCol = cc;
        startRow = rr + 1;
      } else if (s === "penyebab") {
        penyebabCol = cc;
      }
    }
  }
  
  const results: RisikoExtracted[] = [];
  for (let rr = startRow; rr < numRows; rr++) {
    const row = rows[rr] || [];
    if (resikoCol >= row.length) break;
    const rVal = row[resikoCol];
    const pVal = penyebabCol < row.length ? row[penyebabCol] : '';
    
    const rStr = rVal !== undefined && rVal !== null ? rVal.toString().trim() : '';
    const pStr = pVal !== undefined && pVal !== null ? pVal.toString().trim() : '';
    
    if (rStr === '' && pStr === '') break;
    if (rStr !== '') {
      results.push({ resiko: rStr, penyebab: pStr });
    }
  }
  
  if (logMsgs) {
    logMsgs.push(`✅ 'Resiko Bahaya' ditemukan (baris ${labelRow + 1}) — ${results.length} data.`);
  }
  return results;
}

export interface SyaratJabatanExtracted {
  keterampilanKerja: string[];
  bakatKerja: string[];
  temperamenKerja: string[];
  minatKerja: string[];
  upayaFisik: string[];
  kondisiFisik: {
    jenisKelamin: string;
    umur: string;
    tinggiBadan: string;
    beratBadan: string;
    posturBadan: string;
    penampilan: string;
  };
  fungsiPekerjaan: string[];
}

export function extractSyaratJabatan(rows: any[][], logMsgs?: string[]): SyaratJabatanExtracted | null {
  const numRows = rows.length;
  let labelRow: number | null = null;
  let labelCol: number | null = null;
  
  for (let r = 0; r < numRows; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < Math.min(row.length, 8); c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim().toLowerCase();
      if (s.includes("syarat jabatan")) {
        labelRow = r;
        labelCol = c;
        break;
      }
    }
    if (labelRow !== null) break;
  }
  
  if (labelRow === null || labelCol === null) {
    if (logMsgs) {
      logMsgs.push("⚠️ Section 'Syarat Jabatan' tidak ditemukan.");
    }
    return null;
  }
  
  const result: SyaratJabatanExtracted = {
    keterampilanKerja: [],
    bakatKerja: [],
    temperamenKerja: [],
    minatKerja: [],
    upayaFisik: [],
    kondisiFisik: {
      jenisKelamin: '',
      umur: '',
      tinggiBadan: '',
      beratBadan: '',
      posturBadan: '',
      penampilan: ''
    },
    fungsiPekerjaan: []
  };
  
  const keterampilanList: string[] = [];
  const bakatList: string[] = [];
  const temperamenList: string[] = [];
  const minatList: string[] = [];
  const upayaList: string[] = [];
  
  const dataFungsiList: string[] = [];
  const orangFungsiList: string[] = [];
  const bendaFungsiList: string[] = [];
  
  for (let r = labelRow + 1; r < numRows; r++) {
    const row = rows[r] || [];
    const numCols = row.length;
    
    if (numCols > 0) {
      const col1 = row[1];
      const col2 = row[2];
      const checkText1 = col1 ? col1.toString().toLowerCase() : '';
      const checkText2 = col2 ? col2.toString().toLowerCase() : '';
      if (checkText1.includes("prestasi kerja") || checkText2.includes("prestasi kerja") ||
          checkText1.includes("kelas jabatan") || checkText2.includes("kelas jabatan")) {
        break;
      }
    }
    
    let itemLabel = '';
    let itemValue = '';
    
    for (let c = 0; c < numCols; c++) {
      const v = row[c];
      if (v === undefined || v === null || v === '') continue;
      const s = v.toString().trim();
      
      const lower = s.toLowerCase();
      if (lower.includes("keterampilan kerja") || lower.includes("bakat kerja") || 
          lower.includes("temperamen kerja") || lower.includes("minat kerja") ||
          lower.includes("upaya fisik") || lower.includes("kondisi fisik") ||
          lower.includes("fungsi pekerjaan") || lower.includes("jenis kelamin") ||
          lower.includes("umur") || lower.includes("tinggi badan") ||
          lower.includes("berat badan") || lower.includes("postur badan") ||
          lower.includes("penampilan") || lower.includes("data") ||
          lower.includes("orang") || lower.includes("benda")) {
        
        for (let offset = 1; offset <= 8; offset++) {
          if (c + offset >= numCols) break;
          const nv = row[c + offset];
          if (nv === undefined || nv === null || nv === '') continue;
          let nvStr = nv.toString().trim();
          if (nvStr.startsWith(":")) {
            nvStr = nvStr.substring(1).trim();
          }
          if (nvStr) {
            itemLabel = lower;
            itemValue = nvStr;
            break;
          }
        }
      }
      if (itemLabel) break;
    }
    
    if (!itemLabel) continue;
    
    if (itemLabel.includes("keterampilan kerja")) {
      keterampilanList.push(itemValue);
    } else if (itemLabel.includes("bakat kerja")) {
      bakatList.push(itemValue);
    } else if (itemLabel.includes("temperamen kerja")) {
      temperamenList.push(itemValue);
    } else if (itemLabel.includes("minat kerja")) {
      minatList.push(itemValue);
    } else if (itemLabel.includes("upaya fisik")) {
      upayaList.push(itemValue);
    } else if (itemLabel.includes("jenis kelamin")) {
      result.kondisiFisik.jenisKelamin = itemValue;
    } else if (itemLabel.includes("umur")) {
      result.kondisiFisik.umur = itemValue;
    } else if (itemLabel.includes("tinggi badan")) {
      result.kondisiFisik.tinggiBadan = itemValue;
    } else if (itemLabel.includes("berat badan")) {
      result.kondisiFisik.beratBadan = itemValue;
    } else if (itemLabel.includes("postur badan")) {
      result.kondisiFisik.posturBadan = itemValue;
    } else if (itemLabel.includes("penampilan")) {
      result.kondisiFisik.penampilan = itemValue;
    } else if (itemLabel.includes("data")) {
      dataFungsiList.push(itemValue);
    } else if (itemLabel.includes("orang")) {
      orangFungsiList.push(itemValue);
    } else if (itemLabel.includes("benda")) {
      bendaFungsiList.push(itemValue);
    }
  }
  
  result.keterampilanKerja = keterampilanList.join("\n").split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  result.bakatKerja = parseBakatKerja(bakatList.join("\n"));
  result.temperamenKerja = parseTemperamenKerja(temperamenList.join("\n"));
  result.minatKerja = parseMinatKerja(minatList.join("\n"));
  result.upayaFisik = parseUpayaFisik(upayaList.join("\n"));
  result.fungsiPekerjaan = mapFungsiPekerjaan(
    dataFungsiList.join("\n"),
    orangFungsiList.join("\n"),
    bendaFungsiList.join("\n")
  );
  
  if (logMsgs) {
    logMsgs.push("✅ Syarat Jabatan berhasil diekstrak.");
  }
  return result;
}
