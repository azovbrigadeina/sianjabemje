# Investigasi & Audit Anomali Jabatan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun menu baru "Investigasi Anomali" (`/dashboard/investigasi`) untuk mendeteksi typo nama jabatan, disparitas kelas pada nama yang sama, serta outlier kelas pada jabatan struktural (JPT, Administrator, Pengawas).

**Architecture:** Menggunakan 1 single bulk API call `api.getBulkData(['unitKerja', 'jabatan', 'referensiJabatan'])` di client-side Next.js, diolah dengan utilitas algoritma audit berkinerja tinggi (`src/lib/investigasiUtils.ts`) di dalam `useMemo`, dan ditampilkan dalam 3 tab interaktif dengan modal Quick Fix yang terhubung ke `api.updateJabatan()`.

**Tech Stack:** Next.js (App Router, Static Export), TypeScript, CSS Modules, Modern Vanilla CSS Tokens.

## Global Constraints

- Backend fetch menggunakan `api.getBulkData(['unitKerja', 'jabatan', 'referensiJabatan'])` (hanya 1 request).
- Setiap operasi update menggunakan `api.updateJabatan()` (otomatis menghapus cache).
- Tampilan responsif dengan dukungan tema terang/gelap (`data-theme`).

---

### Task 1: Utility Audit & Deteksi Anomali (`src/lib/investigasiUtils.ts`)

**Files:**
- Create: `src/lib/investigasiUtils.ts`

**Interfaces:**
- Consumes: `Jabatan`, `ReferensiJabatan`, `UnitKerja` from `@/lib/types`
- Produces: `detectAnomali(jabatanList, referensiList, unitKerjaList): AuditResult`

- [ ] **Step 1: Write utility file with type definitions and algorithms**

```typescript
import { Jabatan, ReferensiJabatan, UnitKerja } from '@/lib/types';

export type AnomaliType = 'TYPO_SPACE' | 'FUZZY_TYPO' | 'UNREFERENCED' | 'DISPARITAS_KELAS' | 'OUTLIER_STRUKTURAL';
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
  kelasDominan?: number;
  kelasStandar?: string;
}

export interface AuditResult {
  summary: {
    totalAnomali: number;
    totalTypo: number;
    totalDisparitas: number;
    totalOutlier: number;
  };
  anomaliTypo: AnomaliItem[];
  anomaliDisparitas: AnomaliItem[];
  anomaliOutlier: AnomaliItem[];
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
  unitKerjas: UnitKerja[]
): AuditResult {
  const opdMap = new Map<string, string>();
  unitKerjas.forEach(u => opdMap.set(u.id, u.nama));

  const refNameMap = new Map<string, ReferensiJabatan>();
  referensis.forEach(r => {
    refNameMap.set(normalizeName(r.namaBase), r);
  });

  const anomaliTypo: AnomaliItem[] = [];
  const anomaliDisparitas: AnomaliItem[] = [];
  const anomaliOutlier: AnomaliItem[] = [];

  // Grouping by normalized name
  const nameGroups = new Map<string, Jabatan[]>();
  jabatans.forEach(j => {
    const norm = normalizeName(j.namaJabatan);
    if (!nameGroups.has(norm)) nameGroups.set(norm, []);
    nameGroups.get(norm)!.push(j);
  });

  // 1. Check Typo & Reference
  jabatans.forEach(j => {
    const opdNama = opdMap.get(j.unitKerjaId) || 'OPD Tidak Diketahui';
    const normName = normalizeName(j.namaJabatan);
    const jenis = (j.jenisJabatan || '').toLowerCase();

    // Referensi Check for Pelaksana / Fungsional
    if (jenis.includes('pelaksana') || jenis.includes('fungsional')) {
      const matchExactRef = refNameMap.get(normName);
      if (matchExactRef) {
        // Teks sama secara huruf, cek apakah ada spasi berlebih atau case tidak konsisten
        if (j.namaJabatan !== matchExactRef.namaBase) {
          anomaliTypo.push({
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
            rekomendasi: matchExactRef.namaBase,
          });
        }
      } else {
        // Cek fuzzy match
        let bestMatch: ReferensiJabatan | null = null;
        let highestSim = 0;
        referensis.forEach(ref => {
          const sim = stringSimilarity(normName, ref.namaBase);
          if (sim > highestSim) {
            highestSim = sim;
            bestMatch = ref;
          }
        });

        if (bestMatch && highestSim >= 0.78 && highestSim < 1.0) {
          anomaliTypo.push({
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
            rekomendasi: (bestMatch as ReferensiJabatan).namaBase,
          });
        } else {
          anomaliTypo.push({
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
          });
        }
      }
    }
  });

  // 2. Check Disparitas Kelas (Nama Jabatan Sama)
  nameGroups.forEach((group, normName) => {
    if (group.length < 2) return;

    // Hitung frekuensi kelas (Modus)
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

    // Jika ada lebih dari 1 kelas yang dipakai
    if (gradeCounts.size > 1) {
      group.forEach(j => {
        if ((j.kelasJabatan || 0) !== modeGrade) {
          const opdNama = opdMap.get(j.unitKerjaId) || 'OPD Tidak Diketahui';
          anomaliDisparitas.push({
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
  jabatans.forEach(j => {
    const jenis = (j.jenisJabatan || '').toLowerCase();
    const nama = (j.namaJabatan || '').toLowerCase();
    const kelas = j.kelasJabatan || 0;
    const opdNama = opdMap.get(j.unitKerjaId) || 'OPD Tidak Diketahui';

    // JPT Pratama (Eselon II)
    if (jenis.includes('jpt') || jenis.includes('utama') || jenis.includes('madya') || jenis.includes('pratama') || nama.includes('kepala dinas') || nama.includes('kepala badan') || nama.includes('sekretaris daerah')) {
      const isSekda = nama.includes('sekretaris daerah');
      const targetGrade = isSekda ? 15 : 14;
      if (kelas !== targetGrade) {
        anomaliOutlier.push({
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
    // Administrator (Eselon III)
    else if (jenis.includes('administrator') || nama.includes('kabid') || nama.includes('camat') || nama.includes('sekretaris dinas') || nama.includes('kepala bidang')) {
      if (kelas < 11 || kelas > 12) {
        anomaliOutlier.push({
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
    // Pengawas (Eselon IV)
    else if (jenis.includes('pengawas') || nama.includes('kasubag') || nama.includes('kasi') || nama.includes('kepala seksi') || nama.includes('kepala subbagian')) {
      if (kelas < 8 || kelas > 9) {
        anomaliOutlier.push({
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

  return {
    summary: {
      totalAnomali: anomaliTypo.length + anomaliDisparitas.length + anomaliOutlier.length,
      totalTypo: anomaliTypo.length,
      totalDisparitas: anomaliDisparitas.length,
      totalOutlier: anomaliOutlier.length,
    },
    anomaliTypo,
    anomaliDisparitas,
    anomaliOutlier,
  };
}
```

