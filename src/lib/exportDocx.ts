import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { api } from './api';
import { JabatanFull } from './types';

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
const transformData = (jabatan: JabatanFull, mappings: Record<string, any> = {}) => {
  const result: Record<string, any> = {};

  const getValue = (fieldKey: string, defaultValue: any) => {
    return mappings[fieldKey] || defaultValue;
  };

  // Base fields
  result[getValue('namaJabatan', 'namaJabatan')] = jabatan.namaJabatan || "-";
  result[getValue('kodeJabatan', 'kodeJabatan')] = jabatan.kodeJabatan || "-";
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

  // Kualifikasi lists
  const qualKeys = mappings.kualifikasi || {};
  result[qualKeys.pendidikanFormal || 'kualifikasi_pendidikanFormal'] = jabatan.kualifikasi?.pendidikanFormal || [];
  result[qualKeys.pendidikanPelatihan || 'kualifikasi_pendidikanPelatihan'] = jabatan.kualifikasi?.pendidikanPelatihan || [];
  result[qualKeys.pengalamanKerja || 'kualifikasi_pengalamanKerja'] = jabatan.kualifikasi?.pengalamanKerja || [];

  // Syarat Jabatan lists
  const sjKeys = mappings.syaratJabatan || {};
  result[sjKeys.keterampilanKerja || 'syarat_keterampilanKerja'] = jabatan.syaratJabatan?.keterampilanKerja || [];
  result[sjKeys.bakatKerja || 'syarat_bakatKerja'] = jabatan.syaratJabatan?.bakatKerja || [];
  result[sjKeys.temperamenKerja || 'syarat_temperamenKerja'] = jabatan.syaratJabatan?.temperamenKerja || [];
  result[sjKeys.minatKerja || 'syarat_minatKerja'] = jabatan.syaratJabatan?.minatKerja || [];
  result[sjKeys.upayaFisik || 'syarat_upayaFisik'] = jabatan.syaratJabatan?.upayaFisik || [];
  result[sjKeys.fungsiPekerjaan || 'syarat_fungsiPekerjaan'] = jabatan.syaratJabatan?.fungsiPekerjaan || [];

  // Syarat Jabatan -> Kondisi Fisik
  const physicalKeys = sjKeys.kondisiFisik || {};
  const physResult: Record<string, any> = {};
  physResult[physicalKeys.jenisKelamin || 'jenisKelamin'] = jabatan.syaratJabatan?.kondisiFisik?.jenisKelamin || "-";
  physResult[physicalKeys.umur || 'umur'] = jabatan.syaratJabatan?.kondisiFisik?.umur || "-";
  physResult[physicalKeys.tinggiBadan || 'tinggiBadan'] = jabatan.syaratJabatan?.kondisiFisik?.tinggiBadan || "-";
  physResult[physicalKeys.beratBadan || 'beratBadan'] = jabatan.syaratJabatan?.kondisiFisik?.beratBadan || "-";
  physResult[physicalKeys.posturBadan || 'posturBadan'] = jabatan.syaratJabatan?.kondisiFisik?.posturBadan || "-";
  physResult[physicalKeys.penampilan || 'penampilan'] = jabatan.syaratJabatan?.kondisiFisik?.penampilan || "-";
  result[sjKeys.kondisiFisikName || 'syarat_kondisiFisik'] = physResult;

  // Single-value fields
  const hasilKerjaVal = jabatan.hasilKerja?.uraian || "-";
  const prestasiKerjaVal = jabatan.prestasiKerja?.uraian || "-";
  result[getValue('hasilKerja', 'hasilKerja')] = {
    uraian: hasilKerjaVal,
    toString: () => hasilKerjaVal
  };
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

  mapLoopArray(jabatan.tugasPokok || [], mappings.tugasPokok, 'tugasPokok');
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
export const exportJabatanToDocx = async (jabatan: JabatanFull) => {
  try {
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
    const renderData = transformData(jabatan, mappings);

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

    // 6. Generate output zip/docx blob
    const outBlob = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    // 7. Save file to client device
    saveAs(outBlob, `Anjab_${jabatan.namaJabatan || 'Jabatan'}.docx`);
  } catch (err: any) {
    console.error("Gagal melakukan export Word:", err);
    throw new Error("Gagal mengekspor laporan: " + err.message);
  }
};

// Bulk Export (Generates a combined document with multiple sections or individual downloads depending on browser performance)
export const exportJabatansToDocx = async (title: string, jabatans: JabatanFull[]) => {
  // If exporting bulk, we run individual downloads sequentially or combined. 
  // Standard docxtemplater does not merge documents out-of-the-box. 
  // The best way in standard frontend JS without commercial add-ons is downloading individual files,
  // or downloading them sequentially so they download as separate files.
  for (const jabatan of jabatans) {
    await exportJabatanToDocx(jabatan);
    // Simple delay to prevent simultaneous download prompt blocking
    await new Promise(resolve => setTimeout(resolve, 800));
  }
};
