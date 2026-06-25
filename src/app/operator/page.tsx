"use client";

import { useEffect, useState } from "react";
import styles from "../dashboard/page.module.css";
import { api } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import type { UnitKerja } from "@/lib/types";
import Link from "next/link";

export default function OperatorHome() {
  const { user } = useUser();
  const [opdName, setOpdName] = useState<string>("OPD Anda");
  const [statusValidasi, setStatusValidasi] = useState<string>("Draft");
  const [catatanRevisi, setCatatanRevisi] = useState<string | null>(null);
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
        if (thisOpd) {
          setOpdName(thisOpd.nama);
          setStatusValidasi(thisOpd.statusValidasi || "Draft");
          setCatatanRevisi(thisOpd.catatanRevisi || null);
        }

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

      {/* Banner Status Validasi */}
      {!loading && (
        <div style={{
          margin: '0.5rem 0 2rem 0',
          padding: '1.25rem 1.5rem',
          borderRadius: '16px',
          background: 
            statusValidasi === 'Disetujui' ? 'rgba(16, 185, 129, 0.1)' :
            statusValidasi === 'Diajukan' ? 'rgba(59, 130, 246, 0.1)' :
            statusValidasi === 'Revisi' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
          border: `1px solid ${
            statusValidasi === 'Disetujui' ? '#10b981' :
            statusValidasi === 'Diajukan' ? '#3b82f6' :
            statusValidasi === 'Revisi' ? '#ef4444' : '#f59e0b'
          }`,
          boxShadow: `0 8px 20px -8px ${
            statusValidasi === 'Disetujui' ? 'rgba(16, 185, 129, 0.2)' :
            statusValidasi === 'Diajukan' ? 'rgba(59, 130, 246, 0.2)' :
            statusValidasi === 'Revisi' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'
          }`,
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          flexWrap: 'wrap',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            background: 
              statusValidasi === 'Disetujui' ? 'rgba(16, 185, 129, 0.2)' :
              statusValidasi === 'Diajukan' ? 'rgba(59, 130, 246, 0.2)' :
              statusValidasi === 'Revisi' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            color: 
              statusValidasi === 'Disetujui' ? '#10b981' :
              statusValidasi === 'Diajukan' ? '#3b82f6' :
              statusValidasi === 'Revisi' ? '#ef4444' : '#f59e0b',
          }}>
            {statusValidasi === 'Disetujui' ? '✅' :
             statusValidasi === 'Diajukan' ? '⏳' :
             statusValidasi === 'Revisi' ? '⚠️' : '📝'}
          </div>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>
                Status Validasi OPD
              </span>
              <span style={{
                fontSize: '0.8rem',
                padding: '0.15rem 0.6rem',
                borderRadius: '6px',
                fontWeight: 700,
                background: 
                  statusValidasi === 'Disetujui' ? '#10b981' :
                  statusValidasi === 'Diajukan' ? '#3b82f6' :
                  statusValidasi === 'Revisi' ? '#ef4444' : '#f59e0b',
                color: 'white'
              }}>
                {statusValidasi === 'Revisi' ? 'BUTUH REVISI' : statusValidasi}
              </span>
            </div>
            
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', lineHeight: '1.4' }}>
              {statusValidasi === 'Disetujui' && "Selamat! Usulan Anjab & ABK OPD Anda telah disetujui dan disahkan oleh Admin Kabupaten."}
              {statusValidasi === 'Diajukan' && "Dokumen Anda sedang dalam antrean pemeriksaan oleh tim Bagian Organisasi / Admin Kabupaten."}
              {statusValidasi === 'Revisi' && (
                <>
                  Beberapa data Anjab / ABK Anda perlu disesuaikan kembali sesuai dengan catatan admin.
                  {catatanRevisi && (
                    <span style={{ display: 'block', marginTop: '0.4rem', padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.05)', borderLeft: '3px solid #ef4444', borderRadius: '4px', fontStyle: 'italic', fontSize: '0.88rem' }}>
                      <strong>Catatan Revisi:</strong> "{catatanRevisi}"
                    </span>
                  )}
                </>
              )}
              {statusValidasi === 'Draft' && "Semua data masih berstatus Draft. Jika pengisian data Anjab & ABK telah selesai, harap kirim untuk divalidasi."}
            </p>
          </div>
          {statusValidasi === 'Draft' && (
            <Link href="/operator/validasi" className="btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', textDecoration: 'none', backgroundColor: '#f59e0b', border: 'none', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
              Kirim Validasi 📤
            </Link>
          )}
          {statusValidasi === 'Revisi' && (
            <Link href="/operator/validasi" className="btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', textDecoration: 'none', backgroundColor: '#ef4444', border: 'none', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
              Lihat Detail 📤
            </Link>
          )}
        </div>
      )}

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
