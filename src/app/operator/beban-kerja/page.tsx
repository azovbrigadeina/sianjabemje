"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "../../dashboard/beban-kerja/page.module.css";
import treeStyles from "../../dashboard/organisasi/page.module.css";
import { api } from "@/lib/api";
import { filterTreeNodes, calculateFormasiPembulatan } from "@/lib/utils";
import { useUser } from "@/lib/UserContext";
import type { UnitKerja, Jabatan } from "@/lib/types";

type TreeNode = {
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
  abkTerisi?: boolean;
  children: TreeNode[];
};

type ABKRow = {
  tugas: string;
  satuan: string;
  waktu: number;
  volume: number;
};

type ABKData = {
  jabatanId: string;
  rows: ABKRow[];
  wke: number;
  waktuSatuan?: 'jam' | 'menit';
  totalWaktuEfektif: number;
  totalKebutuhan: number;
  formasiPembulatan: number;
};

const WKE_DEFAULT = 72000; // menit per tahun

export default function OperatorBebanKerjaPage() {
  const { user } = useUser();
  const [mode, setMode] = useState<'tree' | 'editor'>('tree');

  // Tree State
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingTree, setIsLoadingTree] = useState(true);

  // Editor State
  const [activeJob, setActiveJob] = useState("");
  const [activeJobData, setActiveJobData] = useState<TreeNode | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{
    title: string;
    message: string;
    type?: 'success' | 'warning' | 'error';
  } | null>(null);

  // Read-Only lock state
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string>("");

  // ABK data
  const [abkRows, setAbkRows] = useState<ABKRow[]>([]);
  const [waktuSatuan, setWaktuSatuan] = useState<'jam' | 'menit'>('jam');
  const [wke, setWke] = useState(1250);
  const [anjabStatus, setAnjabStatus] = useState<'none' | 'partial' | 'done'>('none');
  const [anjabTasks, setAnjabTasks] = useState<{ uraianTugas: string; hasilKerja: string; waktuPenyelesaian: number; jumlahHasil?: number }[]>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // BUILD OPERATOR TREE HELPER
  const buildOperatorTreeNodes = (
    allOpds: UnitKerja[],
    allJabatans: Jabatan[],
    abks: any[],
    userUnitKerjaId: string,
    statusSummary?: { anjabFilled?: string[]; abkFilled?: string[] } | null
  ) => {
    const abkMap: Record<string, boolean> = {};
    if (abks && Array.isArray(abks)) {
      abks.forEach(a => { 
        if (a.id) abkMap[a.id] = true; 
        if (a.jabatanId) abkMap[a.jabatanId] = true;
      });
    }

    const anjabFilledSet = new Set(statusSummary?.anjabFilled || []);

    const userOpd = allOpds.find(o => o.id === userUnitKerjaId || (o.kode && o.kode.trim() === userUnitKerjaId));
    const targetUnitId = userOpd ? userOpd.id : userUnitKerjaId;
    const targetUnitKode = userOpd && userOpd.kode ? userOpd.kode.trim() : "";

    const myOpdKeys = new Set<string>();
    if (userUnitKerjaId) myOpdKeys.add(userUnitKerjaId);
    if (targetUnitId) myOpdKeys.add(targetUnitId);
    if (targetUnitKode) myOpdKeys.add(targetUnitKode);

    allOpds.forEach(opd => {
      if (opd.parentId === targetUnitId || (targetUnitKode && opd.parentId === targetUnitKode)) {
        myOpdKeys.add(opd.id);
        if (opd.kode) myOpdKeys.add(opd.kode.trim());
      }
    });

    const opds = allOpds.filter(opd => myOpdKeys.has(opd.id) || (opd.kode && myOpdKeys.has(opd.kode.trim())));
    const jabatans = allJabatans.filter(jbt => myOpdKeys.has(jbt.unitKerjaId || ""));

    const map: Record<string, TreeNode> = {};
    const roots: TreeNode[] = [];
    const expandState: Record<string, boolean> = {};

    opds.forEach(opd => {
      map[opd.id] = {
        id: opd.id, type: 'OPD', label: opd.nama || opd.id,
        parentId: opd.parentId, urutan: opd.urutan || 0, children: []
      };
      expandState[opd.id] = false; // Collapsed by default
    });

    jabatans.forEach(jbt => {
      map[jbt.id] = {
        id: jbt.id, type: 'JABATAN', label: jbt.namaJabatan || jbt.id,
        eselon: jbt.jenisJabatan, kelas: jbt.kelasJabatan,
        parentId: jbt.parentId, unitKerjaId: jbt.unitKerjaId,
        urutan: jbt.urutan || 0, ikhtisar: jbt.ikhtisarJabatan || "", 
        anjabTerisi: (jbt.ikhtisarJabatan && jbt.ikhtisarJabatan.trim().length > 5) || anjabFilledSet.has(jbt.id),
        abkTerisi: !!abkMap[jbt.id], children: []
      };
    });

    // --- TIPUAN VISUAL UNTUK SUB-UNIT (BAGIAN/UPTD) ---
    const opdToExternalParentJbt: Record<string, string> = {};
    const jbtToReroute: Record<string, boolean> = {};

    const jabatanById = new Map<string, any>();
    jabatans.forEach(jbt => jabatanById.set(jbt.id, jbt));

    jabatans.forEach(jbt => {
      if (jbt.parentId && jbt.unitKerjaId) {
        const parentJbt = jabatanById.get(jbt.parentId);
        if (parentJbt && parentJbt.unitKerjaId && parentJbt.unitKerjaId !== jbt.unitKerjaId) {
          opdToExternalParentJbt[jbt.unitKerjaId] = jbt.parentId;
          jbtToReroute[jbt.id] = true;
        }
      }
    });

    opds.forEach(opd => {
      if (opdToExternalParentJbt[opd.id] && map[opdToExternalParentJbt[opd.id]]) {
        map[opdToExternalParentJbt[opd.id]].children.push(map[opd.id]);
      } else if (opd.parentId && map[opd.parentId]) {
        map[opd.parentId].children.push(map[opd.id]);
      } else {
        roots.push(map[opd.id]);
      }
    });

    jabatans.forEach(jbt => {
      if (jbt.parentId && map[jbt.parentId] && !jbtToReroute[jbt.id]) {
        map[jbt.parentId].children.push(map[jbt.id]);
      } else if (jbt.unitKerjaId && map[jbt.unitKerjaId]) {
        map[jbt.unitKerjaId].children.push(map[jbt.id]);
      } else if (opds.length === 0) {
        roots.push(map[jbt.id]);
      }
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
    return { roots, expandState };
  };

  // LOAD TREE
  const loadTree = useCallback(async () => {
    if (!user?.unitKerjaId) return;

    // 1. Optimistic Hydration: render instan (0 ms) dari cache jika tersedia
    try {
      const [cachedBulk, cachedSummary] = await Promise.all([
        api.getCachedBulkData(['unitKerja', 'jabatan', 'abk']),
        api.getCachedStatusSummary()
      ]);
      if (cachedBulk?.unitKerja && cachedBulk?.jabatan) {
        const { roots, expandState } = buildOperatorTreeNodes(
          cachedBulk.unitKerja as UnitKerja[],
          cachedBulk.jabatan as Jabatan[],
          (cachedBulk.abk || []) as any[],
          user.unitKerjaId,
          cachedSummary
        );
        setTreeData(roots);
        setExpandedNodes(prev => Object.keys(prev).length === 0 ? expandState : prev);
        setIsLoadingTree(false);
      } else {
        setIsLoadingTree(true);
      }
    } catch {
      setIsLoadingTree(true);
    }

    // 2. Fetch fresh data di background / jaringan
    try {
      const [bulkData, deadlineData, summary] = await Promise.all([
        api.getBulkData(['unitKerja', 'jabatan', 'abk']),
        api.getDeadline().catch(() => null),
        api.getAnjabStatusSummary()
      ]);
      const opdsRaw = (bulkData.unitKerja || []) as UnitKerja[];
      const jabatansRaw = (bulkData.jabatan || []) as Jabatan[];
      const abks = (bulkData.abk || []) as any[];

      const thisOpd = opdsRaw ? opdsRaw.find(u => u.id === user.unitKerjaId) : null;
      let readOnlyActive = false;
      let reason = "";

      if (thisOpd) {
        if (thisOpd.statusValidasi === 'Diajukan' || thisOpd.statusValidasi === 'Disetujui') {
          readOnlyActive = true;
          reason = `Dokumen usulan OPD Anda telah dikirim (Status: ${thisOpd.statusValidasi}). Pengeditan dinonaktifkan.`;
        } else if (deadlineData && deadlineData.enabled) {
          const customDeadline = deadlineData.customDeadlines?.[user.unitKerjaId];
          const activeDeadlineStr = customDeadline || deadlineData.deadline;
          if (activeDeadlineStr) {
            const deadline = new Date(activeDeadlineStr);
            const now = new Date();
            if (now > deadline) {
              readOnlyActive = true;
              reason = deadlineData.message || `Masa pengisian telah berakhir pada ${deadline.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}.`;
            }
          }
        }
      }

      setIsReadOnly(readOnlyActive);
      setLockReason(reason);

      const { roots, expandState } = buildOperatorTreeNodes(opdsRaw, jabatansRaw, abks, user.unitKerjaId, summary);
      setTreeData(roots);
      setExpandedNodes(prev => Object.keys(prev).length === 0 ? expandState : prev);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingTree(false);
    }
  }, [user]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    const traverse = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          next[node.id] = true;
          traverse(node.children);
        }
      });
    };
    traverse(treeData);
    setExpandedNodes(next);
    showToast("➕ Semua tingkatan dikembangkan");
  };

  const collapseAll = () => {
    setExpandedNodes({});
    showToast("➖ Semua tingkatan diciutkan");
  };

  const toggleNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Open ABK Editor
  const openEditor = async (node: TreeNode, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!node.anjabTerisi) {
      alert(`⚠️ Pengisian ABK Terkunci: Dokumen Analisis Jabatan (Anjab) untuk jabatan "${node.label}" belum diisi.\n\nSilakan lengkapi Uraian Tugas Pokok pada menu Pengisian Anjab terlebih dahulu.`);
      return;
    }

    setActiveJob(node.id);
    setActiveJobData(node);
    setMode('editor');

    // Optimistic hydration jika data jabatan full sudah ada di cache
    const cachedFull = api.getCachedJabatanFull(node.id) as { tugasPokok?: { uraianTugas: string; hasilKerja: string; waktuPenyelesaian: number; jumlahHasil?: number }[] } | null;
    if (cachedFull?.tugasPokok && cachedFull.tugasPokok.length > 0) {
      setAnjabTasks(cachedFull.tugasPokok);
      setAnjabStatus('done');
    }

    setLoadingEditor(true);
    
    try {
      const [fullData, abkData] = await Promise.all([
        api.getJabatanFull(node.id) as Promise<{ tugasPokok?: { uraianTugas: string; hasilKerja: string; waktuPenyelesaian: number; jumlahHasil?: number }[] }>,
        api.getABK(node.id) as Promise<ABKData | null>
      ]);

      const tugasPokok = fullData?.tugasPokok || [];
      setAnjabTasks(tugasPokok);
      setAnjabStatus(tugasPokok.length > 0 ? 'done' : 'none');

      if (tugasPokok.length === 0) {
        alert(`⚠️ Pengisian ABK Terkunci: Dokumen Analisis Jabatan (Anjab - Uraian Tugas) untuk jabatan "${node.label}" masih kosong.\n\nSilakan isi Anjab terlebih dahulu sebelum mengisi ABK.`);
        setMode('tree');
        setLoadingEditor(false);
        return;
      }

      if (abkData && abkData.rows && abkData.rows.length > 0) {
        setAbkRows(abkData.rows);
        setWaktuSatuan(abkData.waktuSatuan || 'jam');
        setWke(abkData.wke || (abkData.waktuSatuan === 'menit' ? 72000 : 1250));
      } else {
        const initRows: ABKRow[] = tugasPokok.map(t => ({
          tugas: t.uraianTugas || '',
          satuan: t.hasilKerja || '',
          waktu: t.waktuPenyelesaian || 0,
          volume: t.jumlahHasil || 0
        }));
        setAbkRows(initRows);
        setWaktuSatuan('jam');
        setWke(1250);
      }
    } catch (err) {
      showToast("❌ Gagal memuat data beban kerja");
      setMode('tree');
    }
    setLoadingEditor(false);
  };

  const closeEditor = () => {
    setMode('tree');
    setActiveJob('');
    setActiveJobData(null);
  };

  const handleAddRow = () => {
    if (anjabTasks.length === 0) {
      showToast("⚠️ Tidak ada Uraian Tugas dari Anjab yang tersedia.");
      return;
    }
    const defaultTask = anjabTasks[0];
    setAbkRows([
      ...abkRows,
      {
        tugas: defaultTask.uraianTugas || '',
        satuan: defaultTask.hasilKerja || '',
        waktu: defaultTask.waktuPenyelesaian || 0,
        volume: defaultTask.jumlahHasil || 0
      }
    ]);
  };

  const handleDeleteRow = (index: number) => {
    const newRows = [...abkRows];
    newRows.splice(index, 1);
    setAbkRows(newRows);
  };

  const handleUpdateRow = (index: number, field: keyof ABKRow, value: string | number) => {
    const newRows = [...abkRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setAbkRows(newRows);
  };

  const calculateRequired = (waktu: number, volume: number) => {
    if (!wke) return 0;
    return (waktu * volume) / wke;
  };

  let totalWaktuEfektif = 0;
  let totalRequired = 0;
  abkRows.forEach(row => {
    const we = row.waktu * row.volume;
    totalWaktuEfektif += we;
    totalRequired += calculateRequired(row.waktu, row.volume);
  });

  const handleSave = async () => {
    if (!activeJob) return;
    if (isReadOnly) {
      showToast("❌ Tidak dapat menyimpan: Mode Lihat-Saja aktif.");
      return;
    }
    setSaving(true);
    try {
      const payload: ABKData = {
        jabatanId: activeJob,
        rows: abkRows,
        wke: wke,
        waktuSatuan: waktuSatuan,
        totalWaktuEfektif: totalWaktuEfektif,
        totalKebutuhan: totalRequired,
        formasiPembulatan: calculateFormasiPembulatan(totalRequired)
      };
      await api.saveABK(activeJob, payload);

      // Update local tree data state
      const updateNodeInTree = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map(node => {
          if (node.id === activeJob) {
            return { ...node, abkTerisi: true };
          }
          if (node.children && node.children.length > 0) {
            return { ...node, children: updateNodeInTree(node.children) };
          }
          return node;
        });
      };
      setTreeData(prev => updateNodeInTree(prev));

      showToast("✅ Beban Kerja berhasil disimpan!");
      setAlertModal({
        title: "Berhasil",
        message: "Berhasil Disimpan",
        type: "success"
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast("❌ Gagal menyimpan beban kerja: " + errMsg);
      setAlertModal({
        title: "Gagal Menyimpan",
        message: "Gagal menyimpan beban kerja: " + errMsg,
        type: "error"
      });
    }
    setSaving(false);
  };

  // TREE RENDERING
  const renderTreeNodes = (nodes: TreeNode[]) => (
    <ul>
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
            <li key={node.id} className={treeStyles.treeNode}>
              <div className={`${treeStyles.treeNodeContent} ${treeStyles.treeNodeContentOpd}`} onClick={(e) => toggleNode(node.id, e)}>
                 <div className={treeStyles.treeToggle}>
                   {hasChildren ? (
                     <span style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
                   ) : <span></span>}
                 </div>
                 <div className={treeStyles.treeIcon}>🏛️</div>
                 <div className={treeStyles.treeTitleRow}>
                   <span className={treeStyles.titleLabel}>{node.label}</span>
                   {node.parentId && <span className={treeStyles.badgeOpdSub}>Sub-Unit</span>}
                 </div>
              </div>
              {isExpanded && hasChildren && renderTreeNodes(node.children)}
            </li>
          );
        }

        return (
          <li key={node.id} className={treeStyles.treeNode}>
            <div className={`${treeStyles.treeNodeContent} ${highlightClass}`} onClick={(e) => toggleNode(node.id, e)}>
               <div className={treeStyles.treeToggle}>
                 {hasChildren ? (
                   <span style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
                 ) : <span></span>}
               </div>
               <div className={treeStyles.treeTitleRow}>
                 <span className={treeStyles.titleLabel}>{node.label}</span>
               </div>
               <div className={treeStyles.rightSection}>
                 {node.anjabTerisi ? (
                   <span className={treeStyles.badgeSuccess} title="Anjab Terisi">✅ Anjab Terisi</span>
                 ) : (
                   <span className={treeStyles.badgeWarning} title="Anjab Kosong">⚠️ Anjab Kosong</span>
                 )}
                 {node.abkTerisi ? (
                   <span className={treeStyles.badgeSuccess} title="ABK Terisi">✅ ABK Terisi</span>
                 ) : (
                   <span className={treeStyles.badgeWarning} title="ABK Kosong">⚠️ ABK Kosong</span>
                 )}
                 
                 <span className={`${treeStyles.badgeEselon} ${eselonClass}`}>
                   <span className={treeStyles.badgeIcon}>{icon}</span>
                   {node.eselon || 'Jabatan'}
                 </span>
                 {node.kelas && (
                   <span className={treeStyles.badgeKelas}>Kls {node.kelas}</span>
                 )}
                 <div className={treeStyles.treeActions}>
                    <button type="button" className={`${treeStyles.actionBtn} ${treeStyles.actionBtnPrimary}`} title="Isi ABK" onClickCapture={(e) => openEditor(node, e)}>
                       ⚖️ Isi ABK
                    </button>
                 </div>
               </div>
            </div>
            {isExpanded && hasChildren && renderTreeNodes(node.children)}
          </li>
        );
      })}
    </ul>
  );

  const displayTree = filterTreeNodes(treeData, searchQuery);

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Analisis Beban Kerja</h1>
          <p className={styles.subtitle}>
            Perhitungan Formasi Kebutuhan Pegawai Negeri Sipil
          </p>
        </div>
      </div>

      {isReadOnly && (
        <div style={{
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          border: '1px solid #f59e0b',
          color: '#b45309',
          padding: '1rem 1.5rem',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          fontWeight: 500
        }}>
          <span style={{ fontSize: '1.5rem' }}>🔒</span>
          <div>
            <strong style={{ fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>Mode Lihat-Saja (Read-Only) Aktif</strong>
            <span style={{ fontSize: '0.9rem', opacity: 0.9 }}>{lockReason}</span>
          </div>
        </div>
      )}

      <div className={`${treeStyles.card} glass-panel`}>
        <div className={treeStyles.toolbar}>
          <input
            type="text" placeholder="Cari nama unit kerja atau jabatan..."
            className={treeStyles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}
          />
          <button type="button" className={treeStyles.btnSecondary} onClick={expandAll} style={{ marginLeft: '12px', whiteSpace: 'nowrap' }}>
            ➕ Kembangkan Semua
          </button>
          <button type="button" className={treeStyles.btnSecondary} onClick={collapseAll} style={{ marginLeft: '12px', whiteSpace: 'nowrap' }}>
            ➖ Ciutkan Semua
          </button>
        </div>

        <div className={treeStyles.treeContainerWrapper} style={{ overflowX: 'auto', minWidth: '800px', padding: '20px' }}>
          {isLoadingTree ? (
            <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>Memuat silsilah pohon organisasi OPD Anda...</div>
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
              <span className={styles.jobBadge}>{activeJobData?.eselon || "Jabatan"}</span>
            </div>
            <div className={styles.jobTitle}>{activeJobData?.label || "— Pilih Jabatan —"}</div>
            {activeJob && (
              <div style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.25rem" }}>
                Status Anjab: <strong style={{ color: anjabStatus === 'done' ? 'hsl(142, 71%, 45%)' : '#f59e0b' }}>
                  {anjabStatus === 'done' ? 'Selesai' : 'Belum diisi'}
                </strong>
              </div>
            )}
          </div>

          <div className={styles.panelContent}>
            {loadingEditor ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', opacity: 0.5 }}>
                <div className={styles.jobBadge} style={{ animation: 'spin 1s linear infinite' }}>⏳</div>
                <p>Memuat data...</p>
              </div>
            ) : (
              <>
                <div className={styles.actionRow}>
                  <div style={{ fontSize: '0.9rem', opacity: 0.8, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span><strong>WKE:</strong></span>
                    <input type="number" className={styles.editableInput} value={wke}
                      disabled={isReadOnly}
                      onChange={(e) => setWke(parseInt(e.target.value) || (waktuSatuan === 'jam' ? 1250 : 72000))}
                      style={{ width: '100px' }} />
                    <select className={styles.editableInput} style={{ width: '130px', cursor: 'pointer' }}
                      disabled={isReadOnly}
                      value={waktuSatuan} onChange={(e) => {
                        const val = e.target.value as 'jam' | 'menit';
                        if (val !== waktuSatuan) {
                          setWaktuSatuan(val);
                          setWke(val === 'jam' ? 1250 : 72000);
                          setAbkRows(prev => prev.map(r => ({
                            ...r,
                            waktu: val === 'menit' ? Math.round(r.waktu * 60) : Math.round((r.waktu / 60) * 100) / 100
                          })));
                        }
                      }}>
                      <option value="jam">Jam / Tahun</option>
                      <option value="menit">Menit / Tahun</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {!isReadOnly && (
                      <>
                        <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'hsla(var(--primary), 0.1)', border: '1px solid hsla(var(--primary), 0.2)', color: 'hsl(var(--primary))', borderRadius: '8px', cursor: 'pointer' }}
                          onClick={async () => {
                            if (confirm("Tarik ulang data dari Anjab? Data ABK saat ini akan tertimpa.")) {
                              const fullData = await api.getJabatanFull(activeJob) as { tugasPokok?: any[] };
                              const tp = fullData?.tugasPokok || [];
                              if (tp.length === 0) {
                                showToast("⚠️ Anjab masih kosong!");
                                setAlertModal({
                                  title: "Perhatian",
                                  message: "Anjab masih kosong!",
                                  type: "warning"
                                });
                                return;
                              }
                              setAbkRows(tp.map(t => ({
                                tugas: t.uraianTugas || '',
                                satuan: t.hasilKerja || '',
                                waktu: t.waktuPenyelesaian || 0,
                                volume: t.jumlahHasil || 0
                              })));
                              setWaktuSatuan('jam');
                              setWke(1250);
                              showToast("✅ Berhasil menarik data dari Anjab");
                              setAlertModal({
                                title: "Berhasil",
                                message: "Tarik Anjab berhasil",
                                type: "success"
                              });
                            }
                          }}>🔄 Tarik dari Anjab</button>
                        <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                          onClick={handleAddRow}>+ Tambah Baris</button>
                        <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                          onClick={handleSave} disabled={saving}>
                          {saving ? 'Menyimpan...' : '💾 Simpan'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: '50px', textAlign: 'center' }}>No</th>
                        <th style={{ width: '35%' }}>Uraian Tugas</th>
                        <th style={{ width: '10%' }}>Satuan Hasil</th>
                        <th style={{ width: '12%', textAlign: 'center' }}>Waktu ({waktuSatuan === 'jam' ? 'Jam' : 'Menit'})</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>Volume / Tahun</th>
                        <th style={{ width: '12%', textAlign: 'center' }}>Waktu Efektif</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>Kebutuhan Pegawai</th>
                        <th style={{ width: '60px' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abkRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                            Belum ada data tugas. Klik "+ Tambah Baris" atau isi Anjab terlebih dahulu.
                          </td>
                        </tr>
                      ) : (
                        abkRows.map((row, idx) => {
                          const waktuEfektif = row.waktu * row.volume;
                          const kebutuhan = calculateRequired(row.waktu, row.volume);
                          return (
                            <tr key={idx}>
                              <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                              <td>
                                {anjabTasks.length > 0 ? (
                                  <select
                                    className={styles.editableInput}
                                    value={row.tugas}
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                      const selectedTugas = e.target.value;
                                      const matchingTask = anjabTasks.find(t => t.uraianTugas === selectedTugas);
                                      if (matchingTask) {
                                        const newRows = [...abkRows];
                                        newRows[idx] = {
                                          tugas: matchingTask.uraianTugas,
                                          satuan: matchingTask.hasilKerja || row.satuan,
                                          waktu: matchingTask.waktuPenyelesaian || row.waktu,
                                          volume: matchingTask.jumlahHasil || row.volume
                                        };
                                        setAbkRows(newRows);
                                      } else {
                                        handleUpdateRow(idx, 'tugas', selectedTugas);
                                      }
                                    }}
                                    style={{ textAlign: 'left', width: '100%' }}
                                  >
                                    <option value="" disabled>-- Pilih Uraian Tugas dari Anjab --</option>
                                    {anjabTasks.map((t, tIdx) => (
                                      <option key={tIdx} value={t.uraianTugas}>
                                        {t.uraianTugas}
                                      </option>
                                    ))}
                                    {row.tugas && !anjabTasks.some(t => t.uraianTugas === row.tugas) && (
                                      <option value={row.tugas}>{row.tugas}</option>
                                    )}
                                  </select>
                                ) : (
                                  <input type="text" className={styles.editableInput} value={row.tugas}
                                    disabled={isReadOnly}
                                    onChange={(e) => handleUpdateRow(idx, 'tugas', e.target.value)}
                                    style={{ textAlign: 'left' }} />
                                )}
                              </td>
                              <td><input type="text" className={styles.editableInput} value={row.satuan}
                                disabled={isReadOnly}
                                onChange={(e) => handleUpdateRow(idx, 'satuan', e.target.value)} /></td>
                              <td><input type="number" className={styles.editableInput} value={row.waktu}
                                disabled={isReadOnly}
                                onChange={(e) => handleUpdateRow(idx, 'waktu', parseInt(e.target.value) || 0)} /></td>
                              <td><input type="number" className={styles.editableInput} value={row.volume}
                                disabled={isReadOnly}
                                onChange={(e) => handleUpdateRow(idx, 'volume', parseInt(e.target.value) || 0)} /></td>
                              <td style={{ textAlign: 'center', fontWeight: 500 }}>{waktuEfektif.toLocaleString('id-ID')}</td>
                              <td className={styles.resultCell}>{kebutuhan.toFixed(4)}</td>
                              <td style={{ textAlign: 'center' }}>
                                {!isReadOnly && (
                                  <button onClick={() => handleDeleteRow(idx)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1.1rem' }}
                                    title="Hapus baris">🗑</button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                      {abkRows.length > 0 && (
                        <>
                          <tr className={styles.summaryRow}>
                            <td colSpan={5} style={{ textAlign: 'right', paddingRight: '20px' }}>Total</td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{totalWaktuEfektif.toLocaleString('id-ID')}</td>
                            <td className={styles.resultCell} style={{ fontSize: '1.1rem' }}>{totalRequired.toFixed(4)}</td>
                            <td></td>
                          </tr>
                          <tr style={{ background: 'hsla(var(--primary), 0.2)', fontWeight: 'bold' }}>
                            <td colSpan={6} style={{ textAlign: 'right', paddingRight: '20px' }}>Pembulatan Formasi</td>
                            <td className={styles.resultCell} style={{ fontSize: '1.25rem' }}>{calculateFormasiPembulatan(totalRequired)}</td>
                            <td></td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      </div>
      )}

      {alertModal && (
        <div className={styles.alertOverlay} onClick={() => setAlertModal(null)}>
          <div className={styles.alertCard} onClick={(e) => e.stopPropagation()}>
            <button 
              type="button" 
              className={styles.alertClose} 
              onClick={() => setAlertModal(null)}
              aria-label="Tutup"
            >
              ✕
            </button>
            <div className={
              alertModal.type === 'error' ? styles.alertIconError :
              alertModal.type === 'warning' ? styles.alertIconWarning :
              styles.alertIconSuccess
            }>
              {alertModal.type === 'error' ? '✕' : alertModal.type === 'warning' ? '!' : '✓'}
            </div>
            <div className={styles.alertTitle}>{alertModal.title}</div>
            <div className={styles.alertMessage}>{alertModal.message}</div>
            <button 
              type="button" 
              className={styles.alertButton} 
              onClick={() => setAlertModal(null)}
              autoFocus
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
