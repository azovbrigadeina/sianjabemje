"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import styles from "../users/users.module.css";

interface SecurityLog {
  id: string;
  timestamp: string;
  username: string;
  status: "SUCCESS" | "FAILED";
  reason?: string;
  ip: string;
  userAgent: string;
}

export default function SecurityLogsPage() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "SUCCESS" | "FAILED">("ALL");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getSecurityLogs();
      setLogs((data as SecurityLog[]) || []);
    } catch (err) {
      console.error("Gagal memuat log keamanan:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Filter logs based on search and status filter
  const filteredLogs = logs.filter((log) => {
    const matchesSearch = (log.username || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (log.ip || "").includes(searchQuery);
    const matchesStatus = statusFilter === "ALL" || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const totalAttempts = logs.length;
  const successCount = logs.filter((l) => l.status === "SUCCESS").length;
  const failureCount = logs.filter((l) => l.status === "FAILED").length;

  const formatDate = (isoStr: string) => {
    if (!isoStr) return "-";
    try {
      const date = new Date(isoStr);
      return date.toLocaleString("id-ID", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch (e) {
      return isoStr;
    }
  };

  // Helper to parse browser/OS from user agent
  const parseUserAgent = (ua: string) => {
    if (!ua || ua === "unknown") return "Tidak Diketahui";
    
    let browser = "Browser Lain";
    let os = "OS Lain";

    // Detect Browser
    if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("Chrome/")) browser = "Chrome";
    else if (ua.includes("Safari/")) browser = "Safari";
    else if (ua.includes("Opera/") || ua.includes("OPR/")) browser = "Opera";

    // Detect OS
    if (ua.includes("Windows NT")) os = "Windows";
    else if (ua.includes("Mac OS X")) os = "macOS";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
    else if (ua.includes("Linux")) os = "Linux";

    return `${browser} (${os})`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Log Keamanan Sistem</h1>
          <p className={styles.pageSubtitle}>
            Riwayat aktivitas autentikasi, percobaan masuk sukses, dan deteksi kegagalan login.
          </p>
        </div>
        <button
          onClick={loadLogs}
          disabled={loading}
          className={styles.btnEdit}
          style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", color: "var(--foreground)" }}
        >
          🔄 Refresh Log
        </button>
      </div>

      {/* Stats Cards Dashboard */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1rem",
        marginBottom: "0.5rem"
      }}>
        <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--glass-border)" }}>
          <div style={{ fontSize: "0.8rem", opacity: 0.6, fontWeight: 600, textTransform: "uppercase" }}>Total Percobaan</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, marginTop: "0.5rem", color: "var(--foreground)" }}>{totalAttempts}</div>
        </div>
        <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "12px", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
          <div style={{ fontSize: "0.8rem", opacity: 0.6, fontWeight: 600, textTransform: "uppercase", color: "rgb(34, 197, 94)" }}>Login Sukses</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, marginTop: "0.5rem", color: "rgb(34, 197, 94)" }}>{successCount}</div>
        </div>
        <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "12px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
          <div style={{ fontSize: "0.8rem", opacity: 0.6, fontWeight: 600, textTransform: "uppercase", color: "rgb(239, 68, 68)" }}>Login Gagal</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, marginTop: "0.5rem", color: "rgb(239, 68, 68)" }}>{failureCount}</div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="glass-panel" style={{
        padding: "1.25rem",
        borderRadius: "12px",
        display: "flex",
        flexWrap: "wrap",
        gap: "1rem",
        alignItems: "center",
        border: "1px solid var(--glass-border)"
      }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <input
            type="text"
            placeholder="Cari berdasarkan Username / NIP / IP Address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--glass-border)",
              background: "var(--glass-bg)",
              color: "var(--foreground)",
              outline: "none"
            }}
          />
        </div>
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--glass-border)",
              background: "var(--glass-bg)",
              color: "var(--foreground)",
              outline: "none",
              cursor: "pointer"
            }}
          >
            <option value="ALL">Semua Status</option>
            <option value="SUCCESS">Hanya Sukses</option>
            <option value="FAILED">Hanya Gagal</option>
          </select>
        </div>
      </div>

      {/* Logs Table Card */}
      <div className={`${styles.tableCard} glass-panel`}>
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.loadSpinner}></div>
            <span>Memuat riwayat log keamanan...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem", opacity: 0.5 }}>
            📭 Tidak ada data log keamanan yang cocok dengan kriteria filter.
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Username / NIP</th>
                  <th>IP Address</th>
                  <th>Perangkat / Browser</th>
                  <th>Status</th>
                  <th>Keterangan / Alasan</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(log.timestamp)}</td>
                    <td style={{ fontWeight: 600 }}>{log.username}</td>
                    <td><code>{log.ip}</code></td>
                    <td style={{ fontSize: "0.85rem" }} title={log.userAgent}>
                      {parseUserAgent(log.userAgent)}
                    </td>
                    <td>
                      <span
                        className={styles.roleBadge}
                        style={{
                          background: log.status === "SUCCESS" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                          color: log.status === "SUCCESS" ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)",
                          border: log.status === "SUCCESS" ? "1px solid rgba(34, 197, 94, 0.2)" : "1px solid rgba(239, 68, 68, 0.2)"
                        }}
                      >
                        {log.status === "SUCCESS" ? "🟢 SUKSES" : "🔴 GAGAL"}
                      </span>
                    </td>
                    <td style={{ color: log.status === "FAILED" ? "rgb(239, 68, 68)" : "var(--foreground)", opacity: log.status === "FAILED" ? 1 : 0.6 }}>
                      {log.reason || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
