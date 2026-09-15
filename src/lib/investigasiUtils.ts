import { Jabatan, ReferensiJabatan, UnitKerja, AnomaliExclusion } from '@/lib/types';

export type AnomaliType = 'TYPO_SPACE' | 'FUZZY_TYPO' | 'UNREFERENCED' | 'DISPARITAS_KELAS' | 'OUTLIER_STRUKTURAL' | 'DATA_YATIM';
export type SeverityLevel = 'Tinggi' | 'Sedang' | 'Rendah';

export interface AnomaliItem {
  id: string; // ID unik anomali
  jabatanId: string;
  unitKerjaId: string;
  opdNama: string;
  namaJabatan: string;
  jenisJabatan: string;
  kelasJabatan: number;
  type: AnomaliType;
  severity: SeverityLevel;
  pesan: string;
  rekomendasi?: string;
  rekomendasiBase?: string;
  parsedJenjang?: string | null;
  kelasDominan?: number;
  kelasStandar?: string;
  exclusionId?: string;
  exclusionDate?: string;
  isExcluded?: boolean;
}

export interface AuditResult {
  summary: {
    totalAnomali: number;
    totalTypo: number;
    totalDisparitas: number;
    totalOutlier: number;
    totalYatim: number;
    totalDikecualikan: number;
  };
  anomaliTypo: AnomaliItem[];
  anomaliDisparitas: AnomaliItem[];
  anomaliOutlier: AnomaliItem[];
  anomaliYatim: AnomaliItem[];
  anomaliDikecualikan: AnomaliItem[];
}

export const JENJANG_FUNGSIONAL = [
  'Ahli Utama',
  'Ahli Madya',
  'Ahli Muda',
  'Ahli Pertama',
  'Penyelia',
  'Mahir',
  'Terampil',
  'Pemula',
];

export interface ParsedJabatan {
  baseName: string;
  jenjang: string | null;
}

export function parseJenjangJabatan(nama: string): ParsedJabatan {
  const cleanName = (nama || '').trim();
  for (const j of JENJANG_FUNGSIONAL) {
    const regex = new RegExp(`\\b${j}$`, 'i');
    if (regex.test(cleanName)) {
      const baseName = cleanName.replace(regex, '').replace(/[-,\s]+$/, '').trim();
      if (baseName.length > 0) {
        return { baseName, jenjang: j };
      }
    }
  }
  return { baseName: cleanName, jenjang: null };
}

/** Distance metric Levenshtein */
export function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return (maxLen - dist) / maxLen;
}

