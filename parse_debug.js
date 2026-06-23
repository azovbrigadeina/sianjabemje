const XLSX = require('xlsx');
const wb = XLSX.readFile('siasn_export.xlsx');

const logs = ["INFO: Menggunakan format SIASN BKN (Multi-Sheet)."];
const result = {
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

// INFOJAB I
const ws1 = wb.Sheets['INFOJAB I'];
if (ws1) {
  logs.push("INFO: Memproses sheet 'INFOJAB I'...");
  const rows1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });
  
  let ikhtisarColIdx = 1;
  if (rows1[1]) {
    const foundIdx = rows1[1].findIndex(v => v && v.toString().includes('Ikhtisar Jabatan'));
    if (foundIdx !== -1) ikhtisarColIdx = foundIdx;
  }
  console.log("ikhtisarColIdx: ", ikhtisarColIdx);
  console.log("rows1[3][ikhtisarColIdx]: ", rows1[3] ? rows1[3][ikhtisarColIdx] : 'undefined row3');
  
  if (rows1[3] && rows1[3][ikhtisarColIdx]) {
    result.identitas.ikhtisarJabatan = rows1[3][ikhtisarColIdx].toString().trim();
    logs.push("✅ Berhasil memuat Ikhtisar Jabatan.");
  } else {
    logs.push("⚠️ Ikhtisar Jabatan tidak ditemukan di baris data.");
  }

  let expColIdx = 5;
  if (rows1[1]) {
    const foundIdx = rows1[1].findIndex(v => v && v.toString().includes('Pengalaman Kerja'));
    if (foundIdx !== -1) expColIdx = foundIdx;
  }

  if (rows1[1] && rows1[1][expColIdx]) {
    result.kualifikasi.pengalamanKerja.push(rows1[1][expColIdx].toString().trim());
  }
  
  let tjColIdx = 23;
  let wColIdx = 24;
  if (rows1[1]) {
    const foundTj = rows1[1].findIndex(v => v && v.toString().includes('Tanggung Jawab'));
    if (foundTj !== -1) tjColIdx = foundTj;
    const foundW = rows1[1].findIndex(v => v && v.toString().includes('Wewenang'));
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
}

// INFOJAB II
const ws2 = wb.Sheets['INFOJAB II'];
if (ws2) {
  logs.push("INFO: Memproses sheet 'INFOJAB II'...");
  const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
  let hasilKerjaUraianList = [];
  
  for (let i = 3; i < rows2.length; i++) {
    const ut = rows2[i][0]?.toString().trim(); // A4
    if (ut && ut !== '(text)') {
      result.tugasPokok.push({
        uraianTugas: ut,
        hasilKerja: rows2[i][2]?.toString() || '', // C4
        jumlahHasil: parseFloat(rows2[i][3]) || 0, // D4
        waktuPenyelesaian: parseFloat(rows2[i][5]) || 0 // F4
      });
    }
    
    const hk = rows2[i][1]?.toString().trim(); // B4
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

console.log(logs.join('\n'));
console.log("\n--- TUGAS POKOK ---");
console.log(result.tugasPokok);
console.log("\n--- HASIL KERJA ---");
console.log(result.hasilKerja);

