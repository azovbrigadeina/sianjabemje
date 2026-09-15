"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./layout.module.css";
import { useUser } from "@/lib/UserContext";
import Footer from "@/components/Footer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { api } from "@/lib/api";
import { SUPPORTED_YEARS } from "@/lib/constants";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, logout, isLoading } = useUser();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [colorTheme, setColorTheme] = useState<"theme1" | "theme2">("theme1");
  const [selectedYear, setSelectedYear] = useState<string>("2026");

  // Load saved theme or default to light mode
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const initialTheme = savedTheme || "light";
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
    
    // Load saved color theme
    const savedColorTheme = localStorage.getItem("color-theme") as "theme1" | "theme2" | null;
    const initialColorTheme = savedColorTheme || "theme1";
    setColorTheme(initialColorTheme);
    document.documentElement.setAttribute("data-color-theme", initialColorTheme);

    // Sync settings (color theme & active year) from database if user is logged in
    const syncSettings = async () => {
      try {
        const [themeRes, yearRes] = await Promise.all([
          api.getThemeSetting().catch(() => null),
          api.getActiveYearSetting().catch(() => null),
        ]);
        if (themeRes && themeRes.colorTheme) {
          setColorTheme(themeRes.colorTheme);
          localStorage.setItem("color-theme", themeRes.colorTheme);
          document.documentElement.setAttribute("data-color-theme", themeRes.colorTheme);
        }
        if (yearRes && yearRes.activeYear) {
          const currentYear = localStorage.getItem("sianjab_active_year");
          setSelectedYear(yearRes.activeYear);
          localStorage.setItem("sianjab_active_year", yearRes.activeYear);
          if (currentYear !== yearRes.activeYear && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("yearChanged", { detail: yearRes.activeYear }));
          }
        }
      } catch (err) {
        console.error("Gagal sinkronisasi pengaturan dari database:", err);
      }
    };
    if (user) {
      syncSettings();
    }

    // Load saved year fallback from local storage
    const savedYear = localStorage.getItem("sianjab_active_year") || "2026";
    setSelectedYear(savedYear);
  }, [user]);

  const handleYearChange = async (newYear: string) => {
    setSelectedYear(newYear);
    localStorage.setItem("sianjab_active_year", newYear);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("yearChanged", { detail: newYear }));
    }
    try {
      await api.saveActiveYearSetting({ activeYear: newYear });
    } catch (err) {
      console.error("Gagal menyimpan tahun aktif ke database:", err);
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  const handleColorThemeChange = async (newTheme: "theme1" | "theme2") => {
    setColorTheme(newTheme);
    localStorage.setItem("color-theme", newTheme);
    document.documentElement.setAttribute("data-color-theme", newTheme);
    try {
      await api.saveThemeSetting({ colorTheme: newTheme });
    } catch (err) {
      console.error("Gagal menyimpan tema warna ke database:", err);
    }
  };

  // Guard: if not authenticated or not admin, redirect
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/operator");
    }
  }, [user, isLoading, router]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const displayName = user?.namaLengkap || user?.username || "Admin SianjabABK EM-JE";
  const avatarChar = displayName.charAt(0).toUpperCase();

  // Dynamic header title based on route
  const getPageTitle = () => {
    if (pathname === '/dashboard') return 'Dasbor Utama';
    if (pathname.includes('/organisasi/peta-jabatan')) return 'Peta Jabatan';
    if (pathname.includes('/organisasi')) return 'Struktur Organisasi';
    if (pathname.includes('/opd')) return 'Kelola OPD';
    if (pathname.includes('/analisis')) return 'Analisis Jabatan';
    if (pathname.includes('/beban-kerja')) return 'Beban Kerja';
    if (pathname.includes('/verifikasi')) return 'Verifikasi Pengisian';
    if (pathname.includes('/validasi')) return 'Validasi Usulan';
    if (pathname.includes('/laporan')) return 'Laporan';
    if (pathname.includes('/investigasi')) return 'Investigasi & Audit Anomali';
    if (pathname.includes('/referensi')) return 'Referensi Jabatan';
    if (pathname.includes('/users')) return 'Manajemen User';
    if (pathname.includes('/pengaturan')) return 'Pengaturan AI';
    if (pathname.includes('/log-keamanan')) return 'Log Keamanan';
    if (pathname.includes('/backup-database')) return 'Backup & Restore Database';
    return 'Ringkasan Sistem';
  };

  return (
    <div className={styles.dashboardLayout}>
      <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogo}>
            <div className={styles.logoMark}>S</div>
            <span className={styles.logoText}>
              SianjabABK
              <span className={styles.logoAccent}>EM-JE</span>
            </span>
          </div>
          {!isCollapsed && (
            <button
              className={styles.toggleBtn}
              onClick={() => setIsCollapsed(!isCollapsed)}
              title="Kecilkan Menu"
              aria-label="Kecilkan Menu"
            >
              ◀
            </button>
          )}
          {isCollapsed && (
            <button
              className={styles.toggleBtn}
              onClick={() => setIsCollapsed(!isCollapsed)}
              title="Perluas Menu"
              aria-label="Perluas Menu"
            >
              ◀
            </button>
          )}
        </div>

        <nav className={styles.sidebarNav}>
          <Link href="/dashboard" className={`${styles.navItem} ${pathname === '/dashboard' ? styles.active : ''}`}>
            <span className={styles.navIcon}>📊</span> <span className={styles.navText}>Dasbor Utama</span>
          </Link>
          <Link href="/dashboard/organisasi" className={`${styles.navItem} ${pathname === '/dashboard/organisasi' ? styles.active : ''}`}>
            <span className={styles.navIcon}>🏢</span> <span className={styles.navText}>Struktur Organisasi</span>
          </Link>
          <Link href="/dashboard/organisasi/peta-jabatan" className={`${styles.navItem} ${pathname.includes('/organisasi/peta-jabatan') ? styles.active : ''}`}>
            <span className={styles.navIcon}>🗺️</span> <span className={styles.navText}>Peta Jabatan</span>
          </Link>
          <Link href="/dashboard/opd" className={`${styles.navItem} ${pathname.includes('/opd') ? styles.active : ''}`}>
            <span className={styles.navIcon}>⚙️</span> <span className={styles.navText}>Kelola OPD</span>
          </Link>
          <Link href="/dashboard/analisis" className={`${styles.navItem} ${pathname.includes('/analisis') ? styles.active : ''}`}>
            <span className={styles.navIcon}>📝</span> <span className={styles.navText}>Analisis Jabatan</span>
          </Link>
          <Link href="/dashboard/beban-kerja" className={`${styles.navItem} ${pathname.includes('/beban-kerja') ? styles.active : ''}`}>
            <span className={styles.navIcon}>⚖️</span> <span className={styles.navText}>Beban Kerja</span>
          </Link>
          <Link href="/dashboard/verifikasi" className={`${styles.navItem} ${pathname.includes('/verifikasi') ? styles.active : ''}`}>
            <span className={styles.navIcon}>🔍</span> <span className={styles.navText}>Verifikasi Pengisian</span>
          </Link>
          <Link href="/dashboard/validasi" className={`${styles.navItem} ${pathname.includes('/validasi') ? styles.active : ''}`}>
            <span className={styles.navIcon}>✅</span> <span className={styles.navText}>Validasi Usulan</span>
          </Link>
          <Link href="/dashboard/laporan" className={`${styles.navItem} ${pathname.includes('/laporan') ? styles.active : ''}`}>
            <span className={styles.navIcon}>📄</span> <span className={styles.navText}>Laporan</span>
          </Link>

          {/* Divider */}
          {!isCollapsed && (
            <div className={styles.navDivider}>
              <span>Administrasi</span>
            </div>
          )}
          {isCollapsed && <div className={styles.navDividerLine} />}

          <Link href="/dashboard/referensi" className={`${styles.navItem} ${pathname.includes('/referensi') ? styles.active : ''}`}>
            <span className={styles.navIcon}>📚</span> <span className={styles.navText}>Referensi Jabatan</span>
          </Link>
          <Link href="/dashboard/investigasi" className={`${styles.navItem} ${pathname.includes('/investigasi') ? styles.active : ''}`}>
            <span className={styles.navIcon}>🔍</span> <span className={styles.navText}>Investigasi Anomali</span>
          </Link>
          <Link href="/dashboard/users" className={`${styles.navItem} ${pathname.includes('/users') ? styles.active : ''}`}>
            <span className={styles.navIcon}>👤</span> <span className={styles.navText}>Manajemen User</span>
          </Link>
          <Link href="/dashboard/pengaturan" className={`${styles.navItem} ${pathname.includes('/pengaturan') ? styles.active : ''}`}>
            <span className={styles.navIcon}>⚙️</span> <span className={styles.navText}>Pengaturan AI</span>
          </Link>
          <Link href="/dashboard/log-keamanan" className={`${styles.navItem} ${pathname.includes('/log-keamanan') ? styles.active : ''}`}>
            <span className={styles.navIcon}>🛡️</span> <span className={styles.navText}>Log Keamanan</span>
          </Link>
          <Link href="/dashboard/backup-database" className={`${styles.navItem} ${pathname.includes('/backup-database') ? styles.active : ''}`}>
            <span className={styles.navIcon}>💾</span> <span className={styles.navText}>Backup & Restore</span>
          </Link>
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            id="btn-logout-dashboard"
            className={styles.navItem}
            style={{ color: '#ff5f56', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            onClick={handleLogout}
          >
            <span className={styles.navIcon}>🚪</span> <span className={styles.navText}>Keluar</span>
          </button>
        </div>
      </aside>

      <div className={styles.mainContent}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            {getPageTitle()}
          </div>
          <div className={styles.headerActions}>
            <select
              className={styles.yearSelect}
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              title="Pilih Tahun Anggaran"
            >
              {SUPPORTED_YEARS.map(year => (
                <option key={year} value={year}>Tahun {year}</option>
              ))}
            </select>
            <select
              className={styles.themeSelect}
              value={colorTheme}
              onChange={(e) => handleColorThemeChange(e.target.value as "theme1" | "theme2")}
              title="Pilih Tema Warna"
            >
              <option value="theme1">🎨 Tema 1</option>
              <option value="theme2">🎨 Tema 2</option>
            </select>
            <button
              onClick={toggleTheme}
              className={styles.themeToggleBtn}
              title={theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}
              aria-label="Toggle Theme"
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <div className={styles.userProfile}>
              <div className={styles.avatar}>{avatarChar}</div>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block' }}>{displayName}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Administrator</span>
              </div>
            </div>
          </div>
        </header>

        <main className={styles.contentScroll}>
          <div style={{ flex: 1 }}>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
          <div style={{ marginTop: '2rem' }}>
            <Footer />
          </div>
        </main>
      </div>
    </div>
  );
}
