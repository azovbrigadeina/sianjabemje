"use client";

import { useState, useEffect } from "react";
import styles from "../../dashboard/beban-kerja/page.module.css";
import { useUser } from "@/lib/UserContext";
import { api } from "@/lib/api";
import { UnitKerja } from "@/lib/types";

export default function OperatorValidasiPage() {
  const { user } = useUser();
  const [toast, setToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [unitKerja, setUnitKerja] = useState<UnitKerja | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOpd = async () => {
      if (!user?.unitKerjaId) return;
      try {
        const units = await api.getUnitKerja() as UnitKerja[];
        const currentOpd = units.find(u => u.id === user.unitKerjaId);
        if (currentOpd) setUnitKerja(currentOpd);
      } catch (err) {
        console.error("Gagal mengambil data OPD", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOpd();
  }, [user?.unitKerjaId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleKirimValidasi = async () => {
    if (!unitKerja?.id) return;
    if (!confirm("Apakah Anda yakin ingin mengirim data Anjab dan ABK OPD Anda ke Admin Kabupaten untuk divalidasi? Pastikan semua data telah diisi dengan benar.")) {
      return;
    }
    
    setIsSubmitting(true);
    try {
      await api.updateEntity('unitKerja', unitKerja.id, { 
        statusValidasi: 'Diajukan' 
      });
      setUnitKerja({ ...unitKerja, statusValidasi: 'Diajukan' });
      showToast("✅ Data berhasil dikirim ke Admin Kabupaten untuk divalidasi!");
    } catch (err: any) {
      showToast("❌ Gagal mengirim validasi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Kirim Validasi</h1>
          <p className={styles.subtitle}>
            Ajukan hasil Analisis Jabatan dan Beban Kerja OPD ke Admin Kabupaten
          </p>
        </div>
      </div>

      <div className={`${styles.card} glass-panel`} style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📤</div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Pengajuan Dokumen</h2>
        <p style={{ opacity: 0.8, marginBottom: '2rem', lineHeight: '1.6' }}>
          Setelah Anda selesai mengisi seluruh form <strong>Analisis Jabatan (Anjab)</strong> dan menghitung <strong>Analisis Beban Kerja (ABK)</strong> untuk seluruh struktur jabatan di OPD Anda, Anda dapat menekan tombol di bawah ini untuk mengirimkannya ke tim Bagian Organisasi / Admin Kabupaten untuk divalidasi.
        </p>

        {unitKerja?.statusValidasi === 'Revisi' && unitKerja?.catatanRevisi && (
          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '12px', color: '#ef4444', textAlign: 'left', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>⚠️</span> Catatan Revisi dari Admin Kabupaten:
            </h3>
            <p style={{ margin: 0, opacity: 0.9 }}>{unitKerja.catatanRevisi}</p>
          </div>
        )}

        <button 
          className="btn-primary" 
          onClick={handleKirimValidasi}
          disabled={isSubmitting || isLoading || unitKerja?.statusValidasi === 'Diajukan' || unitKerja?.statusValidasi === 'Disetujui'}
          style={{ 
            padding: '1rem 2rem', 
            fontSize: '1.1rem', 
            backgroundColor: (unitKerja?.statusValidasi === 'Diajukan' || unitKerja?.statusValidasi === 'Disetujui') ? '#6b7280' : 'hsl(142, 71%, 45%)',
            cursor: (unitKerja?.statusValidasi === 'Diajukan' || unitKerja?.statusValidasi === 'Disetujui') ? 'not-allowed' : 'pointer'
          }}
        >
          {isSubmitting ? "Mengirim Data..." : (
            unitKerja?.statusValidasi === 'Diajukan' ? "⏳ Sedang Menunggu Validasi" : 
            unitKerja?.statusValidasi === 'Disetujui' ? "✅ Sudah Disetujui" :
            "🚀 Kirim untuk Divalidasi"
          )}
        </button>

        <div style={{ marginTop: '2rem', padding: '1rem', background: 'hsla(var(--foreground), 0.05)', borderRadius: '12px', textAlign: 'left' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>ℹ️ Informasi Status OPD Anda:</h3>
          <ul style={{ margin: 0, paddingLeft: '1.5rem', opacity: 0.8, fontSize: '0.9rem' }}>
            <li>Status saat ini: <strong>{isLoading ? "Memuat..." : (unitKerja?.statusValidasi || 'Draft')}</strong></li>
            <li>Nama OPD: <strong>{unitKerja?.nama || '-'}</strong></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
