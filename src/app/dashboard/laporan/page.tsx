"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import { exportJabatanToDocx, exportJabatansToDocx } from "@/lib/exportDocx";
import { exportRekapAbkToXlsx } from "@/lib/importXlsx";
import type { UnitKerja, Jabatan, JabatanFull } from "@/lib/types";

const DEFAULT_FLAT_MAPPINGS: Record<string, string> = {
  "namaJabatan": "namaJabatan",
  "kodeJabatan": "kodeJabatan",
  "jenisJabatan": "jenisJabatan",
  "ikhtisarJabatan": "ikhtisarJabatan",
  "kelasJabatan": "kelasJabatan",
  "tahun": "tahun",
  
  "hierarchyName": "hierarchy",
  "hierarchy.jptUtama": "jptUtama",
  "hierarchy.jptMadya": "jptMadya",
  "hierarchy.jptPratama": "jptPratama",
  "hierarchy.administrator": "administrator",
  "hierarchy.pengawas": "pengawas",
  "hierarchy.pelaksana": "pelaksana",
  "hierarchy.jabatanFungsional": "jabatanFungsional",
  
  "kualifikasi.pendidikanFormal": "kualifikasi_pendidikanFormal",
  "kualifikasi.pendidikanPelatihan": "kualifikasi_pendidikanPelatihan",
  "kualifikasi.pengalamanKerja": "kualifikasi_pengalamanKerja",
  
  "tugasPokok.loop": "tugasPokok",
  "tugasPokok.no": "no",
  "tugasPokok.uraianTugas": "uraianTugas",
  "tugasPokok.hasilKerja": "hasilKerja",
  "tugasPokok.jumlahHasil": "jumlahHasil",
  "tugasPokok.waktuPenyelesaian": "waktuPenyelesaian",
  "tugasPokok.waktuEfektif": "waktuEfektif",
  
  "syaratJabatan.keterampilanKerja": "syarat_keterampilanKerja",
  "syaratJabatan.bakatKerja": "syarat_bakatKerja",
  "syaratJabatan.temperamenKerja": "syarat_temperamenKerja",
  "syaratJabatan.minatKerja": "syarat_minatKerja",
  "syaratJabatan.upayaFisik": "syarat_upayaFisik",
  
  "syaratJabatan.kondisiFisikName": "syarat_kondisiFisik",
  "syaratJabatan.kondisiFisik.jenisKelamin": "jenisKelamin",
  "syaratJabatan.kondisiFisik.umur": "umur",
  "syaratJabatan.kondisiFisik.tinggiBadan": "tinggiBadan",
  "syaratJabatan.kondisiFisik.beratBadan": "beratBadan",
  "syaratJabatan.kondisiFisik.posturBadan": "posturBadan",
  "syaratJabatan.kondisiFisik.penampilan": "penampilan",
  
  "hasilKerja": "hasilKerja",
  "prestasiKerja": "prestasiKerja"
};

// Helper to flatten nested object keys
const flattenObject = (obj: any, prefix = ''): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!obj) return result;
  
  Object.keys(obj).forEach((key) => {
    const val = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, newKey));
    } else {
      result[newKey] = val;
    }
  });
  return result;
};

// Helper to unflatten keys back to nested object
const unflattenObject = (flat: Record<string, string>): Record<string, any> => {
  const result: Record<string, any> = {};
  Object.keys(flat).forEach((key) => {
    const parts = key.split('.');
    let current = result;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = flat[key];
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  });
  return result;
};

