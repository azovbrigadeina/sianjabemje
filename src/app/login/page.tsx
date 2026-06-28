"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./login.module.css";
import { api } from "@/lib/api";
import { useUser, type SessionUser } from "@/lib/UserContext";
import Footer from "@/components/Footer";

export default function Login() {
  const router = useRouter();
  const { setUser } = useUser();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const result = await api.login({ username, password }) as { token: string; user: SessionUser };
      // Store token in cookie (7 days)
      document.cookie = `sianjab_token=${result.token}; Max-Age=${60 * 60 * 24 * 7}; path=/`;
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
              <span>S</span>
            </div>
            <h1 className="text-gradient">SianjabABK EM-JE</h1>
            <p>Sistem Analisis Jabatan &amp; Beban Kerja</p>
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

