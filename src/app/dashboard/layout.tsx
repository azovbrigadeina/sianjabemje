"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./layout.module.css";
import { useUser } from "@/lib/UserContext";
import Footer from "@/components/Footer";


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

  // Load saved theme or default to light mode
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const initialTheme = savedTheme || "light";
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
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

  const displayName = user?.namaLengkap || user?.username || "Admin Sianjab";
  const avatarChar = displayName.charAt(0).toUpperCase();

  return (
    <div className={styles.dashboardLayout}>
      <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
        <button
          className={styles.toggleBtn}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Perluas Menu" : "Kecilkan Menu"}
        >
          ◀
        </button>
        <div className={styles.sidebarLogo}>
          <span className={styles.logoFull}>Sianjab ABK</span>
          <span className={styles.logoShort}>S</span>
        </div>

        <nav className={styles.sidebarNav}>
          <Link href="/dashboard" className={`${styles.navItem} ${pathname === '/dashboard' ? styles.active : ''}`}>
            <span className={styles.navIcon}>📊</span> <span className={styles.navText}>Dasbor Utama</span>
          </Link>
          <Link href="/dashboard/organisasi" className={`${styles.navItem} ${pathname.includes('/organisasi') ? styles.active : ''}`}>
            <span className={styles.navIcon}>🏢</span> <span className={styles.navText}>Struktur Organisasi</span>
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
          {isCollapsed && <div style={{ height: "1px", background: "var(--glass-border)", margin: "0.5rem 0" }} />}

          <Link href="/dashboard/referensi" className={`${styles.navItem} ${pathname.includes('/referensi') ? styles.active : ''}`}>
            <span className={styles.navIcon}>📚</span> <span className={styles.navText}>Referensi Jabatan</span>
          </Link>
          <Link href="/dashboard/users" className={`${styles.navItem} ${pathname.includes('/users') ? styles.active : ''}`}>
            <span className={styles.navIcon}>👤</span> <span className={styles.navText}>Manajemen User</span>
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
            Ringkasan Sistem
          </div>
          <div className={styles.headerActions}>
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
            {children}
          </div>
          <div style={{ marginTop: '2rem' }}>
            <Footer />
          </div>
        </main>
      </div>
    </div>
  );
}
