'use client';

import React, { useState, useRef, useEffect } from 'react';

interface EditorHeaderProps {
  jabatanData: any;
  abkMap: Record<string, any>;
  isReadOnly?: boolean;
  aiLoading?: boolean;
  downloadingWord?: boolean;
  downloadingSiasn?: boolean;
  loadingEditor?: boolean;
  onResetAnjab?: () => void;
  onTriggerAI?: () => void;
  onImportExcel?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportAnjabAsli?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate?: () => void;
  onDownloadWord?: () => void;
  onDownloadSiasn?: () => void;
  onOpenAbkModal?: () => void;
}

export default function EditorHeader({
  jabatanData,
  abkMap,
  isReadOnly = false,
  aiLoading = false,
  downloadingWord = false,
  downloadingSiasn = false,
  loadingEditor = false,
  onResetAnjab,
  onTriggerAI,
  onImportExcel,
  onImportAnjabAsli,
  onDownloadTemplate,
  onDownloadWord,
  onDownloadSiasn,
  onOpenAbkModal,
}: EditorHeaderProps) {
  const [openDropdown, setOpenDropdown] = useState<'impor' | 'unduh' | null>(null);
  const importExcelRef = useRef<HTMLInputElement>(null);
  const importAnjabRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or ESC key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!jabatanData) return null;

  const isAbkCalculated = Boolean(abkMap[jabatanData.id]);

  return (
    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--glass-border, #e2e8f0)' }}>
      {/* Row 1: Job Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
        <span
          style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            color: '#ffffff',
            fontSize: '0.7rem',
            padding: '3px 10px',
            borderRadius: '20px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'inline-block',
          }}
        >
          {jabatanData.jenisJabatan || 'Jabatan'}
        </span>
      </div>

      {/* Row 2: Job Title & Reset Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <h2
          style={{
            fontSize: '1.3rem',
            fontWeight: 700,
            margin: 0,
            letterSpacing: '-0.02em',
            color: 'var(--foreground, #0f172a)',
          }}
        >
          {jabatanData.namaJabatan || '— Memuat Jabatan —'}
        </h2>

        {!isReadOnly && onResetAnjab && (
          <button
            onClick={onResetAnjab}
            disabled={loadingEditor}
            title="Reset seluruh isian manual pada jabatan ini kembali ke kondisi awal"
            style={{
              background: '#fff3f3',
              color: '#e11d48',
              border: '1px solid #fecdd3',
              padding: '0.3rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.78rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ffe4e6';
              e.currentTarget.style.borderColor = '#fda4af';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fff3f3';
              e.currentTarget.style.borderColor = '#fecdd3';
            }}
          >
            <span>🧹</span> Reset Isian
          </button>
        )}
      </div>

      {/* Row 3: Meta Info + Independent Status ABK (Left) & Grouped Action Buttons (Right) */}
      <div
        ref={dropdownRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          position: 'relative',
        }}
      >
        {/* Left Side: Metadata & Independent Status ABK */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.82rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>
              Kode: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>{jabatanData.kodeJabatan}</span>
            </span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span>
              Kelas: <strong style={{ color: '#0f172a' }}>{jabatanData.kelasJabatan}</strong>
            </span>
          </div>

          {/* Independent Prominent Status ABK Badge */}
          <div
            onClick={onOpenAbkModal}
            title="Status perhitungan Analisis Beban Kerja (ABK) untuk jabatan ini. Klik untuk mengelola ABK."
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.3rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: onOpenAbkModal ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              background: isAbkCalculated ? '#f0fdf4' : '#fffbeb',
              color: isAbkCalculated ? '#15803d' : '#b45309',
              border: isAbkCalculated ? '1px solid #bbf7d0' : '1px solid #fde68a',
              boxShadow: isAbkCalculated
                ? '0 1px 3px rgba(34, 197, 94, 0.12)'
                : '0 1px 3px rgba(245, 158, 11, 0.12)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = isAbkCalculated
                ? '0 3px 8px rgba(34, 197, 94, 0.25)'
                : '0 3px 8px rgba(245, 158, 11, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = isAbkCalculated
                ? '0 1px 3px rgba(34, 197, 94, 0.12)'
                : '0 1px 3px rgba(245, 158, 11, 0.12)';
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: isAbkCalculated ? '#22c55e' : '#f59e0b',
                boxShadow: isAbkCalculated ? '0 0 6px #22c55e' : '0 0 6px #f59e0b',
                display: 'inline-block',
              }}
            />
            <span>Status ABK: <strong>{isAbkCalculated ? 'Terhitung' : 'Belum Dihitung'}</strong></span>
          </div>
        </div>

        {/* Right Side: Grouped Action Buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Action 1: Draf AI (Special AI Generator Action) */}
          {!isReadOnly && onTriggerAI && (
            <button
              onClick={onTriggerAI}
              disabled={aiLoading}
              title="Susun draf Anjab otomatis menggunakan AI Engine berbasis Tugas Pokok"
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(126, 34, 206, 0.2)',
                transition: 'all 0.2s ease',
                opacity: aiLoading ? 0.75 : 1,
              }}
            >
              <span>✨</span> {aiLoading ? 'Memproses AI...' : 'Draf AI'}
            </button>
          )}

          {/* Action Group 2: Impor Data Dropdown */}
          {!isReadOnly && (onImportExcel || onImportAnjabAsli) && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setOpenDropdown(openDropdown === 'impor' ? null : 'impor')}
                title="Pilihan impor data Anjab dari file Excel (.xlsx)"
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>📤</span> Impor Data <span style={{ fontSize: '0.65rem', marginLeft: '2px' }}>▼</span>
              </button>

              {/* Hidden File Inputs */}
              {onImportExcel && (
                <input
                  ref={importExcelRef}
                  type="file"
                  accept=".xlsx, .xls"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    onImportExcel(e);
                    setOpenDropdown(null);
                  }}
                />
              )}
              {onImportAnjabAsli && (
                <input
                  ref={importAnjabRef}
                  type="file"
                  accept=".xlsx, .xls"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    onImportAnjabAsli(e);
                    setOpenDropdown(null);
                  }}
                />
              )}

              {/* Impor Dropdown Menu */}
              {openDropdown === 'impor' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: '240px',
                    background: 'var(--background, #ffffff)',
                    border: '1px solid var(--glass-border, #e2e8f0)',
                    borderRadius: '10px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
                    padding: '6px',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    animation: 'fadeIn 0.15s ease-out',
                  }}
                >
                  {onImportExcel && (
                    <button
                      onClick={() => importExcelRef.current?.click()}
                      title="Unggah & impor data Anjab dari file Excel template standar"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.6rem',
                        transition: 'background 0.15s ease',
                        color: 'var(--foreground, #1e293b)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(37, 99, 235, 0.08)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: '1.1rem', marginTop: '2px' }}>📤</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Impor Excel Template</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Dari template standar Excel</div>
                      </div>
                    </button>
                  )}

                  {onImportAnjabAsli && (
                    <button
                      onClick={() => importAnjabRef.current?.click()}
                      title="Unggah & impor data dari file Excel dokumen Anjab format asli Pemda"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.6rem',
                        transition: 'background 0.15s ease',
                        color: 'var(--foreground, #1e293b)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: '1.1rem', marginTop: '2px' }}>📑</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Import Anjab Asli</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Format Excel dokumen Anjab asli</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Group 3: Unduh / Ekspor Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setOpenDropdown(openDropdown === 'unduh' ? null : 'unduh')}
              title="Pilihan unduh dokumen Word, SIASN, & template Excel"
              style={{
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>📥</span> Unduh <span style={{ fontSize: '0.65rem', marginLeft: '2px' }}>▼</span>
            </button>

            {/* Unduh Dropdown Menu */}
            {openDropdown === 'unduh' && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: '260px',
                  background: 'var(--background, #ffffff)',
                  border: '1px solid var(--glass-border, #e2e8f0)',
                  borderRadius: '10px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
                  padding: '6px',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  animation: 'fadeIn 0.15s ease-out',
                }}
              >
                {/* Item 1: Unduh Word */}
                {onDownloadWord && (
                  <button
                    onClick={() => {
                      onDownloadWord();
                      setOpenDropdown(null);
                    }}
                    disabled={downloadingWord}
                    title="Unduh hasil Analisis Jabatan & ABK lengkap dalam format Microsoft Word (.docx)"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      textAlign: 'left',
                      cursor: downloadingWord ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.6rem',
                      transition: 'background 0.15s ease',
                      opacity: downloadingWord ? 0.7 : 1,
                      color: 'var(--foreground, #1e293b)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: '1.1rem', marginTop: '2px' }}>📄</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        {downloadingWord ? 'Mengunduh Word...' : 'Unduh Word (.docx)'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Dokumen Anjab & ABK lengkap</div>
                    </div>
                  </button>
                )}

                {/* Item 2: Unduh SIASN */}
                {onDownloadSiasn && (
                  <button
                    onClick={() => {
                      onDownloadSiasn();
                      setOpenDropdown(null);
                    }}
                    disabled={downloadingSiasn}
                    title="Unduh data posisi jabatan sesuai format standar SIASN BKN"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      textAlign: 'left',
                      cursor: downloadingSiasn ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.6rem',
                      transition: 'background 0.15s ease',
                      opacity: downloadingSiasn ? 0.7 : 1,
                      color: 'var(--foreground, #1e293b)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(2, 132, 199, 0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: '1.1rem', marginTop: '2px' }}>📊</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        {downloadingSiasn ? 'Mengekspor SIASN...' : 'Unduh SIASN (.xlsx)'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Format standar SIASN BKN</div>
                    </div>
                  </button>
                )}

                {/* Item 3: Unduh Template */}
                {onDownloadTemplate && (
                  <button
                    onClick={() => {
                      onDownloadTemplate();
                      setOpenDropdown(null);
                    }}
                    title="Unduh template kosong Excel untuk pengisian data jabatan secara manual"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.6rem',
                      transition: 'background 0.15s ease',
                      color: 'var(--foreground, #1e293b)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(100, 116, 139, 0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: '1.1rem', marginTop: '2px' }}>📥</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Unduh Template Excel</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Template kosong pengisian manual</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
