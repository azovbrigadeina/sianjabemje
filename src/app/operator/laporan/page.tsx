"use client";

import { useState, useEffect, useMemo } from "react";
import styles from "../../dashboard/laporan/page.module.css";
import { api } from "@/lib/api";
import { calculateFormasiPembulatan } from "@/lib/utils";
import { useUser } from "@/lib/UserContext";
import type { UnitKerja, Jabatan, JabatanFull } from "@/lib/types";

export default function OperatorLaporanPage() {
  const { user } = useUser();
  const [opdName, setOpdName] = useState<string>("OPD Anda");
  const [statusValidasi, setStatusValidasi] = useState<string>("Draft");
  const [jabatans, setJabatans] = useState<Jabatan[]>([]);
  const [abks, setAbks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [downloadingAnjab, setDownloadingAnjab] = useState<boolean>(false);
  const [downloadingAbk, setDownloadingAbk] = useState<boolean>(false);

  // Bulk Modal states
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [bulkEmptyJobs, setBulkEmptyJobs] = useState<Jabatan[]>([]);
  const [bulkReadyJobs, setBulkReadyJobs] = useState<Jabatan[]>([]);

  useEffect(() => {
    const unitKerjaId = user?.unitKerjaId;
    if (!unitKerjaId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [opds, jabs, bulkData] = await Promise.all([
          api.getUnitKerja() as Promise<UnitKerja[]>,
          api.getJabatanByUnit(unitKerjaId) as Promise<Jabatan[]>,
          api.getBulkData(['abk']).catch(() => ({ abk: [] }))
        ]);

        const thisOpd = opds.find(o => o.id === unitKerjaId);
        if (thisOpd) {
          setOpdName(thisOpd.nama);
          setStatusValidasi(thisOpd.statusValidasi || "Draft");
        }

        setJabatans(jabs);
        setAbks((bulkData.abk || []) as any[]);
      } catch (err) {
        console.error("Gagal memuat data laporan operator:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const abkMap = useMemo(() => {
    const map = new Map<string, any>();
    abks.forEach(a => {
      if (a.id) map.set(a.id, a);
    });
    return map;
  }, [abks]);

  const filteredJabatans = useMemo(() => {
    return jabatans.filter(j => 
      j.namaJabatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.kodeJabatan && j.kodeJabatan.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [jabatans, searchQuery]);

  const isApproved = statusValidasi === "Disetujui";

  const handleDownloadSingle = async (jabatan: Jabatan, abkData: any) => {
    if (!isApproved) {
      alert("Maaf, pencetakan dokumen resmi hanya diizinkan setelah usulan OPD divalidasi dan disetujui oleh Admin Kabupaten.");
      return;
    }
    if (!abkData || !abkData.rows || abkData.rows.length === 0) {
      alert(`Maaf, data Analisis Beban Kerja (ABK) untuk jabatan "${jabatan.namaJabatan}" belum diisi. Silakan lengkapi data ABK terlebih dahulu sebelum mencetak.`);
      return;
    }
    setDownloadingAnjab(true);
    try {
      const fullJabatan = await api.getJabatanFull(jabatan.id) as JabatanFull;
      const { exportJabatanToDocx } = await import("@/lib/exportDocx");
      await exportJabatanToDocx(fullJabatan, abkData, opdName);
    } catch (err: any) {
      alert("Gagal mengunduh laporan Anjab: " + err.message);
    } finally {
      setDownloadingAnjab(false);
    }
  };

  const handleDownloadSiasn = async (jabatan: Jabatan, abkData: any) => {
    if (!isApproved) {
      alert("Maaf, pengeksporan dokumen resmi hanya diizinkan setelah usulan OPD divalidasi dan disetujui oleh Admin Kabupaten.");
      return;
    }
    if (!abkData || !abkData.rows || abkData.rows.length === 0) {
      alert(`Maaf, data Analisis Beban Kerja (ABK) untuk jabatan "${jabatan.namaJabatan}" belum diisi. Silakan lengkapi data ABK terlebih dahulu sebelum mengekspor.`);
      return;
    }
    setDownloadingAnjab(true);
    try {
      const fullJabatan = await api.getJabatanFull(jabatan.id) as JabatanFull;
      const { exportJabatanToSiasn } = await import("@/lib/exportSiasn");
      exportJabatanToSiasn(fullJabatan, abkData);
    } catch (err: any) {
      alert("Gagal mengekspor SIASN: " + err.message);
    } finally {
      setDownloadingAnjab(false);
    }
  };

  const handleDownloadBulk = () => {
    if (!isApproved) {
      alert("Maaf, pencetakan bulk dokumen resmi hanya diizinkan setelah usulan OPD divalidasi dan disetujui oleh Admin Kabupaten.");
      return;
    }
    if (jabatans.length === 0) {
      alert("Tidak ada jabatan pada OPD ini.");
      return;
    }

    const ready: Jabatan[] = [];
    const empty: Jabatan[] = [];
    jabatans.forEach(j => {
      const abk = abkMap.get(j.id);
      if (abk && abk.rows && abk.rows.length > 0) {
        ready.push(j);
      } else {
        empty.push(j);
      }
    });

    if (empty.length > 0) {
      setBulkEmptyJobs(empty);
      setBulkReadyJobs(ready);
      setShowBulkModal(true);
    } else {
      triggerBulkDownload(ready);
    }
  };

  const triggerBulkDownload = async (jobsToDownload: Jabatan[]) => {
    if (jobsToDownload.length === 0) {
      alert("Tidak ada jabatan yang siap dicetak.");
      return;
    }
    setDownloadingAnjab(true);
    setShowBulkModal(false);
    try {
      const bulkData = await api.getBulkData([
        'abk', 'tugasPokok', 'bahanKerja', 'perangkatKerja',
        'tanggungJawab', 'wewenang', 'korelasiJabatan',
        'kondisiLingkungan', 'risikoBahaya', 'syaratJabatan',
        'kualifikasi', 'prestasiKerja', 'hasilKerja'
      ]);

      const multiEntities = ['tugasPokok', 'bahanKerja', 'perangkatKerja', 'tanggungJawab', 'wewenang', 'korelasiJabatan', 'kondisiLingkungan', 'risikoBahaya'];
      const singleEntities = ['syaratJabatan', 'kualifikasi', 'prestasiKerja', 'hasilKerja'];

      const fullJabatans: JabatanFull[] = jobsToDownload.map(j => {
        const full: any = { ...j };
        multiEntities.forEach(ent => {
          const list = bulkData[ent] || [];
          full[ent] = list
            .filter((item: any) => item.jabatanId === j.id)
            .sort((a: any, b: any) => (a.nomorUrut || 0) - (b.nomorUrut || 0));
        });
        singleEntities.forEach(ent => {
          const list = bulkData[ent] || [];
          full[ent] = list.find((item: any) => item.jabatanId === j.id) || null;
        });
        return full as JabatanFull;
      });

      const abkList = jobsToDownload.map(j => abkMap.get(j.id));
      
      const { exportJabatansToDocx } = await import("@/lib/exportDocx");
      await exportJabatansToDocx(`Anjab_Lengkap_${opdName.replace(/[^a-zA-Z0-9]/g, '_')}`, fullJabatans, abkList);
    } catch (err: any) {
      alert("Gagal mengunduh bulk Anjab: " + err.message);
    } finally {
      setDownloadingAnjab(false);
    }
  };

  const handleDownloadRekapAbk = async () => {
    if (!isApproved) {
      alert("Maaf, unduh Rekap Excel hanya diizinkan setelah usulan OPD divalidasi dan disetujui oleh Admin Kabupaten.");
      return;
    }
    if (!user?.unitKerjaId) return;
    setDownloadingAbk(true);
    try {
      const targetJabatans = await api.getJabatanByUnit(user.unitKerjaId) as Jabatan[];
      if (targetJabatans.length === 0) {
        alert("Tidak ada jabatan pada OPD ini.");
        setDownloadingAbk(false);
        return;
      }

      const bulkData = await api.getBulkData([
        'abk', 'tugasPokok', 'bahanKerja', 'perangkatKerja',
        'tanggungJawab', 'wewenang', 'korelasiJabatan',
        'kondisiLingkungan', 'risikoBahaya', 'syaratJabatan',
        'kualifikasi', 'prestasiKerja', 'hasilKerja'
      ]);

      const multiEntities = ['tugasPokok', 'bahanKerja', 'perangkatKerja', 'tanggungJawab', 'wewenang', 'korelasiJabatan', 'kondisiLingkungan', 'risikoBahaya'];
      const singleEntities = ['syaratJabatan', 'kualifikasi', 'prestasiKerja', 'hasilKerja'];

      const abkMapByJbt = new Map<string, any>();
      if (bulkData.abk && Array.isArray(bulkData.abk)) {
        bulkData.abk.forEach((a: any) => {
          if (a.id) abkMapByJbt.set(a.id, a);
          if (a.jabatanId) abkMapByJbt.set(a.jabatanId, a);
        });
      }

      const fullJabatans: JabatanFull[] = targetJabatans.map(j => {
        const full: any = { ...j };
        multiEntities.forEach(ent => {
          const list = bulkData[ent] || [];
          full[ent] = list
            .filter((item: any) => item.jabatanId === j.id)
            .sort((a: any, b: any) => (a.nomorUrut || 0) - (b.nomorUrut || 0));
        });
        singleEntities.forEach(ent => {
          const list = bulkData[ent] || [];
          full[ent] = list.find((item: any) => item.jabatanId === j.id) || null;
        });
        return full as JabatanFull;
      });

      const abkList = targetJabatans.map(j => abkMapByJbt.get(j.id) || null);

      const rows = fullJabatans.map((j, idx) => {
        const abk = abkList[idx];
        let totalWaktuEfektif = 0;
        let kebutuhanPegawai = 0;
        let pembulatanFormasi = 0;

        if (abk && abk.totalWaktuEfektif !== undefined) {
          totalWaktuEfektif = abk.totalWaktuEfektif;
          kebutuhanPegawai = abk.totalKebutuhan || 0;
          pembulatanFormasi = abk.formasiPembulatan || 0;
        } else {
          const tp = j.tugasPokok || [];
          tp.forEach(t => {
            const we = (t.waktuPenyelesaian || 0) * (t.jumlahHasil || 0);
            totalWaktuEfektif += we;
          });
          kebutuhanPegawai = totalWaktuEfektif / 1250;
          pembulatanFormasi = calculateFormasiPembulatan(kebutuhanPegawai);
        }

        return {
          namaJabatan: j.namaJabatan,
          jenisJabatan: j.jenisJabatan,
          kelasJabatan: j.kelasJabatan,
          totalWaktuEfektif,
          kebutuhanPegawai,
          pembulatanFormasi
        };
      });

      const { exportRekapAbkToXlsx } = await import("@/lib/importXlsx");
      exportRekapAbkToXlsx(opdName, rows);
    } catch (err: any) {
      alert("Gagal mengunduh rekap ABK: " + err.message);
    } finally {
      setDownloadingAbk(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <p>Memuat data OPD...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Cetak Laporan & Dokumen</h1>
          <p className={styles.subtitle}>Unduh dokumen Analisis Jabatan dan Analisis Beban Kerja untuk <strong>{opdName}</strong></p>
        </div>
      </div>

      {/* Validasi Banner */}
      {!isApproved && (
        <div style={{
          padding: '1.25rem 1.5rem',
          borderRadius: '16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          boxShadow: '0 8px 20px -8px rgba(239, 68, 68, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ fontSize: '2rem' }}>🔒</div>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f87171', fontSize: '0.9rem' }}>
              Dokumen Terkunci (Belum Divalidasi)
            </span>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', opacity: 0.9, lineHeight: 1.4 }}>
              Status usulan OPD saat ini: <strong>{statusValidasi}</strong>. Pengunduhan dokumen resmi (Word/Excel) hanya diperbolehkan setelah data divalidasi dan disetujui oleh Admin Kabupaten di Bagian Organisasi.
            </p>
          </div>
        </div>
      )}

      <div className={styles.grid}>
        {/* Card Peta Jabatan Instansi */}
        <div className={`${styles.reportCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper} style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)' }}>📊</div>
            <div className={styles.reportTitle}>Peta Jabatan Instansi</div>
          </div>
          <p className={styles.reportDesc}>
            Melihat/mencetak struktur pohon Peta Jabatan secara interaktif yang menunjukkan hierarki struktural dan fungsional pada unit kerja Anda.
          </p>
          <button 
            className={styles.btnDownload} 
            style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)', background: 'rgba(16, 185, 129, 0.1)' }}
            onClick={() => {
              window.location.href = "/operator/peta-jabatan";
            }}
          >
            Buka Peta Jabatan
          </button>
        </div>

        {/* Card Rekap Kebutuhan Pegawai (ABK) */}
        <div className={`${styles.reportCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper} style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>⚖️</div>
            <div className={styles.reportTitle}>Rekap Kebutuhan Pegawai (ABK)</div>
          </div>
          <p className={styles.reportDesc}>
            Mencetak tabel hasil perhitungan Analisis Beban Kerja yang memuat total beban kerja per jabatan dan kebutuhan formasinya dalam format Excel.
          </p>
          <button 
            className={styles.btnDownload} 
            style={{ 
              color: isApproved ? '#f59e0b' : 'rgba(255,255,255,0.3)', 
              borderColor: isApproved ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.08)', 
              background: isApproved ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.03)',
              cursor: isApproved ? 'pointer' : 'not-allowed'
            }}
            onClick={handleDownloadRekapAbk}
            disabled={!isApproved || downloadingAbk}
          >
            {downloadingAbk ? "Mengunduh..." : "Unduh Rekap Excel"}
          </button>
        </div>
      </div>

      {/* Panel Daftar Jabatan Interaktif */}
      <div className={`${styles.fullWidthPanel} glass-panel`}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span>📑</span> Cetak Dokumen Informasi Jabatan
          </div>
          <div>
            <button 
              className={styles.btnBulk} 
              onClick={handleDownloadBulk}
              disabled={downloadingAnjab || jabatans.length === 0 || !isApproved}
              style={{
                opacity: isApproved ? 1 : 0.4,
                cursor: isApproved ? 'pointer' : 'not-allowed'
              }}
            >
              <span>📥</span> {downloadingAnjab ? "Mengunduh..." : "Cetak Bulk (.docx)"}
            </button>
          </div>
        </div>

        <p style={{ fontSize: "0.85rem", opacity: 0.7, margin: 0, lineHeight: 1.5 }}>
          Mencetak dokumen Informasi Jabatan resmi lengkap dengan kolom perhitungan beban kerja ABK.
        </p>

        <div className={styles.panelToolbar}>
          <div className={styles.formGroup} style={{ flex: 1, maxWidth: '300px' }}>
            <label>Cari Jabatan</label>
            <input 
              type="text"
              placeholder="Cari nama jabatan..."
              className={styles.searchBox}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {filteredJabatans.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>Tidak ada jabatan ditemukan.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.jobTable}>
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>No</th>
                  <th>Nama Jabatan</th>
                  <th>Jenis Jabatan</th>
                  <th style={{ width: '130px' }}>Kelas Jabatan</th>
                  <th style={{ width: '220px' }}>Status ABK & Validasi</th>
                  <th style={{ width: '260px', textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredJabatans.map((j, idx) => {
                  const abk = abkMap.get(j.id);
                  const isAbkFilled = abk && abk.rows && abk.rows.length > 0;
                  
                  return (
                    <tr key={j.id}>
                      <td>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{j.namaJabatan}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '2px' }}>{j.kodeJabatan || '-'}</div>
                      </td>
                      <td>{j.jenisJabatan}</td>
                      <td>Kelas {j.kelasJabatan}</td>
                      <td>
                        {!isAbkFilled ? (
                          <span className={`${styles.badge} ${styles.badgeDanger}`}>
                            ❌ ABK Kosong
                          </span>
                        ) : !isApproved ? (
                          <span className={`${styles.badge} ${styles.badgeWarning}`}>
                            ⏳ Belum Disetujui Admin
                          </span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                            Bisa Dicetak ✅
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button 
                            className={`${styles.btnAction} ${(isAbkFilled && isApproved) ? styles.btnActionPrimary : styles.btnActionDisabled}`}
                            onClick={() => handleDownloadSingle(j, abk)}
                            disabled={downloadingAnjab || !isApproved || !isAbkFilled}
                            title={!isAbkFilled ? "Lengkapi ABK terlebih dahulu" : !isApproved ? "Menunggu persetujuan Admin" : "Unduh file Word"}
                          >
                            📄 {downloadingAnjab ? "..." : "Word"}
                          </button>
                          <button 
                            className={`${styles.btnAction} ${(isAbkFilled && isApproved) ? styles.btnActionPrimary : styles.btnActionDisabled}`}
                            onClick={() => handleDownloadSiasn(j, abk)}
                            disabled={downloadingAnjab || !isApproved || !isAbkFilled}
                            title={!isAbkFilled ? "Lengkapi ABK terlebih dahulu" : !isApproved ? "Menunggu persetujuan Admin" : "Unduh file SIASN Excel"}
                            style={{ background: 'hsla(142.1, 76.2%, 36.3%, 0.1)', color: 'hsl(142.1, 76.2%, 36.3%)', borderColor: 'hsla(142.1, 76.2%, 36.3%, 0.2)' }}
                          >
                            📊 {downloadingAnjab ? "..." : "SIASN"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Download Modal */}
      {showBulkModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              Konfirmasi Cetak Bulk
            </div>
            <div className={styles.modalBody}>
              <p>Terdapat <strong>{bulkEmptyJobs.length} jabatan</strong> yang belum mengisi data ABK (sehingga tidak bisa dicetak).</p>
              <p>Hanya <strong>{bulkReadyJobs.length} jabatan</strong> yang siap dicetak.</p>
              <div style={{ marginTop: '1rem' }}>
                <strong>Daftar jabatan yang belum mengisi ABK:</strong>
                <ul className={styles.modalList}>
                  {bulkEmptyJobs.slice(0, 5).map(j => (
                    <li key={j.id}>{j.namaJabatan}</li>
                  ))}
                  {bulkEmptyJobs.length > 5 && (
                    <li style={{ color: 'var(--foreground)', opacity: 0.5, listStyle: 'none' }}>...dan {bulkEmptyJobs.length - 5} jabatan lainnya.</li>
                  )}
                </ul>
              </div>
              <p style={{ marginTop: '1.25rem' }}>Apakah Anda ingin melanjutkan pengunduhan bulk untuk <strong>{bulkReadyJobs.length} jabatan</strong> yang sudah siap saja?</p>
            </div>
            <div className={styles.modalFooter}>
              <button 
                className="btn-secondary" 
                onClick={() => setShowBulkModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--foreground)', marginRight: '8px' }}
              >
                Batal
              </button>
              <button 
                className="btn-primary" 
                onClick={() => triggerBulkDownload(bulkReadyJobs)}
                disabled={bulkReadyJobs.length === 0}
                style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
              >
                Ya, Unduh {bulkReadyJobs.length} Jabatan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
