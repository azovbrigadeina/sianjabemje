"use client";

import { useState, useEffect, useMemo } from "react";
import styles from "./ModalDuplikasiUnit.module.css";
import { api } from "@/lib/api";
import { UnitKerja } from "@/lib/types";

interface ModalDuplikasiUnitProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (targetUnitId?: string) => void;
  unitKerjas: UnitKerja[];
  jabatans?: any[];
}

export default function ModalDuplikasiUnit({
  isOpen,
  onClose,
  onSuccess,
  unitKerjas,
  jabatans: initialJabatans,
}: ModalDuplikasiUnitProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<'createNew' | 'existing'>('createNew');
  const [sourceUnitId, setSourceUnitId] = useState<string>('');
  
  // Mode createNew fields
  const [newNama, setNewNama] = useState<string>('');
  const [newKode, setNewKode] = useState<string>('');
  const [newParentId, setNewParentId] = useState<string>('');

  // Mode existing field
  const [targetUnitId, setTargetUnitId] = useState<string>('');

  // Local jabatans cache for counting
  const [localJabatans, setLocalJabatans] = useState<any[]>(initialJabatans || []);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch jabatans if not provided as props
  useEffect(() => {
    if (!isOpen) return;
    if (initialJabatans && initialJabatans.length > 0) {
      setLocalJabatans(initialJabatans);
      return;
    }
    let isMounted = true;
    api.getBulkData(['jabatan']).then(data => {
      if (isMounted && data.jabatan) {
        setLocalJabatans(data.jabatan);
      }
    }).catch(err => {
      console.warn("Gagal memuat jabatans untuk modal duplikasi:", err);
    });
    return () => { isMounted = false; };
  }, [isOpen, initialJabatans]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setErrorMsg(null);
      setIsSubmitting(false);
      setNewNama('');
      setNewKode('');
      setTargetUnitId('');
      if (!sourceUnitId && unitKerjas.length > 0) {
        // Default to first unit
        setSourceUnitId(unitKerjas[0].id);
      }
    }
  }, [isOpen]);

  // Update default parentId when sourceUnitId changes
  useEffect(() => {
    if (!sourceUnitId) return;
    const srcUnit = unitKerjas.find(u => u.id === sourceUnitId);
    if (srcUnit) {
      // Default newParentId to the same parent as source unit
      setNewParentId(srcUnit.parentId || '');
    }
  }, [sourceUnitId, unitKerjas]);

  // Count jabatans in source unit
  const sourceJabatansCount = useMemo(() => {
    if (!sourceUnitId) return 0;
    return localJabatans.filter(j => j.unitKerjaId === sourceUnitId).length;
  }, [sourceUnitId, localJabatans]);

  // Lookups for labels
  const sourceUnit = useMemo(() => {
    return unitKerjas.find(u => u.id === sourceUnitId);
  }, [sourceUnitId, unitKerjas]);

  const sourceParentOpd = useMemo(() => {
    if (!sourceUnit?.parentId) return null;
    return unitKerjas.find(u => u.id === sourceUnit.parentId);
  }, [sourceUnit, unitKerjas]);

  const targetUnit = useMemo(() => {
    return unitKerjas.find(u => u.id === targetUnitId);
  }, [targetUnitId, unitKerjas]);

  const targetParentOpd = useMemo(() => {
    if (mode === 'createNew') {
      if (!newParentId) return null;
      return unitKerjas.find(u => u.id === newParentId);
    } else {
      if (!targetUnit?.parentId) return null;
      return unitKerjas.find(u => u.id === targetUnit.parentId);
    }
  }, [mode, newParentId, targetUnit, unitKerjas]);

  // Sorted list of UnitKerjas for dropdowns
  const sortedUnits = useMemo(() => {
    return [...unitKerjas].sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
  }, [unitKerjas]);

  // Top level OPDs for parent selection
  const topLevelOpds = useMemo(() => {
    return sortedUnits.filter(u => !u.parentId);
  }, [sortedUnits]);

  // Candidates for target unit (mode existing)
  const targetCandidates = useMemo(() => {
    return sortedUnits.filter(u => u.id !== sourceUnitId);
  }, [sortedUnits, sourceUnitId]);

  if (!isOpen) return null;

  const handleNextToStep2 = () => {
    setErrorMsg(null);
    if (!sourceUnitId) {
      setErrorMsg("Harap pilih Unit Kerja sumber yang akan disalin.");
      return;
    }
    if (sourceJabatansCount === 0) {
      setErrorMsg(`Unit sumber "${sourceUnit?.nama || sourceUnitId}" tidak memiliki jabatan untuk diduplikasi.`);
      return;
    }

    if (mode === 'createNew') {
      if (!newNama.trim()) {
        setErrorMsg("Nama unit kerja baru wajib diisi.");
        return;
      }
    } else {
      if (!targetUnitId) {
        setErrorMsg("Harap pilih Unit Kerja sasaran.");
        return;
      }
    }

    setStep(2);
  };

  const handleExecuteDuplicate = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const payload = {
        sourceUnitId,
        mode,
        targetData: mode === 'createNew'
          ? {
              nama: newNama.trim(),
              kode: newKode.trim(),
              parentId: newParentId || undefined,
            }
          : {
              targetUnitId,
            }
      };

      const res = await api.duplicateUnitKerja(payload);
      if (res && res.success) {
        onSuccess(res.targetUnitId);
        onClose();
      } else {
        throw new Error(res?.message || "Gagal menduplikasi unit kerja.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || String(err));
      setIsSubmitting(false);
    }
  };

  // Helper text for confirmation
  const targetNameDisplay = mode === 'createNew' ? newNama.trim() : (targetUnit?.nama || 'Unit Sasaran');
  const parentNameDisplay = targetParentOpd ? targetParentOpd.nama : 'Tingkat OPD Mandiri (Tanpa Induk)';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>
            <span>📋</span> Duplikasi Unit Kerja & Struktur Jabatan
          </h3>
          <button className={styles.closeBtn} onClick={onClose} disabled={isSubmitting}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {errorMsg && (
            <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
              ❌ {errorMsg}
            </div>
          )}

          {step === 1 ? (
            <>
              {/* Mode Toggle */}
              <div className={styles.modeToggle}>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${mode === 'createNew' ? styles.modeBtnActive : ''}`}
                  onClick={() => setMode('createNew')}
                >
                  ➕ Buat Unit Baru & Salin
                </button>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${mode === 'existing' ? styles.modeBtnActive : ''}`}
                  onClick={() => setMode('existing')}
                >
                  📂 Salin ke Unit yang Ada
                </button>
              </div>

              {/* Source Unit Selection */}
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  1. Pilih Unit Kerja Sumber (Template Salinan)
                </label>
                <select
                  className={styles.select}
                  value={sourceUnitId}
                  onChange={(e) => setSourceUnitId(e.target.value)}
                >
                  <option value="">-- Pilih Unit Kerja Sumber --</option>
                  {sortedUnits.map((u) => {
                    const parent = u.parentId ? unitKerjas.find(p => p.id === u.parentId) : null;
                    return (
                      <option key={u.id} value={u.id}>
                        {u.nama} {parent ? `(${parent.nama})` : ''}
                      </option>
                    );
                  })}
                </select>
                <div className={styles.helperText}>
                  Unit sumber saat ini memiliki <strong>{sourceJabatansCount}</strong> jabatan aktif beserta seluruh uraian Anjab.
                </div>
              </div>

              {/* Target Unit Form (Mode Create New) */}
              {mode === 'createNew' ? (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>2. Nama Unit Kerja Baru</label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="Contoh: Puskesmas Bahar Selatan Baru / Bidang Pengendalian"
                      value={newNama}
                      onChange={(e) => setNewNama(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>3. Kode Unit Kerja Baru (Opsional)</label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="Contoh: PKM_BHR_02 / BID_KHL_01"
                      value={newKode}
                      onChange={(e) => setNewKode(e.target.value)}
                    />
                    <div className={styles.helperText}>
                      Biarkan kosong jika ingin kode di-generate otomatis oleh sistem.
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>4. Naungan Induk OPD</label>
                    <select
                      className={styles.select}
                      value={newParentId}
                      onChange={(e) => setNewParentId(e.target.value)}
                    >
                      <option value="">-- Tingkat OPD Mandiri (Tanpa Induk) --</option>
                      {topLevelOpds.map((opd) => (
                        <option key={opd.id} value={opd.id}>
                          {opd.nama}
                        </option>
                      ))}
                    </select>
                    <div className={styles.helperText}>
                      Pilih OPD yang menaungi unit ini (misal Dinas Kesehatan untuk Puskesmas, atau Sekretariat Daerah untuk Bagian).
                    </div>
                  </div>
                </>
              ) : (
                /* Target Unit Form (Mode Existing) */
                <div className={styles.formGroup}>
                  <label className={styles.label}>2. Pilih Unit Kerja Sasaran</label>
                  <select
                    className={styles.select}
                    value={targetUnitId}
                    onChange={(e) => setTargetUnitId(e.target.value)}
                  >
                    <option value="">-- Pilih Unit Kerja Sasaran --</option>
                    {targetCandidates.map((u) => {
                      const parent = u.parentId ? unitKerjas.find(p => p.id === u.parentId) : null;
                      return (
                        <option key={u.id} value={u.id}>
                          {u.nama} {parent ? `(${parent.nama})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className={styles.helperText}>
                    Seluruh susunan jabatan dari unit sumber akan disalin ke dalam unit kerja sasaran ini.
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Step 2: Konfirmasi Berlapis & Review Ringkasan */
            <>
              <div className={styles.reviewBox}>
                <div className={styles.reviewTitle}>
                  <span>⚠️</span> Ringkasan Verifikasi Duplikasi
                </div>
                <div className={styles.reviewItem}>
                  <span className={styles.reviewLabel}>Unit Sumber</span>
                  <span className={styles.reviewValue}>{sourceUnit?.nama || sourceUnitId}</span>
                </div>
                <div className={styles.reviewItem}>
                  <span className={styles.reviewLabel}>Tindakan</span>
                  <span className={styles.reviewValue}>
                    {mode === 'createNew' ? 'Buat Unit Baru & Salin Jabatan' : 'Salin ke Unit yang Ada'}
                  </span>
                </div>
                <div className={styles.reviewItem}>
                  <span className={styles.reviewLabel}>Unit Tujuan / Sasaran</span>
                  <span className={styles.reviewValue} style={{ color: '#1d4ed8' }}>
                    {targetNameDisplay}
                  </span>
                </div>
                <div className={styles.reviewItem}>
                  <span className={styles.reviewLabel}>Induk OPD Naungan</span>
                  <span className={styles.reviewValue}>{parentNameDisplay}</span>
                </div>
                <div className={styles.reviewItem}>
                  <span className={styles.reviewLabel}>Jumlah Jabatan Disalin</span>
                  <span className={styles.reviewValue}>
                    <strong>{sourceJabatansCount}</strong> Jabatan + Uraian Anjab Lengkap
                  </span>
                </div>
                <div className={styles.reviewItem} style={{ borderBottom: 'none' }}>
                  <span className={styles.reviewLabel}>Status Beban Kerja (ABK)</span>
                  <span className={styles.reviewValue} style={{ color: '#059669' }}>
                    Pegawai Riil Direset ke 0 (Template Bersih)
                  </span>
                </div>
              </div>

              {/* Explicit Confirmation Question Prompt */}
              <div className={styles.confirmNotice}>
                {mode === 'createNew' ? (
                  <span>
                    👉 <strong>Konfirmasi:</strong> Apakah Anda yakin akan menduplikasi seluruh jabatan dari{" "}
                    <u>{sourceUnit?.nama}</u> lalu membuat unit baru ke{" "}
                    <u>{targetNameDisplay}</u> di bawah naungan{" "}
                    <u>{parentNameDisplay}</u>?
                  </span>
                ) : (
                  <span>
                    👉 <strong>Konfirmasi:</strong> Apakah Anda yakin akan menduplikasi seluruh jabatan dari{" "}
                    <u>{sourceUnit?.nama}</u> ke unit sasaran{" "}
                    <u>{targetNameDisplay}</u> di bawah naungan{" "}
                    <u>{parentNameDisplay}</u>?
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {step === 1 ? (
            <>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Batal
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleNextToStep2}
              >
                Lanjut ke Konfirmasi ➡️
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setStep(1)}
                disabled={isSubmitting}
              >
                ⬅️ Kembali & Periksa Ulang
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                style={{ backgroundColor: '#059669' }}
                onClick={handleExecuteDuplicate}
                disabled={isSubmitting}
              >
                {isSubmitting ? "⏳ Sedang Memproses..." : "✅ Ya, Lanjutkan Duplikasi"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
