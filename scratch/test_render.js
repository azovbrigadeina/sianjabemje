const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

try {
  console.log("Reading template...");
  const templatePath = path.join(__dirname, '../public/templates/template_anjab.docx');
  const content = fs.readFileSync(templatePath, 'binary');

  console.log("Initializing PizZip...");
  const zip = new PizZip(content);

  console.log("Initializing Docxtemplater...");
  const parser = function(tag) {
    return {
      get: function(scope) {
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

  console.log("Rendering...");
  const dummyData = {
    namaJabatan: "Test Jabatan",
    kodeJabatan: "1.2.3.4",
    jenisJabatan: "Pelaksana",
    ikhtisarJabatan: "Test ikhtisar",
    kelasJabatan: 7,
    tahun: "2026",
    tugasPokok: [
      { no: 1, uraianTugas: "Tugas 1", hasilKerja: "Hasil 1", jumlahHasil: 10, waktuPenyelesaian: 10, waktuEfektif: 100, kebutuhanPegawai: 0.1 }
    ],
    bahanKerja: [],
    perangkatKerja: [],
    tanggungJawab: [],
    wewenang: [],
    korelasiJabatan: [],
    kondisiLingkungan: [],
    risikoBahaya: []
  };

  doc.render(dummyData);

  console.log("Generating buffer...");
  const buf = doc.getZip().generate({
    type: 'nodebuffer',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  console.log("Writing test output to output.docx...");
  fs.writeFileSync(path.join(__dirname, 'output.docx'), buf);
  console.log("SUCCESS!");
} catch (err) {
  console.error("ERROR OCCURRED:", err);
}
