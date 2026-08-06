import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { api } from './api';
import { JabatanFull } from './types';
import { generateVerificationCode } from './verification';

// Helper to convert base64 string to ArrayBuffer
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Map Sianjab data to template placeholder keys based on custom user mappings
const transformData = (jabatan: JabatanFull, mappings: Record<string, any> = {}, abkData?: any, verifyCode?: string) => {
  const result: Record<string, any> = {};

  if (verifyCode) {
    result['kodeKeabsahan'] = verifyCode;
    result['kodeVerifikasi'] = verifyCode;
    result['verificationCode'] = verifyCode;
  }

  const getValue = (fieldKey: string, defaultValue: any) => {
    return mappings[fieldKey] || defaultValue;
  };

  // Base fields
  result[getValue('namaJabatan', 'namaJabatan')] = jabatan.namaJabatan || "-";

  // Generate hierarchical code if kodeJabatan is empty, is database ID, or contains null
  let displayKode = jabatan.kodeJabatan || "";
  if (!displayKode || displayKode.startsWith("jbt_") || displayKode === "-" || displayKode.includes("null")) {
    const opdCode = jabatan.unitKerjaId ? (jabatan.unitKerjaId.replace(/[^0-9]/g, '').slice(-2) || ((jabatan.unitKerjaId.length % 90) + 10).toString()) : "14";
    
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
    displayKode = `${opdCode}.${levelCode}.${subCode}.${seqCode}`;
  }
  result[getValue('kodeJabatan', 'kodeJabatan')] = displayKode;
  result[getValue('jenisJabatan', 'jenisJabatan')] = jabatan.jenisJabatan || "-";
  result[getValue('ikhtisarJabatan', 'ikhtisarJabatan')] = jabatan.ikhtisarJabatan || "-";
  result[getValue('kelasJabatan', 'kelasJabatan')] = jabatan.kelasJabatan || 0;
  result[getValue('tahun', 'tahun')] = jabatan.tahun || "-";

  // Hierarchy fields
  const hierarchyKeys = mappings.hierarchy || {};
  const hierarchyResult: Record<string, any> = {};
  hierarchyResult[hierarchyKeys.jptUtama || 'jptUtama'] = jabatan.hierarchy?.jptUtama || "-";
  hierarchyResult[hierarchyKeys.jptMadya || 'jptMadya'] = jabatan.hierarchy?.jptMadya || "-";
  hierarchyResult[hierarchyKeys.jptPratama || 'jptPratama'] = jabatan.hierarchy?.jptPratama || "-";
  hierarchyResult[hierarchyKeys.administrator || 'administrator'] = jabatan.hierarchy?.administrator || "-";
  hierarchyResult[hierarchyKeys.pengawas || 'pengawas'] = jabatan.hierarchy?.pengawas || "-";
  hierarchyResult[hierarchyKeys.pelaksana || 'pelaksana'] = jabatan.hierarchy?.pelaksana || "-";
  hierarchyResult[hierarchyKeys.jabatanFungsional || 'jabatanFungsional'] = jabatan.hierarchy?.jabatanFungsional || "-";
  result[mappings.hierarchyName || 'hierarchy'] = hierarchyResult;

  // Format helpers for Kualifikasi & Syarat Jabatan arrays
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
    'D': 'DCP - Directing-Control-Planning',
    'F': 'FIF - Feeling-Idea-Fact',
    'I': 'INFLU - Influencing',
    'J': 'SJC - Sensory & Judgmental Criteria',
    'M': 'MVC - Measurable & Verifiable Criteria',
    'P': 'DEPL - Dealing with People',
    'R': 'REPCON - Repetitive & Continuous',
    'S': 'PUS - Performing Under Stress',
    'T': 'STS - Set of Limits/Tolerances/Standards',
    'V': 'VARCH - Variety & Changing Conditions'
  };
  const MINAT_MAP: Record<string, string> = {
    '1a': 'Pilihan melakukan kegiatan yang berhubungan dengan benda dan obyek',
    '1b': 'Pilihan melakukan kegiatan yang berhubungan dengan komunikasi data',
    '2a': 'Pilihan melakukan kegiatan yang berhubungan dengan orang dalam niaga',
    '2b': 'Pilihan melakukan kegiatan yang bersifat ilmiah dan teknik',
    '3a': 'Pilihan melakukan kegiatan rutin, konkrit dan teratur',
    '3b': 'Pilihan melakukan kegiatan yang bersifat abstrak dan kreatif',
    '4a': 'Pilihan melakukan kegiatan yang berhubungan dengan orang',
    '4b': 'Pilihan melakukan kegiatan yang dianggap baik bagi orang lain',
    '5a': 'Pilihan melakukan kegiatan yang menghasilkan prestise atau penghargaan',
    '5b': 'Pilihan melakukan kegiatan yang menghasilkan kepuasan nyata'
  };

  const formatArray = (arr: any, formatter?: (val: any) => string) => {
    if (!arr) return "-";
    if (typeof arr === 'string') return arr || "-";
    if (!Array.isArray(arr)) return "-";
    if (arr.length === 0) return "-";
    
    if (formatter) {
      return arr.map(formatter).filter(Boolean).join(", ");
    }
    return arr.filter(Boolean).join(", ");
  };

  // Kualifikasi lists
  const qualKeys = mappings.kualifikasi || {};
  const formattedPendidikan = formatArray(jabatan.kualifikasi?.pendidikanFormal);
  const formattedDiklat = formatArray(jabatan.kualifikasi?.pendidikanPelatihan);
  const formattedPengalaman = formatArray(jabatan.kualifikasi?.pengalamanKerja);

  result[qualKeys.pendidikanFormal || 'kualifikasi_pendidikanFormal'] = formattedPendidikan;
  result[qualKeys.pendidikanPelatihan || 'kualifikasi_pendidikanPelatihan'] = formattedDiklat;
  result[qualKeys.pengalamanKerja || 'kualifikasi_pengalamanKerja'] = formattedPengalaman;

  // Nested kualifikasi object to support {kualifikasi.pendidikanFormal} directly
  result['kualifikasi'] = {
    pendidikanFormal: formattedPendidikan,
    pendidikanPelatihan: formattedDiklat,
    pengalamanKerja: formattedPengalaman
  };

  // Syarat Jabatan
  const sjKeys = mappings.syaratJabatan || {};
  
  const formattedKeterampilan = formatArray(jabatan.syaratJabatan?.keterampilanKerja);
  const formattedBakat = formatArray(jabatan.syaratJabatan?.bakatKerja, code => {
    const name = BAKAT_MAP[code.toUpperCase()];
    return name ? `${code} (${name})` : code;
  });
  const formattedTemperamen = formatArray(jabatan.syaratJabatan?.temperamenKerja, code => {
    const name = TEMPERAMEN_MAP[code.toUpperCase()];
    return name ? `${code} (${name})` : code;
  });
  const formattedMinat = formatArray(jabatan.syaratJabatan?.minatKerja, code => {
    const name = MINAT_MAP[code.toLowerCase()];
    return name ? `${code} (${name})` : code;
  });
  const formattedUpaya = formatArray(jabatan.syaratJabatan?.upayaFisik);
  const formattedFungsi = formatArray(jabatan.syaratJabatan?.fungsiPekerjaan);

  result[sjKeys.keterampilanKerja || 'syarat_keterampilanKerja'] = formattedKeterampilan;
  result[sjKeys.bakatKerja || 'syarat_bakatKerja'] = formattedBakat;
  result[sjKeys.temperamenKerja || 'syarat_temperamenKerja'] = formattedTemperamen;
  result[sjKeys.minatKerja || 'syarat_minatKerja'] = formattedMinat;
  result[sjKeys.upayaFisik || 'syarat_upayaFisik'] = formattedUpaya;
  result[sjKeys.fungsiPekerjaan || 'syarat_fungsiPekerjaan'] = formattedFungsi;

  // Syarat Jabatan -> Kondisi Fisik
  const physicalKeys = sjKeys.kondisiFisik || {};
  const physResult: Record<string, any> = {};
  const jk = jabatan.syaratJabatan?.kondisiFisik?.jenisKelamin || "-";
  const um = jabatan.syaratJabatan?.kondisiFisik?.umur || "-";
  const tb = jabatan.syaratJabatan?.kondisiFisik?.tinggiBadan || "-";
  const bb = jabatan.syaratJabatan?.kondisiFisik?.beratBadan || "-";
  const pb = jabatan.syaratJabatan?.kondisiFisik?.posturBadan || "-";
  const pn = jabatan.syaratJabatan?.kondisiFisik?.penampilan || "-";

  physResult[physicalKeys.jenisKelamin || 'jenisKelamin'] = jk;
  physResult[physicalKeys.umur || 'umur'] = um;
  physResult[physicalKeys.tinggiBadan || 'tinggiBadan'] = tb;
  physResult[physicalKeys.beratBadan || 'beratBadan'] = bb;
  physResult[physicalKeys.posturBadan || 'posturBadan'] = pb;
  physResult[physicalKeys.penampilan || 'penampilan'] = pn;
  result[sjKeys.kondisiFisikName || 'syarat_kondisiFisik'] = physResult;

  // Root level flat backups for any older templates or alternative designs
  result['jenisKelamin'] = jk;
  result['umur'] = um;
  result['tinggiBadan'] = tb;
  result['beratBadan'] = bb;
  result['posturBadan'] = pb;
  result['penampilan'] = pn;

  // Populate nested syaratJabatan object to support {syaratJabatan.bakatKerja} directly
  result['syaratJabatan'] = {
    keterampilanKerja: formattedKeterampilan,
    bakatKerja: formattedBakat,
    temperamenKerja: formattedTemperamen,
    minatKerja: formattedMinat,
    upayaFisik: formattedUpaya,
    fungsiPekerjaan: formattedFungsi,
    kondisiFisik: {
      jenisKelamin: jk,
      umur: um,
      tinggiBadan: tb,
      beratBadan: bb,
      posturBadan: pb,
      penampilan: pn
    }
  };

  // Populate nested syarat_kondisiFisik object to support {syarat_kondisiFisik.jenisKelamin} directly
  result['syarat_kondisiFisik'] = {
    jenisKelamin: jk,
    umur: um,
    tinggiBadan: tb,
    beratBadan: bb,
    posturBadan: pb,
    penampilan: pn
  };

  // Hasil Kerja (supported both as single-value string and loop array)
  const hasilKerjaVal = jabatan.hasilKerja?.uraian || "-";
  let hasilKerjaList: any[] = [];
  let isJsonArray = false;
  if (hasilKerjaVal && hasilKerjaVal !== "-") {
    try {
      if (hasilKerjaVal.trim().startsWith("[")) {
        const parsed = JSON.parse(hasilKerjaVal);
        if (Array.isArray(parsed)) {
          isJsonArray = true;
          hasilKerjaList = parsed.map((str, idx) => ({ no: idx + 1, uraian: str }));
        }
      }
    } catch (e) {}
  }
  if (!isJsonArray && hasilKerjaVal && hasilKerjaVal !== "-") {
    const lines = hasilKerjaVal.split("\n").map(s => s.trim()).filter(Boolean);
    hasilKerjaList = lines.map((str, idx) => ({ no: idx + 1, uraian: str }));
  }
  if (hasilKerjaList.length === 0) {
    hasilKerjaList = [{ no: 1, uraian: "-" }];
  }

  // Override toString for backward compatibility
  const hasilKerjaListObj: any = hasilKerjaList;
  hasilKerjaListObj.toString = () => {
    if (isJsonArray) {
      try {
        return JSON.parse(hasilKerjaVal).join("\n");
      } catch (e) {}
    }
    return hasilKerjaVal;
  };
  result[getValue('hasilKerja', 'hasilKerja')] = hasilKerjaListObj;
  // Also provide a dedicated loop key 'hasilKerjaList'
  result['hasilKerjaList'] = hasilKerjaList;

  const prestasiKerjaVal = jabatan.prestasiKerja?.uraian || "-";
  result[getValue('prestasiKerja', 'prestasiKerja')] = {
    uraian: prestasiKerjaVal,
    toString: () => prestasiKerjaVal
  };

  // Loop Arrays mapping
  const mapLoopArray = (arrayData: any[], loopMapping: any, defaultKey: string) => {
    const loopKey = loopMapping?.loop || defaultKey;
    result[loopKey] = arrayData.map((item, idx) => {
      const row: Record<string, any> = {};
      row[loopMapping?.no || 'no'] = idx + 1;
      Object.keys(item).forEach((key) => {
        if (key !== 'id' && key !== 'jabatanId' && key !== 'nomorUrut') {
          const targetKey = loopMapping?.[key] || key;
          row[targetKey] = item[key] !== undefined && item[key] !== null ? item[key] : "-";
        }
      });
      return row;
    });
  };

  // Custom mapping for tugasPokok with ABK injection
  const abkRows = abkData?.rows || [];
  const wke = abkData?.wke || 1250;
  const tpMapping = mappings.tugasPokok || {};
  const tugasPokokLoopKey = tpMapping.loop || 'tugasPokok';
  
  let sumWaktuEfektif = 0;
  let sumKebutuhan = 0;

  result[tugasPokokLoopKey] = (jabatan.tugasPokok || []).map((tp, idx) => {
    const row: Record<string, any> = {};
    row[tpMapping.no || 'no'] = idx + 1;
    row[tpMapping.uraianTugas || 'uraianTugas'] = tp.uraianTugas || "-";
    row[tpMapping.hasilKerja || 'hasilKerja'] = tp.hasilKerja || "-";
    row[tpMapping.jumlahHasil || 'jumlahHasil'] = tp.jumlahHasil !== undefined ? tp.jumlahHasil : (tp as any).jumlahHasil || 0;
    row[tpMapping.waktuPenyelesaian || 'waktuPenyelesaian'] = tp.waktuPenyelesaian !== undefined ? tp.waktuPenyelesaian : (tp as any).waktuPenyelesaian || 0;
    
    // Inject ABK fields
    const abkRow = abkRows[idx];
    const waktu = abkRow ? abkRow.waktu : (tp.waktuPenyelesaian || 0);
    const volume = abkRow ? abkRow.volume : (tp.jumlahHasil || 0);
    const waktuEfektif = waktu * volume;
    const kebutuhanPegawai = wke > 0 ? (waktuEfektif / wke) : 0;
    
    sumWaktuEfektif += waktuEfektif;
    sumKebutuhan += kebutuhanPegawai;
    
    const formattedKebutuhan = kebutuhanPegawai.toLocaleString('id-ID', { 
      minimumFractionDigits: 3, 
      maximumFractionDigits: 4 
    });
    const formattedWaktuEfektif = waktuEfektif.toLocaleString('id-ID');
    
    row[tpMapping.waktuEfektif || 'waktuEfektif'] = formattedWaktuEfektif;
    row[tpMapping.kebutuhanPegawai || 'kebutuhanPegawai'] = formattedKebutuhan;
    
    return row;
  });

  // Summary ABK
  result[mappings.totalWaktuEfektif || 'totalWaktuEfektif'] = sumWaktuEfektif.toLocaleString('id-ID');
  result[mappings.totalKebutuhanPegawai || 'totalKebutuhanPegawai'] = sumKebutuhan.toLocaleString('id-ID', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4
  });
  const pembulatan = Math.ceil(sumKebutuhan);
  result[mappings.pembulatanFormasi || 'pembulatanFormasi'] = pembulatan;
  result[mappings.jumlahPegawaiOrang || 'jumlahPegawaiOrang'] = `${pembulatan.toLocaleString('id-ID')} Orang`;
  result[mappings.wke || 'wke'] = wke;

  mapLoopArray(jabatan.bahanKerja || [], mappings.bahanKerja, 'bahanKerja');
  mapLoopArray(jabatan.perangkatKerja || [], mappings.perangkatKerja, 'perangkatKerja');
  mapLoopArray(jabatan.tanggungJawab || [], mappings.tanggungJawab, 'tanggungJawab');
  mapLoopArray(jabatan.wewenang || [], mappings.wewenang, 'wewenang');
  mapLoopArray(jabatan.korelasiJabatan || [], mappings.korelasiJabatan, 'korelasiJabatan');
  mapLoopArray(jabatan.kondisiLingkungan || [], mappings.kondisiLingkungan, 'kondisiLingkungan');
  mapLoopArray(jabatan.risikoBahaya || [], mappings.risikoBahaya, 'risikoBahaya');

  return result;
};

