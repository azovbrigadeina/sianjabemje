"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import { ReferensiJabatan } from "@/lib/types";

export default function ReferensiPage() {
  const [activeTab, setActiveTab] = useState<'Pelaksana' | 'Fungsional'>('Pelaksana');
  
  const [inputPelaksana, setInputPelaksana] = useState("");
  
  const [inputFungsional, setInputFungsional] = useState("");
  const [kategoriFungsional, setKategoriFungsional] = useState({
    keahlian: false,
    keterampilan: false
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  const [previewData, setPreviewData] = useState<ReferensiJabatan[]>([]);

  const [savedData, setSavedData] = useState<ReferensiJabatan[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [editingItem, setEditingItem] = useState<ReferensiJabatan | null>(null);
  const [editNamaBase, setEditNamaBase] = useState("");
  const [editKategori, setEditKategori] = useState<'Keahlian' | 'Keterampilan'>('Keahlian');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchSavedData = async () => {
    setIsLoadingData(true);
    try {
      const bulk = await api.getBulkData(['referensiJabatan']) as { referensiJabatan: ReferensiJabatan[] };
      setSavedData(bulk.referensiJabatan || []);
    } catch (err) {
      console.error("Failed to fetch referensi data:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchSavedData();
  }, []);

  const handleOpenEdit = (item: ReferensiJabatan) => {
    setEditingItem(item);
    setEditNamaBase(item.namaBase || "");
    setEditKategori((item.kategori as 'Keahlian' | 'Keterampilan') || 'Keahlian');
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editingItem.id) return;
    if (!editNamaBase.trim()) {
      setMessage({ type: 'error', text: 'Nama jabatan tidak boleh kosong.' });
      return;
    }

    setIsSavingEdit(true);
    try {
      const updatedData: ReferensiJabatan = {
        ...editingItem,
        namaBase: editNamaBase.trim(),
        kategori: editingItem.jenisJabatan === 'Fungsional' ? editKategori : undefined
      };

      await api.updateEntity('referensiJabatan', editingItem.id, updatedData);
      setSavedData(prev => prev.map(item => item.id === editingItem.id ? { ...item, ...updatedData } : item));
      setMessage({ type: 'success', text: 'Data referensi berhasil diperbarui.' });
      setEditingItem(null);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal memperbarui referensi.' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus referensi ini?")) return;
    try {
      await api.deleteEntity('referensiJabatan', id);
      setSavedData(prev => prev.filter(item => item.id !== id));
      setMessage({ type: 'success', text: 'Data referensi berhasil dihapus.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal menghapus referensi.' });
    }
  };

  const handlePreviewPelaksana = () => {
    const names = inputPelaksana.split(',').map(n => n.trim()).filter(n => n);
    const data: ReferensiJabatan[] = names.map(name => ({
      jenisJabatan: 'Pelaksana',
      namaBase: name
    }));
    setPreviewData(data);
    setMessage(null);
  };

  const handlePreviewFungsional = () => {
    const names = inputFungsional.split(',').map(n => n.trim()).filter(n => n);
    if (names.length > 0 && !kategoriFungsional.keahlian && !kategoriFungsional.keterampilan) {
      setMessage({ type: 'error', text: 'Pilih minimal satu kategori (Keahlian / Keterampilan) untuk Jabatan Fungsional' });
      return;
    }

    const data: ReferensiJabatan[] = [];
    names.forEach(name => {
      if (kategoriFungsional.keahlian) {
        data.push({
          jenisJabatan: 'Fungsional',
          namaBase: name,
          kategori: 'Keahlian'
        });
      }
      if (kategoriFungsional.keterampilan) {
        data.push({
          jenisJabatan: 'Fungsional',
          namaBase: name,
          kategori: 'Keterampilan'
        });
      }
    });
    
    setPreviewData(data);
    setMessage(null);
  };

  const handleSave = async () => {
    if (previewData.length === 0) {
      setMessage({ type: 'error', text: 'Tidak ada data untuk disimpan. Silakan klik Preview terlebih dahulu.' });
      return;
    }
    
    setIsLoading(true);
    setMessage(null);
    try {
      for (const item of previewData) {
        await api.createEntity('referensiJabatan', item);
      }
      
      setMessage({ type: 'success', text: `${previewData.length} data referensi berhasil disimpan ke database!` });
      
      if (activeTab === 'Pelaksana') setInputPelaksana("");
      else setInputFungsional("");
      
      setPreviewData([]);
      fetchSavedData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal menyimpan data referensi' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Referensi Jabatan</h1>
        <p className={styles.subtitle}>
          Kelola daftar baku Jabatan Pelaksana dan Jabatan Fungsional secara masal.
        </p>
      </div>

      {message && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}

      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'Pelaksana' ? styles.active : ''}`}
          onClick={() => { setActiveTab('Pelaksana'); setPreviewData([]); setMessage(null); setCurrentPage(1); }}
        >
          Jabatan Pelaksana
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'Fungsional' ? styles.active : ''}`}
          onClick={() => { setActiveTab('Fungsional'); setPreviewData([]); setMessage(null); setCurrentPage(1); }}
        >
          Jabatan Fungsional
        </button>
      </div>

      <div className="glass-panel p-6" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {activeTab === 'Pelaksana' && (
          <div className={styles.formGroup}>
            <label>Masukkan Nama Jabatan Pelaksana</label>
            <p className={styles.subtitle} style={{ fontSize: '0.85rem' }}>
              Pisahkan beberapa nama jabatan dengan koma. Contoh: Penelaah Teknis Kebijakan, Pengadministrasi Perkantoran, Pengolah Data
            </p>
            <textarea 
              className={styles.textarea}
              value={inputPelaksana}
              onChange={(e) => setInputPelaksana(e.target.value)}
              placeholder="Ketik disini..."
            />
            <div className={styles.buttonGroup}>
              <button className={styles.btnSecondary} onClick={handlePreviewPelaksana}>Preview</button>
            </div>
          </div>
        )}

        {activeTab === 'Fungsional' && (
          <div className={styles.formGroup}>
            <label>Masukkan Nama Dasar Jabatan Fungsional</label>
            <p className={styles.subtitle} style={{ fontSize: '0.85rem' }}>
              Pisahkan dengan koma. Contoh: Dokter, Perawat, Bidan, Analis SDM Aparatur
            </p>
            <textarea 
              className={styles.textarea}
              value={inputFungsional}
              onChange={(e) => setInputFungsional(e.target.value)}
              placeholder="Ketik disini..."
            />
            
            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
              <label>Kategori Jenjang Fungsional</label>
              <div className={styles.checkboxGroup}>
                <label className={styles.checkboxLabel}>
                  <input 
                    type="checkbox" 
                    checked={kategoriFungsional.keahlian}
                    onChange={(e) => setKategoriFungsional({...kategoriFungsional, keahlian: e.target.checked})}
                  />
                  Keahlian (Ahli Pertama, Ahli Muda, Ahli Madya, Ahli Utama)
                </label>
              </div>
              <div className={styles.checkboxGroup}>
                <label className={styles.checkboxLabel}>
                  <input 
                    type="checkbox" 
                    checked={kategoriFungsional.keterampilan}
                    onChange={(e) => setKategoriFungsional({...kategoriFungsional, keterampilan: e.target.checked})}
                  />
                  Keterampilan (Pemula, Terampil, Mahir, Penyelia)
                </label>
              </div>
            </div>

            <div className={styles.buttonGroup}>
              <button className={styles.btnSecondary} onClick={handlePreviewFungsional}>Preview</button>
            </div>
          </div>
        )}

        {previewData.length > 0 && (
          <div className={styles.previewSection}>
            <h3>Preview Data ({previewData.length} item)</h3>
            <div className={styles.previewList}>
              {previewData.map((item, idx) => (
                <div key={idx} className={styles.previewItem}>
                  <span style={{ fontWeight: 600 }}>{item.namaBase}</span>
                  <span className={`${styles.badge} ${item.jenisJabatan === 'Pelaksana' ? styles.pelaksana : (item.kategori?.toLowerCase() === 'keahlian' ? styles.keahlian : styles.keterampilan)}`}>
                    {item.jenisJabatan === 'Pelaksana' ? 'Pelaksana' : item.kategori}
                  </span>
                </div>
              ))}
            </div>
            
            <div className={styles.buttonGroup} style={{ marginTop: '2rem' }}>
              <button 
                className={styles.btnPrimary} 
                onClick={handleSave}
                disabled={isLoading}
              >
                {isLoading ? 'Menyimpan...' : 'Simpan Referensi ke Database'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="glass-panel p-6" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className={styles.header} style={{ marginBottom: '0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Daftar Referensi {activeTab} Tersimpan</h2>
          <span className={styles.subtitle}>Total: {savedData.filter(item => item.jenisJabatan === activeTab).length} data</span>
        </div>

        {isLoadingData ? (
          <p className={styles.subtitle}>Memuat data referensi...</p>
        ) : (() => {
          const filteredData = savedData.filter(item => item.jenisJabatan === activeTab);
          if (filteredData.length === 0) {
            return <p className={styles.subtitle}>Belum ada data referensi {activeTab} yang tersimpan.</p>;
          }
          
          const totalPages = Math.ceil(filteredData.length / itemsPerPage);
          const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

          return (
            <>
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: '5%' }}>No</th>
                      <th style={{ width: '45%' }}>Nama Jabatan</th>
                      <th style={{ width: '30%' }}>Kategori</th>
                      <th style={{ width: '20%', textAlign: 'center' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td>{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{item.namaBase}</td>
                        <td>
                          <span className={`${styles.badge} ${item.jenisJabatan === 'Pelaksana' ? styles.pelaksana : (item.kategori?.toLowerCase() === 'keahlian' ? styles.keahlian : styles.keterampilan)}`}>
                            {item.jenisJabatan === 'Pelaksana' ? 'Pelaksana' : item.kategori}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button 
                              onClick={() => handleOpenEdit(item)}
                              style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}
                              title="Edit Referensi"
                            >
                              ✏️ Edit
                            </button>
                            <button 
                              onClick={() => item.id && handleDelete(item.id)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}
                              title="Hapus"
                            >
                              🗑️ Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button 
                    className={styles.pageButton} 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  >
                    Sebelumnya
                  </button>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    Halaman {currentPage} dari {totalPages}
                  </span>
                  <button 
                    className={styles.pageButton} 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  >
                    Berikutnya
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {editingItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
              Edit Referensi {editingItem.jenisJabatan}
            </h3>

            <div className={styles.formGroup} style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Nama Jabatan</label>
              <input 
                type="text"
                className={styles.textarea}
                style={{ minHeight: 'auto', height: '42px', padding: '0.5rem 1rem' }}
                value={editNamaBase}
                onChange={(e) => setEditNamaBase(e.target.value)}
                placeholder="Nama jabatan..."
              />
            </div>

            {editingItem.jenisJabatan === 'Fungsional' && (
              <div className={styles.formGroup} style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Kategori Jenjang Fungsional</label>
                <select 
                  className={styles.textarea}
                  style={{ minHeight: 'auto', height: '42px', padding: '0.5rem 1rem', background: 'rgba(30, 41, 59, 0.95)' }}
                  value={editKategori}
                  onChange={(e) => setEditKategori(e.target.value as 'Keahlian' | 'Keterampilan')}
                >
                  <option value="Keahlian">Keahlian (Ahli Pertama, Muda, Madya, Utama)</option>
                  <option value="Keterampilan">Keterampilan (Pemula, Terampil, Mahir, Penyelia)</option>
                </select>
              </div>
            )}

            <div className={styles.buttonGroup} style={{ justifyContent: 'flex-end', display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button 
                className={styles.btnSecondary} 
                onClick={() => setEditingItem(null)}
                disabled={isSavingEdit}
              >
                Batal
              </button>
              <button 
                className={styles.btnPrimary} 
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
