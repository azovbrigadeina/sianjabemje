"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "../dashboard/layout.module.css";
import { useUser } from "@/lib/UserContext";
import { api } from "@/lib/api";
import type { UnitKerja } from "@/lib/types";

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useUser();
  const [opdName, setOpdName] = useState<string>("OPD");

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

  return (
    <div className={styles.dashboardLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <span className="text-gradient">Sianjab ABK</span>
        </div>

        <div style={{ padding: '0 0.5rem 1rem', fontSize: '0.8rem', opacity: 0.7, fontWeight: 700, textTransform: 'uppercase', color: 'hsl(var(--secondary))' }}>
          Panel Operator OPD
        </div>

        <nav className={styles.sidebarNav}>
          <Link href="/operator" className={`${styles.navItem} ${pathname === '/operator' ? styles.active : ''}`}>
            <span>📊</span> Beranda OPD
          </Link>
          <Link href="/operator/analisis" className={`${styles.navItem} ${pathname.includes('/analisis') ? styles.active : ''}`}>
            <span>📝</span> Pengisian Anjab
          </Link>
          <Link href="/operator/beban-kerja" className={`${styles.navItem} ${pathname.includes('/beban-kerja') ? styles.active : ''}`}>
            <span>⚖️</span> Hitung ABK
          </Link>
          <Link href="/operator/validasi" className={`${styles.navItem} ${pathname.includes('/validasi') ? styles.active : ''}`}>
            <span>✅</span> Kirim Validasi
          </Link>
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            id="btn-logout-operator"
            className={styles.navItem}
            style={{ color: '#ff5f56', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            onClick={handleLogout}
          >
            <span>🚪</span> Keluar
          </button>
        </div>
      </aside>

      <div className={styles.mainContent}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            {opdName}
          </div>
          <div className={styles.headerActions}>
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
          {children}
        </main>
      </div>
    </div>
  );
}