// Main Export Logic
export const exportJabatanToDocx = async (jabatan: JabatanFull, abkData?: any, opdNamaParam?: string) => {
  try {
    const opdNama = opdNamaParam || jabatan.hierarchy?.jptPratama || "OPD Kabupaten Muaro Jambi";
    const verifyRecord = generateVerificationCode("Analisis Jabatan & ABK", opdNama, jabatan.namaJabatan);

    let arrayBuffer: ArrayBuffer;
    
    // 1. Fetch template from database settings
    const customTemplate = await api.getTemplate().catch(() => null);
    
    if (customTemplate && customTemplate.base64) {
      arrayBuffer = base64ToArrayBuffer(customTemplate.base64);
    } else {
      // Fallback to default template in public/templates folder
      const response = await fetch('/templates/template_anjab.docx');
      if (!response.ok) {
        throw new Error("Gagal mengambil file template default.");
      }
      arrayBuffer = await response.arrayBuffer();
    }

    // 2. Fetch custom mappings from database settings
    const mappings = await api.getTagMappings().catch(() => null) || {};

    // 3. Transform data using mappings
    const renderData = transformData(jabatan, mappings, abkData, verifyRecord.code);

    // 4. Initialize pizzip and docxtemplater with dot-notation parser
    const zip = new PizZip(arrayBuffer);
    const parser = function(tag: string) {
      return {
        get: function(scope: any) {
          if (tag === '.') {
            return scope;
          }
          return tag.split('.').reduce(function(accumulator, currentValue) {
            return accumulator ? accumulator[currentValue] : undefined;
          }, scope);
        }
      };
    };

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      parser: parser
    });

    // 5. Render
    doc.render(renderData);

    // 6. Append verification footer paragraph to document.xml
    try {
      const footerParagraph = new Paragraph({
        children: [
          new TextRun({ text: "--------------------------------------------------------------------------------------------------\n", color: "CCCCCC" }),
          new TextRun({ text: "BAGIAN ORGANISASI PEMERINTAH KABUPATEN MUARO JAMBI\n", bold: true, size: 18 }),
          new TextRun({ text: `Dokumen Resmi SianjabABK EM-JE. Kode Keabsahan: ${verifyRecord.code}\n`, size: 18, color: "0284C7" }),
          new TextRun({ text: `Verifikasi keaslian dokumen dapat diakses secara online pada tautan portal resmi.`, size: 16, italics: true, color: "64748B" }),
        ],
        spacing: { before: 400 },
      });

      const dummyDoc = new Document({ sections: [{ children: [footerParagraph] }] });
      const pBuffer = await Packer.toArrayBuffer(dummyDoc);
      const pZip = new PizZip(pBuffer);
      const pXml = pZip.file('word/document.xml')?.asText() || '';
      const match = pXml.match(/<w:p>[\s\S]*?<\/w:p>/);
      if (match) {
        const paragraphXml = match[0];
        const zipInstance = doc.getZip();
        let docXml = zipInstance.file('word/document.xml')?.asText() || '';
        if (docXml.includes('<w:sectPr')) {
          docXml = docXml.replace('<w:sectPr', paragraphXml + '<w:sectPr');
        } else if (docXml.includes('</w:body>')) {
          docXml = docXml.replace('</w:body>', paragraphXml + '</w:body>');
        }
        zipInstance.file('word/document.xml', docXml);
      }
    } catch (verifErr) {
      console.warn("Gagal menyisipkan footer keabsahan dokumen:", verifErr);
    }

    // 7. Generate output zip/docx blob
    const outBlob = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    // 8. Save file to client device
    saveAs(outBlob, `Anjab_${jabatan.namaJabatan || 'Jabatan'}.docx`);
  } catch (err: any) {
    console.error("Gagal melakukan export Word:", err);
    let detailMsg = err.message;
    if (err.properties && Array.isArray(err.properties.errors)) {
      const details = err.properties.errors
        .map((e: any) => e.properties?.explanation || e.message || JSON.stringify(e))
        .join("; ");
      detailMsg += ` (${details})`;
    }
    throw new Error("Gagal mengekspor laporan: " + detailMsg);
  }
};

// Bulk Export (Generates a combined document with multiple sections or individual downloads depending on browser performance)
export const exportJabatansToDocx = async (title: string, jabatans: JabatanFull[], abkList?: any[]) => {
  for (let i = 0; i < jabatans.length; i++) {
    const jabatan = jabatans[i];
    const abkData = abkList ? abkList.find(a => a.id === jabatan.id) : undefined;
    await exportJabatanToDocx(jabatan, abkData);
    // Simple delay to prevent simultaneous download prompt blocking
    await new Promise(resolve => setTimeout(resolve, 800));
  }
};
