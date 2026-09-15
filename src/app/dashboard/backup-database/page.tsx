'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '@/lib/UserContext';
import { api } from '@/lib/api';
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

export default function BackupDatabasePage() {
  const { user, isLoading: isUserLoading } = useUser();
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // File upload & preview state
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<any>(null);
  const [backupMeta, setBackupMeta] = useState<BackupMetadata | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Security logs state
  const [securityLogs, setSecurityLogs] = useState<SecurityLogItem[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Format timestamp helper: YYYYMMDD_HHMMSS
  const getFormattedTimestamp = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  // Helper browser blob download
  const triggerJsonDownload = (dataObj: any, filename: string) => {
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
    setIsLogsLoading(true);
    try {
      const logs = await api.getSecurityLogs();
      if (Array.isArray(logs)) {
        setSecurityLogs(logs.reverse()); // show latest first
      } else {
        setSecurityLogs([]);
      }
    } catch (err: any) {
      console.error('Gagal memuat security logs:', err);
    } finally {
      setIsLogsLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchSecurityLogs();
    }
  }, [user]);

  // Export full database handler
  const handleExportFullDatabase = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsExporting(true);

    try {
      const res = await api.exportFullDatabase();
      const exportData = (res as any)?.data || res;
      if (!exportData || (typeof exportData === 'object' && Object.keys(exportData).length === 0)) {
        throw new Error('Data backup yang dikembalikan dari server kosong.');
      }

      const filename = `backup_sianjab_${getFormattedTimestamp()}.json`;
      triggerJsonDownload(exportData, filename);
      setSuccessMsg(`Berhasil mengunduh full backup database (${filename}).`);
      
      // Reload security logs to reflect BACKUP_EXPORT event if recorded
      fetchSecurityLogs();
    } catch (err: any) {
      console.error('Export Database Error:', err);
      setErrorMsg(err.message || 'Gagal mengeksport database. Silakan coba lagi.');
    } finally {
      setIsExporting(false);
    }
  };

  // Analyze parsed JSON for safety preview
  const analyzeBackupFile = (jsonContent: any, fileObj: File) => {
    const rawData = jsonContent.data ? jsonContent.data : jsonContent;

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
      timestamp: jsonContent._exportMeta?.timestamp || jsonContent.timestamp || new Date(fileObj.lastModified).toLocaleString('id-ID'),
      exportedBy: jsonContent._exportMeta?.exportedBy || jsonContent.exportedBy || 'Unknown / Manual Export',
      version: jsonContent._exportMeta?.version || jsonContent.version || '1.0',
      yearNodesCount,
      entityStats,
      totalKeys: keys.length,
    };

    setBackupMeta(meta);
    setParsedBackupData(jsonContent);
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
      } catch (err: any) {
        console.error('File Parse Error:', err);
        setErrorMsg(`Gagal membaca file JSON: ${err.message}`);
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
        const currentData = (currentDataRes as any)?.data || currentDataRes;
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
    } catch (err: any) {
      console.error('Restore Error:', err);
      setErrorMsg(`Gagal memulihkan database: ${err.message || 'Terjadi kesalahan sistem.'}`);
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
                          {log.timestamp || log.createdAt || '-'}
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
