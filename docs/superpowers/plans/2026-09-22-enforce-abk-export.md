# Enforcement & Integrasi ABK pada Ekspor Word ANJAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menegakkan pengisian Analisis Beban Kerja (ABK) sebelum dokumen Word ANJAB dapat diunduh, dengan menyediakan Quick ABK Modal interaktif langsung di halaman ANJAB dan menyelaraskan data ABK dengan ekspor Word.

**Architecture:** 
1. Buat komponen modal `QuickAbkModal.tsx` untuk pengisian/penyesuaian cepat ABK dari ANJAB.
2. Perbarui `src/lib/exportDocx.ts` agar menyerap `abkData` untuk menyusun variabel `tugasPokok` & ringkasan formasi pada dokumen Word.
3. Tambahkan indikator status ABK (🟢/⚠️) di header modal Editor ANJAB di atas tombol `Unduh SIASN` dan interseptor pada tombol `Unduh Word` di `src/app/dashboard/analisis/page.tsx` serta `src/app/operator/analisis/page.tsx`.

**Tech Stack:** Next.js, React, TypeScript, docxtemplater / docx (`exportDocx.ts`), Sianjab API Client (`@/lib/api`).

## Global Constraints
- **Performance**: Gunakan `api.getBulkData` untuk multiple entity reads.
- **Data Integrity**: Operasi simpan wajib memanggil `api.saveSingleEntity('abk', payload)` yang secara otomatis memicu `invalidateAllCache()`.
- **Bundle Optimization**: Import `exportDocx` wajib menggunakan dynamic import (`await import("@/lib/exportDocx")`).

---

### Task 1: Create `QuickAbkModal` Component

**Files:**
- Create: `src/components/QuickAbkModal.tsx`

**Interfaces:**
- Consumes: `JabatanFull` from `@/lib/types`, `api` from `@/lib/api`
- Produces: `QuickAbkModal` component exported as default

- [ ] **Step 1: Create `src/components/QuickAbkModal.tsx` file with full modal UI and logic**

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { JabatanFull } from "@/lib/types";

type QuickAbkModalProps = {
  isOpen: boolean;
  onClose: () => void;
  jabatan: JabatanFull | null;
  onSuccess: (savedAbk: any) => void;
};

type ABKRow = {
  tugas: string;
  satuan: string;
  waktu: number;
  volume: number;
};

