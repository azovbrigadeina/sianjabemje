'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Root Error:', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      backgroundColor: '#f8fafc',
      color: '#0f172a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'center'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        padding: '2.5rem',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        maxWidth: '500px',
        width: '100%',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', color: '#1e293b' }}>
          Terjadi Kesalahan Aplikasi
        </h2>
        <p style={{ fontSize: '0.95rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: '1.5' }}>
          {error?.message || 'Aplikasi mengalami kendala teknis saat memuat komponen ini.'}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.65rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
          >
            🔄 Coba Lagi
          </button>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              padding: '0.65rem 1.5rem',
              backgroundColor: '#f1f5f9',
              color: '#475569',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
          >
            🏠 Halaman Utama
          </button>
        </div>
      </div>
    </div>
  );
}
