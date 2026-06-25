"use client";

import { useState, useCallback, useEffect } from "react";
import styles from "./page.module.css";
import treeStyles from "../organisasi/page.module.css";
import { api } from "@/lib/api";
import { downloadTemplateXlsx, parseXlsxForAnjab, parseAnjabAsli } from "@/lib/importXlsx";
import type { JabatanFull, TugasPokok, Kualifikasi, SyaratJabatan, UnitKerja, Jabatan } from "@/lib/types";
import { exportJabatanToDocx } from "@/lib/exportDocx";

import TabIdentitas from "./components/TabIdentitas";
import TabTugasPokok from "./components/TabTugasPokok";
import TabBahanPerangkat from "./components/TabBahanPerangkat";
import TabKorelasiLingkungan from "./components/TabKorelasiLingkungan";
import TabSyaratJabatan from "./components/TabSyaratJabatan";

export type TreeNode = {
  id: string;
  type: 'OPD' | 'JABATAN';
  label: string;
  eselon?: string;
  kelas?: number;
  parentId?: string;
  unitKerjaId?: string;
  urutan?: number;
  ikhtisar?: string;
  anjabTerisi?: boolean;
  children: TreeNode[];
};

const TABS = [
  { id: "identitas", label: "Identitas", icon: "📋" },
  { id: "tugas", label: "Tugas Pokok", icon: "📝" },
  { id: "bahan", label: "Bahan & TJ", icon: "📦" },
  { id: "korelasi", label: "Korelasi & Risiko", icon: "🔗" },
  { id: "syarat", label: "Syarat Jabatan", icon: "🎯" },
];

