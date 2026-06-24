import styles from "./page.module.css";
import Link from "next/link";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <main className={styles.container}>
        <nav className={`${styles.nav} glass-panel`}>
          <div className={styles.logo}>
            <span className="text-gradient">Sianjab ABK</span>
          </div>
          <div className={styles.navLinks}>
            <a href="#">Beranda</a>
            <a href="#">Struktur Organisasi</a>
            <a href="#">Analisis</a>
          </div>
        </nav>

        <section className={styles.hero}>
          <div className={`${styles.heroContent} animate-fade-in`}>
            <h1 className={styles.title}>
              Sistem Terpadu <br />
              <span className="text-gradient">Analisis Jabatan & Beban Kerja</span>
            </h1>
            <p className={styles.subtitle}>
              Berdasarkan Permenpan RB No. 1 Tahun 2020. Aplikasi komprehensif untuk merumuskan, memetakan, dan menganalisis kebutuhan pegawai di setiap unit kerja secara presisi dan efisien.
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
                <span className={styles.cardTitle}>Ringkasan Progress Analisis</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.statRow}>
                  <span>Dokumen Anjab Selesai</span>
                  <span className={styles.statValue}>24 / 45 OPD</span>
                </div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: '53%' }}></div>
                </div>
                <div className={styles.statRow}>
                  <span>Pembaruan Terakhir</span>
                  <span className={styles.statValue}>Hari ini, 08:30 WIB</span>
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

