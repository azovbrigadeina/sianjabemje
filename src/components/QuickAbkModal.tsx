"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { calculateFormasiPembulatan } from "@/lib/utils";
import type { JabatanFull } from "@/lib/types";
import { BRANDING } from "@/config/branding";

export type QuickAbkModalProps = {
  isOpen: boolean;
  onClose: () => void;
  jabatan: JabatanFull | null;
  onSuccess: (savedAbk: any) => void;
};

export type ABKRow = {
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
    let isMounted = true;
    if (isOpen && jabatan) {
      const initialRows: ABKRow[] = (jabatan.tugasPokok || []).map((tp) => ({
        tugas: tp.uraianTugas || "-",
        satuan: tp.hasilKerja || "Dokumen",
        waktu: Number(tp.waktuPenyelesaian) || 0,
        volume: Number(tp.jumlahHasil) || 0,
      }));

      // Try fetching existing ABK data if present
      api.getABK(jabatan.id)
        .then((res: any) => {
          if (!isMounted) return;
          const abkData = res?.data || res;
          if (abkData && abkData.rows && Array.isArray(abkData.rows) && abkData.rows.length > 0) {
            setRows(abkData.rows);
            if (abkData.wke) setWke(Number(abkData.wke));
            if (abkData.waktuSatuan) setWaktuSatuan(abkData.waktuSatuan);
          } else {
            setRows(initialRows);
          }
        })
        .catch(() => {
          if (isMounted) setRows(initialRows);
        });
    } else {
      setRows([]);
    }
    return () => { isMounted = false; };
  }, [isOpen, jabatan]);

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
  const formasiPembulatan = calculateFormasiPembulatan(totalKebutuhan);

  const handleSave = async () => {
    if (!jabatan) return;
    setSaving(true);
    try {
      const abkPayload = {
        id: jabatan.id,
        jabatanId: jabatan.id,
        rows: rows,
        wke: Number(wke),
        waktuSatuan: waktuSatuan,
        totalWaktuEfektif: totalWaktuEfektif,
        totalKebutuhan: totalKebutuhan,
        formasiPembulatan: formasiPembulatan,
        updatedAt: new Date().toISOString()
      };

      try {
        await api.saveABK(jabatan.id, abkPayload);
      } catch {
        await api.saveSingleEntity('abk', jabatan.id, abkPayload);
      }

      onSuccess(abkPayload);
      onClose();
    } catch (err: any) {
      alert("Gagal menyimpan ABK: " + (err?.message || err));
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
            💡 <strong>Info {BRANDING.shortName}:</strong> Dokumen Anjab & ABK merupakan satu kesatuan laporan. Mohon verifikasi WKE dan volume beban kerja di bawah ini untuk menghasilkan dokumen laporan yang sah.
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
                onChange={(e) => {
                  const newSat = e.target.value as 'jam' | 'menit';
                  setWaktuSatuan(newSat);
                  if (newSat === 'menit' && wke === 1250) setWke(72000);
                  else if (newSat === 'jam' && wke === 72000) setWke(1250);
                }}
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
                  <th style={{ padding: '0.65rem 0.75rem', width: '40px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Uraian Tugas Pokok</th>
                  <th style={{ padding: '0.65rem 0.75rem', width: '100px' }}>Satuan</th>
                  <th style={{ padding: '0.65rem 0.75rem', width: '110px', textAlign: 'center' }}>Waktu ({waktuSatuan})</th>
                  <th style={{ padding: '0.65rem 0.75rem', width: '110px', textAlign: 'center' }}>Volume / Thn</th>
                  <th style={{ padding: '0.65rem 0.75rem', width: '110px', textAlign: 'center' }}>Waktu Efektif</th>
                  <th style={{ padding: '0.65rem 0.75rem', width: '110px', textAlign: 'center' }}>Kebutuhan</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>Tidak ada tugas pokok terdaftar di ANJAB.</td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    const waktuEfektif = calculateWaktuEfektif(r.waktu, r.volume);
                    const keb = calculateKebutuhan(r.waktu, r.volume);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#64748b', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 500, color: '#1e293b' }}>{r.tugas}</td>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#64748b' }}>{r.satuan || '-'}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <input 
                            type="number" 
                            step="any"
                            value={r.waktu} 
                            onChange={(e) => handleRowChange(idx, 'waktu', Number(e.target.value))}
                            style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', textAlign: 'center' }} 
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <input 
                            type="number" 
                            step="any"
                            value={r.volume} 
                            onChange={(e) => handleRowChange(idx, 'volume', Number(e.target.value))}
                            style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', textAlign: 'center' }} 
                          />
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: '#475569', textAlign: 'center' }}>
                          {waktuEfektif.toLocaleString('id-ID')}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: '#0f172a', textAlign: 'center' }}>
                          {keb.toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 700, color: '#1e293b' }}>
                    <td colSpan={5} style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Total</td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: '#0f172a', fontWeight: 700 }}>
                      {totalWaktuEfektif.toLocaleString('id-ID')}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: '#2563eb', fontSize: '0.95rem', fontWeight: 700 }}>
                      {totalKebutuhan.toFixed(4)}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#eff6ff', borderTop: '1px solid #bfdbfe', fontWeight: 700, color: '#1e40af' }}>
                    <td colSpan={6} style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Pembulatan Formasi</td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: '#1d4ed8', fontSize: '1.1rem', fontWeight: 700 }}>
                      {formasiPembulatan}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
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
