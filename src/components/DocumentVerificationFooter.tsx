'use client';
import React from 'react';
import { VerificationRecord } from '@/lib/verification';

interface Props {
  record: VerificationRecord;
}

export const DocumentVerificationFooter: React.FC<Props> = ({ record }) => {
  const verifyUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/verify/${record.code}`
    : `https://sianjab.muarojambikab.go.id/verify/${record.code}`;

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verifyUrl)}`;

  return (
    <div style={{
      marginTop: '20px',
      paddingTop: '12px',
      borderTop: '2px dashed #CBD5E1',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      fontSize: '11px',
      color: '#334155',
      fontFamily: 'sans-serif'
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrImageUrl} alt="QR Code Verifikasi" width={75} height={75} style={{ borderRadius: '4px' }} />
      <div>
        <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#0F172A' }}>
          Sistem Terpadu Analisis Jabatan & Beban Kerja (SianjabABK EM-JE)
        </div>
        <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>
          Pemerintah Kabupaten Muaro Jambi — Bagian Organisasi
        </div>
        <div>
          Dokumen ini terdaftar secara digital dengan Kode Verifikasi: <strong style={{ color: '#0284C7' }}>{record.code}</strong>
        </div>
        <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
          Scan QR Code di atas atau akses <u>{verifyUrl}</u> untuk mengecek keabsahan dokumen fisik ini.
        </div>
      </div>
    </div>
  );
};
