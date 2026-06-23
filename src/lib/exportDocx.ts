import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, BorderStyle, WidthType, AlignmentType, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import { JabatanFull } from './types';

// Helper for cells
const createCell = (text: string, bold: boolean = false, width?: number, colSpan: number = 1) => {
  return new TableCell({
    columnSpan: colSpan,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, font: "Arial", size: 22 })],
      }),
    ],
  });
};

const createListCell = (items: string[], width?: number) => {
  if (!items || items.length === 0) return createCell("-", false, width);
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
    children: items.map(item => new Paragraph({
      children: [new TextRun({ text: item, font: "Arial", size: 22 })],
      bullet: { level: 0 }
    }))
  });
};

export const exportJabatanToDocx = async (jabatan: JabatanFull) => {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch
          },
        },
        children: [
          new Paragraph({
            text: "INFORMASI JABATAN",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createCell("1.", false, 5),
                  createCell("Nama Jabatan", false, 25),
                  createCell(":", false, 2),
                  createCell(jabatan.namaJabatan || "-", true, 68),
                ]
              }),
              new TableRow({
                children: [
                  createCell("2.", false, 5),
                  createCell("Kode Jabatan", false, 25),
                  createCell(":", false, 2),
                  createCell(jabatan.kodeJabatan || "-", false, 68),
                ]
              }),
              new TableRow({
                children: [
                  createCell("3.", false, 5),
                  createCell("Unit Kerja", false, 25),
                  createCell(":", false, 2),
                  createCell("JPT Utama", false, 15),
                  createCell(": " + (jabatan.hierarchy?.jptUtama || "-"), false, 53)
                ]
              }),
              new TableRow({
                children: [
                  createCell("", false, 5),
                  createCell("", false, 25),
                  createCell("", false, 2),
                  createCell("JPT Madya", false, 15),
                  createCell(": " + (jabatan.hierarchy?.jptMadya || "-"), false, 53)
                ]
              }),
              new TableRow({
                children: [
                  createCell("", false, 5),
                  createCell("", false, 25),
                  createCell("", false, 2),
                  createCell("JPT Pratama", false, 15),
                  createCell(": " + (jabatan.hierarchy?.jptPratama || "-"), false, 53)
                ]
              }),
              new TableRow({
                children: [
                  createCell("", false, 5),
                  createCell("", false, 25),
                  createCell("", false, 2),
                  createCell("Administrator", false, 15),
                  createCell(": " + (jabatan.hierarchy?.administrator || "-"), false, 53)
                ]
              }),
              new TableRow({
                children: [
                  createCell("", false, 5),
                  createCell("", false, 25),
                  createCell("", false, 2),
                  createCell("Pengawas", false, 15),
                  createCell(": " + (jabatan.hierarchy?.pengawas || "-"), false, 53)
                ]
              }),
              new TableRow({
                children: [
                  createCell("", false, 5),
                  createCell("", false, 25),
                  createCell("", false, 2),
                  createCell("Pelaksana", false, 15),
                  createCell(": " + (jabatan.hierarchy?.pelaksana || "-"), false, 53)
                ]
              }),
              new TableRow({
                children: [
                  createCell("", false, 5),
                  createCell("", false, 25),
                  createCell("", false, 2),
                  createCell("Jabatan Fungsional", false, 15),
                  createCell(": " + (jabatan.hierarchy?.jabatanFungsional || "-"), false, 53)
                ]
              }),
              new TableRow({
                children: [
                  createCell("4.", false, 5),
                  createCell("Ikhtisar Jabatan", false, 25),
                  createCell(":", false, 2),
                  createCell(jabatan.ikhtisarJabatan || "-", false, 68),
                ]
              }),
              new TableRow({
                children: [
                  createCell("5.", false, 5),
                  createCell("Kualifikasi Jabatan", false, 25),
                  createCell(":", false, 2),
                  createCell("Pendidikan Formal", false, 20),
                  createListCell(jabatan.kualifikasi?.pendidikanFormal || [], 48)
                ]
              }),
              new TableRow({
                children: [
                  createCell("", false, 5),
                  createCell("", false, 25),
                  createCell("", false, 2),
                  createCell("Pendidikan/Pelatihan", false, 20),
                  createListCell(jabatan.kualifikasi?.pendidikanPelatihan || [], 48)
                ]
              }),
              new TableRow({
                children: [
                  createCell("", false, 5),
                  createCell("", false, 25),
                  createCell("", false, 2),
                  createCell("Pengalaman Kerja", false, 20),
                  createListCell(jabatan.kualifikasi?.pengalamanKerja || [], 48)
                ]
              }),
            ]
          }),
          
          new Paragraph({ text: "", spacing: { after: 200 } }),
          
          new Paragraph({
            children: [new TextRun({ text: "6. Tugas Pokok", bold: true, font: "Arial", size: 22 })],
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
                  createCell("Waktu Pyls", true, 10),
                  createCell("Waktu Efektif", true, 15),
                ]
              }),
              ...(jabatan.tugasPokok && jabatan.tugasPokok.length > 0 ? jabatan.tugasPokok.map((t, i) => new TableRow({
                children: [
                  createCell((i + 1).toString()),
                  createCell(t.uraianTugas || "-"),
                  createCell(t.hasilKerja || "-"),
                  createCell(t.jumlahHasil?.toString() || "0"),
                  createCell(t.waktuPenyelesaian?.toString() || "0"),
                  createCell(t.waktuEfektif?.toString() || "0"),
                ]
              })) : [new TableRow({ children: [createCell("Tidak ada data", false, 100, 6)] })])
            ]
          }),

          // We can add Bahan Kerja, Perangkat Kerja similarly...
          new Paragraph({ text: "", spacing: { after: 200 } }),

          new Paragraph({
            children: [new TextRun({ text: "7. Syarat Jabatan", bold: true, font: "Arial", size: 22 })],
            spacing: { after: 100 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createCell("a.", false, 5),
                  createCell("Keterampilan Kerja", false, 30),
                  createListCell(jabatan.syaratJabatan?.keterampilanKerja || [], 65)
                ]
              }),
              new TableRow({
                children: [
                  createCell("b.", false, 5),
                  createCell("Bakat Kerja", false, 30),
                  createListCell(jabatan.syaratJabatan?.bakatKerja || [], 65)
                ]
              }),
              new TableRow({
                children: [
                  createCell("c.", false, 5),
                  createCell("Temperamen Kerja", false, 30),
                  createListCell(jabatan.syaratJabatan?.temperamenKerja || [], 65)
                ]
              }),
              new TableRow({
                children: [
                  createCell("d.", false, 5),
                  createCell("Minat Kerja", false, 30),
                  createListCell(jabatan.syaratJabatan?.minatKerja || [], 65)
                ]
              }),
              new TableRow({
                children: [
                  createCell("e.", false, 5),
                  createCell("Upaya Fisik", false, 30),
                  createListCell(jabatan.syaratJabatan?.upayaFisik || [], 65)
                ]
              })
            ]
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Anjab_${jabatan.namaJabatan || 'Jabatan'}.docx`);
};

export const exportJabatansToDocx = async (title: string, jabatans: JabatanFull[]) => {
  const sections = jabatans.map((jabatan) => {
    return {
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          text: "INFORMASI JABATAN",
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                createCell("1.", false, 5),
                createCell("Nama Jabatan", false, 25),
                createCell(":", false, 2),
                createCell(jabatan.namaJabatan || "-", true, 68),
              ]
            }),
            new TableRow({
              children: [
                createCell("2.", false, 5),
                createCell("Kode Jabatan", false, 25),
                createCell(":", false, 2),
                createCell(jabatan.kodeJabatan || "-", false, 68),
              ]
            }),
            new TableRow({
              children: [
                createCell("3.", false, 5),
                createCell("Unit Kerja", false, 25),
                createCell(":", false, 2),
                createCell("JPT Utama", false, 15),
                createCell(": " + (jabatan.hierarchy?.jptUtama || "-"), false, 53)
              ]
            }),
            new TableRow({
              children: [
                createCell("", false, 5),
                createCell("", false, 25),
                createCell("", false, 2),
                createCell("JPT Madya", false, 15),
                createCell(": " + (jabatan.hierarchy?.jptMadya || "-"), false, 53)
              ]
            }),
            new TableRow({
              children: [
                createCell("", false, 5),
                createCell("", false, 25),
                createCell("", false, 2),
                createCell("JPT Pratama", false, 15),
                createCell(": " + (jabatan.hierarchy?.jptPratama || "-"), false, 53)
              ]
            }),
            new TableRow({
              children: [
                createCell("", false, 5),
                createCell("", false, 25),
                createCell("", false, 2),
                createCell("Administrator", false, 15),
                createCell(": " + (jabatan.hierarchy?.administrator || "-"), false, 53)
              ]
            }),
            new TableRow({
              children: [
                createCell("", false, 5),
                createCell("", false, 25),
                createCell("", false, 2),
                createCell("Pengawas", false, 15),
                createCell(": " + (jabatan.hierarchy?.pengawas || "-"), false, 53)
              ]
            }),
            new TableRow({
              children: [
                createCell("", false, 5),
                createCell("", false, 25),
                createCell("", false, 2),
                createCell("Pelaksana", false, 15),
                createCell(": " + (jabatan.hierarchy?.pelaksana || "-"), false, 53)
              ]
            }),
            new TableRow({
              children: [
                createCell("", false, 5),
                createCell("", false, 25),
                createCell("", false, 2),
                createCell("Jabatan Fungsional", false, 15),
                createCell(": " + (jabatan.hierarchy?.jabatanFungsional || "-"), false, 53)
              ]
            }),
            new TableRow({
              children: [
                createCell("4.", false, 5),
                createCell("Ikhtisar Jabatan", false, 25),
                createCell(":", false, 2),
                createCell(jabatan.ikhtisarJabatan || "-", false, 68),
              ]
            }),
            new TableRow({
              children: [
                createCell("5.", false, 5),
                createCell("Kualifikasi Jabatan", false, 25),
                createCell(":", false, 2),
                createCell("Pendidikan Formal", false, 20),
                createListCell(jabatan.kualifikasi?.pendidikanFormal || [], 48)
              ]
            }),
            new TableRow({
              children: [
                createCell("", false, 5),
                createCell("", false, 25),
                createCell("", false, 2),
                createCell("Pendidikan/Pelatihan", false, 20),
                createListCell(jabatan.kualifikasi?.pendidikanPelatihan || [], 48)
              ]
            }),
            new TableRow({
              children: [
                createCell("", false, 5),
                createCell("", false, 25),
                createCell("", false, 2),
                createCell("Pengalaman Kerja", false, 20),
                createListCell(jabatan.kualifikasi?.pengalamanKerja || [], 48)
              ]
            }),
          ]
        }),
        
        new Paragraph({ text: "", spacing: { after: 200 } }),
        
        new Paragraph({
          children: [new TextRun({ text: "6. Tugas Pokok", bold: true, font: "Arial", size: 22 })],
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
                createCell("Waktu Pyls", true, 10),
                createCell("Waktu Efektif", true, 15),
              ]
            }),
            ...(jabatan.tugasPokok && jabatan.tugasPokok.length > 0 ? jabatan.tugasPokok.map((t, i) => new TableRow({
              children: [
                createCell((i + 1).toString()),
                createCell(t.uraianTugas || "-"),
                createCell(t.hasilKerja || "-"),
                createCell(t.jumlahHasil?.toString() || "0"),
                createCell(t.waktuPenyelesaian?.toString() || "0"),
                createCell(t.waktuEfektif?.toString() || ((t.waktuPenyelesaian || 0) * (t.jumlahHasil || 0)).toString()),
              ]
            })) : [new TableRow({ children: [createCell("Tidak ada data", false, 100, 6)] })])
          ]
        }),

        new Paragraph({ text: "", spacing: { after: 200 } }),

        new Paragraph({
          children: [new TextRun({ text: "7. Syarat Jabatan", bold: true, font: "Arial", size: 22 })],
          spacing: { after: 100 }
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                createCell("a.", false, 5),
                createCell("Keterampilan Kerja", false, 30),
                createListCell(jabatan.syaratJabatan?.keterampilanKerja || [], 65)
              ]
            }),
            new TableRow({
              children: [
                createCell("b.", false, 5),
                createCell("Bakat Kerja", false, 30),
                createListCell(jabatan.syaratJabatan?.bakatKerja || [], 65)
              ]
            }),
            new TableRow({
              children: [
                createCell("c.", false, 5),
                createCell("Temperamen Kerja", false, 30),
                createListCell(jabatan.syaratJabatan?.temperamenKerja || [], 65)
              ]
            }),
            new TableRow({
              children: [
                createCell("d.", false, 5),
                createCell("Minat Kerja", false, 30),
                createListCell(jabatan.syaratJabatan?.minatKerja || [], 65)
              ]
            }),
            new TableRow({
              children: [
                createCell("e.", false, 5),
                createCell("Upaya Fisik", false, 30),
                createListCell(jabatan.syaratJabatan?.upayaFisik || [], 65)
              ]
            })
          ]
        }),
      ]
    };
  });

  const doc = new Document({
    sections: sections
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${title}.docx`);
};