export default function AnalisisPage() {
  const [mode, setMode] = useState<'tree' | 'editor'>('tree');
  
  // Tree State
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingTree, setIsLoadingTree] = useState(true);

  // Editor State
  const [activeJob, setActiveJob] = useState<string>("");
  const [activeTab, setActiveTab] = useState("identitas");
  const [jabatanData, setJabatanData] = useState<JabatanFull | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [versionKey, setVersionKey] = useState(0);
  
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // LOAD TREE
  const loadTree = useCallback(async () => {
    setIsLoadingTree(true);
    try {
      const [opds, jabatans, tugasPokoks] = await Promise.all([
        api.getUnitKerja() as Promise<UnitKerja[]>,
        api.readAllEntity('jabatan', '') as Promise<Jabatan[]>,
        api.readAllEntity('tugasPokok', '') as Promise<any[]>
      ]);

      const tpMap: Record<string, boolean> = {};
      if (tugasPokoks && Array.isArray(tugasPokoks)) {
        tugasPokoks.forEach(tp => { if (tp.jabatanId) tpMap[tp.jabatanId] = true; });
      }

      const map: Record<string, TreeNode> = {};
      const roots: TreeNode[] = [];
      const expandState: Record<string, boolean> = {};

      opds.forEach(opd => {
        map[opd.id] = {
          id: opd.id, type: 'OPD', label: opd.nama || opd.id,
          parentId: opd.parentId, urutan: opd.urutan || 0, children: []
        };
        expandState[opd.id] = true;
      });

      jabatans.forEach(jbt => {
        map[jbt.id] = {
          id: jbt.id, type: 'JABATAN', label: jbt.namaJabatan || jbt.id,
          eselon: jbt.jenisJabatan, kelas: jbt.kelasJabatan,
          parentId: jbt.parentId, unitKerjaId: jbt.unitKerjaId,
          urutan: jbt.urutan || 0, ikhtisar: jbt.ikhtisarJabatan || "", 
          anjabTerisi: (jbt.ikhtisarJabatan && jbt.ikhtisarJabatan.length > 5) || !!tpMap[jbt.id],
          children: []
        };
      });

      opds.forEach(opd => {
        if (opd.parentId && map[opd.parentId]) map[opd.parentId].children.push(map[opd.id]);
        else roots.push(map[opd.id]);
      });

      jabatans.forEach(jbt => {
        if (jbt.parentId && map[jbt.parentId]) map[jbt.parentId].children.push(map[jbt.id]);
        else if (jbt.unitKerjaId && map[jbt.unitKerjaId]) map[jbt.unitKerjaId].children.push(map[jbt.id]);
        else roots.push(map[jbt.id]);
      });

      const getEselonWeight = (eselon?: string) => {
        const val = (eselon || '').toLowerCase().trim();
        if (val.includes('pimpinan tinggi')) return 5;
        if (val === 'administrator') return 4;
        if (val === 'pengawas') return 3;
        if (val.includes('fungsional')) return 2;
        if (val === 'pelaksana') return 1;
        return 0;
      };

      const sortNodes = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => {
          const urutA = a.urutan || 999;
          const urutB = b.urutan || 999;
          if (urutA !== urutB) return urutA - urutB;
          const kelasA = Number(a.kelas) || 0;
          const kelasB = Number(b.kelas) || 0;
          if (kelasA !== kelasB) return kelasB - kelasA;
          const wA = getEselonWeight(a.eselon);
          const wB = getEselonWeight(b.eselon);
          if (wA !== wB) return wB - wA;
          return a.label.localeCompare(b.label);
        });
        nodes.forEach(n => { if (n.children.length > 0) sortNodes(n.children); });
      };

      sortNodes(roots);
      setTreeData(roots);
      setExpandedNodes(expandState);
    } catch (err) {
      console.error(err);
    }
    setIsLoadingTree(false);
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const toggleNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // EDITOR LOGIC
  const openEditor = async (node: TreeNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveJob(node.id);
    setMode('editor');
    setActiveTab('identitas');
    setLoadingEditor(true);
    setJabatanData({ 
      id: node.id, 
      namaJabatan: node.label, 
      jenisJabatan: node.eselon, 
      kelasJabatan: node.kelas,
      kodeJabatan: "Memuat..."
    } as JabatanFull);
    
    try {
      const data = await api.getJabatanFull(node.id) as JabatanFull;
      setJabatanData(data);
    } catch (err) {
      showToast("❌ Gagal memuat data jabatan");
    }
    setLoadingEditor(false);
  };

  const closeEditor = () => {
    if (jabatanData) {
      const isTerisi = (jabatanData.ikhtisarJabatan && jabatanData.ikhtisarJabatan.length > 5) || 
                       (jabatanData.tugasPokok && jabatanData.tugasPokok.length > 0);
      
      const updateNodeInTree = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map(node => {
          if (node.id === jabatanData.id) {
            return {
              ...node,
              ikhtisar: jabatanData.ikhtisarJabatan || "",
              anjabTerisi: isTerisi
            };
          }
          if (node.children && node.children.length > 0) {
            return {
              ...node,
              children: updateNodeInTree(node.children)
            };
          }
          return node;
        });
      };
      setTreeData(prev => updateNodeInTree(prev));
    }
    setMode('tree');
    setActiveJob('');
    setJabatanData(null);
  };

  // SAVE HANDLERS
  const handleSaveIdentitas = async (data: Partial<JabatanFull>) => {
    if (!jabatanData) return;
    setJabatanData(prev => prev ? { ...prev, ...data } : null);
    showToast("⏳ Menyimpan identitas di latar belakang...");
    
    api.updateJabatan(jabatanData.id, {
      ikhtisarJabatan: data.ikhtisarJabatan
    }).then(() => {
      showToast("✅ Identitas berhasil disimpan permanen");
    }).catch(err => {
      showToast("❌ Gagal menyimpan identitas: " + err);
    });
  };

  const handleSaveTugas = async (tugas: Partial<TugasPokok>[]) => {
    if (!jabatanData) return;
    setJabatanData(prev => prev ? { ...prev, tugasPokok: tugas as any } : null);
    showToast("⏳ Menyimpan tugas...");
    
    try {
      await api.saveMultiEntity('tugasPokok', jabatanData.id, tugas);
      showToast("✅ Tugas pokok berhasil disimpan");
    } catch (err) {
      showToast("❌ Gagal menyimpan tugas: " + err);
    }
  };

  const handleSaveKualifikasi = async (data: Partial<Kualifikasi>) => {
    if (!jabatanData) return;
    setJabatanData(prev => prev ? {
      ...prev,
      kualifikasi: prev.kualifikasi ? { ...prev.kualifikasi, ...data } as any : { jabatanId: prev.id, ...data } as any
    } : null);
    try {
      await api.saveSingleEntity('kualifikasi', jabatanData.id, data);
      showToast("✅ Kualifikasi berhasil disimpan");
    } catch (err) {
      showToast("❌ Gagal menyimpan kualifikasi: " + err);
    }
  };

  const handleSaveHasilKerja = async (uraian: string) => {
    if (!jabatanData) return;
    setJabatanData(prev => prev ? {
      ...prev,
      hasilKerja: prev.hasilKerja ? { ...prev.hasilKerja, uraian } : { jabatanId: prev.id, uraian } as any
    } : null);
    try {
      await api.saveSingleEntity('hasilKerja', jabatanData.id, { uraian });
      showToast("✅ Hasil kerja berhasil disimpan");
    } catch (err) {
      showToast("❌ Gagal menyimpan hasil kerja: " + err);
    }
  };

  const handleSaveMultiRows = async (entity: string, rows: any[]) => {
    if (!jabatanData) return;
    setJabatanData(prev => prev ? { ...prev, [entity]: rows } : null);
    showToast(`⏳ Menyimpan ${entity}...`);
    
    try {
      await api.saveMultiEntity(entity, jabatanData.id, rows);
      showToast(`✅ ${entity} berhasil disimpan`);
    } catch (err) {
      showToast(`❌ Gagal menyimpan ${entity}: ${err}`);
    }
  };

  const handleSaveSyarat = async (data: Partial<SyaratJabatan>) => {
    if (!jabatanData) return;
    setJabatanData(prev => prev ? {
      ...prev,
      syaratJabatan: prev.syaratJabatan ? { ...prev.syaratJabatan, ...data } as any : { jabatanId: prev.id, ...data } as any
    } : null);
    try {
      await api.saveSingleEntity('syaratJabatan', jabatanData.id, data);
      showToast("✅ Syarat jabatan berhasil disimpan");
    } catch (err) {
      showToast("❌ Gagal menyimpan syarat: " + err);
    }
  };

  const handleSavePrestasi = async (uraian: string) => {
    if (!jabatanData) return;
    setJabatanData(prev => prev ? {
      ...prev,
      prestasiKerja: prev.prestasiKerja ? { ...prev.prestasiKerja, uraian } : { jabatanId: prev.id, uraian } as any
    } : null);
    try {
      await api.saveSingleEntity('prestasiKerja', jabatanData.id, { uraian });
      showToast("✅ Prestasi kerja berhasil disimpan");
    } catch (err) {
      showToast("❌ Gagal menyimpan prestasi: " + err);
    }
  };

  const processImportedData = async (parsedData: any, logs: string[]) => {
    if (!jabatanData) return;
    
    const updatedJabatan = { ...jabatanData };

    localStorage.removeItem(`anjab_draft_identitas_${jabatanData.id}`);
    localStorage.removeItem(`anjab_draft_tugas_${jabatanData.id}`);
    
    if (parsedData.identitas.ikhtisarJabatan) {
      updatedJabatan.ikhtisarJabatan = parsedData.identitas.ikhtisarJabatan;
      await handleSaveIdentitas({ ikhtisarJabatan: parsedData.identitas.ikhtisarJabatan });
    }
    if (parsedData.kualifikasi.pendidikanFormal?.length > 0 || parsedData.kualifikasi.pengalamanKerja?.length > 0) {
      updatedJabatan.kualifikasi = parsedData.kualifikasi;
      await handleSaveKualifikasi(parsedData.kualifikasi);
    }
    if (parsedData.tugasPokok.length > 0) {
      updatedJabatan.tugasPokok = parsedData.tugasPokok;
      await handleSaveTugas(parsedData.tugasPokok);
    }
    if (parsedData.syaratJabatan) {
      updatedJabatan.syaratJabatan = parsedData.syaratJabatan;
      await handleSaveSyarat(parsedData.syaratJabatan);
    }
    if (parsedData.prestasiKerja?.uraian) {
      updatedJabatan.prestasiKerja = parsedData.prestasiKerja;
      await handleSavePrestasi(parsedData.prestasiKerja.uraian);
    }
    if (parsedData.hasilKerja?.uraian) {
      updatedJabatan.hasilKerja = parsedData.hasilKerja;
      await handleSaveHasilKerja(parsedData.hasilKerja.uraian);
    }
    if (parsedData.bahanKerja.length > 0) {
      updatedJabatan.bahanKerja = parsedData.bahanKerja;
      await handleSaveMultiRows('bahanKerja', parsedData.bahanKerja);
    }
    if (parsedData.perangkatKerja.length > 0) {
      updatedJabatan.perangkatKerja = parsedData.perangkatKerja;
      await handleSaveMultiRows('perangkatKerja', parsedData.perangkatKerja);
    }
    if (parsedData.tanggungJawab.length > 0) {
      updatedJabatan.tanggungJawab = parsedData.tanggungJawab;
      await handleSaveMultiRows('tanggungJawab', parsedData.tanggungJawab);
    }
    if (parsedData.wewenang.length > 0) {
      updatedJabatan.wewenang = parsedData.wewenang;
      await handleSaveMultiRows('wewenang', parsedData.wewenang);
    }
    if (parsedData.korelasiJabatan.length > 0) {
      updatedJabatan.korelasiJabatan = parsedData.korelasiJabatan;
      await handleSaveMultiRows('korelasiJabatan', parsedData.korelasiJabatan);
    }
    if (parsedData.kondisiLingkungan.length > 0) {
      updatedJabatan.kondisiLingkungan = parsedData.kondisiLingkungan;
      await handleSaveMultiRows('kondisiLingkungan', parsedData.kondisiLingkungan);
    }
    if (parsedData.risikoBahaya.length > 0) {
      updatedJabatan.risikoBahaya = parsedData.risikoBahaya;
      await handleSaveMultiRows('risikoBahaya', parsedData.risikoBahaya);
    }

    setJabatanData(updatedJabatan);
    setVersionKey(prev => prev + 1);
    showToast("✅ Berhasil mengimpor data dari Excel!");
    
    if (logs && logs.length > 0) {
      alert("Laporan Hasil Impor:\n\n" + logs.join("\n"));
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !jabatanData) return;

    showToast("⏳ Membaca file Excel...");
    try {
      const { data: parsedData, logs } = await parseXlsxForAnjab(file);
      await processImportedData(parsedData, logs);
    } catch (err) {
      showToast("❌ Gagal mengimpor Excel: Format tidak sesuai atau file rusak.");
      console.error(err);
    }
  };

  const handleImportAnjabAsli = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !jabatanData) return;

    showToast("⏳ Membaca file Excel Anjab Asli...");
    try {
      const { data: parsedData, logs } = await parseAnjabAsli(file);
      await processImportedData(parsedData, logs);
    } catch (err) {
      showToast("❌ Gagal mengimpor Anjab Asli: Format tidak sesuai atau file rusak.");
      console.error(err);
    }
  };

  // TREE RENDERING
  const renderTreeNodes = (nodes: TreeNode[]) => (
    <ul style={{ listStyle: 'none', paddingLeft: '24px', margin: 0 }}>
      {nodes.map(node => {
        const isExpanded = expandedNodes[node.id];
        const hasChildren = node.children.length > 0;
        
        let highlightClass = '';
        let icon = '📌';
        let eselonClass = treeStyles.eselonLainnya;
        const eselonVal = (node.eselon || '').toLowerCase().trim();
        
        if (eselonVal.includes('pimpinan tinggi')) { highlightClass = treeStyles.nodeHighlightJpt; icon = '⭐'; eselonClass = treeStyles.eselonJpt; }
        else if (eselonVal === 'administrator') { icon = '🛡️'; eselonClass = treeStyles.eselonAdministrator; }
        else if (eselonVal === 'pengawas') { icon = '👁️'; eselonClass = treeStyles.eselonPengawas; }
        else if (eselonVal.includes('fungsional')) { icon = '💼'; eselonClass = treeStyles.eselonFungsional; }
        else if (eselonVal === 'pelaksana') { icon = '🧑‍💻'; eselonClass = treeStyles.eselonPelaksana; }

        if (node.type === 'OPD') {
          return (
            <li key={node.id} className={treeStyles.treeNodeWrapper} style={{ position: 'relative', margin: '4px 0' }}>
              <div className={`${treeStyles.treeNode} ${treeStyles.treeNodeOpd}`} onClick={(e) => toggleNode(node.id, e)}>
                 <div className={treeStyles.treeNodeContent}>
                   <div className={treeStyles.treeToggle}>
                     {hasChildren && <span className={isExpanded ? treeStyles.expanded : ''}>▶</span>}
                   </div>
                   <div className={treeStyles.opdIcon}>🏛️</div>
                   <div className={treeStyles.treeInfo}>
                     <div className={treeStyles.treeTitleRow}>
                       <span className={treeStyles.titleOpd}>{node.label}</span>
                       {node.parentId && <span className={treeStyles.badgeOpdSub}>Sub-Unit</span>}
                     </div>
                   </div>
                 </div>
              </div>
              {isExpanded && hasChildren && renderTreeNodes(node.children)}
            </li>
          );
        }

        return (
          <li key={node.id} className={treeStyles.treeNodeWrapper} style={{ position: 'relative', margin: '4px 0' }}>
            <div className={`${treeStyles.treeNode} ${treeStyles.treeNodeJabatan} ${highlightClass}`} onClick={(e) => toggleNode(node.id, e)}>
               <div className={treeStyles.treeNodeContent}>
                 <div className={treeStyles.treeToggle}>
                   {hasChildren && <span className={isExpanded ? treeStyles.expanded : ''}>▶</span>}
                 </div>
                 <div className={treeStyles.treeInfo}>
                   <div className={treeStyles.treeTitleRow}>
                     <span className={treeStyles.titleJabatan}>{node.label}</span>
                   </div>
                     <div className={treeStyles.treeBadges}>
                       {node.anjabTerisi ? (
                         <span className={treeStyles.badgeSuccess} title="Anjab Terisi">✅ Anjab Terisi</span>
                       ) : (
                         <span className={treeStyles.badgeWarning} title="Anjab Kosong">⚠️ Anjab Kosong</span>
                       )}
                       {/* Placeholder untuk Tanda Validasi Admin */}
                       {false && <span className={treeStyles.badgeSuccess} title="Sudah Divalidasi Admin">✔️ Valid</span>}
                       
                       <span className={`${treeStyles.badgeEselon} ${eselonClass}`}>
                       <span className={treeStyles.badgeIcon}>{icon}</span>
                       {node.eselon || 'Jabatan'}
                     </span>
                     {node.kelas && (
                       <span className={treeStyles.badgeKelas}>Kls {node.kelas}</span>
                     )}
                     <div className={treeStyles.treeActions}>
                        <button type="button" className={`${treeStyles.actionBtn} ${treeStyles.actionBtnPrimary}`} title="Isi Anjab" onClickCapture={(e) => openEditor(node, e)}>
                           📝 Isi Anjab
                        </button>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
            {isExpanded && hasChildren && renderTreeNodes(node.children)}
          </li>
        );
      })}
    </ul>
  );

  const displayTree = searchQuery
    ? treeData // Simplification
    : treeData;

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Analisis Jabatan</h1>
          <p className={styles.subtitle}>
            Formulir Informasi Jabatan — Permenpan RB No. 1 Tahun 2020
          </p>
        </div>
      </div>

      <div className={`${treeStyles.card} glass-panel`}>
        <div className={treeStyles.toolbar}>
          <input
            type="text" placeholder="Cari nama unit kerja atau jabatan..."
            className={treeStyles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}
          />
        </div>

        <div className={treeStyles.treeContainerWrapper} style={{ overflowX: 'auto', minWidth: '800px' }}>
          {isLoadingTree ? (
            <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>Memuat silsilah pohon organisasi...</div>
          ) : (
            renderTreeNodes(displayTree)
          )}
        </div>
      </div>

      {mode === 'editor' && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeButton} onClick={closeEditor}>
              ✕
            </button>
            <div className={styles.mainPanel}>
              <div className={styles.panelHeader}>
            <div className={styles.panelHeaderContent}>
              <span className={styles.jobBadge}>{jabatanData?.jenisJabatan || "Jabatan"}</span>
            </div>
            <div className={styles.jobTitle}>{jabatanData?.namaJabatan || "— Memuat Jabatan —"}</div>
            {jabatanData && (
              <div style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.25rem", display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span>Kode: <span style={{ fontFamily: "monospace" }}>{jabatanData.kodeJabatan}</span></span>
                <span>{' · '} Kelas: <strong>{jabatanData.kelasJabatan}</strong></span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => downloadTemplateXlsx(jabatanData)}
                    style={{ background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <span>📥</span> Unduh Template
                  </button>
                  <label 
                    style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <span>📤</span> Impor Excel
                    <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleImportExcel} />
                  </label>
                  <label 
                    style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <span>📤</span> Import Anjab Asli
                    <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleImportAnjabAsli} />
                  </label>
                  <button 
                    onClick={() => exportJabatanToDocx(jabatanData)}
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <span>📄</span> Unduh Word
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.tabs}>
            {TABS.map((tab) => (
              <div key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.active : ""}`}
                onClick={() => setActiveTab(tab.id)}>
                <span style={{ marginRight: "4px" }}>{tab.icon}</span>
                {tab.label}
              </div>
            ))}
          </div>

          <div className={styles.panelContent}>
            {loadingEditor ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Memuat data jabatan...</p>
              </div>
            ) : jabatanData ? (
              <>
                {activeTab === "identitas" && (
                  <TabIdentitas key={`identitas-${jabatanData.id}-${versionKey}`} jabatan={jabatanData} treeData={treeData} onSave={handleSaveIdentitas} loading={loadingEditor} />
                )}
                {activeTab === "tugas" && (
                  <TabTugasPokok key={`tugas-${jabatanData.id}-${versionKey}`} jabatan={jabatanData} onSaveTugas={handleSaveTugas}
                    onSaveKualifikasi={handleSaveKualifikasi} onSaveHasilKerja={handleSaveHasilKerja} loading={loadingEditor} />
                )}
                {activeTab === "bahan" && (
                  <TabBahanPerangkat jabatan={jabatanData} onSave={handleSaveMultiRows} loading={loadingEditor} />
                )}
                {activeTab === "korelasi" && (
                  <TabKorelasiLingkungan jabatan={jabatanData} onSave={handleSaveMultiRows} loading={loadingEditor} />
                )}
                {activeTab === "syarat" && (
                  <TabSyaratJabatan key={`syarat-${jabatanData.id}-${versionKey}`} jabatan={jabatanData} onSaveSyarat={handleSaveSyarat}
                    onSavePrestasi={handleSavePrestasi} loading={loadingEditor} />
                )}
              </>
            ) : null}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
