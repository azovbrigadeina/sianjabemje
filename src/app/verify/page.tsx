'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getVerificationRecord, VerificationRecord } from '@/lib/verification';

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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navigation Bar Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-decoration-none">
            <span className="font-extrabold text-xl bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              SianjabABK EM-JE
            </span>
            <span className="text-[10px] bg-gradient-to-r from-purple-500 to-blue-500 text-white font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
              AI Powered
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link href="/" className="hover:text-blue-600 transition-colors">Beranda</Link>
            <Link href="/organisasi" className="hover:text-blue-600 transition-colors">Struktur Organisasi</Link>
            <Link href="/verify" className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5">Cek Keabsahan Dokumen</Link>
            <button 
              onClick={() => setShowContactModal(true)} 
              className="hover:text-blue-600 transition-colors bg-transparent border-0 cursor-pointer text-slate-600 font-medium"
            >
              Kontak Kami
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-10">
        {/* Form Pencarian Kode Verifikasi */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800">Layanan Cek Keabsahan Dokumen</h1>
            <p className="text-slate-500 text-xs mt-1 max-w-lg mx-auto">
              Sistem Terpadu Analisis Jabatan & Beban Kerja (SianjabABK EM-JE)<br/>
              <strong>Bagian Organisasi Pemerintah Kabupaten Muaro Jambi</strong>
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Contoh: BAGORMJ-20260806-A1B2C3"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Cek Keabsahan
            </button>
          </form>
        </div>

        {/* Dynamic Status Display */}
        {loading ? (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="animate-pulse flex flex-col items-center">
              <div className="w-12 h-12 bg-slate-200 rounded-full mb-3"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-slate-200 rounded w-1/3"></div>
            </div>
          </div>
        ) : !searched ? (
          <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-6 text-center text-slate-600 text-sm">
            <div className="font-semibold text-blue-900 mb-1">Panduan Pengecekan Dokumen:</div>
            <div>Masukkan Kode Verifikasi unik berawalan <code className="bg-white px-2 py-0.5 rounded border border-blue-200 font-mono text-blue-700">BAGORMJ-</code> yang tertera pada bagian bawah cetakan atau dokumen cetak resmi.</div>
          </div>
        ) : record ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-green-50 border-b border-green-100 p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mb-3 shadow-sm border border-green-200">
                ✓
              </div>
              <h2 className="text-lg font-bold text-green-800">DOKUMEN RESMI & TERVERIFIKASI</h2>
              <p className="text-green-700 text-xs mt-1">Terdaftar sah dalam database Sistem Informasi SianjabABK</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kode Verifikasi</span>
                <span className="text-blue-600 font-bold font-mono">{record.code}</span>
              </div>

              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Jenis Laporan</span>
                <span className="text-slate-800 font-semibold">{record.documentType}</span>
              </div>
              
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Perangkat Daerah (OPD)</span>
                <span className="text-slate-800 font-medium">{record.opdName}</span>
              </div>

              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Judul Dokumen</span>
                <span className="text-slate-800 font-medium">{record.title}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Waktu Cetak</div>
                  <div className="text-slate-800 text-xs">{new Date(record.createdAt).toLocaleString('id-ID')}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Dicetak Oleh</div>
                  <div className="text-slate-800 text-xs">{record.printedBy || 'Operator Sianjab'}</div>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 p-4 border-t border-slate-100 text-xs text-slate-500 text-center">
              Bagian Organisasi Sekretariat Daerah<br/>Pemerintah Kabupaten Muaro Jambi
            </div>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-200 text-center">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
              ✕
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">KODE DOKUMEN TIDAK DITEMUKAN</h2>
            <p className="text-slate-600 text-xs max-w-md mx-auto mb-4">
              Kode verifikasi <strong className="text-red-600 font-mono">{urlCode}</strong> tidak terdaftar dalam sistem atau belum pernah diterbitkan.
            </p>
            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl max-w-md mx-auto text-left">
              Pastikan Anda memasukkan Kode Verifikasi lengkap berawalan <code>BAGORMJ-</code> atau memindai QR Code resmi dari dokumen cetak instansi.
            </div>
          </div>
        )}
      </main>

      {/* Modal Kontak Kami */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
            <button 
              onClick={() => setShowContactModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-xl font-bold bg-transparent border-0 cursor-pointer"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Kontak & Layanan Informasi</h3>
            <p className="text-slate-600 text-xs mb-4">
              Bagian Organisasi Sekretariat Daerah Kabupaten Muaro Jambi
            </p>
            <div className="space-y-3 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>📍 <strong>Alamat:</strong> Kompleks Perkantoran Pemkab Muaro Jambi, Sengeti</div>
              <div>✉️ <strong>Email:</strong> organisasi@muarojambikab.go.id</div>
              <div>🏛️ <strong>Layanan:</strong> Analisis Jabatan & Beban Kerja (SianjabABK EM-JE)</div>
            </div>
            <button 
              onClick={() => setShowContactModal(false)}
              className="mt-5 w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl transition-all border-0 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        © 2026 Bagian Organisasi Pemerintah Kabupaten Muaro Jambi. All rights reserved.
      </footer>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center p-4">Loading verification page...</div>}>
      <VerificationContent />
    </Suspense>
  );
}
