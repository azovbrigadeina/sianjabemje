"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import { exportJabatanToDocx, exportJabatansToDocx } from "@/lib/exportDocx";
import { exportRekapAbkToXlsx } from "@/lib/importXlsx";
import type { UnitKerja, Jabatan, JabatanFull } from "@/lib/types";

export default function LaporanPage() {
  const [opds, setOpds] = useState<UnitKerja[]>([]);
  const [jabatans, setJabatans] = useState<Jabatan[]>([]);
  
  // Card 1 state
  const [selectedOpd1, setSelectedOpd1] = useState<string>("");
  const [selectedJabatan, setSelectedJabatan] = useState<string>("all");
  const [downloadingAnjab, setDownloadingAnjab] = useState<boolean>(false);

  // Card 2 state
  const [selectedOpd2, setSelectedOpd2] = useState<string>("");

  // Card 3 state
  const [selectedOpd3, setSelectedOpd3] = useState<string>("");
  const [downloadingAbk, setDownloadingAbk] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);

  // Load Unit Kerja (OPD) on mount
  useEffect(() => {
    const loadOpds = async () => {
      try {
        const data = await api.getUnitKerja() as UnitKerja[];
        setOpds(data);
        if (data.length > 0) {
          setSelectedOpd1(data[0].id);
          setSelectedOpd2(data[0].id);
          setSelectedOpd3(data[0].id);
        }
      } catch (err) {
        console.error("Gagal memuat daftar OPD:", err);
      } finally {
        setLoading(false);
      }
    };
    loadOpds();
  }, []);

  // Fetch Jabatans whenever selectedOpd1 changes
  useEffect(() => {
    if (!selectedOpd1) return;
    const loadJabatans = async () => {
      try {
        const data = await api.getJabatanByUnit(selectedOpd1) as Jabatan[];
        setJabatans(data);
        setSelectedJabatan("all"); // Default to all jabatans
      } catch (err) {
        console.error("Gagal memuat daftar jabatan:", err);
      }
    };
    loadJabatans();
  }, [selectedOpd1]);

  const handleDownloadAnjab = async () => {
    if (!selectedOpd1) return;
    setDownloadingAnjab(true);
    try {
      const opdName = opds.find(o => o.id === selectedOpd1)?.nama || "OPD";
      if (selectedJabatan === "all") {
        // Bulk download all jabatans in selectedOpd
        if (jabatans.length === 0) {
          alert("Tidak ada jabatan pada OPD ini.");
          setDownloadingAnjab(false);
          return;
        }
        
        // Fetch full details of all jabatans in parallel
        const fullJabatans = await Promise.all(
          jabatans.map(j => api.getJabatanFull(j.id) as Promise<JabatanFull>)
        );
        
        await exportJabatansToDocx(`Anjab_Lengkap_${opdName.replace(/[^a-zA-Z0-9]/g, '_')}`, fullJabatans);
      } else {
        // Download single jabatan
        const fullJabatan = await api.getJabatanFull(selectedJabatan) as JabatanFull;
        await exportJabatanToDocx(fullJabatan);
      }
    } catch (err: any) {
      alert("Gagal mengunduh laporan Anjab: " + err.message);
    } finally {
      setDownloadingAnjab(false);
    }
  };

  const handleDownloadRekapAbk = async () => {
    if (!selectedOpd3) return;
    setDownloadingAbk(true);
    try {
      const opdName = opds.find(o => o.id === selectedOpd3)?.nama || "OPD";
      const targetJabatans = await api.getJabatanByUnit(selectedOpd3) as Jabatan[];
      
      if (targetJabatans.length === 0) {
        alert("Tidak ada jabatan pada OPD ini.");
        setDownloadingAbk(false);
        return;
      }

      // Load full details and ABK data in parallel
      const fullJabatans = await Promise.all(
        targetJabatans.map(j => api.getJabatanFull(j.id) as Promise<JabatanFull>)
      );
      const abkList = await Promise.all(
        targetJabatans.map(j => api.getABK(j.id).catch(() => null) as Promise<any>)
      );

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
          // Fallback to tugasPokok calculation (WKE=1250)
          const tp = j.tugasPokok || [];
          tp.forEach(t => {
            const we = (t.waktuPenyelesaian || 0) * (t.jumlahHasil || 0);
            totalWaktuEfektif += we;
          });
          kebutuhanPegawai = totalWaktuEfektif / 1250;
          pembulatanFormasi = Math.ceil(kebutuhanPegawai);
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
          <h1 className={styles.title}>Laporan & Dokumen</h1>
          <p className={styles.subtitle}>Cetak dokumen resmi Analisis Jabatan dan Beban Kerja (Format Permenpan RB)</p>
        </div>
      </div>

      <div className={styles.grid}>
        
        {/* Card 1: Dokumen Informasi Jabatan */}
        <div className={`${styles.reportCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper}>📑</div>
            <div className={styles.reportTitle}>Dokumen Informasi Jabatan</div>
          </div>
          <p className={styles.reportDesc}>
            Mencetak formulir Informasi Jabatan secara lengkap beserta uraian tugas, syarat, dan korelasi untuk satu jabatan spesifik atau seluruh jabatan di OPD (Bulk).
          </p>
          <div className={styles.formGroup}>
            <label>Pilih OPD</label>
            <select 
              className={styles.selectInput} 
              value={selectedOpd1} 
              onChange={(e) => setSelectedOpd1(e.target.value)}
            >
              {opds.map(opd => (
                <option key={opd.id} value={opd.id}>{opd.nama}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Pilih Jabatan</label>
            <select 
              className={styles.selectInput} 
              value={selectedJabatan} 
              onChange={(e) => setSelectedJabatan(e.target.value)}
            >
              <option value="all">[Semua Jabatan - Cetak Bulk]</option>
              {jabatans.map(j => (
                <option key={j.id} value={j.id}>{j.namaJabatan}</option>
              ))}
            </select>
          </div>
          <button 
            className={styles.btnDownload} 
            onClick={handleDownloadAnjab}
            disabled={downloadingAnjab}
          >
            {downloadingAnjab ? "Mengunduh..." : "Unduh Word (.docx)"}
          </button>
        </div>

        {/* Card 2: Peta Jabatan Instansi */}
        <div className={`${styles.reportCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper} style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)' }}>📊</div>
            <div className={styles.reportTitle}>Peta Jabatan Instansi</div>
          </div>
          <p className={styles.reportDesc}>
            Mencetak struktur pohon Peta Jabatan yang menunjukkan hierarki struktural dan fungsional pada unit kerja tertentu.
          </p>
          <div className={styles.formGroup}>
            <label>Pilih OPD</label>
            <select 
              className={styles.selectInput} 
              value={selectedOpd2} 
              onChange={(e) => setSelectedOpd2(e.target.value)}
            >
              {opds.map(opd => (
                <option key={opd.id} value={opd.id}>{opd.nama}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup} style={{ visibility: 'hidden' }}>
            <label>Spacer</label>
            <select className={styles.selectInput}></select>
          </div>
          <button 
            className={styles.btnDownload} 
            style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)', background: 'rgba(16, 185, 129, 0.1)' }}
            onClick={() => {
              alert("Fitur peta jabatan dapat dilihat dan dicetak secara interaktif di halaman Struktur Organisasi.");
              window.location.href = "/dashboard/organisasi";
            }}
          >
            Buka Peta Jabatan
          </button>
        </div>

        {/* Card 3: Rekap Kebutuhan Pegawai (ABK) */}
        <div className={`${styles.reportCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper} style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>⚖️</div>
            <div className={styles.reportTitle}>Rekap Kebutuhan Pegawai (ABK)</div>
          </div>
          <p className={styles.reportDesc}>
            Mencetak tabel hasil perhitungan Analisis Beban Kerja yang memuat total beban kerja per jabatan dan kebutuhan formasinya dalam format Excel.
          </p>
          <div className={styles.formGroup}>
            <label>Cakupan Laporan</label>
            <select className={styles.selectInput} defaultValue="opd">
              <option value="opd">Per OPD (Unit Kerja)</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Pilih OPD</label>
            <select 
              className={styles.selectInput} 
              value={selectedOpd3} 
              onChange={(e) => setSelectedOpd3(e.target.value)}
            >
              {opds.map(opd => (
                <option key={opd.id} value={opd.id}>{opd.nama}</option>
              ))}
            </select>
          </div>
          <button 
            className={styles.btnDownload} 
            style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.1)' }}
            onClick={handleDownloadRekapAbk}
            disabled={downloadingAbk}
          >
            {downloadingAbk ? "Mengunduh..." : "Unduh Rekap Excel"}
          </button>
        </div>

      </div>
    </div>
  );
}
