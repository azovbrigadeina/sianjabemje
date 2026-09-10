import * as XLSX from 'xlsx';
import type { JabatanFull } from './types';

const BAKAT_MAP: Record<string, string> = {
  'G': 'Intelegensia',
  'V': 'Bakat Verbal',
  'N': 'Bakat Numerik',
  'S': 'Bakat Pandang Ruang',
  'P': 'Bakat Penerapan Bentuk',
  'Q': 'Bakat Ketelitian',
  'K': 'Koordinasi Motorik',
  'F': 'Kecekatan Jari',
  'E': 'Koordinasi Mata-Tangan-Kaki',
  'C': 'Kemampuan Membedakan Warna',
  'M': 'Kecekatan Tangan'
};

const TEMPERAMEN_MAP: Record<string, string> = {
  'D': 'Directing Control Planning (DCP)',
  'F': 'Feeling Idea Fact (FIF)',
  'I': 'Influencing (INFLU)',
  'J': 'Sensory & Judgmental Criteria (SJC)',
  'M': 'Measurable & Verifiable Criteria (MVC)',
  'P': 'Dealing with People (DEPL)',
  'R': 'Repetitive & Continuous (REPCON)',
  'S': 'Performing Under Stress (PUS)',
  'T': 'Set of Limits/Tolerances/Standards (STS)',
  'V': 'Variety & Changing Conditions (VARCH)'
};

const DATA_FUNGSI_MAP: Record<string, string> = {
  'D0': 'Memadukan data',
  'D1': 'Mengoordinasikan data',
  'D2': 'Menganalisis data',
  'D3': 'Menyusun data',
  'D4': 'Menghitung data',
  'D5': 'Membandingkan data',
  'D6': 'Menyalin data'
};

const ORANG_FUNGSI_MAP: Record<string, string> = {
  'O0': 'Menasihati',
  'O1': 'Berunding',
  'O2': 'Mengajar',
  'O3': 'Menyelia',
  'O4': 'Menghibur',
  'O5': 'Mempengaruhi',
  'O6': 'Berbicara - memberi informasi',
  'O7': 'Melayani',
  'O8': 'Menerima instruksi'
};

const BENDA_FUNGSI_MAP: Record<string, string> = {
  'B0': 'Menelaah secara presisi',
  'B1': 'Menjalankan - mengontrol mesin',
  'B2': 'Mengoperasikan jalan',
  'B3': 'Mengemudikan/mengoperasikan mesin',
  'B4': 'Mengerjakan benda dengan tangan atau perkakas',
  'B5': 'Melayani mesin',
  'B6': 'Memasukkan/mengeluarkan barang ke/dari mesin',
  'B7': 'Memegang'
};

const getMinatNames = (codes: string[]): string[] => {
  if (!codes || !Array.isArray(codes)) return [];
  const names = new Set<string>();
  codes.forEach(code => {
    const lower = code.toLowerCase();
    if (lower === '1a' || lower === '5b') names.add('Realistik');
    if (lower === '1b' || lower === '3a') names.add('Konvensional');
    if (lower === '2a' || lower === '5a') names.add('Kewirausahaan');
    if (lower === '2b') names.add('Investigasi');
    if (lower === '3b') names.add('Artistik');
    if (lower === '4a' || lower === '4b') names.add('Sosial');
  });
  return Array.from(names);
};

