// =============================================
// Sianjab ABK - Type Definitions
// Berdasarkan Formulir Permenpan RB No. 1/2020
// =============================================

export interface ValidationHistory {
  id: string;
  status: 'Draft' | 'Diajukan' | 'Revisi' | 'Disetujui';
  timestamp: string;
  actor: string;
  catatan?: string;
}

export interface UnitKerja {
  id: string;
  nama: string;
  kode: string;
  parentId?: string;
  urutan?: number;
  tahun?: string; // Menyimpan periode tahun (misal: "2026")
  statusValidasi?: 'Draft' | 'Diajukan' | 'Revisi' | 'Disetujui';
  catatanRevisi?: string;
  historyValidasi?: ValidationHistory[];
}

export interface Jabatan {
  id: string;
  unitKerjaId: string;
  parentId?: string;
  urutan?: number;
  tahun?: string; // Menyimpan periode tahun (misal: "2026")
  namaJabatan: string;
  kodeJabatan: string;
  jenisJabatan: string;
  ikhtisarJabatan: string;
  kelasJabatan: number;
  level: number;
  jptUtama?: string;
  jptMadya?: string;
  jptPratama?: string;
  administrator?: string;
  pengawas?: string;
  pelaksana?: string;
  jabatanFungsional?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Kualifikasi {
  id: string;
  jabatanId: string;
  pendidikanFormal: string[];
  pendidikanPelatihan: string[];
  pengalamanKerja: string[];
}

export interface TugasPokok {
  id: string;
  jabatanId: string;
  nomorUrut: number;
  uraianTugas: string;
  hasilKerja: string;
  jumlahHasil: number;
  waktuPenyelesaian: number;
  waktuEfektif: number;
  kebutuhanPegawai: number;
}

export interface BahanKerja {
  id: string;
  jabatanId: string;
  nomorUrut: number;
  namaBahan: string;
  penggunaanDalamTugas: string;
}

export interface PerangkatKerja {
  id: string;
  jabatanId: string;
  nomorUrut: number;
  namaPerangkat: string;
  penggunaanUntukTugas: string;
}

export interface TanggungJawab {
  id: string;
  jabatanId: string;
  nomorUrut: number;
  uraian: string;
}

export interface Wewenang {
  id: string;
  jabatanId: string;
  nomorUrut: number;
  uraian: string;
}

export interface KorelasiJabatan {
  id: string;
  jabatanId: string;
  nomorUrut: number;
  namaJabatanTerkait: string;
  unitKerjaInstansi: string;
  dalamHal: string;
}

export interface KondisiLingkungan {
  id: string;
  jabatanId: string;
  nomorUrut: number;
  aspek: string;
  faktor: string;
}

export interface RisikoBahaya {
  id: string;
  jabatanId: string;
  nomorUrut: number;
  namaRisiko: string;
  penyebab: string;
}

export interface KondisiFisik {
  jenisKelamin: string;
  umur: string;
  tinggiBadan: string;
  beratBadan: string;
  posturBadan: string;
  penampilan: string;
}

export interface SyaratJabatan {
  id: string;
  jabatanId: string;
  keterampilanKerja: string[];
  bakatKerja: string[];
  temperamenKerja: string[];
  minatKerja: string[];
  upayaFisik: string[];
  kondisiFisik: KondisiFisik;
  fungsiPekerjaan: string[];
}

export interface PrestasiKerja {
  id: string;
  jabatanId: string;
  uraian: string;
}

export interface HasilKerja {
  id: string;
  jabatanId: string;
  uraian: string;
}

export interface User {
  id: string;
  username: string;
  namaLengkap: string;
  email?: string;
  sptAdminNama?: string;
  sptAdminNip?: string;
  role: "admin" | "operator";
  unitKerjaId?: string; // Empty or ALL for admin, specific ID for operator
  isActive: boolean;
  createdAt?: string;
}

// Full jabatan data with all related entities
export interface JabatanFull extends Jabatan {
  kualifikasi: Kualifikasi | null;
  tugasPokok: TugasPokok[];
  hasilKerja: HasilKerja | null;
  bahanKerja: BahanKerja[];
  perangkatKerja: PerangkatKerja[];
  tanggungJawab: TanggungJawab[];
  wewenang: Wewenang[];
  korelasiJabatan: KorelasiJabatan[];
  kondisiLingkungan: KondisiLingkungan[];
  risikoBahaya: RisikoBahaya[];
  syaratJabatan: SyaratJabatan | null;
  prestasiKerja: PrestasiKerja | null;
  hierarchy?: Record<string, string>;
}

export interface ReferensiJabatan {
  id?: string;
  jenisJabatan: 'Pelaksana' | 'Fungsional';
  namaBase: string;
  kategori?: 'Keahlian' | 'Keterampilan' | 'Keduanya';
}

// Master data for dropdowns
export const BAKAT_KERJA = [
  { kode: 'G', nama: 'Intelegensia' },
  { kode: 'V', nama: 'Bakat Verbal' },
  { kode: 'N', nama: 'Bakat Numerik' },
  { kode: 'S', nama: 'Bakat Pandang Ruang' },
  { kode: 'P', nama: 'Bakat Penerapan Bentuk' },
  { kode: 'Q', nama: 'Bakat Ketelitian' },
  { kode: 'K', nama: 'Koordinasi Motorik' },
  { kode: 'F', nama: 'Kecekatan Jari' },
  { kode: 'E', nama: 'Koordinasi Mata-Tangan-Kaki' },
  { kode: 'C', nama: 'Kemampuan Membedakan Warna' },
  { kode: 'M', nama: 'Kecekatan Tangan' },
];

export const TEMPERAMEN_KERJA = [
  { kode: 'D', nama: 'DCP - Directing-Control-Planning' },
  { kode: 'F', nama: 'FIF - Feeling-Idea-Fact' },
  { kode: 'I', nama: 'INFLU - Influencing' },
  { kode: 'J', nama: 'SJC - Sensory & Judgmental Criteria' },
  { kode: 'M', nama: 'MVC - Measurable & Verifiable Criteria' },
  { kode: 'P', nama: 'DEPL - Dealing with People' },
  { kode: 'R', nama: 'REPCON - Repetitive & Continuous' },
  { kode: 'S', nama: 'PUS - Performing Under Stress' },
  { kode: 'T', nama: 'STS - Set of Limits/Tolerances/Standards' },
  { kode: 'V', nama: 'VARCH - Variety & Changing Conditions' },
];

export const MINAT_KERJA = [
  { kode: '1a', nama: 'Pilihan melakukan kegiatan yang berhubungan dengan benda dan obyek' },
  { kode: '1b', nama: 'Pilihan melakukan kegiatan yang berhubungan dengan komunikasi data' },
  { kode: '2a', nama: 'Pilihan melakukan kegiatan yang berhubungan dengan orang dalam niaga' },
  { kode: '2b', nama: 'Pilihan melakukan kegiatan yang bersifat ilmiah dan teknik' },
  { kode: '3a', nama: 'Pilihan melakukan kegiatan rutin, konkrit dan teratur' },
  { kode: '3b', nama: 'Pilihan melakukan kegiatan yang bersifat abstrak dan kreatif' },
  { kode: '4a', nama: 'Pilihan melakukan kegiatan yang berhubungan dengan orang' },
  { kode: '4b', nama: 'Pilihan melakukan kegiatan yang dianggap baik bagi orang lain' },
  { kode: '5a', nama: 'Pilihan melakukan kegiatan yang menghasilkan prestise atau penghargaan' },
  { kode: '5b', nama: 'Pilihan melakukan kegiatan yang menghasilkan kepuasan nyata' },
];

export const UPAYA_FISIK = [
  'Berdiri', 'Berjalan', 'Duduk', 'Mengangkat', 'Membawa',
  'Mendorong', 'Menarik', 'Memanjat', 'Menyimpan imbangan',
  'Menunduk', 'Berlutut', 'Membungkuk', 'Merangkak', 'Menjangkau',
  'Memegang', 'Bekerja dengan jari', 'Meraba', 'Berbicara',
  'Mendengar', 'Melihat',
];

export const ASPEK_LINGKUNGAN = [
  'Tempat Kerja', 'Suhu', 'Udara', 'Keadaan Ruangan',
  'Letak', 'Penerangan', 'Suara', 'Keadaan Tempat Kerja',
  'Getaran',
];
