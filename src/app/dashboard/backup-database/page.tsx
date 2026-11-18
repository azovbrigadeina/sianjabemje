'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '@/lib/UserContext';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import styles from './page.module.css';

interface BackupMetadata {
  timestamp?: string;
  exportedBy?: string;
  version?: string;
  yearNodesCount: number;
  entityStats: { entity: string; count: number }[];
  totalKeys: number;
}

interface SecurityLogItem {
  id?: string;
  timestamp?: string;
  createdAt?: string;
  username?: string;
  user?: string;
  event?: string;
  action?: string;
  details?: string;
  description?: string;
  ip?: string;
}

/** Ringkasan status Homeserver dari endpoint /_homeserver/status. */
interface HomeserverStatus {
  mode?: 'HOMESERVER' | 'RTDB' | 'OFF';
  error?: string;
  latencyMs?: number;
  baseUrl?: string;
  activeYearPreview?: string;
  counts?: { jabatan?: number; unitKerja?: number; tugasPokok?: number; abk?: number; users?: number };
  outbox?: { dirtyCount?: number; isFlushing?: boolean };
  traffic?: { rtdbBytesSavedEstimate?: number };
  alerts?: { storageError?: string | null; lastBackupAt?: string | null; lastBackupError?: string | null };
  [key: string]: unknown;
}