export function exportJabatanToSiasn(jabatan: JabatanFull, abkData?: any) {
  const wb = XLSX.utils.book_new();

  // Helper to extract array safely
  const getArray = (arr: any) => (Array.isArray(arr) ? arr : []);

  // -------------------------------------------------------------
  // 1. INFOJAB I
  // -------------------------------------------------------------
  const sheet1Data: any[][] = [
    // Row 0
    [
      'DATA JABATAN', '', 'SYARAT JABATAN', '', '', '', '', '', '', '', '', 
      'KONDISI FISIK', '', '', '', '', '', '', '', 'FUNGSI PEKERJAAN', '', '', 
      'PRESTASI KERJA DIHARAPKAN', '', '', ''
    ],
    // Row 1
    [
      'Kode Jabatan', 'Ikhtisar Jabatan', 'Tingkat Pendidikan Minimum', 'Rumpun Pendidikan', 
      'Rumpun Diklat', 'Pengalaman Kerja (dalam hitungan tahun)', 'Keterampilan Kerja', 
      'Bakat Kerja', 'Minat Kerja', 'Tempramen Kerja', 'Upaya Fisik', 'Jenis Kelamin', 
      'Postur Badan', 'Umur Maksimal', 'Penampilan', 'Tinggi Badan (cm)', 'Berat Badan (Kg)', 
      'Terima Disabilitas', 'Jenis Disabilitas', 'Hubungan dengan data', 'Hubungan dengan benda', 
      'Hubungan dengan orang', 'Nilai Kriteria', 'Tanggung Jawab', 'Wewenang', 'Kelas Jabatan'
    ],
    // Row 2
    [
      '', '', '(lihat tabel referensi)', '(lihat tabel referensi)\n(boleh lebih dari satu)', 
      '(lihat tabel referensi)\n(boleh lebih dari satu)', '(boleh lebih dari satu)', '', 
      '(lihat tabel referensi)\n(pilih 3)', '(lihat tabel referensi)\n(pilih 3)', 
      '(lihat tabel referensi)\n(pilih 3)', '(lihat tabel referensi)\n(boleh lebih dari satu)', 
      '(lihat tabel referensi)', '(boleh text)', '(hanya boleh angka)', '(boleh text)', 
      '(boleh text)', '(boleh text)', '(Y / N)', 
      '(lihat tabel referensi)\n(boleh lebih dari satu)\n(diisi jika terima disabilitas Y)', 
      '(lihat tabel referensi)', '(lihat tabel referensi)', '(lihat tabel referensi)', 
      '(Baik / Sangat Baik)', '(boleh lebih dari satu)', '(boleh lebih dari satu)', '(1 - 19)'
    ]
  ];

  // Map sub-arrays
  const kualFormal = getArray(jabatan.kualifikasi?.pendidikanFormal);
  const kualDiklat = getArray(jabatan.kualifikasi?.pendidikanPelatihan);
  const kualPengalaman = getArray(jabatan.kualifikasi?.pengalamanKerja);
  
  const syaratKeterampilan = getArray(jabatan.syaratJabatan?.keterampilanKerja);
  const syaratBakat = getArray(jabatan.syaratJabatan?.bakatKerja).map(c => BAKAT_MAP[c.toUpperCase()] || c);
  const syaratMinat = getMinatNames(getArray(jabatan.syaratJabatan?.minatKerja));
  const syaratTemp = getArray(jabatan.syaratJabatan?.temperamenKerja).map(c => TEMPERAMEN_MAP[c.toUpperCase()] || c);
  const syaratUpaya = getArray(jabatan.syaratJabatan?.upayaFisik);

  const fungsiList = getArray(jabatan.syaratJabatan?.fungsiPekerjaan);
  const dataFungsi = fungsiList.filter(c => c.startsWith('D')).map(c => DATA_FUNGSI_MAP[c] || c);
  const bendaFungsi = fungsiList.filter(c => c.startsWith('B')).map(c => BENDA_FUNGSI_MAP[c] || c);
  const orangFungsi = fungsiList.filter(c => c.startsWith('O')).map(c => ORANG_FUNGSI_MAP[c] || c);

  const tjList = getArray(jabatan.tanggungJawab);
  const wList = getArray(jabatan.wewenang);

  // Maximum length of any multi-row column
  const maxLen1 = Math.max(
    kualFormal.length,
    kualDiklat.length,
    kualPengalaman.length,
    syaratKeterampilan.length,
    syaratBakat.length,
    syaratMinat.length,
    syaratTemp.length,
    syaratUpaya.length,
    dataFungsi.length,
    bendaFungsi.length,
    orangFungsi.length,
    tjList.length,
    wList.length,
    1
  );

  const pendMinimum = kualFormal[0] || 'S-1/Sarjana';

  for (let i = 0; i < maxLen1; i++) {
    const row = [
      i === 0 ? (jabatan.kodeJabatan || jabatan.id) : '',
      i === 0 ? (jabatan.ikhtisarJabatan || '') : '',
      i === 0 ? pendMinimum : '',
      kualFormal[i] || '',
      kualDiklat[i] || '',
      kualPengalaman[i] || '',
      syaratKeterampilan[i] || '',
      syaratBakat[i] || '',
      syaratMinat[i] || '',
      syaratTemp[i] || '',
      syaratUpaya[i] || '',
      i === 0 ? (jabatan.syaratJabatan?.kondisiFisik?.jenisKelamin || 'Laki-laki/Perempuan') : '',
      i === 0 ? (jabatan.syaratJabatan?.kondisiFisik?.posturBadan || 'Tegap') : '',
      i === 0 ? ((jabatan.syaratJabatan?.kondisiFisik?.umur || '').match(/\d+/)?.[0] || '') : '',
      i === 0 ? (jabatan.syaratJabatan?.kondisiFisik?.penampilan || 'Rapi') : '',
      i === 0 ? (jabatan.syaratJabatan?.kondisiFisik?.tinggiBadan || 'tidak ada syarat khusus') : '',
      i === 0 ? (jabatan.syaratJabatan?.kondisiFisik?.beratBadan || 'tidak ada syarat khusus') : '',
      i === 0 ? 'N' : '', // Terima Disabilitas
      '', // Jenis Disabilitas
      dataFungsi[i] || '',
      bendaFungsi[i] || '',
      orangFungsi[i] || '',
      i === 0 ? (jabatan.prestasiKerja?.uraian ? 'Baik' : 'Baik') : '', // Nilai Kriteria
      tjList[i]?.uraian || '',
      wList[i]?.uraian || '',
      i === 0 ? (jabatan.kelasJabatan || 1) : ''
    ];
    sheet1Data.push(row);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  XLSX.utils.book_append_sheet(wb, ws1, 'INFOJAB I');

  // -------------------------------------------------------------
  // 2. INFOJAB II
  // -------------------------------------------------------------
  const sheet2Data: any[][] = [
    // Row 0
    ['TUGAS POKOK', '', '', '', '', '', 'BAHAN KERJA', 'PERANGKAT KERJA'],
    // Row 1
    [
      'Uraian Tugas', 'Hasil Kerja', 'Satuan Hasil Kerja', 'Beban Kerja 1 Tahun', 
      'Waktu Kerja Efektif 1 Tahun', 'Waktu Penyelesaian (jam/menit)', 'Uraian Bahan Kerja', 
      'Uraian Perangkat Kerja'
    ],
    // Row 2
    ['(text)', '(text)', '(text)', '(angka)', '(1250 / 75000)', '(angka)', '(text)', '(text)']
  ];

  // Parse hasilKerjaRows if it was saved as JSON array
  let hasilKerjaRows: string[] = [];
  if (jabatan.hasilKerja?.uraian) {
    try {
      const parsed = JSON.parse(jabatan.hasilKerja.uraian);
      if (Array.isArray(parsed)) {
        hasilKerjaRows = parsed.map(item => typeof item === 'string' ? item : item.uraian || '');
      } else {
        hasilKerjaRows = [jabatan.hasilKerja.uraian];
      }
    } catch {
      hasilKerjaRows = jabatan.hasilKerja.uraian.split('\n').filter(Boolean);
    }
  }

  const tpList = getArray(jabatan.tugasPokok);
  const bahanList = getArray(jabatan.bahanKerja);
  const perangkatList = getArray(jabatan.perangkatKerja);

  const maxLen2 = Math.max(tpList.length, bahanList.length, perangkatList.length, hasilKerjaRows.length, 1);

  for (let i = 0; i < maxLen2; i++) {
    const tp = tpList[i];
    const row = [
      tp?.uraianTugas || '',
      hasilKerjaRows[i] || tp?.hasilKerja || '',
      tp?.hasilKerja || '',
      tp?.jumlahHasil || 0,
      tp?.waktuEfektif || abkData?.wke || 1250,
      tp?.waktuPenyelesaian || 0,
      bahanList[i]?.namaBahan || '',
      perangkatList[i]?.namaPerangkat || ''
    ];
    sheet2Data.push(row);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  XLSX.utils.book_append_sheet(wb, ws2, 'INFOJAB II');

  // -------------------------------------------------------------
  // 3. INFOJAB III
  // -------------------------------------------------------------
  const sheet3Data: any[][] = [
    ['KORELARSI JABATAN', ''], // Keep "KORELARSI JABATAN" or "KORELASI JABATAN" as parsed by the importer
    ['Unit Kerja / Instansi', 'Dalam Hal']
  ];

  // The parser searches for "KORELASI JABATAN" or similar. Let's make sure it handles both.
  // Wait, let's write "KORELASI JABATAN" since the sheet name is 'INFOJAB III'.
  sheet3Data[0] = ['KORELASI JABATAN', ''];

  const korelasiList = getArray(jabatan.korelasiJabatan);
  korelasiList.forEach(k => {
    const labelInstansi = k.namaJabatanTerkait 
      ? `${k.namaJabatanTerkait}, ${k.unitKerjaInstansi}` 
      : k.unitKerjaInstansi;
    sheet3Data.push([labelInstansi, k.dalamHal || '']);
  });
  if (korelasiList.length === 0) {
    sheet3Data.push(['', '']);
  }

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  XLSX.utils.book_append_sheet(wb, ws3, 'INFOJAB III');

  // -------------------------------------------------------------
  // 4. INFOJAB IV
  // -------------------------------------------------------------
  const sheet4Data: any[][] = [
    ['KONDISI LINGKUNGAN KERJA', ''],
    ['Aspek', 'Faktor'],
    ['(lihat tabel referensi)', '']
  ];

  const lingList = getArray(jabatan.kondisiLingkungan);
  lingList.forEach(l => {
    sheet4Data.push([l.aspek, l.faktor || '']);
  });
  if (lingList.length === 0) {
    sheet4Data.push(['', '']);
  }

  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
  XLSX.utils.book_append_sheet(wb, ws4, 'INFOJAB IV');

  // -------------------------------------------------------------
  // 5. INFOJAB V
  // -------------------------------------------------------------
  const sheet5Data: any[][] = [
    ['RESIKO BAHAYA', ''],
    ['Fisik / Mental', 'Penyebab']
  ];

  const resList = getArray(jabatan.risikoBahaya);
  resList.forEach(r => {
    sheet5Data.push([r.namaRisiko, r.penyebab || '']);
  });
  if (resList.length === 0) {
    sheet5Data.push(['', '']);
  }

  const ws5 = XLSX.utils.aoa_to_sheet(sheet5Data);
  XLSX.utils.book_append_sheet(wb, ws5, 'INFOJAB V');

  // -------------------------------------------------------------
  // Save/Download File
  // -------------------------------------------------------------
  const safeName = (jabatan.namaJabatan || 'Anjab').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `siasn_export_${safeName}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
