"use client";

import { useEffect, useState } from "react";
import styles from "../dashboard/page.module.css";
import { api } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import type { UnitKerja } from "@/lib/types";

export default function OperatorHome() {
  const { user } = useUser();
  const [opdName, setOpdName] = useState<string>("OPD Anda");
  const [stats, setStats] = useState({
    totalJabatan: 0,
    abkSelesai: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.unitKerjaId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch OPD name
        const opdsRaw = await api.getUnitKerja();
        const opds = (opdsRaw as UnitKerja[]) || [];

        // Also collect sub-unit IDs under this OPD
        const thisOpd = opds.find((o) => o.id === user.unitKerjaId);
        if (thisOpd) setOpdName(thisOpd.nama);

        const allSubIds = opds
          .filter((o) => o.parentId === user.unitKerjaId)
          .map((o) => o.id);
        const allUnitIds = [user.unitKerjaId, ...allSubIds];

        // Fetch jabatan filtered
        const jabatansRaw = await api.readAllEntity("jabatan", "");
        const jabatans = (jabatansRaw as { id: string; unitKerjaId?: string }[]) || [];
        const myJabatan = jabatans.filter((j) => allUnitIds.includes(j.unitKerjaId || ""));

        // Fetch ABK
        const abkRaw = await api.readAllEntity("abk", "");
        const abks = (abkRaw as { id: string }[]) || [];
        const myJabatanIds = new Set(myJabatan.map((j) => j.id));
        const myAbks = abks.filter((a) => myJabatanIds.has(a.id));

        setStats({
          totalJabatan: myJabatan.length,
          abkSelesai: myAbks.length,
        });
      } catch (err) {
        console.error("Gagal memuat data operator", err);
      }
      setLoading(false);
    };

    fetchData();
  }, [user]);

  const abkBelum = Math.max(0, stats.totalJabatan - stats.abkSelesai);
  const progressPct = stats.totalJabatan > 0 ? Math.round((stats.abkSelesai / stats.totalJabatan) * 100) : 0;

  return (
    <div className="animate-fade-in">
      <div className={styles.welcomeSection}>
        <h1 className={styles.title}>
          Halo, <span className="text-gradient">{user?.namaLengkap || "Operator"}</span>
        </h1>
        <p className={styles.subtitle}>
          Selamat datang di panel pengisian dokumen Analisis Jabatan dan Beban Kerja — <strong>{opdName}</strong>.
        </p>
      </div>

      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(199, 89%, 48%, 0.1)', color: 'hsl(199, 89%, 48%)' }}>👥</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Jabatan OPD</span>
            <span className={styles.statValue}>{loading ? "..." : stats.totalJabatan.toLocaleString()}</span>
          </div>
        </div>

        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(142, 71%, 45%, 0.1)', color: 'hsl(142, 71%, 45%)' }}>⚖️</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>ABK Selesai</span>
            <span className={styles.statValue}>{loading ? "..." : stats.abkSelesai}</span>
          </div>
        </div>

        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(39, 100%, 50%, 0.1)', color: 'hsl(39, 100%, 50%)' }}>⏳</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>ABK Menunggu</span>
            <span className={styles.statValue}>{loading ? "..." : abkBelum}</span>
          </div>
        </div>

        <div className={`${styles.statCard} glass-panel`}>
          <div className={styles.statIcon} style={{ background: 'hsla(256, 65%, 50%, 0.1)', color: 'hsl(256, 65%, 50%)' }}>📊</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Progress ABK</span>
            <span className={styles.statValue}>{loading ? "..." : `${progressPct}%`}</span>
          </div>
        </div>
      </div>

      {!loading && stats.totalJabatan > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className={`glass-panel`} style={{ padding: '1.5rem', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>
              <span>Progress Pengisian ABK</span>
              <span style={{ color: 'hsl(var(--primary))' }}>{progressPct}%</span>
            </div>
            <div style={{ background: 'var(--glass-border)', borderRadius: '99px', height: '10px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)))',
                borderRadius: '99px',
                transition: 'width 0.8s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.78rem', opacity: 0.6 }}>
              <span>{stats.abkSelesai} selesai</span>
              <span>{abkBelum} tersisa dari {stats.totalJabatan} jabatan</span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.recentActivity}>
        <div className={`${styles.activityCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <h3>Panduan Pengisian</h3>
          </div>
          <div className={styles.activityList}>
            <div className={styles.activityItem}>
              <div className={styles.activityDot} style={{ background: 'hsl(var(--primary))' }} />
              <div className={styles.activityContent}>
                <p>Pilih <strong>Pengisian Anjab</strong> untuk mengisi data Analisis Jabatan per-jabatan di OPD Anda.</p>
              </div>
            </div>
            <div className={styles.activityItem}>
              <div className={styles.activityDot} style={{ background: 'hsl(var(--secondary))' }} />
              <div className={styles.activityContent}>
                <p>Pilih <strong>Hitung ABK</strong> untuk mengisi dan menghitung Analisis Beban Kerja.</p>
              </div>
            </div>
            <div className={styles.activityItem}>
              <div className={styles.activityDot} style={{ background: 'hsl(142, 71%, 45%)' }} />
              <div className={styles.activityContent}>
                <p>Setelah semua jabatan terisi, klik <strong>Kirim Validasi</strong> untuk mengirim ke tim kabupaten.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
