'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getVerificationRecord, VerificationRecord } from '@/lib/verification';

export default function PublicVerificationClient() {
  const params = useParams();
  const code = (params?.code as string) || '';
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (code) {
      const found = getVerificationRecord(code);
      setRecord(found);
      setLoading(false);
    }
  }, [code]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F8FAFC',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        maxWidth: '560px',
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
        padding: '32px',
        border: '1px solid #E2E8F0'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px 0' }}>
            SIANJAB-ABK EM-JE
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
            Sistem Terpadu Analisis Jabatan & Beban Kerja<br />
            <strong>Pemerintah Kabupaten Muaro Jambi — Bagian Organisasi</strong>
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #F1F5F9', margin: '20px 0' }} />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748B' }}>
            Memeriksa keabsahan dokumen...
          </div>
        ) : record ? (
          <div>
            {/* Status Badge Valid */}
            <div style={{
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              marginBottom: '24px'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>✓</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#166534' }}>
                DOKUMEN RESMI & TERVERIFIKASI
              </div>
              <div style={{ fontSize: '12px', color: '#15803D', marginTop: '2px' }}>
                Dokumen ini terdaftar sah dalam database Sistem Informasi SianjabABK
              </div>
            </div>

            {/* Details Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                <span style={{ color: '#64748B' }}>Kode Verifikasi</span>
                <span style={{ fontWeight: '700', color: '#0284C7' }}>{record.code}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                <span style={{ color: '#64748B' }}>Jenis Laporan</span>
                <span style={{ fontWeight: '600', color: '#1E293B' }}>{record.documentType}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                <span style={{ color: '#64748B' }}>Perangkat Daerah (OPD)</span>
                <span style={{ fontWeight: '600', color: '#1E293B' }}>{record.opdName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                <span style={{ color: '#64748B' }}>Judul Dokumen</span>
                <span style={{ fontWeight: '600', color: '#1E293B' }}>{record.title}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                <span style={{ color: '#64748B' }}>Waktu Cetak</span>
                <span style={{ color: '#334155' }}>{new Date(record.createdAt).toLocaleString('id-ID')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Dicetak Oleh</span>
                <span style={{ color: '#334155' }}>{record.printedBy}</span>
              </div>
            </div>
          </div>
        ) : (
          /* Status Badge Invalid */
          <div style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>✕</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#991B1B' }}>
              KODE VERIFIKASI TIDAK DITEMUKAN
            </div>
            <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '6px' }}>
              Dokumen dengan kode <strong>{code}</strong> tidak terdaftar atau belum diterbitkan secara sah.
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '32px', fontSize: '11px', color: '#94A3B8' }}>
          © Bagian Organisasi Pemerintah Kabupaten Muaro Jambi
        </div>
      </div>
    </div>
  );
}
