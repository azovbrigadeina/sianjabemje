import { NextRequest, NextResponse } from 'next/server';

// Fallback Mock Generator to ensure UI works when API key is missing
function generateMockAnjab(namaJabatan: string, unitKerja: string, namaOPD: string) {
  const normalizedName = namaJabatan.toLowerCase();
  
  if (normalizedName.includes('kebijakan') || normalizedName.includes('penelaah')) {
    return {
      ikhtisarJabatan: `Melakukan kegiatan penelaahan, analisis, dan penyusunan draf rekomendasi kebijakan teknis di bidang ${unitKerja} pada ${namaOPD} sesuai ketentuan peraturan perundang-undangan agar pelayanan berjalan lancar.`,
      kualifikasi: {
        pendidikanFormal: ["S-1 Administrasi Publik", "S-1 Kebijakan Publik", "S-1 Hukum", "S-1 Ilmu Sosial"],
        pendidikanPelatihan: ["Diklat Teknis Analisis Kebijakan", "Bimtek Penyusunan Nomenklatur Jabatan"],
        pengalamanKerja: ["Minimal 2 tahun di bidang penelaahan teknis atau administrasi umum"]
      },
      tugasPokok: [
        {
          nomorUrut: 1,
          uraianTugas: `Mengumpulkan bahan-bahan kerja dan regulasi terkait penelaahan kebijakan teknis di lingkungan ${unitKerja}.`,
          hasilKerja: "Koleksi dokumen bahan analisis kebijakan",
          waktuPenyelesaian: 45
        },
        {
          nomorUrut: 2,
          uraianTugas: "Melakukan penelaahan dan identifikasi permasalahan kebijakan berdasarkan data empiris lapangan.",
          hasilKerja: "Catatan telaahan permasalahan kebijakan",
          waktuPenyelesaian: 90
        },
        {
          nomorUrut: 3,
          uraianTugas: `Menyusun draf rekomendasi dan usulan naskah kebijakan teknis untuk diajukan kepada atasan langsung (${unitKerja}).`,
          hasilKerja: "Naskah rekomendasi kebijakan teknis",
          waktuPenyelesaian: 120
        },
        {
          nomorUrut: 4,
          uraianTugas: "Mengevaluasi pelaksanaan kebijakan teknis secara berkala untuk perbaikan masa depan.",
          hasilKerja: "Laporan monitoring evaluasi kebijakan",
          waktuPenyelesaian: 60
        }
      ],
      syaratJabatan: {
        keterampilanKerja: ["Mengoperasikan komputer & pengolah kata", "Menganalisis regulasi hukum", "Menulis laporan telaahan"],
        bakatKerja: ["G", "V", "Q"],
        temperamenKerja: ["DCP", "STS"],
        minatKerja: ["1b", "2b"],
        upayaFisik: ["Duduk", "Melihat", "Berbicara"]
      }
    };
  } else if (normalizedName.includes('keuangan') || normalizedName.includes('bendahara') || normalizedName.includes('akuntansi')) {
    return {
      ikhtisarJabatan: `Mengelola administrasi penatausahaan keuangan, pembukuan, dan penyusunan laporan pertanggungjawaban anggaran di lingkungan ${unitKerja} pada ${namaOPD} secara transparan dan akuntabel.`,
      kualifikasi: {
        pendidikanFormal: ["S-1 Akuntansi", "S-1 Manajemen Keuangan", "D-III Perpajakan/Akuntansi"],
        pendidikanPelatihan: ["Bimtek Penatausahaan SIPD-RI", "Pelatihan Pengelolaan Keuangan Daerah"],
        pengalamanKerja: ["Minimal 1 tahun di bidang pengelolaan pembukuan atau kebendaharaan"]
      },
      tugasPokok: [
        {
          nomorUrut: 1,
          uraianTugas: "Menerima, mencatat, dan memverifikasi kelengkapan berkas Surat Pertanggungjawaban (SPJ) pengeluaran.",
          hasilKerja: "Berkas SPJ terverifikasi lengkap",
          waktuPenyelesaian: 30
        },
        {
          nomorUrut: 2,
          uraianTugas: "Memasukkan data transaksi penerimaan dan pengeluaran ke dalam sistem informasi aplikasi keuangan daerah (SIPD).",
          hasilKerja: "Buku pembukuan transaksi digital",
          waktuPenyelesaian: 60
        },
        {
          nomorUrut: 3,
          uraianTugas: "Menyusun draf laporan realisasi anggaran bulanan dan tahunan sebagai bahan pertanggungjawaban.",
          hasilKerja: "Laporan Realisasi Anggaran (LRA)",
          waktuPenyelesaian: 150
        },
        {
          nomorUrut: 4,
          uraianTugas: "Mengarsipkan dokumen transaksi belanja daerah secara teratur untuk mempermudah audit keuangan.",
          hasilKerja: "Arsip berkas keuangan tertata rapi",
          waktuPenyelesaian: 45
        }
      ],
      syaratJabatan: {
        keterampilanKerja: ["Mengoperasikan Excel tingkat lanjut", "Penatausahaan transaksi keuangan", "Rekonsiliasi bank"],
        bakatKerja: ["G", "N", "Q"],
        temperamenKerja: ["MVC", "STS"],
        minatKerja: ["3a", "1b"],
        upayaFisik: ["Duduk", "Melihat", "Berbicara"]
      }
    };
  } else {
    // Generic Admin / Default
    return {
      ikhtisarJabatan: `Melaksanakan kegiatan dukungan administrasi perkantoran, pengarsipan, pelayanan surat-menyurat di lingkungan ${unitKerja} pada ${namaOPD} sesuai petunjuk teknis.`,
      kualifikasi: {
        pendidikanFormal: ["S-1 Manajemen", "S-1 Administrasi Negara", "Diploma III Administrasi Perkantoran"],
        pendidikanPelatihan: ["Pelatihan Tata Naskah Dinas", "Bimtek Kearsipan Modern"],
        pengalamanKerja: ["Minimal 1 tahun di bidang kesekretariatan atau tata usaha"]
      },
      tugasPokok: [
        {
          nomorUrut: 1,
          uraianTugas: "Menerima, mencatat, dan menyortir surat masuk dan keluar sesuai dengan klasifikasi tata kearsipan.",
          hasilKerja: "Surat dinas terdistribusi",
          waktuPenyelesaian: 20
        },
        {
          nomorUrut: 2,
          uraianTugas: "Menyusun draf surat undangan, nota dinas, dan administrasi surat keluar berdasarkan instruksi pimpinan.",
          hasilKerja: "Draf surat undangan/nota dinas",
          waktuPenyelesaian: 45
        },
        {
          nomorUrut: 3,
          uraianTugas: "Menyiapkan ruang rapat dan kelengkapan dokumen pendukung pertemuan koordinasi internal.",
          hasilKerja: "Sarana rapat siap saji",
          waktuPenyelesaian: 60
        },
        {
          nomorUrut: 4,
          uraianTugas: "Membuat laporan bulanan pelaksanaan kegiatan administrasi tata usaha untuk diserahkan ke atasan.",
          hasilKerja: "Laporan capaian kegiatan TU bulanan",
          waktuPenyelesaian: 90
        }
      ],
      syaratJabatan: {
        keterampilanKerja: ["Korespondensi surat menyurat", "Pengarsipan arsip dinamis", "Komunikasi interpersonal"],
        bakatKerja: ["G", "V", "Q"],
        temperamenKerja: ["REPCON", "STS"],
        minatKerja: ["3a", "1a"],
        upayaFisik: ["Duduk", "Berjalan", "Mendengar", "Melihat"]
      }
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { namaJabatan, unitKerja, namaOPD } = await req.json();

    if (!namaJabatan) {
      return NextResponse.json(
        { success: false, error: 'namaJabatan wajib diisi' },
        { status: 400 }
      );
    }

    const normalizedUnit = unitKerja || 'Bagian Umum';
    const normalizedOPD = namaOPD || 'Sekretariat Daerah';
    const apiKey = process.env.GEMINI_API_KEY;

    // Fallback if key is placeholder or empty
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY' || apiKey.trim() === '') {
      console.log('Gemini API key not configured. Using Mock Data Fallback.');
      const mockData = generateMockAnjab(namaJabatan, normalizedUnit, normalizedOPD);
      return NextResponse.json({
        success: true,
        isMock: true,
        data: mockData
      });
    }

    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const systemInstruction = `
You are an Indonesian civil service expert specialized in Job Analysis (Anjab) and Workload Analysis (ABK) based on Kemenpan-RB Regulation No. 1/2020.
Your task is to draft a compliant, logical, and detailed Anjab/ABK profile in Indonesian.
You MUST output raw JSON matching the exact schema provided. Do not include markdown wraps (like \`\`\`json).

SCHEMA RULES:
- bakatKerja elements MUST only be chosen from: ["G", "V", "N", "S", "P", "Q", "K", "F", "E", "C", "M"]
- temperamenKerja elements MUST only be chosen from: ["DCP", "FIF", "INFLU", "SJC", "MVC", "DEPL", "REPCON", "PUS", "STS", "VARCH"]
- minatKerja elements MUST only be chosen from: ["1a", "1b", "2a", "2b", "3a", "3b", "4a", "4b", "5a", "5b"]
- upayaFisik elements MUST only be chosen from: ["Berdiri", "Berjalan", "Duduk", "Mengangkat", "Membawa", "Mendorong", "Menarik", "Memanjat", "Menyimpan imbangan", "Menunduk", "Berlutut", "Membungkuk", "Merangkak", "Menjangkau", "Memegang", "Bekerja dengan jari", "Meraba", "Berbicara", "Mendengar", "Melihat"]
`;

    const promptText = `
Buatkan draf Anjab & ABK lengkap untuk Jabatan Pelaksana dengan data berikut:
- Nama Jabatan: "${namaJabatan}"
- Unit Kerja / Seksi / Bidang: "${normalizedUnit}"
- Dinas / Badan / OPD: "${normalizedOPD}"

Sesuaikan semua uraian tugas, kualifikasi pendidikan, bahan kerja, dan keterampilan agar pas dengan lingkungan dinas tersebut.
`;

    const responseSchema = {
      type: "object",
      properties: {
        ikhtisarJabatan: { type: "string" },
        kualifikasi: {
          type: "object",
          properties: {
            pendidikanFormal: { type: "array", items: { type: "string" } },
            pendidikanPelatihan: { type: "array", items: { type: "string" } },
            pengalamanKerja: { type: "array", items: { type: "string" } }
          },
          required: ["pendidikanFormal", "pendidikanPelatihan", "pengalamanKerja"]
        },
        tugasPokok: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nomorUrut: { type: "integer" },
              uraianTugas: { type: "string" },
              hasilKerja: { type: "string" },
              waktuPenyelesaian: { type: "integer" }
            },
            required: ["nomorUrut", "uraianTugas", "hasilKerja", "waktuPenyelesaian"]
          }
        },
        syaratJabatan: {
          type: "object",
          properties: {
            keterampilanKerja: { type: "array", items: { type: "string" } },
            bakatKerja: { type: "array", items: { type: "string" } },
            temperamenKerja: { type: "array", items: { type: "string" } },
            minatKerja: { type: "array", items: { type: "string" } },
            upayaFisik: { type: "array", items: { type: "string" } }
          },
          required: ["keterampilanKerja", "bakatKerja", "temperamenKerja", "minatKerja", "upayaFisik"]
        }
      },
      required: ["ikhtisarJabatan", "kualifikasi", "tugasPokok", "syaratJabatan"]
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            parts: [{ text: promptText }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API returned error: ${res.status} - ${errorText}`);
    }

    const resultJson = await res.json();
    
    // Parse response
    const candidateText = resultJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Empty response from Gemini API');
    }

    const data = JSON.parse(candidateText);
    return NextResponse.json({
      success: true,
      isMock: false,
      data: data
    });

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Terjadi kesalahan sistem'
      },
      { status: 500 }
    );
  }
}
