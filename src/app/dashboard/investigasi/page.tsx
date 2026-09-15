"use client";

import { useState, useEffect, useMemo } from "react";
import styles from "./investigasi.module.css";
import { api } from "@/lib/api";
import { Jabatan, ReferensiJabatan, UnitKerja, AnomaliExclusion } from "@/lib/types";
import { analyzeAnomali, AnomaliItem, JENJANG_FUNGSIONAL } from "@/lib/investigasiUtils";
import Link from "next/link";

export default function InvestigasiPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jabatans, setJabatans] = useState<Jabatan[]>([]);
  const [referensis, setReferensis] = useState<ReferensiJabatan[]>([]);
  const [unitKerjas, setUnitKerjas] = useState<UnitKerja[]>([]);
  const [exclusions, setExclusions] = useState<AnomaliExclusion[]>([]);

  const [activeTab, setActiveTab] = useState<'typo' | 'disparitas' | 'outlier' | 'yatim' | 'dikecualikan'>('typo');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOpd, setSelectedOpd] = useState<string>('ALL');

  // Quick Fix Modal State
  const [editingAnomali, setEditingAnomali] = useState<AnomaliItem | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editJenis, setEditJenis] = useState('');
  const [editKelas, setEditKelas] = useState<number>(0);
  const [editUnitKerjaId, setEditUnitKerjaId] = useState('');
  const [saving, setSaving] = useState(false);

  // Permanent Delete Modal State
  const [deletingAnomali, setDeletingAnomali] = useState<AnomaliItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 1-Click Standardize State
  const [standardizingId, setStandardizingId] = useState<string | null>(null);

  // Interactive Reference Mapping Modal State
  const [mappingAnomali, setMappingAnomali] = useState<AnomaliItem | null>(null);
  const [selectedRefBase, setSelectedRefBase] = useState('');
  const [selectedJenjang, setSelectedJenjang] = useState('');
  const [refSearchQuery, setRefSearchQuery] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);

  // Exclude & Reset State
  const [excludingId, setExcludingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const bulk = await api.getBulkData(['unitKerja', 'jabatan', 'referensiJabatan', 'anomaliExclusion']);
        setUnitKerjas(bulk.unitKerja || []);
        setJabatans(bulk.jabatan || []);
        setReferensis(bulk.referensiJabatan || []);
        setExclusions(bulk.anomaliExclusion || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat data investigasi');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const auditResult = useMemo(() => {
    return analyzeAnomali(jabatans, referensis, unitKerjas, exclusions);
  }, [jabatans, referensis, unitKerjas, exclusions]);

  const sortedReferensis = useMemo(() => {
    return [...referensis].sort((a, b) => a.namaBase.localeCompare(b.namaBase));
  }, [referensis]);

  const filteredReferensis = useMemo(() => {
    if (!refSearchQuery.trim()) return sortedReferensis;
    const q = refSearchQuery.toLowerCase();
    return sortedReferensis.filter(r => r.namaBase.toLowerCase().includes(q));
  }, [sortedReferensis, refSearchQuery]);

  const filterList = (items: AnomaliItem[]) => {
    return items.filter(item => {
      const matchOpd = selectedOpd === 'ALL' || item.unitKerjaId === selectedOpd;
      const matchSearch =
        item.namaJabatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.opdNama.toLowerCase().includes(searchQuery.toLowerCase());
      return matchOpd && matchSearch;
    });
  };

  const filteredTypo = useMemo(() => filterList(auditResult.anomaliTypo), [auditResult, searchQuery, selectedOpd]);
  const filteredDisparitas = useMemo(() => filterList(auditResult.anomaliDisparitas), [auditResult, searchQuery, selectedOpd]);
  const filteredOutlier = useMemo(() => filterList(auditResult.anomaliOutlier), [auditResult, searchQuery, selectedOpd]);
  const filteredYatim = useMemo(() => filterList(auditResult.anomaliYatim), [auditResult, searchQuery, selectedOpd]);
  const filteredDikecualikan = useMemo(() => filterList(auditResult.anomaliDikecualikan), [auditResult, searchQuery, selectedOpd]);

  const handleOpenEdit = (item: AnomaliItem) => {
    setEditingAnomali(item);
    setEditNama(item.rekomendasi && item.type !== 'DATA_YATIM' ? item.rekomendasi : item.namaJabatan);
    setEditJenis(item.jenisJabatan || '');
    setEditKelas(item.kelasDominan || item.kelasJabatan);
    setEditUnitKerjaId(item.unitKerjaId || '');
  };

  const handleSaveEdit = async () => {
    if (!editingAnomali) return;
    try {
      setSaving(true);
      await api.updateJabatan(editingAnomali.jabatanId, {
        namaJabatan: editNama,
        jenisJabatan: editJenis,
        kelasJabatan: Number(editKelas),
        unitKerjaId: editUnitKerjaId,
      });

      // Update local state directly
      setJabatans(prev =>
        prev.map(j => (j.id === editingAnomali.jabatanId ? { ...j, namaJabatan: editNama, jenisJabatan: editJenis, kelasJabatan: Number(editKelas), unitKerjaId: editUnitKerjaId } : j))
      );
      setEditingAnomali(null);
    } catch (err) {
      alert("Gagal mengupdate jabatan: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePermanent = async () => {
    if (!deletingAnomali) return;
    try {
      setDeleting(true);
      await api.deleteEntity('jabatan', deletingAnomali.jabatanId);
      setJabatans(prev => prev.filter(j => j.id !== deletingAnomali.jabatanId));
      setDeletingAnomali(null);
    } catch (err) {
      alert("Gagal menghapus data jabatan: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeleting(false);
    }
  };

  // 1-Click Standardize Handler
  const handleQuickStandardize = async (item: AnomaliItem) => {
    if (!item.rekomendasi) return;
    try {
      setStandardizingId(item.id);
      await api.updateJabatan(item.jabatanId, {
        namaJabatan: item.rekomendasi,
      });

      // Update local state directly
      setJabatans(prev =>
        prev.map(j => (j.id === item.jabatanId ? { ...j, namaJabatan: item.rekomendasi! } : j))
      );
    } catch (err) {
      alert("Gagal menstandardkan jabatan: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setStandardizingId(null);
    }
  };

  // Open Reference Mapping Modal
  const handleOpenMapping = (item: AnomaliItem) => {
    setMappingAnomali(item);
    setRefSearchQuery('');

    const initialBase = item.rekomendasiBase || item.namaJabatan;
    const exactMatch = referensis.find(
      r => r.namaBase.toLowerCase() === initialBase.toLowerCase()
    );
    const partialMatch = !exactMatch
      ? referensis.find(
          r =>
            r.namaBase.toLowerCase().includes(initialBase.toLowerCase()) ||
            initialBase.toLowerCase().includes(r.namaBase.toLowerCase())
        )
      : null;

    setSelectedRefBase(exactMatch?.namaBase || partialMatch?.namaBase || '');
    setSelectedJenjang(item.parsedJenjang || '');
  };

  // Save Reference Mapping Handler
  const handleSaveMapping = async () => {
    if (!mappingAnomali || !selectedRefBase) return;
    const computedStandard = `${selectedRefBase}${selectedJenjang ? ' ' + selectedJenjang : ''}`.trim();
    if (!computedStandard) return;

    try {
      setSavingMapping(true);
      await api.updateJabatan(mappingAnomali.jabatanId, {
        namaJabatan: computedStandard,
      });

      // Update local state directly
      setJabatans(prev =>
        prev.map(j => (j.id === mappingAnomali.jabatanId ? { ...j, namaJabatan: computedStandard } : j))
      );
      setMappingAnomali(null);
    } catch (err) {
      alert("Gagal memetakan referensi jabatan: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingMapping(false);
    }
  };

  // Exclude Anomali Handler
  const handleExcludeAnomali = async (item: AnomaliItem) => {
    if (!confirm(`Kecualikan temuan anomali untuk "${item.namaJabatan}"?\nKondisi ini tidak akan lagi dianggap sebagai anomali.`)) return;
    try {
      setExcludingId(item.id);
      const payload = {
        jabatanId: item.jabatanId,
        unitKerjaId: item.unitKerjaId,
        namaJabatan: item.namaJabatan,
        type: item.type,
        pesan: item.pesan,
      };
      const res = await api.createEntity<AnomaliExclusion>('anomaliExclusion', payload);
      const createdExclusion: AnomaliExclusion = {
        id: res.id,
        ...payload,
        createdAt: new Date().toISOString(),
      };
      setExclusions(prev => [...prev, createdExclusion]);
    } catch (err) {
      alert("Gagal mengecualikan anomali: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExcludingId(null);
    }
  };

  // Reset Exclusion Handler
  const handleResetExclusion = async (item: AnomaliItem) => {
    if (!item.exclusionId) return;
    if (!confirm(`Batalkan pengecualian anomali untuk "${item.namaJabatan}"?\nData akan dikembalikan sebagai temuan anomali.`)) return;
    try {
      setResettingId(item.id);
      await api.deleteEntity('anomaliExclusion', item.exclusionId);
      setExclusions(prev => prev.filter(x => x.id !== item.exclusionId));
    } catch (err) {
      alert("Gagal mereset pengecualian: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setResettingId(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ padding: '2rem', textAlign: 'center' }}>🔄 Melakukan audit & analisa data anomali...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div style={{ color: 'red', padding: '1rem' }}>❌ {error}</div>
      </div>
    );
  }

  const currentTabItems =
    activeTab === 'typo'
      ? filteredTypo
      : activeTab === 'disparitas'
      ? filteredDisparitas
      : activeTab === 'outlier'
      ? filteredOutlier
      : activeTab === 'yatim'
      ? filteredYatim
      : filteredDikecualikan;

  return (
    <div className={styles.container}>
      {/* Metric Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>⚠️</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalAnomali}</div>
            <div className={styles.statLabel}>Total Anomali Ditemukan</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>📝</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalTypo}</div>
            <div className={styles.statLabel}>Typo & Format Ejaan</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>⚖️</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalDisparitas}</div>
            <div className={styles.statLabel}>Disparitas Kelas</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>🏛️</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalOutlier}</div>
            <div className={styles.statLabel}>Outlier Struktural</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(225, 29, 72, 0.1)', color: '#e11d48' }}>⛓️‍💥</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalYatim}</div>
            <div className={styles.statLabel}>Data Yatim (Tanpa OPD)</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(107, 114, 128, 0.1)', color: '#4b5563' }}>🚫</div>
          <div>
            <div className={styles.statValue}>{auditResult.summary.totalDikecualikan}</div>
            <div className={styles.statLabel}>Dikecualikan (Diabaikan)</div>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className={styles.controls}>
        <input
          type="text"
          className={styles.searchBox}
          placeholder="🔍 Cari nama jabatan atau OPD..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <select
          className={styles.selectBox}
          value={selectedOpd}
          onChange={e => setSelectedOpd(e.target.value)}
        >
          <option value="ALL">-- Semua OPD ({unitKerjas.length}) --</option>
          {unitKerjas.map(u => (
            <option key={u.id} value={u.id}>{u.nama}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'typo' ? styles.active : ''}`}
          onClick={() => setActiveTab('typo')}
        >
          Typo & Format ({filteredTypo.length})
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'disparitas' ? styles.active : ''}`}
          onClick={() => setActiveTab('disparitas')}
        >
          Disparitas Kelas ({filteredDisparitas.length})
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'outlier' ? styles.active : ''}`}
          onClick={() => setActiveTab('outlier')}
        >
          Outlier Struktural ({filteredOutlier.length})
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'yatim' ? styles.active : ''}`}
          onClick={() => setActiveTab('yatim')}
          style={{ color: activeTab === 'yatim' ? '#e11d48' : undefined, borderBottomColor: activeTab === 'yatim' ? '#e11d48' : undefined }}
        >
          ⛓️‍💥 Data Yatim ({filteredYatim.length})
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'dikecualikan' ? styles.active : ''}`}
          onClick={() => setActiveTab('dikecualikan')}
          style={{ color: activeTab === 'dikecualikan' ? '#4b5563' : undefined, borderBottomColor: activeTab === 'dikecualikan' ? '#4b5563' : undefined }}
        >
          🚫 Dikecualikan ({filteredDikecualikan.length})
        </button>
      </div>

      {/* Content Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>OPD / Unit Kerja</th>
              <th>Nama Jabatan Saat Ini</th>
              <th>Jenis Jabatan</th>
              <th>Kelas</th>
              <th>Analisa & Temuan</th>
              <th>Level Risk</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {currentTabItems.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
                  {activeTab === 'dikecualikan' ? 'ℹ️ Belum ada jabatan yang dikecualikan.' : '✅ Tidak ditemukan anomali pada kategori ini.'}
                </td>
              </tr>
            ) : (
              currentTabItems.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.opdNama}</strong></td>
                  <td>{item.namaJabatan}</td>
                  <td>{item.jenisJabatan}</td>
                  <td><span className={styles.badge} style={{ background: '#f3f4f6' }}>Kelas {item.kelasJabatan}</span></td>
                  <td>
                    {item.pesan}
                    {item.rekomendasi && (
                      <div style={{ fontSize: '0.8rem', color: '#2563eb', marginTop: '0.2rem' }}>
                        💡 Rekomendasi: <strong>{item.rekomendasi}</strong>
                      </div>
                    )}
                    {item.isExcluded && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        📅 Dikecualikan pada: {item.exclusionDate ? new Date(item.exclusionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${
                      item.isExcluded ? '' : item.severity === 'Tinggi' ? styles.badgeTinggi : item.severity === 'Sedang' ? styles.badgeSedang : styles.badgeRendah
                    }`} style={item.isExcluded ? { background: '#e5e7eb', color: '#4b5563' } : undefined}>
                      {item.isExcluded ? 'Dikecualikan' : item.severity}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {activeTab === 'dikecualikan' ? (
                        <button
                          className={styles.actionBtnResetExclusion}
                          onClick={() => handleResetExclusion(item)}
                          disabled={resettingId === item.id}
                          title="Kembalikan kondisi sebagai temuan anomali"
                        >
                          {resettingId === item.id ? '⏳...' : '🔄 Reset Kecualikan'}
                        </button>
                      ) : (
                        <>
                          {item.rekomendasi && item.type !== 'DATA_YATIM' && (
                            <button
                              className={styles.actionBtnStandard}
                              onClick={() => handleQuickStandardize(item)}
                              disabled={standardizingId === item.id}
                              title={`Standardkan nama menjadi: "${item.rekomendasi}"`}
                            >
                              {standardizingId === item.id ? '⏳...' : '✨ Standardkan'}
                            </button>
                          )}
                          {item.type === 'UNREFERENCED' && (
                            <button
                              className={styles.actionBtnMap}
                              onClick={() => handleOpenMapping(item)}
                              title="Petakan ke Master Referensi Jabatan"
                            >
                              🔗 Petakan
                            </button>
                          )}
                          <button className={styles.actionBtn} onClick={() => handleOpenEdit(item)}>
                            ✏️ Koreksi
                          </button>
                          <button
                            className={styles.actionBtnExclude}
                            onClick={() => handleExcludeAnomali(item)}
                            disabled={excludingId === item.id}
                            title="Abaikan / Kecualikan temuan ini dari daftar anomali"
                          >
                            {excludingId === item.id ? '⏳...' : '🚫 Kecualikan'}
                          </button>
                          {item.type === 'DATA_YATIM' ? (
                            <button
                              className={styles.actionBtnDelete}
                              onClick={() => setDeletingAnomali(item)}
                              title="Hapus permanen data jabatan yatim ini dari database"
                            >
                              🗑️ Hapus Permanen
                            </button>
                          ) : (
                            <Link href={`/dashboard/organisasi?unitId=${item.unitKerjaId}`} className={styles.actionBtn} style={{ background: '#6b7280', textDecoration: 'none' }}>
                              🗺️ Peta
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Quick Fix Modal */}
      {editingAnomali && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h3>✏️ Koreksi Cepat Jabatan</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Unit Kerja Saat Ini: <strong>{editingAnomali.opdNama}</strong>
            </p>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Hubungkan ke Unit Kerja / OPD</label>
              <select
                className={styles.selectBox}
                style={{ width: '100%' }}
                value={editUnitKerjaId}
                onChange={e => setEditUnitKerjaId(e.target.value)}
              >
                <option value="">-- Pilih Unit Kerja / OPD --</option>
                {unitKerjas.map(u => (
                  <option key={u.id} value={u.id}>{u.nama}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Nama Jabatan</label>
              <input
                type="text"
                className={styles.searchBox}
                style={{ width: '100%' }}
                value={editNama}
                onChange={e => setEditNama(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Jenis / Kategori Jabatan</label>
              <select
                className={styles.selectBox}
                style={{ width: '100%' }}
                value={editJenis}
                onChange={e => setEditJenis(e.target.value)}
              >
                <option value="">-- Pilih Jenis Jabatan --</option>
                <option value="Jabatan Pimpinan Tinggi">Jabatan Pimpinan Tinggi</option>
                <option value="Administrator">Administrator</option>
                <option value="Pengawas">Pengawas</option>
                <option value="Pelaksana">Pelaksana</option>
                <option value="Fungsional">Fungsional</option>
                <option value="Fungsional Keahlian">Fungsional Keahlian</option>
                <option value="Fungsional Keterampilan">Fungsional Keterampilan</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Kelas Jabatan</label>
              <input
                type="number"
                className={styles.searchBox}
                style={{ width: '100%' }}
                value={editKelas}
                onChange={e => setEditKelas(Number(e.target.value))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className={styles.actionBtn}
                style={{ background: '#9ca3af' }}
                onClick={() => setEditingAnomali(null)}
                disabled={saving}
              >
                Batal
              </button>
              <button
                className={styles.actionBtn}
                onClick={handleSaveEdit}
                disabled={saving}
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Reference Mapping Modal */}
      {mappingAnomali && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ maxWidth: '580px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🔗</span> Pemetaan Master Referensi Jabatan
              </h3>
              <button
                onClick={() => setMappingAnomali(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted, #6b7280)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: 'var(--bg-item-hover, #f3f4f6)', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)' }}>Unit Kerja: </span>
                <strong>{mappingAnomali.opdNama}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted, #6b7280)' }}>Jabatan Saat Ini: </span>
                <strong style={{ color: '#ef4444' }}>{mappingAnomali.namaJabatan}</strong>
                <span className={styles.badge} style={{ marginLeft: '0.5rem', background: '#e5e7eb' }}>
                  {mappingAnomali.jenisJabatan}
                </span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                1. Cari & Pilih Master Referensi Jabatan <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className={styles.searchBox}
                style={{ width: '100%', marginBottom: '0.5rem' }}
                placeholder="🔍 Ketik untuk memfilter master referensi..."
                value={refSearchQuery}
                onChange={e => setRefSearchQuery(e.target.value)}
              />
              <select
                className={styles.selectBox}
                style={{ width: '100%' }}
                value={selectedRefBase}
                onChange={e => setSelectedRefBase(e.target.value)}
              >
                <option value="">-- Pilih Master Referensi ({filteredReferensis.length} opsi) --</option>
                {selectedRefBase && !filteredReferensis.some(r => r.namaBase === selectedRefBase) && (
                  <option value={selectedRefBase}>{selectedRefBase} (Terpilih)</option>
                )}
                {filteredReferensis.map((r, idx) => (
                  <option key={`${r.id || r.namaBase}-${idx}`} value={r.namaBase}>
                    {r.namaBase} {r.jenisJabatan ? `(${r.jenisJabatan})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                2. Jenjang Fungsional (Opsional)
              </label>
              <select
                className={styles.selectBox}
                style={{ width: '100%' }}
                value={selectedJenjang}
                onChange={e => setSelectedJenjang(e.target.value)}
              >
                <option value="">-- Tanpa Jenjang (Pelaksana / Jabatan Tunggal) --</option>
                {JENJANG_FUNGSIONAL.map(j => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Preview Card */}
            <div className={styles.previewCard}>
              <div className={styles.previewLabel}>Preview Standar Nama Jabatan</div>
              <div className={styles.previewValue}>
                {selectedRefBase ? (
                  <span style={{ color: '#10b981' }}>
                    {`${selectedRefBase}${selectedJenjang ? ' ' + selectedJenjang : ''}`.trim()}
                  </span>
                ) : (
                  <span style={{ color: '#9ca3af', fontStyle: 'italic', fontWeight: 400 }}>
                    Pilih Master Referensi di atas untuk melihat preview
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className={styles.actionBtn}
                style={{ background: '#9ca3af' }}
                onClick={() => setMappingAnomali(null)}
                disabled={savingMapping}
              >
                Batal
              </button>
              <button
                className={styles.actionBtnStandard}
                onClick={handleSaveMapping}
                disabled={savingMapping || !selectedRefBase}
                style={{ opacity: savingMapping || !selectedRefBase ? 0.6 : 1 }}
              >
                {savingMapping ? 'Menyimpan...' : '💾 Simpan & Standardkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Modal */}
      {deletingAnomali && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ maxWidth: '450px' }}>
            <h3 style={{ color: '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🗑️</span> Konfirmasi Hapus Permanen
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-main, #374151)', margin: 0 }}>
              Apakah Anda yakin ingin menghapus permanen data jabatan yatim ini dari database?
            </p>
            <div style={{ background: '#fee2e2', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#991b1b' }}>
              <div style={{ fontWeight: 700 }}>{deletingAnomali.namaJabatan}</div>
              <div>Jenis: {deletingAnomali.jenisJabatan} | Kelas: {deletingAnomali.kelasJabatan}</div>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
              ⚠️ Tindakan ini menghapus data langsung dari database dan tidak dapat dibatalkan.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className={styles.actionBtn}
                style={{ background: '#9ca3af' }}
                onClick={() => setDeletingAnomali(null)}
                disabled={deleting}
              >
                Batal
              </button>
              <button
                className={styles.actionBtnDelete}
                onClick={handleDeletePermanent}
                disabled={deleting}
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus Permanen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