export function normalizeName(name: string): string {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function analyzeAnomali(
  jabatans: Jabatan[],
  referensis: ReferensiJabatan[],
  unitKerjas: UnitKerja[],
  exclusions: AnomaliExclusion[] = []
): AuditResult {
  const opdMap = new Map<string, string>();
  unitKerjas.forEach(u => opdMap.set(u.id, u.nama));

  const refNameMap = new Map<string, ReferensiJabatan>();
  referensis.forEach(r => {
    refNameMap.set(normalizeName(r.namaBase), r);
  });

  const exclusionMap = new Map<string, AnomaliExclusion>();
  exclusions.forEach(ex => {
    exclusionMap.set(`${ex.jabatanId}_${ex.type}`, ex);
    exclusionMap.set(`${ex.jabatanId}_ALL`, ex);
  });

  const processedExclusionIds = new Set<string>();

  const rawAnomaliTypo: AnomaliItem[] = [];
  const rawAnomaliDisparitas: AnomaliItem[] = [];
  const rawAnomaliOutlier: AnomaliItem[] = [];
  const rawAnomaliYatim: AnomaliItem[] = [];

  const anomaliTypo: AnomaliItem[] = [];
  const anomaliDisparitas: AnomaliItem[] = [];
  const anomaliOutlier: AnomaliItem[] = [];
  const anomaliYatim: AnomaliItem[] = [];
  const anomaliDikecualikan: AnomaliItem[] = [];

  // Filter orphan data vs valid jabatans
  const validJabatans: Jabatan[] = [];
  jabatans.forEach(j => {
    if (!j.unitKerjaId || !opdMap.has(j.unitKerjaId)) {
      rawAnomaliYatim.push({
        id: `yatim-${j.id}`,
        jabatanId: j.id,
        unitKerjaId: j.unitKerjaId || '',
        opdNama: 'OPD Tidak Diketahui',
        namaJabatan: j.namaJabatan,
        jenisJabatan: j.jenisJabatan || 'Tidak Diketahui',
        kelasJabatan: j.kelasJabatan || 0,
        type: 'DATA_YATIM',
        severity: 'Tinggi',
        pesan: 'Jabatan tidak terikat ke Unit Kerja / OPD manapun (Data Yatim)',
        rekomendasi: 'Koreksi OPD atau Hapus Permanen',
      });
    } else {
      validJabatans.push(j);
    }
  });

  // Grouping by normalized name
  const nameGroups = new Map<string, Jabatan[]>();
  validJabatans.forEach(j => {
    const norm = normalizeName(j.namaJabatan);
    if (!nameGroups.has(norm)) nameGroups.set(norm, []);
    nameGroups.get(norm)!.push(j);
  });

  // 1. Check Typo & Reference
  validJabatans.forEach(j => {
    const opdNama = opdMap.get(j.unitKerjaId) || 'OPD Tidak Diketahui';
    const jenis = (j.jenisJabatan || '').toLowerCase();

    // Referensi Check for Pelaksana / Fungsional
    if (jenis.includes('pelaksana') || jenis.includes('fungsional')) {
      const parsed = parseJenjangJabatan(j.namaJabatan);
      const normBase = normalizeName(parsed.baseName);
      const normFull = normalizeName(j.namaJabatan);

      const matchExactRef = refNameMap.get(normBase) || refNameMap.get(normFull);
      if (matchExactRef) {
        const isFullMatch = refNameMap.has(normFull) && !refNameMap.has(normBase);
        const standardName = isFullMatch
          ? matchExactRef.namaBase
          : `${matchExactRef.namaBase}${parsed.jenjang ? ' ' + parsed.jenjang : ''}`;

        if (j.namaJabatan !== standardName) {
          rawAnomaliTypo.push({
            id: `typo-case-${j.id}`,
            jabatanId: j.id,
            unitKerjaId: j.unitKerjaId,
            opdNama,
            namaJabatan: j.namaJabatan,
            jenisJabatan: j.jenisJabatan,
            kelasJabatan: j.kelasJabatan,
            type: 'TYPO_SPACE',
            severity: 'Rendah',
            pesan: 'Penulisan spasi atau huruf kapital berbeda dari Referensi Jabatan',
            rekomendasi: standardName,
            rekomendasiBase: matchExactRef.namaBase,
            parsedJenjang: parsed.jenjang,
          });
        }
      } else {
        // Cek fuzzy match
        let bestMatch: ReferensiJabatan | null = null;
        let highestSim = 0;
        referensis.forEach(ref => {
          const sim = stringSimilarity(normBase, ref.namaBase);
          if (sim > highestSim) {
            highestSim = sim;
            bestMatch = ref;
          }
        });

        if (bestMatch && highestSim >= 0.78) {
          const standardName = `${(bestMatch as ReferensiJabatan).namaBase}${parsed.jenjang ? ' ' + parsed.jenjang : ''}`;
          rawAnomaliTypo.push({
            id: `typo-fuzzy-${j.id}`,
            jabatanId: j.id,
            unitKerjaId: j.unitKerjaId,
            opdNama,
            namaJabatan: j.namaJabatan,
            jenisJabatan: j.jenisJabatan,
            kelasJabatan: j.kelasJabatan,
            type: 'FUZZY_TYPO',
            severity: 'Tinggi',
            pesan: `Kemiripan ${(highestSim * 100).toFixed(0)}% dengan referensi '${(bestMatch as ReferensiJabatan).namaBase}' (kemungkinan typo)`,
            rekomendasi: standardName,
            rekomendasiBase: (bestMatch as ReferensiJabatan).namaBase,
            parsedJenjang: parsed.jenjang,
          });
        } else {
          rawAnomaliTypo.push({
            id: `typo-unref-${j.id}`,
            jabatanId: j.id,
            unitKerjaId: j.unitKerjaId,
            opdNama,
            namaJabatan: j.namaJabatan,
            jenisJabatan: j.jenisJabatan,
            kelasJabatan: j.kelasJabatan,
            type: 'UNREFERENCED',
            severity: 'Sedang',
            pesan: 'Nama Jabatan tidak terdaftar pada Master Referensi Jabatan',
            rekomendasiBase: parsed.baseName,
            parsedJenjang: parsed.jenjang,
          });
        }
      }
    }
  });

  // 2. Check Disparitas Kelas (Nama Jabatan Sama)
  nameGroups.forEach((group, normName) => {
    if (group.length < 2) return;

    const gradeCounts = new Map<number, number>();
    group.forEach(j => {
      const g = j.kelasJabatan || 0;
      gradeCounts.set(g, (gradeCounts.get(g) || 0) + 1);
    });

    let maxCount = 0;
    let modeGrade = 0;
    gradeCounts.forEach((count, grade) => {
      if (count > maxCount) {
        maxCount = count;
        modeGrade = grade;
      }
    });

    if (gradeCounts.size > 1) {
      group.forEach(j => {
        if ((j.kelasJabatan || 0) !== modeGrade) {
          const opdNama = opdMap.get(j.unitKerjaId) || 'OPD Tidak Diketahui';
          rawAnomaliDisparitas.push({
            id: `disparitas-${j.id}`,
            jabatanId: j.id,
            unitKerjaId: j.unitKerjaId,
            opdNama,
            namaJabatan: j.namaJabatan,
            jenisJabatan: j.jenisJabatan,
            kelasJabatan: j.kelasJabatan,
            type: 'DISPARITAS_KELAS',
            severity: 'Tinggi',
            pesan: `Kelas Jabatan (${j.kelasJabatan}) berbeda dari kelas dominan (${modeGrade}) yang dipakai oleh ${maxCount} unit lainnya`,
            kelasDominan: modeGrade,
          });
        }
      });
    }
  });

  // 3. Check Outlier Kelas Jabatan Struktural
  validJabatans.forEach(j => {
    const jenis = (j.jenisJabatan || '').toLowerCase();
    const nama = (j.namaJabatan || '').toLowerCase();
    const kelas = j.kelasJabatan || 0;
    const opdNama = opdMap.get(j.unitKerjaId) || 'OPD Tidak Diketahui';

    const isFungsional = jenis.includes('fungsional');
    const isJpt = !isFungsional && (
      jenis.includes('pimpinan tinggi') ||
      /\bjpt\b/.test(jenis) ||
      nama.includes('kepala dinas') ||
      nama.includes('kepala badan') ||
      nama.includes('sekretaris daerah')
    );
    if (isJpt) {
      const isSekda = nama.includes('sekretaris daerah');
      const targetGrade = isSekda ? 15 : 14;
      if (kelas !== targetGrade) {
        rawAnomaliOutlier.push({
          id: `outlier-jpt-${j.id}`,
          jabatanId: j.id,
          unitKerjaId: j.unitKerjaId,
          opdNama,
          namaJabatan: j.namaJabatan,
          jenisJabatan: j.jenisJabatan,
          kelasJabatan: kelas,
          type: 'OUTLIER_STRUKTURAL',
          severity: 'Tinggi',
          pesan: `Jabatan JPT biasanya berkelas ${targetGrade}, saat ini diset kelas ${kelas}`,
          kelasStandar: `Kelas ${targetGrade}`,
        });
      }
    }
    else if (jenis.includes('administrator') || nama.includes('kabid') || nama.includes('camat') || nama.includes('sekretaris dinas') || nama.includes('kepala bidang')) {
      if (kelas < 11 || kelas > 12) {
        rawAnomaliOutlier.push({
          id: `outlier-admin-${j.id}`,
          jabatanId: j.id,
          unitKerjaId: j.unitKerjaId,
          opdNama,
          namaJabatan: j.namaJabatan,
          jenisJabatan: j.jenisJabatan,
          kelasJabatan: kelas,
          type: 'OUTLIER_STRUKTURAL',
          severity: 'Sedang',
          pesan: `Jabatan Administrator standar berkelas 11 - 12, saat ini diset kelas ${kelas}`,
          kelasStandar: 'Kelas 11 - 12',
        });
      }
    }
    else if (jenis.includes('pengawas') || nama.includes('kasubag') || nama.includes('kasi') || nama.includes('kepala seksi') || nama.includes('kepala subbagian')) {
      if (kelas < 8 || kelas > 9) {
        rawAnomaliOutlier.push({
          id: `outlier-pengawas-${j.id}`,
          jabatanId: j.id,
          unitKerjaId: j.unitKerjaId,
          opdNama,
          namaJabatan: j.namaJabatan,
          jenisJabatan: j.jenisJabatan,
          kelasJabatan: kelas,
          type: 'OUTLIER_STRUKTURAL',
          severity: 'Sedang',
          pesan: `Jabatan Pengawas standar berkelas 8 - 9, saat ini diset kelas ${kelas}`,
          kelasStandar: 'Kelas 8 - 9',
        });
      }
    }
  });

  // Filter out excluded items and route them to anomaliDikecualikan
  const processList = (rawList: AnomaliItem[], targetList: AnomaliItem[]) => {
    rawList.forEach(item => {
      const matchEx = exclusionMap.get(`${item.jabatanId}_${item.type}`) || exclusionMap.get(`${item.jabatanId}_ALL`);
      if (matchEx) {
        processedExclusionIds.add(matchEx.id);
        anomaliDikecualikan.push({
          ...item,
          exclusionId: matchEx.id,
          exclusionDate: matchEx.createdAt,
          isExcluded: true,
        });
      } else {
        targetList.push(item);
      }
    });
  };

  processList(rawAnomaliTypo, anomaliTypo);
  processList(rawAnomaliDisparitas, anomaliDisparitas);
  processList(rawAnomaliOutlier, anomaliOutlier);
  processList(rawAnomaliYatim, anomaliYatim);

  // Include any remaining exclusions stored in database that might not be matched to raw findings
  exclusions.forEach(ex => {
    if (!processedExclusionIds.has(ex.id)) {
      const j = jabatans.find(jab => jab.id === ex.jabatanId);
      const opdNama = j && j.unitKerjaId ? (opdMap.get(j.unitKerjaId) || 'OPD Tidak Diketahui') : (opdMap.get(ex.unitKerjaId || '') || 'OPD Tidak Diketahui');
      anomaliDikecualikan.push({
        id: `excluded-${ex.id}`,
        jabatanId: ex.jabatanId,
        unitKerjaId: j?.unitKerjaId || ex.unitKerjaId || '',
        opdNama,
        namaJabatan: j?.namaJabatan || ex.namaJabatan || 'Jabatan Dikecualikan',
        jenisJabatan: j?.jenisJabatan || '-',
        kelasJabatan: j?.kelasJabatan || 0,
        type: (ex.type as AnomaliType) || 'OUTLIER_STRUKTURAL',
        severity: 'Rendah',
        pesan: ex.pesan || 'Kondisi dikecualikan dari temuan anomali',
        exclusionId: ex.id,
        exclusionDate: ex.createdAt,
        isExcluded: true,
      });
    }
  });

  return {
    summary: {
      totalAnomali: anomaliTypo.length + anomaliDisparitas.length + anomaliOutlier.length + anomaliYatim.length,
      totalTypo: anomaliTypo.length,
      totalDisparitas: anomaliDisparitas.length,
      totalOutlier: anomaliOutlier.length,
      totalYatim: anomaliYatim.length,
      totalDikecualikan: anomaliDikecualikan.length,
    },
    anomaliTypo,
    anomaliDisparitas,
    anomaliOutlier,
    anomaliYatim,
    anomaliDikecualikan,
  };
}

export const detectAnomali = analyzeAnomali;

