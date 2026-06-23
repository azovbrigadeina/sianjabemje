"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import { UnitKerja } from "@/lib/types";

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
      await api.updateEntity('unitKerja', selectedOpd.id, {
        statusValidasi: status,
        catatanRevisi: status === 'Revisi' ? catatan : '' // Clear notes if approved
      });
      
      setOpds(prev => prev.map(u => 
        u.id === selectedOpd.id ? { ...u, statusValidasi: status, catatanRevisi: status === 'Revisi' ? catatan : '' } : u
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
