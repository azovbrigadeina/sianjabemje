"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./login.module.css";
import { api } from "@/lib/api";
import { useUser, type SessionUser } from "@/lib/UserContext";
import Footer from "@/components/Footer";
import { BRANDING } from "@/config/branding";

export default function Login() {
  const router = useRouter();
  const { setUser } = useUser();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clientIp, setClientIp] = useState("unknown");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expiredNotice, setExpiredNotice] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("expired") === "1") {
        setExpiredNotice(true);
      }
    }

    // Pre-fetch client IP in background on mount
    const fetchIp = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout
        const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
        const json = await res.json();
        clearTimeout(timeoutId);
        if (json && json.ip) {
          setClientIp(json.ip);
        }
      } catch (err) {
        // Silent catch, fallback remains "unknown"
      }
    };
    fetchIp();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const userAgentStr = typeof window !== "undefined" ? navigator.userAgent : "unknown";
      const result = await api.login({ 
        username, 
        password,
        ip: clientIp,
        userAgent: userAgentStr
      }) as { token: string; user: SessionUser };
      // Store token in cookie (24 hours to match backend token TTL)
      document.cookie = `sianjab_token=${result.token}; Max-Age=${60 * 60 * 24}; path=/`;
      // Store user in context
      setUser(result.user);

      if (result.user.role === "admin") {
        router.push("/dashboard");
      } else {
        router.push("/operator");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login gagal";
      setError(message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <main className={styles.loginContainer} style={{ flex: 1 }}>
        <div className={`${styles.loginCard} glass-panel animate-fade-in`}>
          <div className={styles.cardHeader}>
            <div className={styles.logoMark}>
              <span>P</span>
            </div>
            <h1 className="text-gradient">{BRANDING.displayName}</h1>
            <p>{BRANDING.tagline}</p>
            <p style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "0.25rem" }}>
              Silakan masuk menggunakan kredensial Anda
            </p>
          </div>

          <form className={styles.loginForm} onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label htmlFor="username">NIP / Username</label>
              <input
                type="text"
                id="username"
                placeholder="Masukkan NIP atau Username"
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                placeholder="••••••••"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {expiredNotice && (
              <div className={styles.infoBox}>
                <span>ℹ️</span> Sesi Anda telah berakhir. Silakan login kembali.
              </div>
            )}

            {error && (
              <div className={styles.errorBox}>
                <span>⚠️</span> {error}
              </div>
            )}

            <button
              type="submit"
              id="btn-login"
              className={`btn-primary ${styles.submitBtn}`}
              disabled={loading}
            >
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                "Masuk ke Sistem"
              )}
            </button>
          </form>

          <div className={styles.backLink}>
            <Link href="/">← Kembali ke Beranda</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