export default function LaporanPage() {
  const [opds, setOpds] = useState<UnitKerja[]>([]);
  const [jabatans, setJabatans] = useState<Jabatan[]>([]);
  
  // Card 1 state
  const [selectedOpd1, setSelectedOpd1] = useState<string>("");
  const [selectedJabatan, setSelectedJabatan] = useState<string>("all");
  const [downloadingAnjab, setDownloadingAnjab] = useState<boolean>(false);

  // Card 2 state
  const [selectedOpd2, setSelectedOpd2] = useState<string>("");

  // Card 3 state
  const [selectedOpd3, setSelectedOpd3] = useState<string>("");
  const [downloadingAbk, setDownloadingAbk] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);

  // Template Settings State
  const [activeTab, setActiveTab] = useState<"file" | "mappings">("file");
  const [customTemplateName, setCustomTemplateName] = useState<string | null>(null);
  const [flatMappings, setFlatMappings] = useState<Record<string, string>>(DEFAULT_FLAT_MAPPINGS);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState<boolean>(false);
  const [isSavingMappings, setIsSavingMappings] = useState<boolean>(false);

  // Load Unit Kerja (OPD) & Template Settings on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const data = await api.getUnitKerja() as UnitKerja[];
        setOpds(data);
        if (data.length > 0) {
          setSelectedOpd1(data[0].id);
          setSelectedOpd2(data[0].id);
          setSelectedOpd3(data[0].id);
        }

        // Fetch custom template settings
        const customTemplate = await api.getTemplate().catch(() => null);
        if (customTemplate && customTemplate.filename) {
          setCustomTemplateName(customTemplate.filename);
        }

        // Fetch custom tag mappings
        const customMappings = await api.getTagMappings().catch(() => null);
        if (customMappings) {
          const flat = flattenObject(customMappings);
          setFlatMappings(prev => ({
            ...prev,
            ...flat
          }));
        }
      } catch (err) {
        console.error("Gagal memuat data awal:", err);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, []);

  // Fetch Jabatans whenever selectedOpd1 changes
  useEffect(() => {
    if (!selectedOpd1) return;
    const loadJabatans = async () => {
      try {
        const data = await api.getJabatanByUnit(selectedOpd1) as Jabatan[];
        setJabatans(data);
        setSelectedJabatan("all"); // Default to all jabatans
      } catch (err) {
        console.error("Gagal memuat daftar jabatan:", err);
      }
    };
    loadJabatans();
  }, [selectedOpd1]);

  const handleDownloadAnjab = async () => {
    if (!selectedOpd1) return;
    setDownloadingAnjab(true);
    try {
      const opdName = opds.find(o => o.id === selectedOpd1)?.nama || "OPD";
      if (selectedJabatan === "all") {
        if (jabatans.length === 0) {
          alert("Tidak ada jabatan pada OPD ini.");
          setDownloadingAnjab(false);
          return;
        }
        
        const fullJabatans = await Promise.all(
          jabatans.map(j => api.getJabatanFull(j.id) as Promise<JabatanFull>)
        );
        
        await exportJabatansToDocx(`Anjab_Lengkap_${opdName.replace(/[^a-zA-Z0-9]/g, '_')}`, fullJabatans);
      } else {
        const fullJabatan = await api.getJabatanFull(selectedJabatan) as JabatanFull;
        await exportJabatanToDocx(fullJabatan);
      }
    } catch (err: any) {
      alert("Gagal mengunduh laporan Anjab: " + err.message);
    } finally {
      setDownloadingAnjab(false);
    }
  };

  const handleDownloadRekapAbk = async () => {
    if (!selectedOpd3) return;
    setDownloadingAbk(true);
    try {
      const opdName = opds.find(o => o.id === selectedOpd3)?.nama || "OPD";
      const targetJabatans = await api.getJabatanByUnit(selectedOpd3) as Jabatan[];
      
      if (targetJabatans.length === 0) {
        alert("Tidak ada jabatan pada OPD ini.");
        setDownloadingAbk(false);
        return;
      }

      const fullJabatans = await Promise.all(
        targetJabatans.map(j => api.getJabatanFull(j.id) as Promise<JabatanFull>)
      );
      const abkList = await Promise.all(
        targetJabatans.map(j => api.getABK(j.id).catch(() => null) as Promise<any>)
      );

      const rows = fullJabatans.map((j, idx) => {
        const abk = abkList[idx];
        let totalWaktuEfektif = 0;
        let kebutuhanPegawai = 0;
        let pembulatanFormasi = 0;

        if (abk && abk.totalWaktuEfektif !== undefined) {
          totalWaktuEfektif = abk.totalWaktuEfektif;
          kebutuhanPegawai = abk.totalKebutuhan || 0;
          pembulatanFormasi = abk.formasiPembulatan || 0;
        } else {
          const tp = j.tugasPokok || [];
          tp.forEach(t => {
            const we = (t.waktuPenyelesaian || 0) * (t.jumlahHasil || 0);
            totalWaktuEfektif += we;
          });
          kebutuhanPegawai = totalWaktuEfektif / 1250;
          pembulatanFormasi = Math.ceil(kebutuhanPegawai);
        }

        return {
          namaJabatan: j.namaJabatan,
          jenisJabatan: j.jenisJabatan,
          kelasJabatan: j.kelasJabatan,
          totalWaktuEfektif,
          kebutuhanPegawai,
          pembulatanFormasi
        };
      });

      exportRekapAbkToXlsx(opdName, rows);
    } catch (err: any) {
      alert("Gagal mengunduh rekap ABK: " + err.message);
    } finally {
      setDownloadingAbk(false);
    }
  };

  // Upload Word Template file (.docx)
  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".docx")) {
      alert("Format berkas harus berupa dokumen Word (.docx)");
      return;
    }

    setIsUploadingTemplate(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result as string;
        // Strip out the data URL metadata prefix if present
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        
        await api.saveTemplate({
          base64,
          filename: file.name
        });
        
        setCustomTemplateName(file.name);
        alert("Template Word kustom berhasil diunggah dan disimpan ke database.");
      };
      
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert("Gagal mengunggah template: " + err.message);
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  // Reset to default template
  const handleResetTemplate = async () => {
    if (!confirm("Apakah Anda yakin ingin menghapus template kustom dan kembali ke template default bawaan sistem?")) {
      return;
    }
    
    setIsUploadingTemplate(true);
    try {
      await api.saveTemplate({ base64: "", filename: "" });
      setCustomTemplateName(null);
      alert("Pengaturan template berhasil di-reset ke bawaan sistem.");
    } catch (err: any) {
      alert("Gagal me-reset template: " + err.message);
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  // Save Tag Mappings to Firebase
  const handleSaveMappings = async () => {
    setIsSavingMappings(true);
    try {
      const nested = unflattenObject(flatMappings);
      await api.saveTagMappings(nested);
      alert("Pemetaan tag berhasil disimpan ke database.");
    } catch (err: any) {
      alert("Gagal menyimpan pemetaan tag: " + err.message);
    } finally {
      setIsSavingMappings(false);
    }
  };

  // Reset mappings to system default
  const handleResetMappings = () => {
    if (!confirm("Apakah Anda yakin ingin mengembalikan seluruh pemetaan tag ke default bawaan sistem?")) {
      return;
    }
    setFlatMappings(DEFAULT_FLAT_MAPPINGS);
  };

  const handleMappingChange = (key: string, value: string) => {
    setFlatMappings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <p>Memuat data OPD...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Laporan & Dokumen</h1>
          <p className={styles.subtitle}>Cetak dokumen resmi Analisis Jabatan dan Beban Kerja (Format Permenpan RB)</p>
        </div>
      </div>

      <div className={styles.grid}>
        
        {/* Card 1: Dokumen Informasi Jabatan */}
        <div className={`${styles.reportCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper}>📑</div>
            <div className={styles.reportTitle}>Dokumen Informasi Jabatan</div>
          </div>
          <p className={styles.reportDesc}>
            Mencetak formulir Informasi Jabatan secara lengkap beserta uraian tugas, syarat, dan korelasi untuk satu jabatan spesifik atau seluruh jabatan di OPD (Bulk).
          </p>
          <div className={styles.formGroup}>
            <label>Pilih OPD</label>
            <select 
              className={styles.selectInput} 
              value={selectedOpd1} 
              onChange={(e) => setSelectedOpd1(e.target.value)}
            >
              {opds.map(opd => (
                <option key={opd.id} value={opd.id}>{opd.nama}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Pilih Jabatan</label>
            <select 
              className={styles.selectInput} 
              value={selectedJabatan} 
              onChange={(e) => setSelectedJabatan(e.target.value)}
            >
              <option value="all">[Semua Jabatan - Cetak Bulk]</option>
              {jabatans.map(j => (
                <option key={j.id} value={j.id}>{j.namaJabatan}</option>
              ))}
            </select>
          </div>
          <button 
            className={styles.btnDownload} 
            onClick={handleDownloadAnjab}
            disabled={downloadingAnjab}
          >
            {downloadingAnjab ? "Mengunduh..." : "Unduh Word (.docx)"}
          </button>
        </div>

        {/* Card 2: Peta Jabatan Instansi */}
        <div className={`${styles.reportCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper} style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)' }}>📊</div>
            <div className={styles.reportTitle}>Peta Jabatan Instansi</div>
          </div>
          <p className={styles.reportDesc}>
            Mencetak struktur pohon Peta Jabatan yang menunjukkan hierarki struktural dan fungsional pada unit kerja tertentu.
          </p>
          <div className={styles.formGroup}>
            <label>Pilih OPD</label>
            <select 
              className={styles.selectInput} 
              value={selectedOpd2} 
              onChange={(e) => setSelectedOpd2(e.target.value)}
            >
              {opds.map(opd => (
                <option key={opd.id} value={opd.id}>{opd.nama}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup} style={{ visibility: 'hidden' }}>
            <label>Spacer</label>
            <select className={styles.selectInput}></select>
          </div>
          <button 
            className={styles.btnDownload} 
            style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)', background: 'rgba(16, 185, 129, 0.1)' }}
            onClick={() => {
              alert("Fitur peta jabatan dapat dilihat dan dicetak secara interaktif di halaman Struktur Organisasi.");
              window.location.href = "/dashboard/organisasi";
            }}
          >
            Buka Peta Jabatan
          </button>
        </div>

        {/* Card 3: Rekap Kebutuhan Pegawai (ABK) */}
        <div className={`${styles.reportCard} glass-panel`}>
          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper} style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>⚖️</div>
            <div className={styles.reportTitle}>Rekap Kebutuhan Pegawai (ABK)</div>
          </div>
          <p className={styles.reportDesc}>
            Mencetak tabel hasil perhitungan Analisis Beban Kerja yang memuat total beban kerja per jabatan dan kebutuhan formasinya dalam format Excel.
          </p>
          <div className={styles.formGroup}>
            <label>Cakupan Laporan</label>
            <select className={styles.selectInput} defaultValue="opd">
              <option value="opd">Per OPD (Unit Kerja)</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Pilih OPD</label>
            <select 
              className={styles.selectInput} 
              value={selectedOpd3} 
              onChange={(e) => setSelectedOpd3(e.target.value)}
            >
              {opds.map(opd => (
                <option key={opd.id} value={opd.id}>{opd.nama}</option>
              ))}
            </select>
          </div>
          <button 
            className={styles.btnDownload} 
            style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.1)' }}
            onClick={handleDownloadRekapAbk}
            disabled={downloadingAbk}
          >
            {downloadingAbk ? "Mengunduh..." : "Unduh Rekap Excel"}
          </button>
        </div>

      </div>

      {/* Advanced Settings: Template & Tag Manager (Admin Only) */}
      <div className={`${styles.settingsSection} glass-panel`}>
        <div className={styles.settingsHeader}>
          <div className={styles.settingsTitle}>⚙️ Pengaturan Ekspor Template Word</div>
          <div className={styles.tabs}>
            <button 
              className={`${styles.tab} ${activeTab === "file" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("file")}
            >
              File Template (.docx)
            </button>
            <button 
              className={`${styles.tab} ${activeTab === "mappings" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("mappings")}
            >
              Tag Manager (Pemetaan Tag)
            </button>
          </div>
        </div>

        <div className={styles.settingsContent}>
          {activeTab === "file" && (
            <div className={styles.uploadContainer}>
              <p style={{ fontSize: "0.9rem", opacity: 0.85, lineHeight: 1.6 }}>
                Anda dapat mengunggah file template Microsoft Word kustom Anda sendiri. File ini akan disimpan ke database sehingga semua Operator/Admin akan menggunakan template yang sama saat mengekspor dokumen.
              </p>
              
              <div className={styles.fileInfo}>
                {customTemplateName ? (
                  <span>📄 Template Aktif saat ini: <strong>{customTemplateName}</strong> (Menggunakan template kustom)</span>
                ) : (
                  <span>⚙️ Template Aktif saat ini: <strong>Bawaan Sistem (template_anjab.docx)</strong></span>
                )}
              </div>

              <div className={styles.uploadRow}>
                <div className={styles.fileInputWrapper}>
                  <button className={styles.btnBrowse} disabled={isUploadingTemplate}>
                    {isUploadingTemplate ? "Mengunggah..." : "Pilih & Unggah File .docx Baru"}
                  </button>
                  <input 
                    type="file" 
                    accept=".docx" 
                    onChange={handleTemplateUpload}
                    disabled={isUploadingTemplate}
                  />
                </div>
                {customTemplateName && (
                  <button 
                    className={styles.btnReset}
                    onClick={handleResetTemplate}
                    disabled={isUploadingTemplate}
                  >
                    Reset ke Default Bawaan
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === "mappings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <p style={{ fontSize: "0.9rem", opacity: 0.85, lineHeight: 1.6 }}>
                Sesuaikan nama tag di dalam file Word Anda dengan data field sistem. Masukkan nama tag dokumen tanpa tanda kurung kurawal. Contoh: jika data Nama Jabatan di Word ditulis sebagai <code>{`{NM_JABATAN}`}</code>, isi kolom Nama Jabatan dengan <code>NM_JABATAN</code>.
              </p>

              <div className={styles.settingsGrid}>
                {/* Kategori 1: Data Utama */}
                <div className={styles.mappingCategory}>
                  <div className={styles.categoryTitle}>Data Utama Jabatan</div>
                  
                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Nama Jabatan</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["namaJabatan"]}
                      onChange={(e) => handleMappingChange("namaJabatan", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Kode Jabatan</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["kodeJabatan"]}
                      onChange={(e) => handleMappingChange("kodeJabatan", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Jenis Jabatan</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["jenisJabatan"]}
                      onChange={(e) => handleMappingChange("jenisJabatan", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Ikhtisar Jabatan</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["ikhtisarJabatan"]}
                      onChange={(e) => handleMappingChange("ikhtisarJabatan", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Kelas Jabatan</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["kelasJabatan"]}
                      onChange={(e) => handleMappingChange("kelasJabatan", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Tahun Analisis</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["tahun"]}
                      onChange={(e) => handleMappingChange("tahun", e.target.value)}
                    />
                  </div>
                </div>

                {/* Kategori 2: Hierarki Unit Kerja */}
                <div className={styles.mappingCategory}>
                  <div className={styles.categoryTitle}>Hierarki Unit Kerja</div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Nama Objek Hierarki</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["hierarchyName"]}
                      onChange={(e) => handleMappingChange("hierarchyName", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>JPT Utama</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["hierarchy.jptUtama"]}
                      onChange={(e) => handleMappingChange("hierarchy.jptUtama", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>JPT Madya</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["hierarchy.jptMadya"]}
                      onChange={(e) => handleMappingChange("hierarchy.jptMadya", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>JPT Pratama</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["hierarchy.jptPratama"]}
                      onChange={(e) => handleMappingChange("hierarchy.jptPratama", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Administrator</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["hierarchy.administrator"]}
                      onChange={(e) => handleMappingChange("hierarchy.administrator", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Pengawas</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["hierarchy.pengawas"]}
                      onChange={(e) => handleMappingChange("hierarchy.pengawas", e.target.value)}
                    />
                  </div>
                </div>

                {/* Kategori 3: Loop Tugas Pokok */}
                <div className={styles.mappingCategory}>
                  <div className={styles.categoryTitle}>Tabel Loop Tugas Pokok</div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Nama Array / Loop</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["tugasPokok.loop"]}
                      onChange={(e) => handleMappingChange("tugasPokok.loop", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Tag Kolom No</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["tugasPokok.no"]}
                      onChange={(e) => handleMappingChange("tugasPokok.no", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Tag Kolom Uraian</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["tugasPokok.uraianTugas"]}
                      onChange={(e) => handleMappingChange("tugasPokok.uraianTugas", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Tag Kolom Hasil</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["tugasPokok.hasilKerja"]}
                      onChange={(e) => handleMappingChange("tugasPokok.hasilKerja", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Tag Kolom Jumlah</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["tugasPokok.jumlahHasil"]}
                      onChange={(e) => handleMappingChange("tugasPokok.jumlahHasil", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Tag Kolom Waktu Pyls</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["tugasPokok.waktuPenyelesaian"]}
                      onChange={(e) => handleMappingChange("tugasPokok.waktuPenyelesaian", e.target.value)}
                    />
                  </div>
                </div>

                {/* Kategori 4: Kualifikasi & Syarat Jabatan */}
                <div className={styles.mappingCategory}>
                  <div className={styles.categoryTitle}>Kualifikasi & Syarat Jabatan</div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Pendidikan Formal</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["kualifikasi.pendidikanFormal"]}
                      onChange={(e) => handleMappingChange("kualifikasi.pendidikanFormal", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Pendidikan/Pelatihan</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["kualifikasi.pendidikanPelatihan"]}
                      onChange={(e) => handleMappingChange("kualifikasi.pendidikanPelatihan", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Pengalaman Kerja</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["kualifikasi.pengalamanKerja"]}
                      onChange={(e) => handleMappingChange("kualifikasi.pengalamanKerja", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Keterampilan Kerja</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["syaratJabatan.keterampilanKerja"]}
                      onChange={(e) => handleMappingChange("syaratJabatan.keterampilanKerja", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Bakat Kerja</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["syaratJabatan.bakatKerja"]}
                      onChange={(e) => handleMappingChange("syaratJabatan.bakatKerja", e.target.value)}
                    />
                  </div>

                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Temperamen Kerja</span>
                    <input 
                      className={styles.mappingInput}
                      value={flatMappings["syaratJabatan.temperamenKerja"]}
                      onChange={(e) => handleMappingChange("syaratJabatan.temperamenKerja", e.target.value)}
                    />
                  </div>
                </div>

              </div>

              <div className={styles.actionRow}>
                <button 
                  className={styles.btnReset}
                  onClick={handleResetMappings}
                  disabled={isSavingMappings}
                >
                  Reset Default
                </button>
                <button 
                  className={styles.btnSave}
                  onClick={handleSaveMappings}
                  disabled={isSavingMappings}
                >
                  {isSavingMappings ? "Menyimpan..." : "Simpan Pemetaan Tag"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
