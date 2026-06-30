"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import type { UnitKerja, Jabatan } from "@/lib/types";

export default function Home() {
  const [stats, setStats] = useState({
    totalOpdMain: 0,
    totalOpdSub: 0,
    totalJabatan: 0,
    totalJPT: 0,
    totalAdministrator: 0,
    totalPengawas: 0,
    totalPelaksana: 0,
    totalFungsional: 0,
    opdDisetujui: 0,
    anjabSelesai: 0,
    abkSelesai: 0,
  });
  const [loading, setLoading] = useState(true);
  const [currentTimeStr, setCurrentTimeStr] = useState("Hari ini, 08:30 WIB");

  useEffect(() => {
    // Set formatted time dynamically to avoid hydration mismatch
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    setCurrentTimeStr(`Hari ini, ${hours}:${minutes} WIB`);

    const controller = new AbortController();

    const fetchStats = async () => {
      try {
        const data = await api.getDashboardStats(controller.signal);

        setStats({
          totalOpdMain: data.totalOpdMain,
          totalOpdSub: data.totalOpdSub,
          totalJabatan: data.totalJabatan,
          totalJPT: data.totalJPT,
          totalAdministrator: data.totalAdministrator,
          totalPengawas: data.totalPengawas,
          totalPelaksana: data.totalPelaksana,
          totalFungsional: data.totalFungsional,
          opdDisetujui: data.opdDisetujui,
          anjabSelesai: data.anjabSelesai,
          abkSelesai: data.abkSelesai,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.error("Gagal memuat data statistik", err);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      controller.abort();
    };
  }, []);

  const opdProgressPct = stats.totalOpdMain > 0 ? Math.round((stats.opdDisetujui / stats.totalOpdMain) * 100) : 0;
  const anjabProgressPct = stats.totalJabatan > 0 ? Math.round((stats.anjabSelesai / stats.totalJabatan) * 100) : 0;
  const abkProgressPct = stats.totalJabatan > 0 ? Math.round((stats.abkSelesai / stats.totalJabatan) * 100) : 0;

  return (
    <>
      {loading && <div className={styles.topLoadingBar} />}
      <main className={styles.container}>
        <nav className={`${styles.nav} glass-panel`}>
          <div className={styles.logo} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span className="text-gradient">SianjabABK EM-JE</span>
            <span style={{ fontSize: '0.625rem', background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', color: 'white', padding: '0.15rem 0.45rem', borderRadius: '6px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.07em', boxShadow: '0 2px 8px rgba(168, 85, 247, 0.2)' }}>AI Powered</span>
          </div>
          <div className={styles.navLinks}>
            <Link href="/">Beranda</Link>
            <Link href="/organisasi">Struktur Organisasi</Link>
            <a href="#">Analisis</a>
          </div>
        </nav>

        <section className={styles.hero}>
          <div className={`${styles.heroContent} animate-fade-in`}>
            <div className={styles.aiBadge}>
              <span className={styles.aiIcon}>✨</span> Ditenagai oleh Kecerdasan Buatan (AI)
            </div>
            <h1 className={styles.title}>
              Sistem Terpadu <br />
              <span className="text-gradient">Analisis Jabatan & Beban Kerja</span>
            </h1>
            <p className={styles.subtitle}>
              Berdasarkan Permenpan RB No. 1 Tahun 2020. Aplikasi komprehensif yang ditenagai oleh <strong>Kecerdasan Buatan (AI)</strong> untuk merumuskan, memetakan, dan menyusun draf analisis jabatan secara instan, presisi, dan efisien.
            </p>
            <div className={styles.heroActions}>
              <Link href="/login" className="btn-primary">Masuk / Login</Link>
            </div>
          </div>
          
          <div className={`${styles.heroVisual} animate-float animate-fade-in`} style={{ animationDelay: '0.2s' }}>
            <div className={`${styles.dashboardCard} glass-panel`}>
              <div className={styles.cardHeader}>
                <div className={styles.dotGroup}>
                  <div className={styles.dot} style={{background: '#ff5f56'}}></div>
                  <div className={styles.dot} style={{background: '#ffbd2e'}}></div>
                  <div className={styles.dot} style={{background: '#27c93f'}}></div>
                </div>
                <span className={styles.cardTitle}>Statistik & Progres Analisis</span>
              </div>
              
              <div className={styles.cardBody}>
                {/* Mini Progress List */}
                <div className={styles.progressContainer}>
                  <div className={styles.miniProgressItem}>
                    <div className={styles.statRow}>
                      <span>Validasi OPD (Induk)</span>
                      <span className={styles.statValue}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '60px', height: '1.1rem' }}></span>
                        ) : (
                          `${stats.opdDisetujui} / ${stats.totalOpdMain}`
                        )}
                      </span>
                    </div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${loading ? 0 : opdProgressPct}%` }}></div>
                    </div>
                  </div>

                  <div className={styles.miniProgressItem}>
                    <div className={styles.statRow}>
                      <span>Pengisian Anjab (Jabatan)</span>
                      <span className={styles.statValue}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '60px', height: '1.1rem' }}></span>
                        ) : (
                          `${stats.anjabSelesai} / ${stats.totalJabatan}`
                        )}
                      </span>
                    </div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${loading ? 0 : anjabProgressPct}%` }}></div>
                    </div>
                  </div>

                  <div className={styles.miniProgressItem}>
                    <div className={styles.statRow}>
                      <span>Pengisian ABK (Jabatan)</span>
                      <span className={styles.statValue}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '60px', height: '1.1rem' }}></span>
                        ) : (
                          `${stats.abkSelesai} / ${stats.totalJabatan}`
                        )}
                      </span>
                    </div>
                    <div className={styles.progressBar}>
                      <div 
                        className={styles.progressFill} 
                        style={{ 
                          width: `${loading ? 0 : abkProgressPct}%`,
                          background: 'linear-gradient(90deg, hsl(var(--secondary)), #f472b6)'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                <hr className={styles.divider} />

                {/* Compact Demographics Grid */}
                <div className={styles.compactStatsGrid}>
                  <div className={styles.compactStatItem}>
                    <span className={styles.compactIcon}>🏢</span>
                    <div className={styles.compactInfo}>
                      <span className={styles.compactVal}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '30px', height: '1rem' }}></span>
                        ) : (
                          stats.totalOpdMain
                        )}
                      </span>
                      <span className={styles.compactLabel}>OPD Induk</span>
                    </div>
                  </div>

                  <div className={styles.compactStatItem}>
                    <span className={styles.compactIcon}>👥</span>
                    <div className={styles.compactInfo}>
                      <span className={styles.compactVal}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '40px', height: '1rem' }}></span>
                        ) : (
                          stats.totalJabatan
                        )}
                      </span>
                      <span className={styles.compactLabel}>Total Jabatan</span>
                    </div>
                  </div>

                  <div className={styles.compactStatItem}>
                    <span className={styles.compactIcon}>👑</span>
                    <div className={styles.compactInfo}>
                      <span className={styles.compactVal}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '30px', height: '1rem' }}></span>
                        ) : (
                          stats.totalJPT
                        )}
                      </span>
                      <span className={styles.compactLabel}>JPT</span>
                    </div>
                  </div>

                  <div className={styles.compactStatItem}>
                    <span className={styles.compactIcon}>🛡️</span>
                    <div className={styles.compactInfo}>
                      <span className={styles.compactVal}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '30px', height: '1rem' }}></span>
                        ) : (
                          stats.totalAdministrator
                        )}
                      </span>
                      <span className={styles.compactLabel}>Administrator</span>
                    </div>
                  </div>

                  <div className={styles.compactStatItem}>
                    <span className={styles.compactIcon}>🔍</span>
                    <div className={styles.compactInfo}>
                      <span className={styles.compactVal}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '30px', height: '1rem' }}></span>
                        ) : (
                          stats.totalPengawas
                        )}
                      </span>
                      <span className={styles.compactLabel}>Pengawas</span>
                    </div>
                  </div>

                  <div className={styles.compactStatItem}>
                    <span className={styles.compactIcon}>💼</span>
                    <div className={styles.compactInfo}>
                      <span className={styles.compactVal}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '35px', height: '1rem' }}></span>
                        ) : (
                          stats.totalPelaksana
                        )}
                      </span>
                      <span className={styles.compactLabel}>Pelaksana</span>
                    </div>
                  </div>

                  <div className={`${styles.compactStatItem} ${styles.fullWidth}`}>
                    <span className={styles.compactIcon}>⚡</span>
                    <div className={styles.compactInfo}>
                      <span className={styles.compactVal}>
                        {loading ? (
                          <span className={styles.skeleton} style={{ width: '40px', height: '1rem' }}></span>
                        ) : (
                          stats.totalFungsional
                        )}
                      </span>
                      <span className={styles.compactLabel}>Jabatan Fungsional</span>
                    </div>
                  </div>
                </div>

                <div className={styles.lastUpdateRow}>
                  <span>Pembaruan Terakhir: {currentTimeStr}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

