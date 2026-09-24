"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import type { UnitKerja, Jabatan } from "@/lib/types";
import { BRANDING } from "@/config/branding";
import AppLogo from "@/components/AppLogo";

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
  const [showContact, setShowContact] = useState(false);

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
          <div className={styles.logo}>
            <AppLogo showBadge />
          </div>
          <div className={styles.navLinks}>
            <Link href="/">Beranda</Link>
            <Link href="/organisasi">Struktur Organisasi</Link>
            <Link href="/verify">Cek Keabsahan Dokumen</Link>
            <a href="#" onClick={(e) => { e.preventDefault(); setShowContact(true); }}>Kontak Kami</a>
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
              <strong>SI-PRABU (Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja)</strong> merupakan platform terpadu Pemerintah Kabupaten Muaro Jambi berdasarkan <strong>Permenpan RB No. 1 Tahun 2020</strong>. Aplikasi komprehensif ini ditenagai oleh <strong>Kecerdasan Buatan (AI)</strong> untuk merumuskan, memetakan, dan menyusun draf analisis jabatan serta perhitungan beban kerja secara instan, presisi, dan efisien.
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
      {showContact && (
        <div className={styles.contactOverlay} onClick={() => setShowContact(false)}>
          <div className={styles.contactCard} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={() => setShowContact(false)} aria-label="Tutup">
              ✕
            </button>
            <div className={styles.contactHeader}>
              <h2 className={styles.contactHeaderTitle}>Hubungi Kami</h2>
              <p className={styles.contactHeaderSubtitle}>
                Bagian Organisasi Sekretariat Daerah Kabupaten Muaro Jambi
              </p>
            </div>
            <div className={styles.contactBody}>
              <div className={styles.infoItem}>
                <span className={styles.infoIcon}>📧</span>
                <div className={styles.infoText}>
                  <span className={styles.infoLabel}>Email</span>
                  <a href="mailto:bagormuarojambi@gmail.com" className={styles.infoVal}>
                    bagormuarojambi@gmail.com
                  </a>
                  <a href="mailto:bagormuarojambi@gmail.com" className={styles.actionLink}>
                    Kirim Email →
                  </a>
                </div>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoIcon}>📍</span>
                <div className={styles.infoText}>
                  <span className={styles.infoLabel}>Alamat Kantor</span>
                  <span className={styles.infoVal}>
                    Komplek Perkantoran Bukit Cinto Kenang, Kecamatan Sekernan, Kabupaten Muaro Jambi, Jambi 36381
                  </span>
                  <a 
                    href="https://www.google.com/maps/search/?api=1&query=Komplek+Perkantoran+Bukit+Cinto+Kenang,+Kecamatan+Sekernan,+Kabupaten+Muaro+Jambi,+Jambi+36381"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.actionLink}
                  >
                    Buka di Google Maps →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

