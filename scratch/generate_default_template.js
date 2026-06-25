const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel } = require('docx');

// Helper to create a cell with custom style
const createCell = (text, bold = false, width, colSpan = 1) => {
  return new TableCell({
    columnSpan: colSpan,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, font: "Arial", size: 20 })],
      }),
    ],
  });
};

const createListCell = (text, width) => {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: "Arial", size: 20 })],
      }),
    ],
  });
};

async function generate() {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch
          },
        },
        children: [
          // Header
          new Paragraph({
            text: "INFORMASI JABATAN",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Table 1: Data Utama
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createCell("1.", false, 5),
                  createCell("Nama Jabatan", false, 25),
                  createCell(":", false, 2),
                  createCell("{namaJabatan}", true, 68),
                ]
              }),
              new TableRow({
                children: [
                  createCell("2.", false, 5),
                  createCell("Kode Jabatan", false, 25),
                  createCell(":", false, 2),
                  createCell("{kodeJabatan}", false, 68),
                ]
              }),
              new TableRow({
                children: [
                  createCell("3.", false, 5),
                  createCell("Ikhtisar Jabatan", false, 25),
                  createCell(":", false, 2),
                  createCell("{ikhtisarJabatan}", false, 68),
                ]
              }),
              new TableRow({
                children: [
                  createCell("4.", false, 5),
                  createCell("Unit Kerja", false, 25),
                  createCell(":", false, 2),
                  createCell("JPT Pratama: {hierarchy.jptPratama} | Administrator: {hierarchy.administrator} | Pengawas: {hierarchy.pengawas}", false, 68),
                ]
              }),
            ]
          }),

          new Paragraph({ text: "", spacing: { after: 300 } }),

          // Kualifikasi Jabatan
          new Paragraph({
            children: [new TextRun({ text: "5. Kualifikasi Jabatan", bold: true, font: "Arial", size: 22 })],
            spacing: { after: 100 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createCell("Pendidikan Formal", false, 30),
                  createListCell("{#kualifikasi_pendidikanFormal}• {.}\n{/kualifikasi_pendidikanFormal}", 70)
                ]
              }),
              new TableRow({
                children: [
                  createCell("Pendidikan Pelatihan", false, 30),
                  createListCell("{#kualifikasi_pendidikanPelatihan}• {.}\n{/kualifikasi_pendidikanPelatihan}", 70)
                ]
              }),
              new TableRow({
                children: [
                  createCell("Pengalaman Kerja", false, 30),
                  createListCell("{#kualifikasi_pengalamanKerja}• {.}\n{/kualifikasi_pengalamanKerja}", 70)
                ]
              })
            ]
          }),

          new Paragraph({ text: "", spacing: { after: 300 } }),

          // Tugas Pokok
          new Paragraph({
            children: [new TextRun({ text: "6. Tugas Pokok (Tabel Dinamis)", bold: true, font: "Arial", size: 22 })],
            spacing: { after: 100 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createCell("No", true, 5),
                  createCell("Uraian Tugas", true, 45),
                  createCell("Hasil Kerja", true, 15),
                  createCell("Jumlah Hasil", true, 10),
                  createCell("Waktu Pyls (Jam)", true, 12),
                  createCell("Waktu Efektif", true, 13),
                ]
              }),
              new TableRow({
                children: [
                  createCell("{#tugasPokok}{no}", false),
                  createCell("{uraianTugas}", false),
                  createCell("{hasilKerja}", false),
                  createCell("{jumlahHasil}", false),
                  createCell("{waktuPenyelesaian}", false),
                  createCell("{waktuEfektif}{/tugasPokok}", false),
                ]
              })
            ]
          }),

          new Paragraph({ text: "", spacing: { after: 300 } }),

          // Syarat Jabatan
          new Paragraph({
            children: [new TextRun({ text: "7. Syarat Jabatan", bold: true, font: "Arial", size: 22 })],
            spacing: { after: 100 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createCell("Keterampilan Kerja", false, 30),
                  createListCell("{#syarat_keterampilanKerja}• {.}\n{/syarat_keterampilanKerja}", 70)
                ]
              }),
              new TableRow({
                children: [
                  createCell("Bakat Kerja", false, 30),
                  createListCell("{#syarat_bakatKerja}• {.}\n{/syarat_bakatKerja}", 70)
                ]
              }),
              new TableRow({
                children: [
                  createCell("Temperamen Kerja", false, 30),
                  createListCell("{#syarat_temperamenKerja}• {.}\n{/syarat_temperamenKerja}", 70)
                ]
              }),
              new TableRow({
                children: [
                  createCell("Minat Kerja", false, 30),
                  createListCell("{#syarat_minatKerja}• {.}\n{/syarat_minatKerja}", 70)
                ]
              }),
              new TableRow({
                children: [
                  createCell("Upaya Fisik", false, 30),
                  createListCell("{#syarat_upayaFisik}• {.}\n{/syarat_upayaFisik}", 70)
                ]
              })
            ]
          }),

          new Paragraph({ text: "", spacing: { after: 300 } }),

          // Kondisi Fisik
          new Paragraph({
            children: [new TextRun({ text: "8. Kondisi Fisik", bold: true, font: "Arial", size: 22 })],
            spacing: { after: 100 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createCell("Jenis Kelamin", false, 20),
                  createCell(":", false, 5),
                  createCell("{syarat_kondisiFisik.jenisKelamin}", false, 75)
                ]
              }),
              new TableRow({
                children: [
                  createCell("Umur", false, 20),
                  createCell(":", false, 5),
                  createCell("{syarat_kondisiFisik.umur}", false, 75)
                ]
              }),
              new TableRow({
                children: [
                  createCell("Tinggi / Berat Badan", false, 20),
                  createCell(":", false, 5),
                  createCell("{syarat_kondisiFisik.tinggiBadan} cm / {syarat_kondisiFisik.beratBadan} kg", false, 75)
                ]
              }),
              new TableRow({
                children: [
                  createCell("Postur / Penampilan", false, 20),
                  createCell(":", false, 5),
                  createCell("{syarat_kondisiFisik.posturBadan} / {syarat_kondisiFisik.penampilan}", false, 75)
                ]
              })
            ]
          })
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outputDir = path.join(__dirname, '../public/templates');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'template_anjab.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Default template successfully written to ${outputPath}`);
}

generate().catch(console.error);
