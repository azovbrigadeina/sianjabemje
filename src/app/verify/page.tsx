'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getVerificationRecord, VerificationRecord } from '@/lib/verification';

function VerificationContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const token = searchParams.get('d');
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (code) {
      const rec = getVerificationRecord(code, token || undefined);
      setRecord(rec);
    }
    setLoading(false);
  }, [code, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="animate-pulse flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-200 rounded-full mb-4"></div>
            <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-red-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500 text-3xl">
            ✕
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Dokumen Tidak Ditemukan</h1>
          <p className="text-slate-600 mb-4 text-sm">
            Kode verifikasi <strong className="text-slate-800">{code || 'Kosong'}</strong> tidak terdaftar dalam sistem atau link tidak valid.
          </p>
          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg text-left">
            Pastikan Anda memindai QR Code dari dokumen cetak asli yang dikeluarkan oleh Bagian Organisasi, atau URL lengkap.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-blue-50 text-blue-600 rounded-xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Verifikasi Dokumen</h1>
          <p className="text-slate-500 text-sm mt-1">Sistem Terpadu Analisis Jabatan & Beban Kerja</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-green-50 border-b border-green-100 p-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mb-3 shadow-sm border border-green-200">
              ✓
            </div>
            <h2 className="text-lg font-bold text-green-800">DOKUMEN VALID</h2>
            <p className="text-green-600 text-xs mt-1">Kode: {record.code}</p>
          </div>
          
          <div className="p-6 space-y-4">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Jenis Dokumen</div>
              <div className="text-slate-800 font-medium">{record.documentType}</div>
            </div>
            
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Judul Dokumen</div>
              <div className="text-slate-800 font-medium">{record.title}</div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Unit Kerja / OPD</div>
              <div className="text-slate-800">{record.opdName}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Waktu Cetak</div>
                <div className="text-slate-800 text-sm">{new Date(record.createdAt).toLocaleString('id-ID')}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Dicetak Oleh</div>
                <div className="text-slate-800 text-sm">{record.printedBy || 'Operator Sianjab'}</div>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50 p-4 border-t border-slate-100 text-xs text-slate-500 text-center">
            Bagian Organisasi Sekretariat Daerah<br/>Pemerintah Kabupaten Muaro Jambi
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center p-4">Loading verification...</div>}>
      <VerificationContent />
    </Suspense>
  );
}
