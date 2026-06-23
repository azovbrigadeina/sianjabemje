import * as XLSX from 'xlsx';
import type { JabatanFull, TugasPokok, BahanKerja, PerangkatKerja, TanggungJawab, Wewenang, KorelasiJabatan, KondisiLingkungan, RisikoBahaya, SyaratJabatan, Kualifikasi } from './types';

// ==========================================
// EXCEL TEMPLATE GENERATOR
// ==========================================
export function downloadTemplateXlsx(jabatan: JabatanFull) {
  const wb = XLSX.utils.book_new();

  // Create a single sheet with standardized markers
  const data: any[][] = [];

  const addEmptyRows = (n: number) => {
    for (let i = 0; i < n; i++) data.push([]);
  };

  const addHeader = (title: string, columns: string[]) => {
    data.push([title]); // Marker e.g. [IDENTITAS]
    data.push(columns);
  };

  // 1. IDENTITAS
  data.push(['[IDENTITAS JABATAN]']);
  data.push(['Nama Jabatan', jabatan.namaJabatan || '']);
  data.push(['Ikhtisar Jabatan', jabatan.ikhtisarJabatan || '']);
  addEmptyRows(2);

  // 2. KUALIFIKASI
  data.push(['[KUALIFIKASI]']);
  data.push(['Pendidikan Formal (pisahkan dengan koma)', jabatan.kualifikasi?.pendidikanFormal?.join(', ') || '']);
  data.push(['Pendidikan & Pelatihan (pisahkan dengan koma)', jabatan.kualifikasi?.pendidikanPelatihan?.join(', ') || '']);
  data.push(['Pengalaman Kerja (pisahkan dengan koma)', jabatan.kualifikasi?.pengalamanKerja?.join(', ') || '']);
  addEmptyRows(2);

  // 3. TUGAS POKOK
  addHeader('[TUGAS POKOK]', ['Uraian Tugas', 'Hasil Kerja', 'Jumlah Hasil', 'Waktu Penyelesaian (Jam)']);
  if (jabatan.tugasPokok && jabatan.tugasPokok.length > 0) {
    jabatan.tugasPokok.forEach(t => data.push([t.uraianTugas, t.hasilKerja, t.jumlahHasil, t.waktuPenyelesaian]));
  } else {
    data.push(['Uraian contoh...', 'Dokumen', 10, 2]);
    data.push(['', '', '', '']);
  }
  addEmptyRows(2);

  // 4. BAHAN KERJA
  addHeader('[BAHAN KERJA]', ['Nama Bahan', 'Penggunaan Dalam Tugas']);
  if (jabatan.bahanKerja && jabatan.bahanKerja.length > 0) {
    jabatan.bahanKerja.forEach(b => data.push([b.namaBahan, b.penggunaanDalamTugas]));
  } else {
    data.push(['Data operasional', 'Sebagai pedoman kerja']);
    data.push(['', '']);
  }
  addEmptyRows(2);

  // 5. PERANGKAT KERJA
  addHeader('[PERANGKAT KERJA]', ['Nama Perangkat', 'Penggunaan Untuk Tugas']);
  if (jabatan.perangkatKerja && jabatan.perangkatKerja.length > 0) {
    jabatan.perangkatKerja.forEach(p => data.push([p.namaPerangkat, p.penggunaanUntukTugas]));
  } else {
    data.push(['Komputer/Laptop', 'Alat penyelesaian tugas']);
    data.push(['', '']);
  }
  addEmptyRows(2);

  // 6. TANGGUNG JAWAB
  addHeader('[TANGGUNG JAWAB]', ['Uraian Tanggung Jawab']);
  if (jabatan.tanggungJawab && jabatan.tanggungJawab.length > 0) {
    jabatan.tanggungJawab.forEach(t => data.push([t.uraian]));
  } else {
    data.push(['Kerahasiaan data instansi']);
    data.push(['']);
  }
  addEmptyRows(2);

  // 7. WEWENANG
  addHeader('[WEWENANG]', ['Uraian Wewenang']);
  if (jabatan.wewenang && jabatan.wewenang.length > 0) {
    jabatan.wewenang.forEach(w => data.push([w.uraian]));
  } else {
    data.push(['Meminta data terkait']);
    data.push(['']);
  }
  addEmptyRows(2);

  // 8. KORELASI JABATAN
  addHeader('[KORELASI JABATAN]', ['Nama Jabatan', 'Unit Kerja / Instansi', 'Dalam Hal']);
  if (jabatan.korelasiJabatan && jabatan.korelasiJabatan.length > 0) {
    jabatan.korelasiJabatan.forEach(k => data.push([k.namaJabatanTerkait, k.unitKerjaInstansi, k.dalamHal]));
  } else {
    data.push(['Atasan Langsung', 'Internal Instansi', 'Konsultasi dan Laporan']);
    data.push(['', '', '']);
  }
  addEmptyRows(2);

  // 9. KONDISI LINGKUNGAN
  addHeader('[KONDISI LINGKUNGAN KERJA]', ['Aspek', 'Faktor']);
  if (jabatan.kondisiLingkungan && jabatan.kondisiLingkungan.length > 0) {
    jabatan.kondisiLingkungan.forEach(k => data.push([k.aspek, k.faktor]));
  } else {
    data.push(['Tempat Kerja', 'Di dalam ruangan']);
    data.push(['Suhu', 'Dingin/Sejuk']);
    data.push(['', '']);
  }
  addEmptyRows(2);

  // 10. RISIKO BAHAYA
  addHeader('[RISIKO BAHAYA]', ['Nama Risiko', 'Penyebab']);
  if (jabatan.risikoBahaya && jabatan.risikoBahaya.length > 0) {
    jabatan.risikoBahaya.forEach(r => data.push([r.namaRisiko, r.penyebab]));
  } else {
    data.push(['Kelelahan Visual', 'Menatap layar monitor terlalu lama']);
    data.push(['', '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch: 35}, {wch: 35}, {wch: 25}, {wch: 25}];
  
  XLSX.utils.book_append_sheet(wb, ws, "Form_Anjab");
  const fileName = `Template_Anjab_${jabatan.namaJabatan.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ==========================================
// EXCEL PARSER (READ)
// ==========================================
export interface ParseResult {
  data: any;
  logs: string[];
}

export async function parseXlsxForAnjab(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result;
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        
        // Detect SIASN format
        const siasnSheetName = wb.SheetNames.find(name => {
          const norm = name.toLowerCase().replace(/\s+/g, '');
          return norm === 'infojabi' || norm === 'infojab1';
        });
        if (siasnSheetName) {
          resolve(parseSiasnFormat(wb));
          return;
        }

        // Sianjab format
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const result: any = {
          identitas: {},
          kualifikasi: { pendidikanFormal: [], pendidikanPelatihan: [], pengalamanKerja: [] },
          tugasPokok: [],
          bahanKerja: [],
          perangkatKerja: [],
          tanggungJawab: [],
          wewenang: [],
          korelasiJabatan: [],
          kondisiLingkungan: [],
          risikoBahaya: []
        };
        const logs: string[] = ["INFO: Menggunakan format Sianjab Template."];

        let currentSection = '';

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const col0 = (row[0] || '').toString().trim();

          // Check if row is a section header
          if (col0.startsWith('[') && col0.endsWith(']')) {
            currentSection = col0;
            // Skip the column header row for tabular sections
            if (currentSection !== '[IDENTITAS JABATAN]' && currentSection !== '[KUALIFIKASI]') {
              i++;
            }
            continue;
          }

          if (col0 === '' && currentSection !== '[IDENTITAS JABATAN]' && currentSection !== '[KUALIFIKASI]') continue;

          switch (currentSection) {
            case '[IDENTITAS JABATAN]':
              if (col0 === 'Ikhtisar Jabatan') {
                 result.identitas.ikhtisarJabatan = row[1]?.toString().trim();
                 logs.push("✅ Memuat Ikhtisar Jabatan.");
              }
              break;
            case '[KUALIFIKASI]':
              if (col0.includes('Pendidikan Formal')) {
                result.kualifikasi.pendidikanFormal = row[1] ? row[1].toString().split(',').map((s: string) => s.trim()).filter((s: string) => s) : [];
              } else if (col0.includes('Pendidikan & Pelatihan')) {
                result.kualifikasi.pendidikanPelatihan = row[1] ? row[1].toString().split(',').map((s: string) => s.trim()).filter((s: string) => s) : [];
              } else if (col0.includes('Pengalaman Kerja')) {
                result.kualifikasi.pengalamanKerja = row[1] ? row[1].toString().split(',').map((s: string) => s.trim()).filter((s: string) => s) : [];
              }
              break;
            case '[TUGAS POKOK]':
              if (col0 && col0 !== 'Uraian contoh...') {
                result.tugasPokok.push({
                  uraianTugas: col0,
                  hasilKerja: row[1]?.toString() || '',
                  jumlahHasil: parseFloat(row[2]) || 0,
                  waktuPenyelesaian: parseFloat(row[3]) || 0
                });
              }
              break;
            case '[BAHAN KERJA]':
              if (col0 && col0 !== 'Data operasional') {
                result.bahanKerja.push({
                  namaBahan: col0,
                  penggunaanDalamTugas: row[1]?.toString() || ''
                });
              }
              break;
            case '[PERANGKAT KERJA]':
              if (col0 && col0 !== 'Komputer/Laptop') {
                result.perangkatKerja.push({
                  namaPerangkat: col0,
                  penggunaanUntukTugas: row[1]?.toString() || ''
                });
              }
              break;
            case '[TANGGUNG JAWAB]':
              if (col0 && col0 !== 'Kerahasiaan data instansi') {
                result.tanggungJawab.push({ uraian: col0 });
              }
              break;
            case '[WEWENANG]':
              if (col0 && col0 !== 'Meminta data terkait') {
                result.wewenang.push({ uraian: col0 });
              }
              break;
            case '[KORELASI JABATAN]':
              if (col0 && col0 !== 'Atasan Langsung') {
                result.korelasiJabatan.push({
                  namaJabatanTerkait: col0,
                  unitKerjaInstansi: row[1]?.toString() || '',
                  dalamHal: row[2]?.toString() || ''
                });
              }
              break;
            case '[KONDISI LINGKUNGAN KERJA]':
              if (col0 && col0 !== 'Tempat Kerja' && col0 !== 'Suhu') {
                result.kondisiLingkungan.push({
                  aspek: col0,
                  faktor: row[1]?.toString() || ''
                });
              }
              break;
            case '[RISIKO BAHAYA]':
              if (col0 && col0 !== 'Kelelahan Visual') {
                result.risikoBahaya.push({
                  namaRisiko: col0,
                  penyebab: row[1]?.toString() || ''
                });
              }
              break;
          }
        }

        if (result.tugasPokok.length > 0) logs.push(`✅ Memuat ${result.tugasPokok.length} Tugas Pokok.`);
        if (result.bahanKerja.length > 0) logs.push(`✅ Memuat ${result.bahanKerja.length} Bahan Kerja.`);
        logs.push("🎯 Parsing selesai.");

        resolve({ data: result, logs });
      } catch (err: any) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

function getGeneralFallbackFactor(aspek: string): string {
  const cleanAspek = aspek.toLowerCase().trim();
  if (cleanAspek.includes('tempat kerja')) return 'Di dalam ruangan';
  if (cleanAspek.includes('suhu')) return 'Dingin/Sejuk';
  if (cleanAspek.includes('udara')) return 'Segar/Bersih';
  if (cleanAspek.includes('keadaan ruangan') || cleanAspek.includes('keadaan ruang')) return 'Nyaman/Cukup';
  if (cleanAspek.includes('letak')) return 'Datar/Strategis';
  if (cleanAspek.includes('penerangan')) return 'Terang/Cukup';
  if (cleanAspek.includes('suara')) return 'Tenang/Sunyi';
  if (cleanAspek.includes('keadaan tempat')) return 'Bersih/Rapi';
  if (cleanAspek.includes('getaran')) return 'Tidak ada';
  return 'Normal';
}


function parseBakatKerja(val: string): string[] {
  const list = val.split(/[,;\n]/).map(s => s.trim().toLowerCase());
  const codes: string[] = [];
  if (list.includes('g') || list.includes('intelegensia')) codes.push('G');
  if (list.includes('v') || list.includes('bakat verbal') || list.includes('verbal')) codes.push('V');
  if (list.includes('n') || list.includes('bakat numerik') || list.includes('numerik')) codes.push('N');
  if (list.includes('s') || list.includes('bakat pandang ruang') || list.includes('pandang ruang')) codes.push('S');
  if (list.includes('p') || list.includes('bakat penerapan bentuk') || list.includes('penerapan bentuk')) codes.push('P');
  if (list.includes('q') || list.includes('bakat ketelitian') || list.includes('ketelitian')) codes.push('Q');
  if (list.includes('k') || list.includes('koordinasi motorik')) codes.push('K');
  if (list.includes('f') || list.includes('kecekatan jari')) codes.push('F');
  if (list.includes('e') || list.includes('koordinasi mata-tangan-kaki')) codes.push('E');
  if (list.includes('c') || list.includes('kemampuan membedakan warna')) codes.push('C');
  if (list.includes('m') || list.includes('kecekatan tangan')) codes.push('M');
  
  const rawCodes = ['G', 'V', 'N', 'S', 'P', 'Q', 'K', 'F', 'E', 'C', 'M'];
  list.forEach(item => {
    const upper = item.toUpperCase();
    if (rawCodes.includes(upper) && !codes.includes(upper)) {
      codes.push(upper);
    }
  });
  return codes;
}

function parseTemperamenKerja(val: string): string[] {
  const list = val.split(/[,;\n]/).map(s => s.trim().toLowerCase());
  const codes: string[] = [];
  if (list.some(s => s.includes('dcp') || s.includes('directing') || s === 'd')) codes.push('D');
  if (list.some(s => s.includes('fif') || s.includes('feeling') || s === 'f')) codes.push('F');
  if (list.some(s => s.includes('influ') || s.includes('influencing') || s === 'i')) codes.push('I');
  if (list.some(s => s.includes('sjc') || s.includes('sensory') || s === 'j')) codes.push('J');
  if (list.some(s => s.includes('mvc') || s.includes('measurable') || s === 'm')) codes.push('M');
  if (list.some(s => s.includes('depl') || s.includes('people') || s === 'p')) codes.push('P');
  if (list.some(s => s.includes('repcon') || s.includes('repetitive') || s === 'r')) codes.push('R');
  if (list.some(s => s.includes('pus') || s.includes('stress') || s === 's')) codes.push('S');
  if (list.some(s => s.includes('sts') || s.includes('tolerance') || s === 't')) codes.push('T');
  if (list.some(s => s.includes('varch') || s.includes('variety') || s === 'v')) codes.push('V');
  return codes;
}

function parseMinatKerja(val: string): string[] {
  const list = val.split(/[,;\n]/).map(s => s.trim().toLowerCase());
  const codes: string[] = [];
  const valid = ['1a', '1b', '2a', '2b', '3a', '3b', '4a', '4b', '5a', '5b'];
  list.forEach(item => {
    const found = valid.find(c => item.includes(c));
    if (found && !codes.includes(found)) {
      codes.push(found);
    }
    if (item.includes('realistik') || item.includes('realistis')) {
      if (!codes.includes('1a')) codes.push('1a');
      if (!codes.includes('2b')) codes.push('2b');
    }
    if (item.includes('investigasi') || item.includes('investigatif')) {
      if (!codes.includes('2b')) codes.push('2b');
    }
    if (item.includes('artistik')) {
      if (!codes.includes('3b')) codes.push('3b');
    }
    if (item.includes('sosial')) {
      if (!codes.includes('4a')) codes.push('4a');
      if (!codes.includes('4b')) codes.push('4b');
    }
    if (item.includes('kewirausahaan') || item.includes('enterprising')) {
      if (!codes.includes('2a')) codes.push('2a');
      if (!codes.includes('5a')) codes.push('5a');
    }
    if (item.includes('konvensional')) {
      if (!codes.includes('1b')) codes.push('1b');
      if (!codes.includes('3a')) codes.push('3a');
    }
  });
  return codes;
}


function parseUpayaFisik(val: string): string[] {
  const list = val.split(/[,;\n]/).map(s => s.trim().toLowerCase());
  const matched: string[] = [];
  const valid = [
    'Berdiri', 'Berjalan', 'Duduk', 'Mengangkat', 'Membawa',
    'Mendorong', 'Menarik', 'Memanjat', 'Menyimpan imbangan',
    'Menunduk', 'Berlutut', 'Membungkuk', 'Merangkak', 'Menjangkau',
    'Memegang', 'Bekerja dengan jari', 'Meraba', 'Berbicara',
    'Mendengar', 'Melihat'
  ];
  list.forEach(item => {
    const found = valid.find(v => item.includes(v.toLowerCase()) || v.toLowerCase().includes(item));
    if (found && !matched.includes(found)) {
      matched.push(found);
    }
  });
  return matched;
}

function mapFungsiPekerjaan(dataVal: string, orangVal: string, bendaVal: string): string[] {
  const codes: string[] = [];
  
  const d = dataVal.toLowerCase();
  if (d.includes('memadukan')) codes.push('D0');
  else if (d.includes('koordinasi') || d.includes('mengoordinasikan')) codes.push('D1');
  else if (d.includes('analisis') || d.includes('menganalisis')) codes.push('D2');
  else if (d.includes('menyusun')) codes.push('D3');
  else if (d.includes('menghitung')) codes.push('D4');
  else if (d.includes('membandingkan')) codes.push('D5');
  else if (d.includes('menyalin') || d.includes('menyalin data')) codes.push('D6');

  const o = orangVal.toLowerCase();
  if (o.includes('menasehati') || o.includes('menasihati')) codes.push('O0');
  else if (o.includes('berunding')) codes.push('O1');
  else if (o.includes('mengajar')) codes.push('O2');
  else if (o.includes('menyelia')) codes.push('O3');
  else if (o.includes('menghibur')) codes.push('O4');
  else if (o.includes('mempengaruhi')) codes.push('O5');
  else if (o.includes('berbicara') || o.includes('informasi')) codes.push('O6');
  else if (o.includes('melayani')) codes.push('O7');
  else if (o.includes('menerima instruksi') || o.includes('instruksi')) codes.push('O8');

  const b = bendaVal.toLowerCase();
  if (b.includes('menelaah')) codes.push('B0');
  else if (b.includes('presisi')) codes.push('B1');
  else if (b.includes('mengoperasikan jalan')) codes.push('B2');
  else if (b.includes('mengemudikan')) codes.push('B3');
  else if (b.includes('mengerjakan benda')) codes.push('B4');
  else if (b.includes('melayani mesin')) codes.push('B5');
  else if (b.includes('memasukkan')) codes.push('B6');
  else if (b.includes('memegang')) codes.push('B7');

  return codes;
}

function getSheetIgnoreCase(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | undefined {
  const target = name.toLowerCase().replace(/\s+/g, '');
  const realName = wb.SheetNames.find(n => n.toLowerCase().replace(/\s+/g, '') === target);
  return realName ? wb.Sheets[realName] : undefined;
}

function parseSiasnFormat(wb: XLSX.WorkBook): ParseResult {
  const logs: string[] = ["INFO: Menggunakan format SIASN BKN (Multi-Sheet)."];
  const result: any = {
    identitas: {},
    kualifikasi: { pendidikanFormal: [], pendidikanPelatihan: [], pengalamanKerja: [] },
    syaratJabatan: null,
    prestasiKerja: null,
    tugasPokok: [],
    bahanKerja: [],
    perangkatKerja: [],
    tanggungJawab: [],
    wewenang: [],
    korelasiJabatan: [],
    kondisiLingkungan: [],
    risikoBahaya: []
  };

  try {
    // Helper to fetch sheet insensitively
    const getSheet = (sheetName: string) => {
      return getSheetIgnoreCase(wb, sheetName);
    };

    // INFOJAB I
    const ws1 = getSheet('INFOJAB I');
    if (ws1) {
      logs.push("INFO: Memproses sheet 'INFOJAB I'...");
      const rows1: any[][] = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });
      
      // Dynamic column mapping for Ikhtisar Jabatan
      let ikhtisarColIdx = 1;
      if (rows1[1]) {
        const foundIdx = rows1[1].findIndex((v: any) => v && v.toString().toLowerCase().includes('ikhtisar jabatan'));
        if (foundIdx !== -1) ikhtisarColIdx = foundIdx;
      }
      
      if (rows1[3] && rows1[3][ikhtisarColIdx]) {
        result.identitas.ikhtisarJabatan = rows1[3][ikhtisarColIdx].toString().trim();
        logs.push("✅ Berhasil memuat Ikhtisar Jabatan.");
      } else {
        logs.push("⚠️ Ikhtisar Jabatan tidak ditemukan di baris data.");
      }

      let expColIdx = 5;
      if (rows1[1]) {
        const foundIdx = rows1[1].findIndex((v: any) => v && v.toString().toLowerCase().includes('pengalaman kerja'));
        if (foundIdx !== -1) expColIdx = foundIdx;
      }

      for (let i = 3; i < rows1.length; i++) {
        const exp = rows1[i]?.[expColIdx]?.toString().trim();
        if (exp && exp !== '(boleh lebih dari satu)' && exp !== 'null' && exp !== 'minimal sesuai syarat jabatan pada Standar Kompetensi Jabatan') {
          result.kualifikasi.pengalamanKerja.push(exp);
        }
      }
      
      let tjColIdx = 23;
      let wColIdx = 24;
      if (rows1[1]) {
        const foundTj = rows1[1].findIndex((v: any) => v && v.toString().toLowerCase().includes('tanggung jawab'));
        if (foundTj !== -1) tjColIdx = foundTj;
        const foundW = rows1[1].findIndex((v: any) => v && v.toString().toLowerCase().includes('wewenang'));
        if (foundW !== -1) wColIdx = foundW;
      }

      for (let i = 3; i < rows1.length; i++) {
        const tj = rows1[i][tjColIdx]?.toString().trim();
        if (tj && tj !== '(boleh lebih dari satu)' && tj !== 'null') {
          result.tanggungJawab.push({ uraian: tj });
        }
        const w = rows1[i][wColIdx]?.toString().trim();
        if (w && w !== '(boleh lebih dari satu)' && w !== 'null') {
          result.wewenang.push({ uraian: w });
        }
      }
      if (result.tanggungJawab.length > 0) logs.push(`✅ Berhasil memuat ${result.tanggungJawab.length} Tanggung Jawab.`);
      if (result.wewenang.length > 0) logs.push(`✅ Berhasil memuat ${result.wewenang.length} Wewenang.`);

      // Parse Syarat Jabatan
      if (rows1[3]) {
        let keterampilanList: string[] = [];
        let bakatList: string[] = [];
        let minatList: string[] = [];
        let temperamenList: string[] = [];
        let upayaList: string[] = [];
        
        let dataFungsiList: string[] = [];
        let orangFungsiList: string[] = [];
        let bendaFungsiList: string[] = [];

        for (let i = 3; i < rows1.length; i++) {
          const rowData = rows1[i];
          if (!rowData) continue;
          
          if (rowData[6]) keterampilanList.push(rowData[6].toString());
          if (rowData[7]) bakatList.push(rowData[7].toString());
          if (rowData[8]) minatList.push(rowData[8].toString());
          if (rowData[9]) temperamenList.push(rowData[9].toString());
          if (rowData[10]) upayaList.push(rowData[10].toString());
          
          if (rowData[19]) dataFungsiList.push(rowData[19].toString());
          if (rowData[21]) orangFungsiList.push(rowData[21].toString());
          if (rowData[20]) bendaFungsiList.push(rowData[20].toString());
        }

        const syarat: any = {
          keterampilanKerja: keterampilanList.join("\n").split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean),
          bakatKerja: parseBakatKerja(bakatList.join("\n")),
          minatKerja: parseMinatKerja(minatList.join("\n")),
          temperamenKerja: parseTemperamenKerja(temperamenList.join("\n")),
          upayaFisik: parseUpayaFisik(upayaList.join("\n")),
          kondisiFisik: {
            jenisKelamin: rows1[3][11]?.toString().trim() || '',
            umur: rows1[3][13]?.toString().trim() || '',
            tinggiBadan: rows1[3][15]?.toString().trim() || '',
            beratBadan: rows1[3][16]?.toString().trim() || '',
            posturBadan: rows1[3][12]?.toString().trim() || '',
            penampilan: rows1[3][14]?.toString().trim() || '',
          },
          fungsiPekerjaan: mapFungsiPekerjaan(
            dataFungsiList.join("\n"),
            orangFungsiList.join("\n"),
            bendaFungsiList.join("\n")
          )
        };
        result.syaratJabatan = syarat;
        logs.push("✅ Berhasil memuat Syarat Jabatan.");
      }

      // Default Prestasi Kerja
      result.prestasiKerja = {
        uraian: "Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan."
      };
      logs.push("✅ Berhasil memuat template Prestasi Kerja.");
    }

    // INFOJAB II
    const ws2 = getSheet('INFOJAB II');
    if (ws2) {
      logs.push("INFO: Memproses sheet 'INFOJAB II'...");
      const rows2: any[][] = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
      let hasilKerjaUraianList: string[] = [];
      
      for (let i = 3; i < rows2.length; i++) {
        const ut = rows2[i][0]?.toString().trim(); // A4
        if (ut && ut !== '(text)') {
          result.tugasPokok.push({
            uraianTugas: ut,
            hasilKerja: rows2[i][2]?.toString() || '', // C4: Satuan Hasil Kerja
            jumlahHasil: parseFloat(rows2[i][3]) || 0, // D4: Beban Kerja 1 Tahun
            waktuPenyelesaian: parseFloat(rows2[i][5]) || 0 // F4
          });
        }
        
        const hk = rows2[i][1]?.toString().trim(); // B4: Hasil Kerja (Uraian)
        if (hk && hk !== '(text)') {
          hasilKerjaUraianList.push(hk);
        }
        
        const bahan = rows2[i][6]?.toString().trim();
        if (bahan && bahan !== '(text)') {
          result.bahanKerja.push({ namaBahan: bahan, penggunaanDalamTugas: 'Sesuai tugas' });
        }

        const perangkat = rows2[i][7]?.toString().trim();
        if (perangkat && perangkat !== '(text)') {
          result.perangkatKerja.push({ namaPerangkat: perangkat, penggunaanUntukTugas: 'Sesuai tugas' });
        }
      }
      
      if (hasilKerjaUraianList.length > 0) {
        result.hasilKerja = { uraian: hasilKerjaUraianList.join("\n\n") };
        logs.push(`✅ Berhasil memuat 7. Hasil Kerja.`);
      }
      
      if (result.tugasPokok.length > 0) logs.push(`✅ Berhasil memuat ${result.tugasPokok.length} Tugas Pokok.`);
      if (result.bahanKerja.length > 0) logs.push(`✅ Berhasil memuat ${result.bahanKerja.length} Bahan Kerja.`);
      if (result.perangkatKerja.length > 0) logs.push(`✅ Berhasil memuat ${result.perangkatKerja.length} Perangkat Kerja.`);
    }

    // INFOJAB III
    const ws3 = getSheet('INFOJAB III');
    if (ws3) {
      logs.push("INFO: Memproses sheet 'INFOJAB III'...");
      const rows3: any[][] = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: '' });
      for (let i = 2; i < rows3.length; i++) {
        const instansi = rows3[i][0]?.toString().trim();
        const hal = rows3[i][1]?.toString().trim();
        if (instansi) {
          result.korelasiJabatan.push({
            namaJabatanTerkait: 'Pejabat Terkait',
            unitKerjaInstansi: instansi,
            dalamHal: hal || ''
          });
        }
      }
      if (result.korelasiJabatan.length > 0) logs.push(`✅ Berhasil memuat ${result.korelasiJabatan.length} Korelasi Jabatan.`);
    }

    // INFOJAB IV
    const ws4 = getSheet('INFOJAB IV');
    if (ws4) {
      logs.push("INFO: Memproses sheet 'INFOJAB IV'...");
      const rows4: any[][] = XLSX.utils.sheet_to_json(ws4, { header: 1, defval: '' });
      for (let i = 2; i < rows4.length; i++) {
        const aspek = rows4[i][0]?.toString().trim();
        const faktor = rows4[i][1]?.toString().trim();
        if (aspek && !aspek.includes('lihat tabel referensi')) {
          result.kondisiLingkungan.push({ 
            aspek, 
            faktor: faktor || getGeneralFallbackFactor(aspek) 
          });
        }
      }
      if (result.kondisiLingkungan.length > 0) logs.push(`✅ Berhasil memuat ${result.kondisiLingkungan.length} Kondisi Lingkungan.`);
    }

    // INFOJAB V
    const ws5 = getSheet('INFOJAB V');
    if (ws5) {
      logs.push("INFO: Memproses sheet 'INFOJAB V'...");
      const rows5: any[][] = XLSX.utils.sheet_to_json(ws5, { header: 1, defval: '' });
      for (let i = 2; i < rows5.length; i++) {
        const risiko = rows5[i][0]?.toString().trim();
        const penyebab = rows5[i][1]?.toString().trim();
        if (risiko) {
          result.risikoBahaya.push({ namaRisiko: risiko, penyebab: penyebab || '' });
        }
      }
      if (result.risikoBahaya.length > 0) logs.push(`✅ Berhasil memuat ${result.risikoBahaya.length} Risiko Bahaya.`);
    }

    logs.push("🎯 Parsing format SIASN berhasil diselesaikan!");
  } catch (err: any) {
    logs.push(`❌ ERROR: Gagal memproses format SIASN: ${err.message}`);
  }

  return { data: result, logs };
}

export function exportRekapAbkToXlsx(opdName: string, rows: any[]) {
  const wb = XLSX.utils.book_new();
  const wsData = [
    [`REKAPITULASI ANALISIS BEBAN KERJA (ABK)`],
    [`OPD/Unit Kerja: ${opdName}`],
    [],
    ['No', 'Nama Jabatan', 'Jenis Jabatan', 'Kelas Jabatan', 'Total Beban Kerja', 'Kebutuhan Pegawai', 'Pembulatan Formasi']
  ];

  rows.forEach((row, i) => {
    wsData.push([
      (i + 1).toString(),
      row.namaJabatan || '-',
      row.jenisJabatan || '-',
      row.kelasJabatan || '-',
      row.totalWaktuEfektif || 0,
      row.kebutuhanPegawai || 0,
      row.pembulatanFormasi || 0
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  ws['!cols'] = [
    { wch: 5 },
    { wch: 45 },
    { wch: 25 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Rekap_ABK");
  XLSX.writeFile(wb, `Rekap_ABK_${opdName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

