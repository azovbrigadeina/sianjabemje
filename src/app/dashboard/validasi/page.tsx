"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import { UnitKerja, ValidationHistory } from "@/lib/types";
import { getWibTimestamp } from "@/lib/utils";

export default function AdminValidasiPage() {
  const [opds, setOpds] = useState<UnitKerja[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Modal State
  const [selectedOpd, setSelectedOpd] = useState<UnitKerja | null>(null);
  const [catatan, setCatatan] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchOpds = async () => {
    setIsLoading(true);
    try {
      const units = await api.getUnitKerja() as UnitKerja[];
      setOpds(units);
    } catch (err) {
      console.error("Gagal mengambil data OPD", err);
      showToast("❌ Gagal memuat data OPD");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOpds();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openReviewModal = (opd: UnitKerja) => {
    setSelectedOpd(opd);
    setCatatan(opd.catatanRevisi || "");
  };

  const handleUpdateStatus = async (status: 'Disetujui' | 'Revisi') => {
    if (!selectedOpd) return;
    if (status === 'Revisi' && !catatan.trim()) {
      alert("Catatan revisi wajib diisi jika Anda mengembalikan (menolak) usulan OPD.");
      return;
    }

    setIsSubmitting(true);
    try {
      const wibTime = getWibTimestamp();
      const newHistoryItem: ValidationHistory = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        status: status,
        timestamp: wibTime,
        actor: 'Admin Kabupaten',
        catatan: status === 'Revisi' ? catatan : ''
      };

      const existingHistory = Array.isArray(selectedOpd.historyValidasi) ? selectedOpd.historyValidasi : [];
      const updatedHistory = [...existingHistory, newHistoryItem];

      await api.updateEntity('unitKerja', selectedOpd.id, {
        statusValidasi: status,
        catatanRevisi: status === 'Revisi' ? catatan : '', // Clear notes if approved
        historyValidasi: updatedHistory
      });
      
      setOpds(prev => prev.map(u => 
        u.id === selectedOpd.id ? { 
          ...u, 
          statusValidasi: status, 
          catatanRevisi: status === 'Revisi' ? catatan : '',
          historyValidasi: updatedHistory
        } : u
      ));
      
      showToast(`✅ Status OPD berhasil diubah menjadi ${status}`);
      setSelectedOpd(null);
    } catch (err: any) {
      showToast("❌ Gagal mengubah status: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only show submitted or processed OPDs, ignore completely empty Drafts unless they were already submitted
  const displayOpds = opds.filter(u => u.statusValidasi && u.statusValidasi !== 'Draft');

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Validasi Usulan OPD</h1>
          <p className={styles.subtitle}>
            Daftar Unit Kerja yang telah mengajukan hasil Anjab dan ABK untuk divalidasi.
          </p>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: '5%' }}>No</th>
              <th style={{ width: '50%' }}>Nama OPD</th>
              <th style={{ width: '25%' }}>Status Validasi</th>
              <th style={{ width: '20%', textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', opacity: 0.7 }}>Memuat data...</td>
              </tr>
            ) : displayOpds.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', opacity: 0.7 }}>Belum ada OPD yang mengajukan validasi.</td>
              </tr>
            ) : (
              displayOpds.map((opd, idx) => (
                <tr key={opd.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{opd.nama}</td>
                  <td>
                    <span className={`${styles.badge} ${
                      opd.statusValidasi === 'Diajukan' ? styles.diajukan :
                      opd.statusValidasi === 'Disetujui' ? styles.disetujui :
                      opd.statusValidasi === 'Revisi' ? styles.revisi : styles.draft
                    }`}>
                      {opd.statusValidasi || 'Draft'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button 
                      onClick={() => openReviewModal(opd)}
                      style={{ 
                        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', 
                        border: 'none', 
                        color: 'white', 
                        padding: '0.4rem 1rem', 
                        borderRadius: '6px', 
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                      }}
                    >
                      Proses
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Review Modal */}
      {selectedOpd && (
        <div className={styles.modalOverlay} onClick={() => setSelectedOpd(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button className={styles.closeButton} onClick={() => setSelectedOpd(null)}>✕</button>
            
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Review Usulan OPD</h2>
            <p style={{ opacity: 0.8, marginBottom: '1.5rem' }}>
              Memproses pengajuan Anjab ABK untuk:<br/>
              <strong>{selectedOpd.nama}</strong>
            </p>

            {/* Riwayat Usulan */}
            {selectedOpd.historyValidasi && Array.isArray(selectedOpd.historyValidasi) && selectedOpd.historyValidasi.length > 0 && (
              <div style={{ 
                marginBottom: '1.5rem', 
                padding: '1rem', 
                background: 'rgba(255, 255, 255, 0.03)', 
                borderRadius: '8px', 
                border: '1px solid var(--glass-border)',
                maxHeight: '180px',
                overflowY: 'auto'
              }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', fontWeight: 600 }}>📜 Riwayat Usulan & Validasi:</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {selectedOpd.historyValidasi.map((hist, idx) => (
                    <div key={hist.id || idx} style={{ 
                      fontSize: '0.85rem',
                      borderBottom: idx < selectedOpd.historyValidasi!.length - 1 ? '1px dashed rgba(255, 255, 255, 0.1)' : 'none', 
                      paddingBottom: '0.5rem' 
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
                        <span style={{ fontWeight: 600 }}>{hist.actor}</span>
                        <span style={{ opacity: 0.7, fontSize: '0.8rem' }}>{hist.timestamp}</span>
                      </div>
                      <div style={{ marginTop: '0.2rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <span style={{ 
                          fontSize: '0.75rem',
                          padding: '0.05rem 0.35rem', 
                          borderRadius: '4px',
                          backgroundColor: 
                            hist.status === 'Diajukan' ? 'rgba(59, 130, 246, 0.15)' :
                            hist.status === 'Disetujui' ? 'rgba(16, 185, 129, 0.15)' :
                            hist.status === 'Revisi' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                          color:
                            hist.status === 'Diajukan' ? '#3b82f6' :
                            hist.status === 'Disetujui' ? '#10b981' :
                            hist.status === 'Revisi' ? '#ef4444' : '#6b7280',
                          fontWeight: 600
                        }}>
                          {hist.status}
                        </span>
                        {hist.catatan ? (
                          <span style={{ opacity: 0.9 }}>
                            - <span style={{ fontStyle: 'italic' }}>"{hist.catatan}"</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.formGroup}>
              <label style={{ fontWeight: 600 }}>Catatan Revisi (Opsional jika disetujui, Wajib jika ditolak)</label>
              <textarea 
                className={styles.textarea}
                placeholder="Tuliskan alasan penolakan atau catatan tambahan di sini..."
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
              />
            </div>

            <div className={styles.buttonGroup}>
              <button 
                className={styles.btnDanger}
                onClick={() => handleUpdateStatus('Revisi')}
                disabled={isSubmitting}
              >
                Tolak & Kembalikan (Revisi)
              </button>
              <button 
                className={styles.btnPrimary}
                onClick={() => handleUpdateStatus('Disetujui')}
                disabled={isSubmitting}
              >
                Setujui Usulan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
