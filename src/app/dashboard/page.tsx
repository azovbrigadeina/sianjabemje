"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import type { UnitKerja } from "@/lib/types";

export default function DashboardHome() {
  const [stats, setStats] = useState({
    totalOpdMain: 0,
    totalOpdSub: 0,
    totalJabatan: 0,
    anjabSelesai: 0,
    abkSelesai: 0,
    opdDisetujui: 0,
    opdDiajukan: 0,
    opdRevisi: 0,
    opdDraft: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [opdsRaw, jabatansRaw, abkRaw] = await Promise.all([
          api.getUnitKerja(),
          api.readAllEntity('jabatan', ''),
          api.readAllEntity('abk', '')
        ]);

        const opds = (opdsRaw || []) as UnitKerja[];
        const jabatans = (jabatansRaw || []) as any[];
        const abks = (abkRaw || []) as { id: string }[];

        // Logika Kategorisasi OPD seperti di SiTPP
        // OPD Utama adalah yang tidak memiliki parentId (Badan, Dinas, Kecamatan, Sekretariat, Inspektorat, Satpol PP)
        // Sub Unit adalah yang memiliki parentId (Bagian, Puskesmas, Rumah Sakit, UPTD) dan dihitung satu kesatuan dengan OPD Utama untuk rekap
        const mainOpds = opds.filter(o => !o.parentId);
        const subOpds = opds.filter(o => o.parentId);

        const opdDisetujui = opds.filter(o => o.statusValidasi === 'Disetujui').length;
        const opdDiajukan = opds.filter(o => o.statusValidasi === 'Diajukan').length;
        const opdRevisi = opds.filter(o => o.statusValidasi === 'Revisi').length;
        const opdDraft = opds.filter(o => !o.statusValidasi || o.statusValidasi === 'Draft').length;

        const anjabSelesai = jabatans.filter(jbt => jbt.ikhtisarJabatan && jbt.ikhtisarJabatan.length > 5).length;

        setStats({
          totalOpdMain: mainOpds.length,
          totalOpdSub: subOpds.length,
          totalJabatan: jabatans.length,
          anjabSelesai,
          abkSelesai: abks.length,
          opdDisetujui,
          opdDiajukan,
          opdRevisi,
          opdDraft
        });
      } catch (err) {
        console.error("Gagal memuat statistik", err);
      }
      setLoading(false);
    };

    fetchStats();
  }, []);

  return (
    <div className="animate-fade-in">
      {loading && <div className={styles.topLoadingBar} />}
      <div className={styles.welcomeSection}>
        <h1 className={styles.title}>Selamat Datang di <span className="text-gradient">SianjabABK EM-JE</span></h1>
        <p className={styles.subtitle}>Pantau progres penyusunan dokumen Analisis Jabatan dan Beban Kerja seluruh unit kerja.</p>
      </div>

      <div className={styles.statsGrid}>
        {/* Total OPD Induk */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(256, 65%, 50%, 0.1)', color: 'hsl(256, 65%, 50%)' }}>🏢</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total OPD Induk</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '50px', height: '2rem' }}></span>
              ) : (
                stats.totalOpdMain
              )}
            </span>
            {!loading && stats.totalOpdSub > 0 && (
              <span style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '4px' }}>
                (+{stats.totalOpdSub} Sub Unit/Puskesmas)
              </span>
            )}
          </div>
        </div>
        
        {/* Total Jabatan */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(199, 89%, 48%, 0.1)', color: 'hsl(199, 89%, 48%)' }}>👥</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Jabatan</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '80px', height: '2rem' }}></span>
              ) : (
                stats.totalJabatan.toLocaleString()
              )}
            </span>
          </div>
        </div>
        
        {/* ANJAB Selesai */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(270, 70%, 50%, 0.1)', color: 'hsl(270, 70%, 50%)' }}>📝</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>ANJAB Selesai</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '60px', height: '2rem' }}></span>
              ) : (
                stats.anjabSelesai
              )}
            </span>
          </div>
        </div>

        {/* ANJAB Menunggu */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(30, 90%, 50%, 0.1)', color: 'hsl(30, 90%, 50%)' }}>⏳</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>ANJAB Menunggu</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '60px', height: '2rem' }}></span>
              ) : (
                Math.max(0, stats.totalJabatan - stats.anjabSelesai)
              )}
            </span>
          </div>
        </div>

        {/* ABK Selesai */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(142, 71%, 45%, 0.1)', color: 'hsl(142, 71%, 45%)' }}>⚖️</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>ABK Selesai</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '60px', height: '2rem' }}></span>
              ) : (
                stats.abkSelesai
              )}
            </span>
          </div>
        </div>
        
        {/* ABK Menunggu */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(340, 80%, 50%, 0.1)', color: 'hsl(340, 80%, 50%)' }}>⏳</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>ABK Menunggu</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '60px', height: '2rem' }}></span>
              ) : (
                Math.max(0, stats.totalJabatan - stats.abkSelesai)
              )}
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem', marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>📋</span> Progres Validasi Unit Kerja (OPD)
        </h2>
      </div>

      <div className={styles.statsGrid}>
        {/* Sudah Divalidasi */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(142, 71%, 45%, 0.1)', color: 'hsl(142, 71%, 45%)' }}>✅</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Sudah Divalidasi</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '50px', height: '2rem' }}></span>
              ) : (
                stats.opdDisetujui
              )}
            </span>
            <span style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '4px' }}>
              Unit Kerja Disetujui
            </span>
          </div>
        </div>

        {/* Menunggu Validasi */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(39, 100%, 50%, 0.1)', color: 'hsl(39, 100%, 50%)' }}>⏳</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Menunggu Validasi</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '50px', height: '2rem' }}></span>
              ) : (
                stats.opdDiajukan
              )}
            </span>
            <span style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '4px' }}>
              Unit Kerja Diajukan
            </span>
          </div>
        </div>

        {/* Dalam Revisi */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(350, 89%, 60%, 0.1)', color: 'hsl(350, 89%, 60%)' }}>⚠️</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Dalam Revisi</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '50px', height: '2rem' }}></span>
              ) : (
                stats.opdRevisi
              )}
            </span>
            <span style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '4px' }}>
              Perlu Perbaikan
            </span>
          </div>
        </div>

        {/* Belum Mengajukan */}
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(210, 50%, 50%, 0.1)', color: 'hsl(210, 50%, 50%)' }}>📁</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Belum Mengajukan</span>
            <span className={styles.statValue}>
              {loading ? (
                <span className={styles.skeleton} style={{ width: '50px', height: '2rem' }}></span>
              ) : (
                stats.opdDraft
              )}
            </span>
            <span style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '4px' }}>
              Masih Tahap Draft
            </span>
          </div>
        </div>
      </div>

      <div className={styles.recentActivity}>
        <div className={`${styles.activityCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <h3>Aktivitas Terbaru</h3>
          </div>
          <div className={styles.activityList}>
            {/* Placeholder aktivitas */}
            <div className={styles.activityItem}>
              <div className={styles.activityDot} style={{ background: 'hsl(142, 71%, 45%)' }}></div>
              <div className={styles.activityContent}>
                <p>Sistem SianjabABK EM-JE siap digunakan untuk penginputan Analisis Jabatan dan Beban Kerja terintegrasi.</p>
                <span className={styles.time}>Otomatis</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