export default function BackupDatabasePage() {
  const { user, isLoading: isUserLoading } = useUser();
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // File upload & preview state
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<Record<string, unknown> | null>(null);
  const [backupMeta, setBackupMeta] = useState<BackupMetadata | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Security logs state
  const [securityLogs, setSecurityLogs] = useState<SecurityLogItem[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(true);

  // Homeserver Docker Database & Funnel Control State
  const [hsUrl, setHsUrl] = useState('');
  const [hsSecret, setHsSecret] = useState('');
  const [hsActiveMode, setHsActiveMode] = useState<'HOMESERVER' | 'RTDB'>('RTDB');
  const [hsStatus, setHsStatus] = useState<HomeserverStatus | null>(null);
  const [hsLoading, setHsLoading] = useState(false);
  const [hsActionBusy, setHsActionBusy] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshHomeserverStatus = async (targetUrl?: string) => {
    setHsLoading(true);
    const urlToTest = (targetUrl || hsUrl).trim().replace(/\/+$/, '');
    try {
      const st = await api.homeserver.getStatus(urlToTest);
      setHsStatus(st);
      if (st?.mode === 'HOMESERVER' || st?.mode === 'RTDB') {
        setHsActiveMode(st.mode);
      }
      // Otomatis simpan ke local config dan sinkronkan saat koneksi terverifikasi
      api.homeserver.saveConfig({ url: urlToTest, secret: hsSecret, mode: st?.mode || hsActiveMode }).catch(() => {});
    } catch (e) {
      setHsStatus({ error: getErrorMessage(e) || 'Tidak terjangkau' });
    } finally {
      setHsLoading(false);
    }
  };

  useEffect(() => {
    // Baca konfigurasi lokal setelah mount (hindari setState sinkron di body effect).
    Promise.resolve().then(() => {
      const localCfg = api.homeserver.getLocalConfig();
      if (localCfg.url) setHsUrl(localCfg.url);
      if (localCfg.secret) setHsSecret(localCfg.secret);
      if (localCfg.mode) setHsActiveMode(localCfg.mode);
      void refreshHomeserverStatus(localCfg.url);
    });
  }, []);

  const handleSaveHomeserverConfig = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setHsActionBusy('save');
    try {
      const cleanUrl = hsUrl.trim().replace(/\/+$/, '');
      const cleanSecret = hsSecret.trim();
      const updated = await api.homeserver.saveConfig({
        url: cleanUrl,
        secret: cleanSecret,
        mode: hsActiveMode,
      });
      setHsUrl(updated.url);
      setSuccessMsg(`✅ URL Homeserver (${cleanUrl}) berhasil disimpan dan disinkronkan ke seluruh sistem!`);
      await refreshHomeserverStatus(cleanUrl);
    } catch (err) {
      setErrorMsg(`Gagal menyimpan konfigurasi Homeserver: ${getErrorMessage(err)}`);
    } finally {
      setHsActionBusy(null);
    }
  };

  const handlePullFromRtdbToHomeserver = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setHsActionBusy('pull');
    try {
      await api.homeserver.saveConfig({ url: hsUrl, secret: hsSecret });
      const res = await api.homeserver.pullFromRtdb(hsUrl, hsSecret);
      setSuccessMsg(`✅ Berhasil menarik seluruh data Firebase RTDB ke Homeserver Docker (${res.topLevelKeys?.length || 0} node utama).`);
      await refreshHomeserverStatus(hsUrl);
    } catch (err) {
      setErrorMsg(`Gagal menarik data dari RTDB ke Homeserver: ${getErrorMessage(err)}`);
    } finally {
      setHsActionBusy(null);
    }
  };

  const handleFlushOutboxToRtdb = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setHsActionBusy('flush');
    try {
      const res = await api.homeserver.flushToRtdb(hsUrl, hsSecret);
      setSuccessMsg(`✅ Berhasil menyinkronkan Outbox Homeserver ke Firebase RTDB (${res.flushedCount || 0} path tersinkron).`);
      await refreshHomeserverStatus(hsUrl);
    } catch (err) {
      setErrorMsg(`Gagal melakukan Flush Outbox ke RTDB: ${getErrorMessage(err)}`);
    } finally {
      setHsActionBusy(null);
    }
  };

  const handleSwitchDatabaseMode = async (nextMode: 'HOMESERVER' | 'RTDB') => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setHsActionBusy('mode');
    try {
      const res = await api.homeserver.switchMode(nextMode, hsUrl, hsSecret);
      setHsActiveMode(nextMode);
      setSuccessMsg(
        nextMode === 'HOMESERVER'
          ? '🚀 Mode HOMESERVER DOCKER AKTIF! Seluruh baca/tulis 42+ OPD kini dilayani dari Homeserver (kuota RTDB dihemat >95%).'
          : `☁️ Berhasil kembali ke Mode FIREBASE RTDB (Safe Switch: ${res.flushInfo?.flushedCount || 0} path Outbox telah di-flush ke RTDB).`
      );
      await refreshHomeserverStatus(hsUrl);
    } catch (err) {
      setErrorMsg(`Gagal mengubah mode database: ${getErrorMessage(err)}`);
    } finally {
      setHsActionBusy(null);
    }
  };

  // Format timestamp helper: YYYYMMDD_HHMMSS
  const getFormattedTimestamp = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const formatTimestampWib = (val?: string) => {
    if (!val) return '-';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      return d.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) + ' WIB';
    } catch {
      return val;
    }
  };

  // Helper browser blob download
  const triggerJsonDownload = (dataObj: unknown, filename: string) => {
    const jsonStr = JSON.stringify(dataObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Load Security Logs
  const fetchSecurityLogs = async () => {
    try {
      const logs = await api.getSecurityLogs();
      if (Array.isArray(logs)) {
        setSecurityLogs(logs.reverse()); // show latest first
      } else {
        setSecurityLogs([]);
      }
    } catch (err) {
      console.error('Gagal memuat security logs:', err);
    } finally {
      setIsLogsLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') {
      // setState terjadi di callback promise, bukan sinkron di body effect.
      Promise.resolve().then(() => fetchSecurityLogs());
    }
  }, [user]);

  // Export full database handler
  const handleExportFullDatabase = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsExporting(true);

    try {
      const res = await api.exportFullDatabase();
      const exportData = (res as { data?: unknown })?.data || res;
      if (!exportData || (typeof exportData === 'object' && Object.keys(exportData).length === 0)) {
        throw new Error('Data backup yang dikembalikan dari server kosong.');
      }

      const filename = `backup_sianjab_${getFormattedTimestamp()}.json`;
      triggerJsonDownload(exportData, filename);
      setSuccessMsg(`Berhasil mengunduh full backup database (${filename}).`);
      
      // Reload security logs to reflect BACKUP_EXPORT event if recorded
      fetchSecurityLogs();
    } catch (err) {
      console.error('Export Database Error:', err);
      setErrorMsg(getErrorMessage(err) || 'Gagal mengeksport database. Silakan coba lagi.');
    } finally {
      setIsExporting(false);
    }
  };

  // Analyze parsed JSON for safety preview
  const analyzeBackupFile = (jsonContent: unknown, fileObj: File) => {
    const obj = (jsonContent && typeof jsonContent === 'object' ? jsonContent : {}) as Record<string, unknown>;
    const rawData = (obj.data ? obj.data : jsonContent) as Record<string, unknown>;

    if (typeof rawData !== 'object' || rawData === null) {
      throw new Error('File JSON tidak valid atau struktur tidak dikenali.');
    }

    const keys = Object.keys(rawData);
    if (keys.length === 0) {
      throw new Error('File JSON backup kosong (tidak ada data node).');
    }

    const yearNodes = keys.filter(k => /^\d{4}$/.test(k));
    const yearNodesCount = yearNodes.length;

    const entityStats: { entity: string; count: number }[] = [];

    // Analyze root level keys (e.g. users, referensiJabatan, settings)
    keys.forEach(key => {
      const val = rawData[key];
      if (Array.isArray(val)) {
        entityStats.push({ entity: key, count: val.length });
      } else if (val && typeof val === 'object') {
        const subCount = Object.keys(val).length;
        entityStats.push({ entity: key, count: subCount });
      }
    });

    const meta: BackupMetadata = {
      timestamp: (obj._exportMeta as Record<string, string> | undefined)?.timestamp || (obj.timestamp as string) || new Date(fileObj.lastModified).toLocaleString('id-ID'),
      exportedBy: (obj._exportMeta as Record<string, string> | undefined)?.exportedBy || (obj.exportedBy as string) || 'Unknown / Manual Export',
      version: (obj._exportMeta as Record<string, string> | undefined)?.version || (obj.version as string) || '1.0',
      yearNodesCount,
      entityStats,
      totalKeys: keys.length,
    };

    setBackupMeta(meta);
    setParsedBackupData(obj);
    setShowPreviewModal(true);
  };

  const processSelectedFile = (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!file.name.endsWith('.json')) {
      setErrorMsg('Format file harus .json!');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        analyzeBackupFile(parsed, file);
      } catch (err) {
        console.error('File Parse Error:', err);
        setErrorMsg(`Gagal membaca file JSON: ${getErrorMessage(err)}`);
        setSelectedFile(null);
      }
    };

    reader.onerror = () => {
      setErrorMsg('Gagal membaca file dari disk.');
      setSelectedFile(null);
    };

    reader.readAsText(file);
  };

  // Drag & Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  // Execute Restore with Emergency Auto-Backup
  const handleConfirmRestore = async () => {
    if (!parsedBackupData) return;

    setIsRestoring(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Step 1: Emergency Auto-Backup before overwrite
      try {
        const currentDataRes = await api.exportFullDatabase();
        const currentData = (currentDataRes as { data?: unknown })?.data || currentDataRes;
        if (currentData) {
          const autoBackupName = `auto_backup_sebelum_restore_${getFormattedTimestamp()}.json`;
          triggerJsonDownload(currentData, autoBackupName);
        }
      } catch (backupErr) {
        console.warn('Emergency auto-backup gagal sebelum restore, tetap melanjutkan restore:', backupErr);
      }

      // Step 2: Restore Full Database
      await api.restoreFullDatabase(parsedBackupData);

      setSuccessMsg('✅ Database berhasil dipulihkan (restore)! Semua cache telah disinkronkan ulang.');
      setShowPreviewModal(false);
      setSelectedFile(null);
      setParsedBackupData(null);
      setBackupMeta(null);

      // Reload security logs
      fetchSecurityLogs();
    } catch (err) {
      console.error('Restore Error:', err);
      setErrorMsg(`Gagal memulihkan database: ${getErrorMessage(err) || 'Terjadi kesalahan sistem.'}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // Guard loading & non-admin check
  if (isUserLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.headerCard}>
          <div className={styles.skeleton} style={{ height: '32px', width: '250px' }} />
        </div>
        <div className={styles.grid}>
          <div className={styles.skeleton} style={{ height: '220px', borderRadius: '16px' }} />
          <div className={styles.skeleton} style={{ height: '220px', borderRadius: '16px' }} />
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className={styles.container}>
        <div className={styles.alertDanger}>
          <span>🚫</span>
          <div>
            <strong>Akses Ditolak</strong>
            <p>Hanya Administrator / Superadmin yang memiliki izin untuk mengakses halaman Backup & Restore Database.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header Banner */}
      <div className={styles.headerCard}>
        <div>
          <h1 className={styles.headerTitle}>
            <span>💾</span> Backup & Restore Database
          </h1>
          <p className={styles.headerSubtitle}>
            Ekspor cadangan penuh snapshot Realtime Database dan pulihkan data sistem secara aman dengan fitur auto-backup darurat.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className={styles.alertDanger}>
          <span>⚠️</span>
          <div>
            <strong>Terjadi Kesalahan:</strong> {errorMsg}
          </div>
        </div>
      )}

      {successMsg && (
        <div className={styles.alertSuccess}>
          <span>🎉</span>
          <div>{successMsg}</div>
        </div>
      )}

      {/* Homeserver Docker Database & Tailscale Funnel Control Panel */}
      <div className={styles.card} style={{ marginBottom: '1.5rem', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
        <div className={styles.cardHeader} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 className={styles.cardTitle}>
            <span>🐳</span> Kontrol Database Homeserver Docker & Penghematan Kuota RTDB (Pengisian Serentak OPD)
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className={hsActiveMode === 'HOMESERVER' ? styles.badgeSuccess : styles.badgeInfo}>
              {hsActiveMode === 'HOMESERVER' ? '🟢 SUMBER UTAMA: HOMESERVER DOCKER' : '☁️ SUMBER UTAMA: FIREBASE RTDB'}
            </span>
            {hsStatus && !hsStatus.error && (
              <span className={styles.badgeInfo}>
                ⚡ Ping {hsStatus.latencyMs}ms | Outbox: {hsStatus.outbox?.dirtyCount || 0} path
              </span>
            )}
            <a
              href={hsUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.btnSecondary}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', textDecoration: 'none' }}
            >
              📊 Buka Live Monitor
            </a>
          </div>
        </div>
        <div className={styles.cardBody}>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', color: 'var(--muted-foreground, #64748b)', lineHeight: 1.55 }}>
            Saat pengisian serentak 42+ OPD berlangsung, alihkan sumber data utama ke <strong>Homeserver Docker (Port 3098 / Tailscale Funnel :8443)</strong>.
            Seluruh pembacaan menggunakan <em>Secondary Index O(1)</em> di RAM dan setiap penyimpanan dicatat ke <em>Outbox</em> lalu disinkronkan secara
            otomatis (<em>Write-Behind</em>) ke Firebase RTDB sebagai cadangan.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                URL Tailscale Funnel Homeserver
              </label>
              <input
                type="text"
                value={hsUrl}
                onChange={(e) => setHsUrl(e.target.value)}
                placeholder="https://bebaa-server-1.tail56d53d.ts.net:8443"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'var(--background, #fff)',
                  color: 'var(--foreground, #0f172a)',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Homeserver Admin Secret
              </label>
              <input
                type="password"
                value={hsSecret}
                onChange={(e) => setHsSecret(e.target.value)}
                placeholder="Homeserver Admin Secret"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'var(--background, #fff)',
                  color: 'var(--foreground, #0f172a)',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>

          {hsStatus && !hsStatus.error && (
            <div className={styles.statGrid} style={{ marginBottom: '1rem' }}>
              <div className={styles.statItem}>
                <div className={styles.statValue}>{hsStatus.counts?.jabatan?.toLocaleString('id-ID') || 0}</div>
                <div className={styles.statLabel}>Jabatan di RAM ({hsStatus.activeYearPreview})</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statValue}>{hsStatus.counts?.unitKerja || 0}</div>
                <div className={styles.statLabel}>Unit Kerja / OPD</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statValue}>{hsStatus.outbox?.dirtyCount || 0}</div>
                <div className={styles.statLabel}>Antrean Outbox ke RTDB</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statValue}>
                  {((hsStatus.traffic?.rtdbBytesSavedEstimate || 0) / (1024 * 1024)).toFixed(2)} MB
                </div>
                <div className={styles.statLabel}>Kuota RTDB Dihemat</div>
              </div>
            </div>
          )}

          {hsStatus?.error && (
            <div className={styles.alertWarning} style={{ marginBottom: '1rem', padding: '0.65rem 1rem' }}>
              <span>ℹ️</span>
              <span style={{ fontSize: '0.83rem' }}>
                Status Homeserver ({hsUrl}): <strong>{hsStatus.error}</strong>. Aplikasi tetap berjalan aman melalui Firebase RTDB (Cloud).
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              type="button"
              className={styles.btnPrimary}
              style={{ background: '#3b82f6', borderColor: '#3b82f6' }}
              onClick={handleSaveHomeserverConfig}
              disabled={hsLoading || !!hsActionBusy}
            >
              {hsActionBusy === 'save' ? '⏳ Menyimpan...' : '💾 Simpan & Terapkan URL'}
            </button>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => refreshHomeserverStatus(hsUrl)}
              disabled={hsLoading || !!hsActionBusy}
            >
              {hsLoading ? '⏳ Mengecek...' : '🔄 Cek Koneksi Funnel'}
            </button>

            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handlePullFromRtdbToHomeserver}
              disabled={!!hsActionBusy}
            >
              {hsActionBusy === 'pull' ? '⏳ Menarik Data RTDB...' : '1️⃣ Tarik Data RTDB ke Homeserver (Seed)'}
            </button>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleFlushOutboxToRtdb}
              disabled={!!hsActionBusy}
            >
              {hsActionBusy === 'flush' ? '⏳ Menyinkronkan Outbox...' : '2️⃣ Flush Outbox ke RTDB Sekarang'}
            </button>

            {hsActiveMode !== 'HOMESERVER' ? (
              <button
                type="button"
                className={styles.btnPrimary}
                style={{ background: '#10b981', borderColor: '#10b981' }}
                onClick={() => handleSwitchDatabaseMode('HOMESERVER')}
                disabled={!!hsActionBusy}
              >
                {hsActionBusy === 'mode' ? '⏳ Mengaktifkan...' : '3️⃣ Aktifkan Mode HOMESERVER DOCKER (Utama)'}
              </button>
            ) : (
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => handleSwitchDatabaseMode('RTDB')}
                disabled={!!hsActionBusy}
              >
                {hsActionBusy === 'mode' ? '⏳ Flushing & Beralih...' : '☁️ Safe Switch Kembali ke Mode FIREBASE RTDB'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid Features: Backup & Restore */}
      <div className={styles.grid}>
        {/* Export Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <span>📤</span> Ekspor Full Backup
            </h2>
            <span className={styles.badgeInfo}>System Snapshot</span>
          </div>
          <div className={styles.cardBody}>
            <div style={{
              background: 'rgba(234, 179, 8, 0.08)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start'
            }}>
              <span style={{ fontSize: '1.25rem' }}>⚠️</span>
              <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--foreground)' }}>
                <strong>PERINGATAN RESMI ARSIP DATABASE:</strong><br />
                Berkas cadangan JSON ini memuat seluruh data formasi jabatan, analisis beban kerja, dan unit kerja Pemerintah Kabupaten Muaro Jambi. Harap simpan berkas di media penyimpanan resmi yang aman. Demi standar privasi, kredensial sensitif (kunci API AI & hash password) secara otomatis disanitasi oleh sistem saat diunduh.
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted-foreground, #64748b)', lineHeight: '1.5' }}>
              Unduh salinan lengkap seluruh database sistem dalam bentuk file JSON terstruktur. File ini mencakup struktur OPD, Jabatan, ABK, Referensi, User, dan Pengaturan.
            </p>
            <div className={styles.alertWarning} style={{ padding: '0.75rem 1rem' }}>
              <span>ℹ️</span>
              <span style={{ fontSize: '0.82rem' }}>
                Disarankan untuk melakukan ekspor backup secara berkala sebelum melakukan perubahan struktur besar.
              </span>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
              <button
                id="btn-export-full-db"
                className={styles.btnPrimary}
                style={{ width: '100%' }}
                onClick={handleExportFullDatabase}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <span className={styles.spinner} /> Memproses Ekspor Database...
                  </>
                ) : (
                  <>
                    <span>💾</span> Unduh Full Backup Database (.json)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Restore Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <span>📥</span> Import & Restore Database
            </h2>
            <span className={styles.badgeDanger}>High Impact</span>
          </div>
          <div className={styles.cardBody}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted-foreground, #64748b)', lineHeight: '1.5' }}>
              Unggah file JSON backup untuk memulihkan seluruh data sistem. Pratinjau keamanan akan ditampilkan sebelum pemulihan diproses.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />

            <div
              className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.dropzoneIcon}>📁</div>
              <div className={styles.dropzoneText}>
                {selectedFile ? selectedFile.name : 'Tarik & lepas file backup (.json) di sini'}
              </div>
              <div className={styles.dropzoneSubtext}>atau klik untuk memilih file dari komputer Anda</div>
            </div>
          </div>
        </div>
      </div>

      {/* Security Audit Logs Section */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <span>🛡️</span> Riwayat & Log Aktivitas Keamanan
          </h2>
          <button
            className={styles.btnSecondary}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            onClick={fetchSecurityLogs}
            disabled={isLogsLoading}
          >
            🔄 Refresh Log
          </button>
        </div>
        <div className={styles.cardBody}>
          {isLogsLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.6 }}>
              <span className={styles.spinner} style={{ borderColor: 'var(--muted-foreground)', borderTopColor: 'transparent' }} />
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Memuat log keamanan...</p>
            </div>
          ) : securityLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground, #64748b)' }}>
              Belum ada catatatan log aktivitas keamanan.
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Aktor / User</th>
                    <th>Event</th>
                    <th>Detail Aktivitas</th>
                    <th>IP / Modul</th>
                  </tr>
                </thead>
                <tbody>
                  {securityLogs.slice(0, 15).map((log, idx) => {
                    const eventName = log.event || log.action || 'ACTIVITY';
                    const isRestore = eventName.includes('RESTORE');
                    const isBackup = eventName.includes('BACKUP') || eventName.includes('EXPORT');

                    return (
                      <tr key={log.id || idx}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                          {formatTimestampWib(log.timestamp || log.createdAt)}
                        </td>
                        <td>
                          <strong>{log.username || log.user || 'System Admin'}</strong>
                        </td>
                        <td>
                          {isRestore ? (
                            <span className={styles.badgeDanger}>⚠️ {eventName}</span>
                          ) : isBackup ? (
                            <span className={styles.badgeSuccess}>💾 {eventName}</span>
                          ) : (
                            <span className={styles.badgeInfo}>{eventName}</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{log.details || log.description || '-'}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--muted-foreground, #64748b)' }}>
                          {log.ip || 'Admin Dashboard'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Safety Preview Modal */}
      {showPreviewModal && backupMeta && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <span>🔍</span> Safety Preview & Konfirmasi Restore
              </h3>
              <button
                className={styles.btnSecondary}
                style={{ border: 'none', padding: '0.2rem 0.6rem', fontSize: '1.2rem' }}
                onClick={() => {
                  setShowPreviewModal(false);
                  setSelectedFile(null);
                  setParsedBackupData(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              {/* Alert Warning */}
              <div className={styles.alertWarning}>
                <span style={{ fontSize: '1.5rem' }}>🚨</span>
                <div>
                  <strong>Peringatan Penting Penimpaan Data:</strong>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
                    Proses restore akan <strong>MENIMPA (OVERWRITE)</strong> seluruh data live saat ini dengan isi file backup.
                    Sebelum restore dijalankan, sistem akan <strong>otomatis mengunduh auto-backup darurat</strong> data live saat ini.
                  </p>
                </div>
              </div>

              {/* File Info */}
              <div style={{ background: 'hsla(var(--primary, 217), 50%, 50%, 0.04)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border, rgba(0,0,0,0.08))' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>📄 Informasi File Backup:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <div><strong>Nama File:</strong> {selectedFile?.name}</div>
                  <div><strong>Ukuran File:</strong> {selectedFile ? (selectedFile.size / 1024).toFixed(1) + ' KB' : '-'}</div>
                  <div><strong>Waktu Snapshot:</strong> {backupMeta.timestamp}</div>
                  <div><strong>Versi / Pengunggah:</strong> {backupMeta.exportedBy}</div>
                </div>
              </div>

              {/* Statistics Grid */}
              <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem' }}>📊 Ringkasan Isi Data Backup:</h4>
              <div className={styles.statGrid}>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{backupMeta.totalKeys}</div>
                  <div className={styles.statLabel}>Total Node Utama</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{backupMeta.yearNodesCount}</div>
                  <div className={styles.statLabel}>Tahun Anggaran</div>
                </div>
              </div>

              {/* Detailed Entities Breakdown */}
              <div className={styles.tableWrapper} style={{ maxHeight: '180px', overflowY: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Entitas / Node Data</th>
                      <th>Jumlah Item / Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupMeta.entityStats.map((st, i) => (
                      <tr key={i}>
                        <td><strong>{st.entity}</strong></td>
                        <td><span className={styles.badgeInfo}>{st.count} record/item</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.btnSecondary}
                onClick={() => {
                  setShowPreviewModal(false);
                  setSelectedFile(null);
                  setParsedBackupData(null);
                }}
                disabled={isRestoring}
              >
                Batal
              </button>
              <button
                id="btn-confirm-restore"
                className={styles.btnDanger}
                onClick={handleConfirmRestore}
                disabled={isRestoring}
              >
                {isRestoring ? (
                  <>
                    <span className={styles.spinner} /> Memulihkan Database...
                  </>
                ) : (
                  <>
                    ⚠️ Konfirmasi & Restore Database
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