export default function QuickAbkModal({ isOpen, onClose, jabatan, onSuccess }: QuickAbkModalProps) {
  const [wke, setWke] = useState<number>(1250);
  const [waktuSatuan, setWaktuSatuan] = useState<'jam' | 'menit'>('jam');
  const [rows, setRows] = useState<ABKRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (jabatan && jabatan.tugasPokok) {
      const initialRows: ABKRow[] = jabatan.tugasPokok.map((tp) => ({
        tugas: tp.uraianTugas || "-",
        satuan: tp.hasilKerja || "Dokumen",
        waktu: Number(tp.waktuPenyelesaian) || 0,
        volume: Number(tp.jumlahHasil) || 0,
      }));
      setRows(initialRows);
    } else {
      setRows([]);
    }
  }, [jabatan]);

  if (!isOpen || !jabatan) return null;

  const handleRowChange = (index: number, field: 'waktu' | 'volume', val: number) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val >= 0 ? val : 0 };
      return updated;
    });
  };

  const calculateWaktuEfektif = (waktu: number, volume: number) => {
    return waktu * volume;
  };

  const calculateKebutuhan = (waktu: number, volume: number) => {
    const waktuEfektif = calculateWaktuEfektif(waktu, volume);
    if (wke <= 0) return 0;
    return waktuEfektif / wke;
  };

  const totalWaktuEfektif = rows.reduce((acc, r) => acc + calculateWaktuEfektif(r.waktu, r.volume), 0);
  const totalKebutuhan = wke > 0 ? totalWaktuEfektif / wke : 0;
  const formasiPembulatan = Math.ceil(totalKebutuhan);

  const handleSave = async () => {
    if (!jabatan) return;
    setSaving(true);
    try {
      const abkPayload = {
        id: jabatan.id,
        jabatanId: jabatan.id,
        rows: rows,
        wke: wke,
        waktuSatuan: waktuSatuan,
        totalWaktuEfektif: totalWaktuEfektif,
        totalKebutuhan: totalKebutuhan,
        formasiPembulatan: formasiPembulatan,
        updatedAt: new Date().toISOString()
      };

      await api.saveSingleEntity('abk', abkPayload);
      onSuccess(abkPayload);
      onClose();
    } catch (err: any) {
      alert("Gagal menyimpan ABK: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '850px',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prasyarat Laporan Resmi</span>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>Perhitungan Analisis Beban Kerja (ABK)</h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>{jabatan.namaJabatan}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.85rem 1rem', fontSize: '0.85rem', color: '#1e40af', lineHeight: 1.5 }}>
            💡 <strong>Sianjab Info:</strong> Dokumen Anjab & ABK merupakan satu kesatuan laporan. Mohon verifikasi WKE dan volume beban kerja di bawah ini untuk menghasilkan dokumen laporan yang sah.
          </div>

          {/* Settings Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.3rem' }}>WKE (Waktu Kerja Efektif / Tahun)</label>
              <input 
                type="number" 
                value={wke} 
                onChange={(e) => setWke(Number(e.target.value))} 
                style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.3rem' }}>Satuan Norma Waktu</label>
              <select 
                value={waktuSatuan} 
                onChange={(e) => setWaktuSatuan(e.target.value as 'jam' | 'menit')}
                style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                <option value="jam">Jam / Tahun (Standar: 1250 Jam)</option>
                <option value="menit">Menit / Tahun (Standar: 72000 Menit)</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '0.65rem 0.75rem', width: '40px' }}>No</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Uraian Tugas Pokok</th>
                  <th style={{ padding: '0.65rem 0.75rem', width: '120px' }}>Waktu ({waktuSatuan})</th>
                  <th style={{ padding: '0.65rem 0.75rem', width: '120px' }}>Volume (Hasil)</th>
                  <th style={{ padding: '0.65rem 0.75rem', width: '120px' }}>Kebutuhan</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>Tidak ada tugas pokok terdaftar di ANJAB.</td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    const keb = calculateKebutuhan(r.waktu, r.volume);
                    return (
                      <tr key={idx} style={{ borderBottom: idx === rows.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 500, color: '#1e293b' }}>{r.tugas}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <input 
                            type="number" 
                            step="any"
                            value={r.waktu} 
                            onChange={(e) => handleRowChange(idx, 'waktu', Number(e.target.value))}
                            style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} 
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <input 
                            type="number" 
                            step="any"
                            value={r.volume} 
                            onChange={(e) => handleRowChange(idx, 'volume', Number(e.target.value))}
                            style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} 
                          />
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: '#0f172a' }}>
                          {keb.toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Summary */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '0.85rem 1.25rem', borderRadius: '8px' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Total Kebutuhan Pegawai: </span>
              <strong style={{ fontSize: '1rem', color: '#0f172a', marginLeft: '0.4rem' }}>{totalKebutuhan.toFixed(4)}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Pembulatan Formasi: </span>
              <strong style={{ fontSize: '1.1rem', color: '#0284c7', marginLeft: '0.4rem' }}>{formasiPembulatan} Orang</strong>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '0 0 12px 12px' }}>
          <button 
            onClick={onClose} 
            disabled={saving}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Batal
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving || rows.length === 0}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: saving ? 0.7 : 1
            }}
          >
            <span>📄</span> {saving ? "Menyimpan & Menyiapkan Word..." : "Simpan ABK & Unduh Word"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit Task 1**

```bash
git add src/components/QuickAbkModal.tsx
git commit -m "feat: add QuickAbkModal component for quick ABK entry and export enforcement"
```

---

### Task 2: Ensure ABK Data Usage in `src/lib/exportDocx.ts`

**Files:**
- Modify: `src/lib/exportDocx.ts`

**Interfaces:**
- Consumes: `JabatanFull`, `abkData`
- Produces: `exportJabatanToDocx` function with accurate ABK data transformation

- [ ] **Step 1: Check and refine ABK rows handling in `src/lib/exportDocx.ts`**

In `src/lib/exportDocx.ts`, verify that when `abkData` is passed:
`abkRows` are mapped accurately matching the order or length of `jabatan.tugasPokok`.
Ensure that if `abkData` is passed, `wke` is extracted from `abkData.wke` (defaulting to 1250 if not specified).

- [ ] **Step 2: Commit Task 2**

```bash
git add src/lib/exportDocx.ts
git commit -m "fix(exportDocx): ensure abkData transformation uses exact saved rows and WKE"
```

---

### Task 3: Integrate ABK Badge & Interceptor in `src/app/dashboard/analisis/page.tsx` & `src/app/operator/analisis/page.tsx`

**Files:**
- Modify: `src/app/dashboard/analisis/page.tsx`
- Modify: `src/app/operator/analisis/page.tsx`

- [ ] **Step 1: Update `src/app/dashboard/analisis/page.tsx`**

1. Include `abk` in `api.getBulkData`:
   `const bulkData = await api.getBulkData(['unitKerja', 'jabatan', 'abk', ...])`
2. Maintain `abkMap` state:
   `const [abkMap, setAbkMap] = useState<Record<string, any>>({});`
   In `loadTree`: build `abkMap` where `abks.forEach(a => { if (a.id) map[a.id] = a; })`.
3. Add state for `QuickAbkModal`:
   `const [isAbkModalOpen, setIsAbkModalOpen] = useState(false);`
   `const [selectedJabatanForAbk, setSelectedJabatanForAbk] = useState<JabatanFull | null>(null);`
4. Add ABK status badge above `Unduh SIASN` / in top header bar of Editor Modal:
   ```tsx
   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
     {abkMap[jabatanData?.id] ? (
       <span style={{ backgroundColor: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '9999px', border: '1px solid #bbf7d0' }}>
         🟢 Status ABK: Selesai
       </span>
     ) : (
       <span style={{ backgroundColor: '#fef3c7', color: '#b45309', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '9999px', border: '1px solid #fde68a' }}>
         ⚠️ Status ABK: Belum Dihitung
       </span>
     )}
   </div>
   ```
5. Update Unduh Word click handler:
   ```tsx
   onClick={async () => {
     if (!jabatanData) return;
     const existingAbk = abkMap[jabatanData.id];
     if (!existingAbk) {
       setSelectedJabatanForAbk(jabatanData);
       setIsAbkModalOpen(true);
       return;
     }

     setDownloadingWord(true);
     try {
       const { exportJabatanToDocx } = await import("@/lib/exportDocx");
       await exportJabatanToDocx(jabatanData, existingAbk);
       showToast("✨ Berhasil mengunduh Word");
     } catch (err: any) {
       alert("Gagal mengunduh Word: " + err.message);
     } finally {
       setDownloadingWord(false);
     }
   }}
   ```
6. Render `<QuickAbkModal>` with `onSuccess`:
   ```tsx
   <QuickAbkModal
     isOpen={isAbkModalOpen}
     onClose={() => setIsAbkModalOpen(false)}
     jabatan={selectedJabatanForAbk}
     onSuccess={async (newAbk) => {
       if (selectedJabatanForAbk) {
         setAbkMap(prev => ({ ...prev, [selectedJabatanForAbk.id]: newAbk }));
         try {
           const { exportJabatanToDocx } = await import("@/lib/exportDocx");
           await exportJabatanToDocx(selectedJabatanForAbk, newAbk);
           showToast("✨ Berhasil menyimpan ABK & mengunduh Word");
         } catch (e: any) {
           alert("ABK tersimpan, namun gagal mengunduh Word: " + e.message);
         }
       }
     }}
   />
   ```

- [ ] **Step 2: Apply same updates to `src/app/operator/analisis/page.tsx`**

Apply identical integration to `src/app/operator/analisis/page.tsx`.

- [ ] **Step 3: Commit Task 3**

```bash
git add src/app/dashboard/analisis/page.tsx src/app/operator/analisis/page.tsx
git commit -m "feat: integrate ABK status badge and enforcement modal on Word export"
```

---

### Task 4: Verification & Build Check

- [ ] **Step 1: Execute `npm run build` to verify no compilation errors**
- [ ] **Step 2: Commit any final fixes if needed**
