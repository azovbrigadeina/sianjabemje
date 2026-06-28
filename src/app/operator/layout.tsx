"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "../dashboard/layout.module.css";
import { useUser } from "@/lib/UserContext";
import { api } from "@/lib/api";
import type { UnitKerja } from "@/lib/types";
import Footer from "@/components/Footer";
import ErrorBoundary from "@/components/ErrorBoundary";


export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useUser();
  const [opdName, setOpdName] = useState<string>("OPD");
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

  // Guard: jika tidak login → /login, jika bukan operator → /dashboard
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "operator") {
      router.replace("/dashboard");
    }
  }, [user, isLoading, router]);

  // Fetch OPD name
  useEffect(() => {
    if (user?.unitKerjaId) {
      api.getUnitKerja().then((raw) => {
        const opds = (raw as UnitKerja[]) || [];
        const found = opds.find((o) => o.id === user.unitKerjaId);
        if (found) setOpdName(found.nama);
      }).catch(() => {});
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const displayName = user?.namaLengkap || user?.username || "Operator";
  const avatarChar = displayName.charAt(0).toUpperCase();

  // Dynamic header title based on route
  const getPageTitle = () => {
    if (pathname === '/operator') return opdName;
    if (pathname.includes('/peta-jabatan')) return 'Peta Jabatan';
    if (pathname.includes('/organisasi')) return 'Struktur Organisasi';
    if (pathname.includes('/analisis')) return 'Pengisian Anjab';
    if (pathname.includes('/beban-kerja')) return 'Hitung ABK';
    if (pathname.includes('/validasi')) return 'Kirim Validasi';
    return opdName;
  };

  return (
    <div className={styles.dashboardLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogo}>
            <div className={styles.logoMark}>S</div>
            <span className={styles.logoText}>
              SianjabABK
              <span className={styles.logoAccent}>EM-JE</span>
            </span>
          </div>
        </div>

        {/* OPD Panel Label - only visible when sidebar is not collapsed on desktop */}
        <div style={{ padding: '0 1rem 0.75rem', fontSize: '0.72rem', opacity: 0.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(var(--secondary))' }}>
          Panel Operator
        </div>

        <nav className={styles.sidebarNav}>
          <Link href="/operator" className={`${styles.navItem} ${pathname === '/operator' ? styles.active : ''}`}>
            <span className={styles.navIcon}>📊</span> <span className={styles.navText}>Beranda OPD</span>
          </Link>
          <Link href="/operator/organisasi" className={`${styles.navItem} ${pathname.includes('/operator/organisasi') ? styles.active : ''}`}>
            <span className={styles.navIcon}>🏢</span> <span className={styles.navText}>Struktur Organisasi</span>
          </Link>
          <Link href="/operator/peta-jabatan" className={`${styles.navItem} ${pathname.includes('/peta-jabatan') ? styles.active : ''}`}>
            <span className={styles.navIcon}>🗺️</span> <span className={styles.navText}>Peta Jabatan</span>
          </Link>
          <Link href="/operator/analisis" className={`${styles.navItem} ${pathname.includes('/analisis') ? styles.active : ''}`}>
            <span className={styles.navIcon}>📝</span> <span className={styles.navText}>Pengisian Anjab</span>
          </Link>
          <Link href="/operator/beban-kerja" className={`${styles.navItem} ${pathname.includes('/beban-kerja') ? styles.active : ''}`}>
            <span className={styles.navIcon}>⚖️</span> <span className={styles.navText}>Hitung ABK</span>
          </Link>
          <Link href="/operator/validasi" className={`${styles.navItem} ${pathname.includes('/validasi') ? styles.active : ''}`}>
            <span className={styles.navIcon}>✅</span> <span className={styles.navText}>Kirim Validasi</span>
          </Link>
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            id="btn-logout-operator"
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
            <button
              onClick={toggleTheme}
              className={styles.themeToggleBtn}
              title={theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}
              aria-label="Toggle Theme"
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <div className={styles.userProfile}>
              <div className={styles.avatar} style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)' }}>
                {avatarChar}
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block' }}>{displayName}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operator OPD</span>
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
