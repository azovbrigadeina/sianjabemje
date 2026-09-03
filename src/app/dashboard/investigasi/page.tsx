"use client";

import { useState, useEffect, useMemo } from "react";
import styles from "./investigasi.module.css";
import { api } from "@/lib/api";
import { Jabatan, ReferensiJabatan, UnitKerja } from "@/lib/types";
import { analyzeAnomali, AnomaliItem } from "@/lib/investigasiUtils";
import Link from "next/link";

export default function InvestigasiPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jabatans, setJabatans] = useState<Jabatan[]>([]);
  const [referensis, setReferensis] = useState<ReferensiJabatan[]>([]);
  const [unitKerjas, setUnitKerjas] = useState<UnitKerja[]>([]);

  const [activeTab, setActiveTab] = useState<'typo' | 'disparitas' | 'outlier'>('typo');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOpd, setSelectedOpd] = useState<string>('ALL');

  // Quick Fix Modal State
  const [editingAnomali, setEditingAnomali] = useState<AnomaliItem | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editKelas, setEditKelas] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const bulk = await api.getBulkData(['unitKerja', 'jabatan', 'referensiJabatan']);
        setUnitKerjas(bulk.unitKerja || []);
        setJabatans(bulk.jabatan || []);
        setReferensis(bulk.referensiJabatan || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat data investigasi');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const auditResult = useMemo(() => {
    return analyzeAnomali(jabatans, referensis, unitKerjas);
  }, [jabatans, referensis, unitKerjas]);

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

  const handleOpenEdit = (item: AnomaliItem) => {
    setEditingAnomali(item);
    setEditNama(item.rekomendasi || item.namaJabatan);
    setEditKelas(item.kelasDominan || item.kelasJabatan);
  };

  const handleSaveEdit = async () => {
    if (!editingAnomali) return;
    try {
      setSaving(true);
      await api.updateJabatan(editingAnomali.jabatanId, {
        namaJabatan: editNama,
        kelasJabatan: Number(editKelas),
      });

      // Update local state directly
      setJabatans(prev =>
        prev.map(j => (j.id === editingAnomali.jabatanId ? { ...j, namaJabatan: editNama, kelasJabatan: Number(editKelas) } : j))
      );
      setEditingAnomali(null);
    } catch (err) {
      alert("Gagal mengupdate jabatan: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
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
            {(activeTab === 'typo' ? filteredTypo : activeTab === 'disparitas' ? filteredDisparitas : filteredOutlier).length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
                  ✅ Tidak ditemukan anomali pada kategori ini.
                </td>
              </tr>
            ) : (
              (activeTab === 'typo' ? filteredTypo : activeTab === 'disparitas' ? filteredDisparitas : filteredOutlier).map(item => (
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
                  </td>
                  <td>
                    <span className={`${styles.badge} ${
                      item.severity === 'Tinggi' ? styles.badgeTinggi : item.severity === 'Sedang' ? styles.badgeSedang : styles.badgeRendah
                    }`}>
                      {item.severity}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className={styles.actionBtn} onClick={() => handleOpenEdit(item)}>
                        ✏️ Koreksi
                      </button>
                      <Link href={`/dashboard/organisasi?unitId=${item.unitKerjaId}`} className={styles.actionBtn} style={{ background: '#6b7280', textDecoration: 'none' }}>
                        🗺️ Peta
                      </Link>
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
              Unit: <strong>{editingAnomali.opdNama}</strong>
            </p>

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
    </div>
  );
}
