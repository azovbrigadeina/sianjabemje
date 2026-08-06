'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getVerificationRecord, VerificationRecord } from '@/lib/verification';
import styles from './verify.module.css';

function VerificationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlCode = searchParams.get('code') || '';
  const token = searchParams.get('d') || '';

  const [inputCode, setInputCode] = useState(urlCode);
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  useEffect(() => {
    if (urlCode) {
      setInputCode(urlCode);
      const rec = getVerificationRecord(urlCode, token || undefined);
      setRecord(rec);
      setSearched(true);
    } else {
      setRecord(null);
      setSearched(false);
    }
    setLoading(false);
  }, [urlCode, token]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = inputCode.trim();
    if (!cleanCode) return;
    router.push(`/verify?code=${encodeURIComponent(cleanCode)}`);
  };

  return (
    <div className={styles.verifyContainer}>
      {/* Header Navigation Bar */}
      <nav className={`${styles.nav} glass-panel`}>
        <Link href="/" className={styles.logo}>
          <span className="text-gradient">SianjabABK EM-JE</span>
          <span className={styles.aiBadgeLogo}>AI Powered</span>
        </Link>
        <div className={styles.navLinks}>
          <Link href="/">Beranda</Link>
          <Link href="/organisasi">Struktur Organisasi</Link>
          <Link href="/verify" className={styles.activeNavLink}>Cek Keabsahan Dokumen</Link>
          <button 
            type="button"
            onClick={() => setShowContactModal(true)} 
            className={styles.navBtn}
          >
            Kontak Kami
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className={styles.mainContent}>
        {/* Search Card */}
        <div className={`${styles.searchCard} glass-panel animate-fade-in`}>
          <div className={styles.searchHeader}>
            <div className={styles.shieldIcon}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <h1 className={styles.pageTitle}>Layanan Cek Keabsahan Dokumen</h1>
            <p className={styles.pageSubtitle}>
              Sistem Terpadu Analisis Jabatan & Beban Kerja (SianjabABK EM-JE)<br/>
              <strong>Bagian Organisasi Pemerintah Kabupaten Muaro Jambi</strong>
            </p>
          </div>

          <form onSubmit={handleSearch} className={styles.searchForm}>
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Masukkan Kode Verifikasi (Contoh: BAGORMJ-20260806-A1B2C3)"
              className={styles.searchInput}
              required
            />
            <button type="submit" className={styles.searchBtn}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Cek Keabsahan
            </button>
          </form>
        </div>

        {/* Dynamic Verification Result */}
        {loading ? (
          <div className={`${styles.searchCard} glass-panel`} style={{ padding: '3rem' }}>
            <div style={{ opacity: 0.6 }}>Memuat data verifikasi...</div>
          </div>
        ) : !searched ? (
          <div className={styles.guideBox}>
            <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>📌 Panduan Pengecekan Dokumen Resmi:</div>
            <div>
              Masukkan Kode Verifikasi unik berawalan <span className={styles.codeBadge}>BAGORMJ-</span> yang tertera di bagian footer cetakan atau dokumen fisik hasil unduhan SianjabABK.
            </div>
          </div>
        ) : record ? (
          <div className={`${styles.resultCard} glass-panel animate-fade-in`}>
            <div className={styles.validHeader}>
              <div className={styles.validIcon}>✓</div>
              <div className={styles.validTitle}>DOKUMEN RESMI & TERVERIFIKASI</div>
              <div className={styles.validSubtitle}>Dokumen ini terdaftar sah dalam Sistem Informasi SianjabABK Kabupaten Muaro Jambi</div>
            </div>

            <div className={styles.detailsList}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Kode Verifikasi</span>
                <span className={styles.detailValue} style={{ color: '#2563eb', fontFamily: 'monospace', fontWeight: 800 }}>{record.code}</span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Jenis Laporan</span>
                <span className={styles.detailValue}>{record.documentType}</span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Perangkat Daerah (OPD)</span>
                <span className={styles.detailValue}>{record.opdName}</span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Judul Dokumen</span>
                <span className={styles.detailValue}>{record.title}</span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Waktu Penerbitan / Cetak</span>
                <span className={styles.detailValue}>{new Date(record.createdAt).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}</span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Pencetak / Operator</span>
                <span className={styles.detailValue}>{record.printedBy || 'Operator Sianjab'}</span>
              </div>
            </div>

            <div className={styles.cardFooter}>
              Bagian Organisasi Sekretariat Daerah<br/>
              Pemerintah Kabupaten Muaro Jambi
            </div>
          </div>
        ) : (
          <div className={`${styles.resultCard} glass-panel animate-fade-in`}>
            <div className={styles.invalidHeader}>
              <div className={styles.invalidIcon}>✕</div>
              <div className={styles.invalidTitle}>KODE VERIFIKASI TIDAK DITEMUKAN</div>
              <div style={{ fontSize: '0.875rem', color: '#991b1b', marginTop: '0.35rem' }}>
                Kode <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{urlCode}</span> tidak terdaftar dalam sistem.
              </div>
            </div>
            <div style={{ padding: '1.5rem', fontSize: '0.85rem', opacity: 0.8, textAlign: 'center', lineHeight: 1.6 }}>
              Pastikan Anda memasukkan Kode Verifikasi lengkap yang diawali dengan <strong>BAGORMJ-</strong> atau memindai QR Code resmi dari dokumen asli yang dikeluarkan Bagian Organisasi.
            </div>
          </div>
        )}
      </main>

      {/* Modal Kontak Kami */}
      {showContactModal && (
        <div className={styles.modalOverlay} onClick={() => setShowContactModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setShowContactModal(false)}>✕</button>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--foreground)' }}>
              Kontak & Layanan Informasi
            </h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '1.25rem' }}>
              Bagian Organisasi Sekretariat Daerah Kabupaten Muaro Jambi
            </p>
            <div style={{ background: 'rgba(15, 23, 42, 0.03)', padding: '1rem', borderRadius: '12px', fontSize: '0.85rem', lineHeight: 1.7 }}>
              <div>📍 <strong>Alamat:</strong> Kompleks Perkantoran Pemkab Muaro Jambi, Sengeti</div>
              <div>✉️ <strong>Email:</strong> organisasi@muarojambikab.go.id</div>
              <div>🏛️ <strong>Layanan:</strong> Analisis Jabatan & Beban Kerja (SianjabABK EM-JE)</div>
            </div>
          </div>
        </div>
      )}

      {/* Page Footer */}
      <footer className={styles.pageFooter}>
        © 2026 Bagian Organisasi Pemerintah Kabupaten Muaro Jambi. All rights reserved.
      </footer>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Memuat halaman...</div>}>
      <VerificationContent />
    </Suspense>
  );
}