- [ ] **Step 2: Commit Task 1**

```bash
git add src/lib/investigasiUtils.ts
git commit -m "feat: add anomaly audit logic and string distance metrics"
```

---

### Task 2: Integrasi Menu Navigasi (`src/app/dashboard/layout.tsx`)

**Files:**
- Modify: `src/app/dashboard/layout.tsx:108-124` & `src/app/dashboard/layout.tsx:195-207`

- [ ] **Step 1: Add getPageTitle entry and sidebar nav item**

In `src/app/dashboard/layout.tsx`:
Add title logic:
```typescript
if (pathname.includes('/investigasi')) return 'Investigasi & Audit Anomali';
```

Add Nav Link:
```tsx
<Link href="/dashboard/investigasi" className={`${styles.navItem} ${pathname.includes('/investigasi') ? styles.active : ''}`}>
  <span className={styles.navIcon}>🔍</span> <span className={styles.navText}>Investigasi Anomali</span>
</Link>
```

- [ ] **Step 2: Commit Task 2**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat: add Investigasi Anomali menu item to dashboard sidebar"
```

---

### Task 3: Halaman UI Investigasi (`src/app/dashboard/investigasi/page.tsx` & `.module.css`)

**Files:**
- Create: `src/app/dashboard/investigasi/page.tsx`
- Create: `src/app/dashboard/investigasi/investigasi.module.css`

- [ ] **Step 1: Create CSS styling module (`investigasi.module.css`)**

```css
.container {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.statsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.statCard {
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.statIcon {
  font-size: 2rem;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.1);
}

.statValue {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-main, #111827);
}

.statLabel {
  font-size: 0.85rem;
  color: var(--text-muted, #6b7280);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 1rem;
}

.searchBox {
  flex: 1;
  min-width: 250px;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-color, #d1d5db);
  background: var(--bg-input, #ffffff);
  color: var(--text-main, #111827);
}

.selectBox {
  padding: 0.6rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-color, #d1d5db);
  background: var(--bg-input, #ffffff);
  color: var(--text-main, #111827);
}

.tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 2px solid var(--border-color, #e5e7eb);
}

.tabBtn {
  padding: 0.75rem 1.25rem;
  font-weight: 600;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  color: var(--text-muted, #6b7280);
  transition: all 0.2s;
}

.tabBtn.active {
  border-bottom-color: #3b82f6;
  color: #3b82f6;
}

.tableWrapper {
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.9rem;
}

.table th {
  background: var(--bg-table-header, #f9fafb);
  padding: 0.85rem 1rem;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.table td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border-color, #f3f4f6);
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badgeTinggi { background: #fee2e2; color: #dc2626; }
.badgeSedang { background: #fef3c7; color: #d97706; }
.badgeRendah { background: #e0f2fe; color: #0284c7; }

.actionBtn {
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  background: #3b82f6;
  color: white;
}

.actionBtn:hover { background: #2563eb; }

/* Modal */
.modalBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modalContent {
  background: var(--bg-card, #ffffff);
  padding: 1.5rem;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
```

- [ ] **Step 2: Create React component `src/app/dashboard/investigasi/page.tsx`**

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import styles from "./investigasi.module.css";
import { api } from "@/lib/api";
import { Jabatan, ReferensiJabatan, UnitKerja } from "@/lib/types";
import { analyzeAnomali, AnomaliItem } from "@/lib/investigasiUtils";
import Link from "next/link";

export default function InvestigasiPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jabatans, setJabatans] = useState<Jabatan[]>([]);
  const [referensis, setReferensis] = useState<ReferensiJabatan[]>([]);
  const [unitKerjas, setUnitKerjas] = useState<UnitKerja[]>([]);

  const [activeTab, setActiveTab] = useState<'typo' | 'disparitas' | 'outlier'>('typo');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOpd, setSelectedOpd] = useState<string>('ALL');

  // Quick Fix Modal State
  const [editingAnomali, setEditingAnomali] = useState<AnomaliItem | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editKelas, setEditKelas] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const bulk = await api.getBulkData(['unitKerja', 'jabatan', 'referensiJabatan']);
        setUnitKerjas(bulk.unitKerja || []);
        setJabatans(bulk.jabatan || []);
        setReferensis(bulk.referensiJabatan || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat data investigasi');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const auditResult = useMemo(() => {
    return analyzeAnomali(jabatans, referensis, unitKerjas);
  }, [jabatans, referensis, unitKerjas]);

  const filterList = (items: AnomaliItem[]) => {
    return items.filter(item => {
      const matchOpd = selectedOpd === 'ALL' || item.unitKerjaId === selectedOpd;
      const matchSearch =
        item.namaJabatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.opdNama.toLowerCase().includes(searchQuery.toLowerCase());
      return matchOpd && matchSearch;
    });
  };

  const filteredTypo = useMemo(() => filterList(auditResult.anomaliTypo), [auditResult, searchQuery, selectedOpd]);
  const filteredDisparitas = useMemo(() => filterList(auditResult.anomaliDisparitas), [auditResult, searchQuery, selectedOpd]);
  const filteredOutlier = useMemo(() => filterList(auditResult.anomaliOutlier), [auditResult, searchQuery, selectedOpd]);

  const handleOpenEdit = (item: AnomaliItem) => {
    setEditingAnomali(item);
    setEditNama(item.rekomendasi || item.namaJabatan);
    setEditKelas(item.kelasDominan || item.kelasJabatan);
  };

  const handleSaveEdit = async () => {
    if (!editingAnomali) return;
    try {
      setSaving(true);
      await api.updateJabatan(editingAnomali.jabatanId, {
        namaJabatan: editNama,
        kelasJabatan: Number(editKelas),
      });

      // Update local state directly
      setJabatans(prev =>
        prev.map(j => (j.id === editingAnomali.jabatanId ? { ...j, namaJabatan: editNama, kelasJabatan: Number(editKelas) } : j))
      );
      setEditingAnomali(null);
    } catch (err) {
      alert("Gagal mengupdate jabatan: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ padding: '2rem', textAlign: 'center' }}>🔄 Melakukan audit & analisa data anomali...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div style={{ color: 'red', padding: '1rem' }}>❌ {error}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Metric Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>⚠️</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalAnomali}</div>
            <div className={styles.statLabel}>Total Anomali Ditemukan</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>📝</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalTypo}</div>
            <div className={styles.statLabel}>Typo & Format Ejaan</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>⚖️</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalDisparitas}</div>
            <div className={styles.statLabel}>Disparitas Kelas</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>🏛️</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalOutlier}</div>
            <div className={styles.statLabel}>Outlier Struktural</div>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className={styles.controls}>
        <input
          type="text"
          className={styles.searchBox}
          placeholder="🔍 Cari nama jabatan atau OPD..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <select
          className={styles.selectBox}
          value={selectedOpd}
          onChange={e => setSelectedOpd(e.target.value)}
        >
          <option value="ALL">-- Semua OPD ({unitKerjas.length}) --</option>
          {unitKerjas.map(u => (
            <option key={u.id} value={u.id}>{u.nama}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'typo' ? styles.active : ''}`}
          onClick={() => setActiveTab('typo')}
        >
          Typo & Format ({filteredTypo.length})
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'disparitas' ? styles.active : ''}`}
          onClick={() => setActiveTab('disparitas')}
        >
          Disparitas Kelas ({filteredDisparitas.length})
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'outlier' ? styles.active : ''}`}
          onClick={() => setActiveTab('outlier')}
        >
          Outlier Struktural ({filteredOutlier.length})
        </button>
      </div>

      {/* Content Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>OPD / Unit Kerja</th>
              <th>Nama Jabatan Saat Ini</th>
              <th>Jenis Jabatan</th>
              <th>Kelas</th>
              <th>Analisa & Temuan</th>
              <th>Level Risk</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {(activeTab === 'typo' ? filteredTypo : activeTab === 'disparitas' ? filteredDisparitas : filteredOutlier).length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
                  ✅ Tidak ditemukan anomali pada kategori ini.
                </td>
              </tr>
            ) : (
              (activeTab === 'typo' ? filteredTypo : activeTab === 'disparitas' ? filteredDisparitas : filteredOutlier).map(item => (
                <tr key={item.id}>
                  <td><strong>{item.opdNama}</strong></td>
                  <td>{item.namaJabatan}</td>
                  <td>{item.jenisJabatan}</td>
                  <td><span className={styles.badge} style={{ background: '#f3f4f6' }}>Kelas {item.kelasJabatan}</span></td>
                  <td>
                    {item.pesan}
                    {item.rekomendasi && (
                      <div style={{ fontSize: '0.8rem', color: '#2563eb', marginTop: '0.2rem' }}>
                        💡 Rekomendasi: <strong>{item.rekomendasi}</strong>
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${
                      item.severity === 'Tinggi' ? styles.badgeTinggi : item.severity === 'Sedang' ? styles.badgeSedang : styles.badgeRendah
                    }`}>
                      {item.severity}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className={styles.actionBtn} onClick={() => handleOpenEdit(item)}>
                        ✏️ Koreksi
                      </button>
                      <Link href={`/dashboard/organisasi?unitId=${item.unitKerjaId}`} className={styles.actionBtn} style={{ background: '#6b7280', textDecoration: 'none' }}>
                        🗺️ Peta
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Quick Fix Modal */}
      {editingAnomali && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h3>✏️ Koreksi Cepat Jabatan</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Unit: <strong>{editingAnomali.opdNama}</strong>
            </p>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Nama Jabatan</label>
              <input
                type="text"
                className={styles.searchBox}
                style={{ width: '100%' }}
                value={editNama}
                onChange={e => setEditNama(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Kelas Jabatan</label>
              <input
                type="number"
                className={styles.searchBox}
                style={{ width: '100%' }}
                value={editKelas}
                onChange={e => setEditKelas(Number(e.target.value))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className={styles.actionBtn}
                style={{ background: '#9ca3af' }}
                onClick={() => setEditingAnomali(null)}
                disabled={saving}
              >
                Batal
              </button>
              <button
                className={styles.actionBtn}
                onClick={handleSaveEdit}
                disabled={saving}
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit Task 3**

```bash
git add src/app/dashboard/investigasi/page.tsx src/app/dashboard/investigasi/investigasi.module.css
git commit -m "feat: implement Investigasi Anomali UI and Quick Edit Modal"
```

---

### Task 4: Build & Local Verification

- [ ] **Step 1: Test build with `npm run build`**

Run: `npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 2: Commit any final build artifacts if clean**
