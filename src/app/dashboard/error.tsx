'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Dashboard Error:', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '2rem',
      color: 'var(--text-main, #0f172a)',
      textAlign: 'center'
    }}>
      <div style={{
        backgroundColor: 'var(--card-bg, #ffffff)',
        padding: '2.5rem',
        borderRadius: '16px',
        boxShadow: 'var(--card-shadow, 0 10px 25px -5px rgba(0, 0, 0, 0.08))',
        maxWidth: '520px',
        width: '100%',
        border: '1px solid var(--border-color, #e2e8f0)'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Gagal Memuat Halaman Dashboard
        </h3>
        <p style={{ fontSize: '0.92rem', opacity: 0.75, marginBottom: '1.5rem', lineHeight: '1.5' }}>
          {error?.message || 'Terjadi kesalahan saat memuat data di halaman ini. Silakan coba muat ulang.'}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.65rem 1.4rem',
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
              transition: 'opacity 0.2s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            🔄 Coba Lagi
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.65rem 1.4rem',
              backgroundColor: 'transparent',
              color: 'var(--text-main, #334155)',
              border: '1px solid var(--border-color, #cbd5e1)',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            🔃 Refresh Halaman
          </button>
        </div>
      </div>
    </div>
  );
}
