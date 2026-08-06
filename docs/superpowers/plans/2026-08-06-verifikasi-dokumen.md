# Verifikasi Dokumen Laporan BAGORMJ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan sistem keabsahan dan verifikasi dokumen laporan (Analisis Jabatan & ABK) dengan Kode Verifikasi unik `BAGORMJ-YYYYMMDD-[HASH_6]`, QR Code pada cetakan/DOCX, dan Halaman Verifikasi Publik `/verify/[code]`.

**Architecture:** Membangun modul utility verifikasi (`src/lib/verification.ts`), komponen footer keabsahan & QR Code (`src/components/DocumentVerificationFooter.tsx`), integrasi pada cetakan (`window.print()`) dan ekspor DOCX, serta Halaman Next.js Publik (`src/app/verify/[code]/page.tsx`).

**Tech Stack:** Next.js, React, TypeScript, `qrcode.react` (atau Canvas/SVG QR Generator), `docx` library.

## Global Constraints

- Kode Verifikasi ber-prefix `BAGORMJ-` (Bagian Organisasi Kabupaten Muaro Jambi).
- Sistem Terpadu Analisis Jabatan & Beban Kerja Pemerintah Kabupaten Muaro Jambi (SianjabABK EM-JE).
- Halaman verifikasi publik `/verify/[code]` dapat diakses tanpa login.

---

### Task 1: Modul Utility Generator & Storage Kode Verifikasi (`src/lib/verification.ts`)

**Files:**
- Create: `src/lib/verification.ts`

**Interfaces:**
- Produces: 
  - `generateVerificationCode(documentType: string, opdName: string, title: string, metadata?: Record<string, any>): VerificationRecord`
  - `getVerificationRecord(code: string): VerificationRecord | null`

- [ ] **Step 1: Buat file `src/lib/verification.ts` dengan interface dan fungsi generator**

```typescript
export interface VerificationRecord {
  code: string;
  documentType: string;
  opdName: string;
  title: string;
  createdAt: string;
  printedBy?: string;
  metadata?: Record<string, any>;
}

export function generateVerificationCode(
  documentType: string,
  opdName: string,
  title: string,
  printedBy?: string,
  metadata?: Record<string, any>
): VerificationRecord {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
  const code = `BAGORMJ-${dateStr}-${randomHash}`;
  
  const record: VerificationRecord = {
    code,
    documentType,
    opdName,
    title,
    createdAt: new Date().toISOString(),
    printedBy: printedBy || 'Operator Sianjab',
    metadata
  };

  try {
    const existingStr = typeof window !== 'undefined' ? localStorage.getItem('sianjab_verification_logs') : null;
    const logs: Record<string, VerificationRecord> = existingStr ? JSON.parse(existingStr) : {};
    logs[code] = record;
    if (typeof window !== 'undefined') {
      localStorage.setItem('sianjab_verification_logs', JSON.stringify(logs));
    }
  } catch (e) {
    console.error('Failed to save verification record:', e);
  }

  return record;
}

export function getVerificationRecord(code: string): VerificationRecord | null {
  try {
    if (typeof window === 'undefined') return null;
    const existingStr = localStorage.getItem('sianjab_verification_logs');
    if (!existingStr) return null;
    const logs: Record<string, VerificationRecord> = JSON.parse(existingStr);
    return logs[code] || null;
  } catch (e) {
    console.error('Failed to read verification record:', e);
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/verification.ts
git commit -m "feat: add verification code generator utility for BAGORMJ"
```

---

### Task 2: Komponent Footer Verification & QR Code (`src/components/DocumentVerificationFooter.tsx`)

**Files:**
- Create: `src/components/DocumentVerificationFooter.tsx`

**Interfaces:**
- Consumes: `VerificationRecord` dari `src/lib/verification.ts`
- Produces: React Component `<DocumentVerificationFooter record={record} />`

- [ ] **Step 1: Buat Komponen Footer Verifikasi dengan QR Code**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DocumentVerificationFooter.tsx
git commit -m "feat: add DocumentVerificationFooter component with QR code"
```

---

### Task 3: Halaman Verifikasi Publik (`src/app/verify/[code]/page.tsx`)

**Files:**
- Create: `src/app/verify/[code]/page.tsx`

**Interfaces:**
- Consumes: `getVerificationRecord` dari `src/lib/verification.ts`

- [ ] **Step 1: Buat Halaman Verifikasi Publik `/verify/[code]`**

```tsx
'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getVerificationRecord, VerificationRecord } from '@/lib/verification';

export default function PublicVerificationPage() {
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/verify/[code]/page.tsx
git commit -m "feat: add public verification page /verify/[code]"
```

---

### Task 4: Integrasi Verifikasi Dokumen pada Ekspor DOCX (`src/lib/exportDocx.ts`)

**Files:**
- Modify: `src/lib/exportDocx.ts`

- [ ] **Step 1: Tambahkan paragraf catatan keabsahan BAGORMJ pada `exportDocx.ts`**

Tambahkan fungsi pembuat kode verifikasi `generateVerificationCode` dan bagian footer keabsahan dokumen di akhir penulisan file Word `.docx`:

```typescript
import { generateVerificationCode } from "@/lib/verification";

// Di dalam fungsi exportDocx:
const verifyRecord = generateVerificationCode("Analisis Jabatan & ABK", opdNama || "OPD", jabatan.namaJabatan);

// Tambahkan paragraf footer keabsahan:
new Paragraph({
  children: [
    new TextRun({ text: "--------------------------------------------------------------------------------------------------\n", color: "CCCCCC" }),
    new TextRun({ text: "BAGIAN ORGANISASI PEMERINTAH KABUPATEN MUARO JAMBI\n", bold: true, size: 18 }),
    new TextRun({ text: `Dokumen Resmi SianjabABK EM-JE. Kode Keabsahan: ${verifyRecord.code}\n`, size: 18, color: "0284C7" }),
    new TextRun({ text: `Verifikasi keaslian dokumen dapat diakses secara online pada tautan portal resmi.`, size: 16, italic: true, color: "64748B" }),
  ],
  spacing: { before: 400 },
}),
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/exportDocx.ts
git commit -m "feat: integrate BAGORMJ document verification text into DOCX export"
```

---

## Verification Plan

### Automated Build Check
- Run: `npm run build`
- Verify static export builds cleanly with new route `/verify/[code]`.

### Manual Verification
- Buka halaman Cetak / Export Laporan.
- Cek hasil cetak dan export Word: pastikan footer keabsahan `BAGORMJ-YYYYMMDD-XXXXXX` muncul.
- Akses halaman `/verify/BAGORMJ-YYYYMMDD-XXXXXX` di browser dan pastikan status **DOKUMEN RESMI & TERVERIFIKASI** muncul secara rinci.
