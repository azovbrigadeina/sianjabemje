"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import { UnitKerja, ReferensiJabatan } from "@/lib/types";

type TreeNode = {
  id: string;
  type: 'OPD' | 'JABATAN';
  label: string;
  eselon?: string;
  kelas?: number;
  parentId?: string;
  unitKerjaId?: string;
  urutan?: number;
  children: TreeNode[];
};

type ModalMode = 'add' | 'edit' | null;
type ModalTarget = 'opd' | 'jabatan';

interface ModalData {
  id?: string;
  nama: string;
  kode: string;
  parentId: string;
  unitKerjaId: string;
  urutan: number;
  jenisJabatan: string;
  kelasJabatan: number;
  targetType: ModalTarget;
}

const EMPTY_MODAL: ModalData = {
  nama: '', kode: '', parentId: '', unitKerjaId: '', urutan: 0,
  jenisJabatan: '', kelasJabatan: 1, targetType: 'jabatan'
};

export default function OrganisasiPage() {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeYear, setActiveYear] = useState<string>("2026");
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [orgEditEnabled, setOrgEditEnabled] = useState<boolean>(true);
  const [isSavingOrgSetting, setIsSavingOrgSetting] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalData, setModalData] = useState<ModalData>(EMPTY_MODAL);
  const [modalSaving, setModalSaving] = useState(false);

  // Raw data refs for modal dropdowns
  const [rawOpds, setRawOpds] = useState<UnitKerja[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawJabatans, setRawJabatans] = useState<any[]>([]);

  // Autocomplete parent state
  const [parentSearch, setParentSearch] = useState("");
  const [showParentDropdown, setShowParentDropdown] = useState(false);

  // Autocomplete referensi state
  const [rawReferensi, setRawReferensi] = useState<ReferensiJabatan[]>([]);
  const [referensiSearch, setReferensiSearch] = useState("");
  const [showReferensiDropdown, setShowReferensiDropdown] = useState(false);

  useEffect(() => {
    if (modalMode && modalData.targetType === 'jabatan') {
      if (modalData.parentId) {
        const parentJbt = rawJabatans.find(j => j.id === modalData.parentId);
        if (parentJbt) {
          const opdName = parentJbt.unitKerjaId ? rawOpds.find(o => o.id === parentJbt.unitKerjaId)?.nama || parentJbt.unitKerjaId : "";
          setParentSearch(`${parentJbt.namaJabatan}${opdName ? ` (${opdName})` : ''}`);
        } else {
          setParentSearch("");
        }
      } else {
        setParentSearch("");
      }
    } else {
      setParentSearch("");
    }
  }, [modalData.parentId, modalMode, rawJabatans, rawOpds]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleToggleOrgEdit = async () => {
    const newStatus = !orgEditEnabled;
    setOrgEditEnabled(newStatus);
    setIsSavingOrgSetting(true);
    try {
      await api.saveOrgSetting({ enabled: newStatus });
      showToast(`✅ Akses edit operator berhasil ${newStatus ? 'diizinkan' : 'dicekal'}.`);
    } catch (err: any) {
      alert("Gagal menyimpan pengaturan: " + err.message);
      setOrgEditEnabled(!newStatus); // rollback
    } finally {
      setIsSavingOrgSetting(false);
    }
  };

  const loadData = useCallback(async (silent = false) => {
    if (silent) {
      setIsBackgroundRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const [opdsRaw, jabatansRaw, referensiRaw, orgSetting] = await Promise.all([
        api.getUnitKerja(),
        api.readAllEntity('jabatan', ''),
        api.readAllEntity('referensiJabatan', ''),
        api.getOrgSetting().catch(() => null)
      ]);

      const opds = (opdsRaw || []) as UnitKerja[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jabatans = (jabatansRaw || []) as any[];
      const referensi = (referensiRaw || []) as ReferensiJabatan[];

      setRawOpds(opds);
      setRawJabatans(jabatans);
      setRawReferensi(referensi);

      if (orgSetting) {
        setOrgEditEnabled(orgSetting.enabled !== false);
      } else {
        setOrgEditEnabled(true);
      }


      if (opds.length === 0 && jabatans.length === 0) {
        setIsEmpty(true);
        setTreeData([]);
        setIsLoading(false);
        setIsBackgroundRefreshing(false);
        return;
      }

      setIsEmpty(false);

      const map: Record<string, TreeNode> = {};
      const roots: TreeNode[] = [];

      opds.forEach(opd => {
        map[opd.id] = {
          id: opd.id, type: 'OPD', label: opd.nama || opd.id,
          parentId: opd.parentId, urutan: opd.urutan || 0, children: []
        };
      });

      jabatans.forEach(jbt => {
        map[jbt.id] = {
          id: jbt.id, type: 'JABATAN', label: jbt.namaJabatan || jbt.id,
          eselon: jbt.jenisJabatan, kelas: jbt.kelasJabatan,
          parentId: jbt.parentId, unitKerjaId: jbt.unitKerjaId,
          urutan: jbt.urutan || 0,
          children: []
        };
      });

      // --- TIPUAN VISUAL UNTUK SUB-UNIT (BAGIAN/UPTD) ---
      // Jika ada Jabatan di Sub-Unit yang atasannya ada di Unit Kerja lain (misal: Kabag di bawah Asisten),
      // maka secara visual kita pindahkan Node OPD Sub-Unit tersebut ke bawah Jabatan Asisten.
      const opdToExternalParentJbt: Record<string, string> = {};
      const jbtToReroute: Record<string, boolean> = {};

      jabatans.forEach(jbt => {
        if (jbt.parentId && jbt.unitKerjaId) {
          const parentJbt = jabatans.find((p: any) => p.id === jbt.parentId);
          if (parentJbt && parentJbt.unitKerjaId && parentJbt.unitKerjaId !== jbt.unitKerjaId) {
            // Ditemukan cross-unit reporting!
            opdToExternalParentJbt[jbt.unitKerjaId] = jbt.parentId;
            jbtToReroute[jbt.id] = true; // Jabatan ini dimunculkan di bawah OPD-nya, bukan menduplikasi di bawah parent aslinya
          }
        }
      });

      opds.forEach(opd => {
        if (opdToExternalParentJbt[opd.id] && map[opdToExternalParentJbt[opd.id]]) {
          // Visual Trick: OPD Sub-Unit nempel di bawah Jabatan Atasannya
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
        } else {
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
      setTreeData(roots);

      setExpandedNodes(prev => {
        const next = { ...prev };
        opds.forEach(opd => {
          if (next[opd.id] === undefined) {
            next[opd.id] = false; // Collapsed by default
          }
        });
        return next;
      });
    } catch (error) {
      console.error("Gagal memuat data tree", error);
    }
    setIsLoading(false);
    setIsBackgroundRefreshing(false);
  }, []);

  useEffect(() => {
    // Initial load
    const savedYear = localStorage.getItem("sianjab_active_year") || "2026";
    setActiveYear(savedYear);
    loadData();

    // Listener for header year changes
    const handleYearChanged = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const newYear = customEvent.detail || "2026";
      setActiveYear(newYear);
    };

    window.addEventListener("yearChanged", handleYearChanged);
    return () => {
      window.removeEventListener("yearChanged", handleYearChanged);
    };
  }, [loadData]);

  // Trigger reload when activeYear changes
  useEffect(() => {
    loadData();
  }, [activeYear, loadData]);



  const handleSyncToSheet = async () => {
    if (!confirm("Sinkronkan seluruh data ke Google Sheet?")) return;
    setIsSyncing(true);
    try {
      await api.syncToSheet();
      showToast("✅ Data berhasil disinkronkan ke Google Sheet!");
    } catch (error) {
      alert("Gagal sync ke Sheet: " + error);
    }
    setIsSyncing(false);
  };

  const handleSyncFromSheet = async () => {
    if (!confirm("Tarik data dari Google Sheet? Baris tanpa ID akan dibuatkan ID baru di Sheet.")) return;
    setIsSyncing(true);
    try {
      await api.syncFromSheet();
      showToast("✅ Data berhasil ditarik dari Google Sheet!");
      await loadData();
    } catch (error) {
      alert("Gagal tarik dari Sheet: " + error);
    }
    setIsSyncing(false);
  };

  const handlePublishSitpp = async () => {
    if (!confirm("Publish seluruh struktur organisasi ini ke SiTPP sekarang? SiTPP akan langsung membaca data terbaru ini.")) return;
    setIsSyncing(true);
    try {
      await api.exportForSitpp();
      showToast("🚀 Data struktur berhasil dipublish! SiTPP sekarang menggunakan versi terbaru ini.");
    } catch (error) {
      alert("Gagal mempublish: " + error);
    }
    setIsSyncing(false);
  };



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

  // --- MODAL HANDLERS ---
  const openAddOpdModal = () => {
    setModalData({
      ...EMPTY_MODAL,
      targetType: 'opd'
    });
    setReferensiSearch("");
    setModalMode('add');
  };

  const openAddModal = (parentNode: TreeNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("openAddModal called for", parentNode);
    setModalData({
      ...EMPTY_MODAL,
      parentId: parentNode.type === 'JABATAN' ? parentNode.id : '',
      unitKerjaId: parentNode.type === 'OPD' ? parentNode.id : (parentNode.unitKerjaId || ''),
      targetType: 'jabatan'
    });
    setParentSearch("");
    setReferensiSearch("");
    setModalMode('add');
  };

  const openEditModal = (node: TreeNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("openEditModal called for", node);
    if (node.type === 'OPD') {
      const opd = rawOpds.find(o => o.id === node.id);
      setModalData({
        id: node.id, nama: opd?.nama || node.label, kode: opd?.kode || '',
        parentId: opd?.parentId || '', unitKerjaId: '', jenisJabatan: '',
        kelasJabatan: 0, urutan: opd?.urutan || 0, targetType: 'opd'
      });
      setReferensiSearch("");
    } else {
      setModalData({
        id: node.id, nama: node.label, kode: '',
        parentId: node.parentId || '', unitKerjaId: node.unitKerjaId || '',
        jenisJabatan: node.eselon || '', kelasJabatan: node.kelas || 1,
        urutan: node.urutan || 0, targetType: 'jabatan'
      });
      if (node.eselon === 'Pelaksana' || (node.eselon || '').startsWith('Fungsional')) {
        setReferensiSearch(node.label);
      } else {
        setReferensiSearch("");
      }
    }
    setModalMode('edit');
  };

  const handleDelete = async (node: TreeNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const type = node.type === 'OPD' ? 'Unit Kerja' : 'Jabatan';
    if (!confirm(`Yakin ingin menghapus ${type}: "${node.label}"? Ini tidak bisa dibatalkan.`)) return;
    try {
      if (node.type === 'OPD') {
        await api.deleteEntity('unitKerja', node.id);
      } else {
        await api.deleteJabatan(node.id);
      }
      showToast(`✅ ${type} "${node.label}" berhasil dihapus.`);
      await loadData(true);
    } catch (error) {
      alert("Gagal menghapus: " + error);
    }
  };

  const handleModalSave = async () => {
    if (modalData.targetType === 'jabatan' && (modalData.jenisJabatan === 'Pelaksana' || modalData.jenisJabatan.startsWith('Fungsional'))) {
      const isMatch = rawReferensi.some(ref => {
        const refJenis = (ref.jenisJabatan || '').toLowerCase();
        const modalJenis = modalData.jenisJabatan;
        const baseName = (ref.namaBase || '').toLowerCase();
        const inputName = modalData.nama.toLowerCase();
        if (modalJenis === 'Fungsional Keahlian') {
          return refJenis === 'fungsional' && ref.kategori === 'Keahlian' && (inputName === baseName || inputName.startsWith(baseName));
        }
        if (modalJenis === 'Fungsional Keterampilan') {
          return refJenis === 'fungsional' && ref.kategori === 'Keterampilan' && (inputName === baseName || inputName.startsWith(baseName));
        }
        if (modalJenis === 'Fungsional') {
          return refJenis === 'fungsional' && (inputName === baseName || inputName.startsWith(baseName));
        }
        return refJenis === modalJenis.toLowerCase() && inputName === baseName;
      });
      if (!isMatch) {
        alert(`Nama jabatan harus dipilih dari referensi Jabatan ${modalData.jenisJabatan} yang terdaftar.`);
        return;
      }
    }
    setModalSaving(true);
    try {
      if (modalData.targetType === 'opd') {
        const opdPayload = {
          nama: modalData.nama,
          kode: modalData.kode,
          parentId: modalData.parentId || null,
          urutan: modalData.urutan || 0,
          tahun: activeYear
        };
        if (modalMode === 'edit' && modalData.id) {
          await api.updateEntity('unitKerja', modalData.id, opdPayload);
          showToast("✅ Unit Kerja berhasil diperbarui.");
        } else {
          await api.createEntity('unitKerja', opdPayload);
          showToast("✅ Unit Kerja baru berhasil ditambahkan.");
        }
      } else {
        const jabatanPayload = {
          namaJabatan: modalData.nama,
          kodeJabatan: modalData.kode || '',
          jenisJabatan: modalData.jenisJabatan,
          kelasJabatan: modalData.kelasJabatan,
          parentId: modalData.parentId || null,
          unitKerjaId: modalData.unitKerjaId || null,
          urutan: modalData.urutan || 0,
          ikhtisarJabatan: '',
          level: 1,
          tahun: activeYear
        };
        if (modalMode === 'edit' && modalData.id) {
          await api.updateJabatan(modalData.id, {
            namaJabatan: modalData.nama,
            kodeJabatan: modalData.kode || '',
            jenisJabatan: modalData.jenisJabatan,
            kelasJabatan: modalData.kelasJabatan,
            parentId: modalData.parentId || null,
            unitKerjaId: modalData.unitKerjaId || null,
            urutan: modalData.urutan || 0,
            ikhtisarJabatan: '',
            level: 1,
            tahun: activeYear
          });
          showToast("✅ Jabatan berhasil diperbarui.");
        } else {
          if (modalData.jenisJabatan === 'Fungsional Keahlian') {
            const levels = [
              { suffix: 'Ahli Utama', kelas: 13 },
              { suffix: 'Ahli Madya', kelas: 11 },
              { suffix: 'Ahli Muda', kelas: 9 },
              { suffix: 'Ahli Pertama', kelas: 8 }
            ];
            const pId = modalData.parentId || null;
            for (let i = 0; i < levels.length; i++) {
              const lvl = levels[i];
              const payload = {
                namaJabatan: `${modalData.nama} ${lvl.suffix}`,
                kodeJabatan: modalData.kode || '',
                jenisJabatan: modalData.jenisJabatan,
                kelasJabatan: lvl.kelas,
                parentId: pId,
                unitKerjaId: modalData.unitKerjaId || null,
                urutan: modalData.urutan || 0,
                ikhtisarJabatan: '',
                level: 1,
                tahun: activeYear
              };
              await api.createJabatan(payload);
            }
            showToast("✅ Jabatan Fungsional Keahlian baru berhasil ditambahkan.");
          } else if (modalData.jenisJabatan === 'Fungsional Keterampilan') {
            const levels = [
              { suffix: 'Penyelia', kelas: 8 },
              { suffix: 'Mahir', kelas: 7 },
              { suffix: 'Terampil', kelas: 6 },
              { suffix: 'Pemula', kelas: 5 }
            ];
            const pId = modalData.parentId || null;
            for (let i = 0; i < levels.length; i++) {
              const lvl = levels[i];
              const payload = {
                namaJabatan: `${modalData.nama} ${lvl.suffix}`,
                kodeJabatan: modalData.kode || '',
                jenisJabatan: modalData.jenisJabatan,
                kelasJabatan: lvl.kelas,
                parentId: pId,
                unitKerjaId: modalData.unitKerjaId || null,
                urutan: modalData.urutan || 0,
                ikhtisarJabatan: '',
                level: 1,
                tahun: activeYear
              };
              await api.createJabatan(payload);
            }
            showToast("✅ Jabatan Fungsional Keterampilan baru berhasil ditambahkan.");
          } else {
            await api.createJabatan(jabatanPayload);
            showToast("✅ Jabatan baru berhasil ditambahkan.");
          }
        }
      }

      // Auto-expand direct parent if a child is added
      const parentToExpand = modalMode === 'add' ? (modalData.parentId || modalData.unitKerjaId || null) : null;
      if (parentToExpand) {
        setExpandedNodes(prev => ({ ...prev, [parentToExpand]: true }));
      }

      setModalMode(null);
      await loadData(true);
    } catch (error) {
      alert("Gagal menyimpan: " + error);
    }
    setModalSaving(false);
  };

  // --- SEARCH FILTER ---
  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;
    const q = query.toLowerCase();
    return nodes.reduce<TreeNode[]>((acc, node) => {
      const match = node.label.toLowerCase().includes(q);
      const filteredChildren = filterTree(node.children, query);
      if (match || filteredChildren.length > 0) {
        acc.push({ ...node, children: match ? node.children : filteredChildren });
      }
      return acc;
    }, []);
  };

  const displayTree = filterTree(treeData, searchQuery);

  // Pagination logic
  const pageSize = 10;
  const totalPages = Math.ceil(displayTree.length / pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [displayTree, totalPages, currentPage]);

  const paginatedTree = displayTree.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Fungsi Renderer Rekursif
  const renderTreeNodes = (nodes: TreeNode[]) => (
    <ul>
      {nodes.map(node => {
        const isExpanded = !!expandedNodes[node.id];
        const hasChildren = node.children.length > 0;
        
        let highlightClass = '';
        let icon = '📌';
        let eselonClass = styles.eselonLainnya;
        const eselonVal = (node.eselon || '').toLowerCase().trim();
        const isJbtDisabled = node.type === 'JABATAN' && (eselonVal === 'pelaksana' || eselonVal.includes('fungsional'));
        
        if (eselonVal.includes('pimpinan tinggi')) { highlightClass = styles.nodeHighlightJpt; icon = '⭐'; eselonClass = styles.eselonJpt; }
        else if (eselonVal === 'administrator') { icon = '🛡️'; eselonClass = styles.eselonAdministrator; }
        else if (eselonVal === 'pengawas') { icon = '👁️'; eselonClass = styles.eselonPengawas; }
        else if (eselonVal.includes('fungsional')) { icon = '💼'; eselonClass = styles.eselonFungsional; }
        else if (eselonVal === 'pelaksana') { icon = '👤'; eselonClass = styles.eselonPelaksana; }
        if (node.type === 'OPD') icon = '🏢';

        return (
          <li key={node.id} className={styles.treeNode}>
            <div onClick={(e) => toggleNode(node.id, e)} className={`${styles.treeNodeContent} ${highlightClass}`}>
               <div className={styles.treeToggle}>
                 {hasChildren ? (
                   <span style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                 ) : <span></span>}
               </div>
               <div className={styles.treeIcon}>{icon}</div>
               <div className={styles.treeTitleRow}>
                 <span className={styles.titleLabel}>{node.label}</span>
               </div>
               <div className={styles.rightSection}>
                 {node.type === 'JABATAN' && node.eselon && (
                   <span className={`${styles.badgeEselon} ${eselonClass}`}>{node.eselon}</span>
                 )}
                 {node.type === 'JABATAN' && node.kelas && (
                   <span className={styles.badgeKelas}>Kls {node.kelas}</span>
                 )}
                 <div className={styles.treeActions}>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnPrimary} ${isJbtDisabled ? styles.actionBtnDisabled : ''}`}
                      title={isJbtDisabled ? "Tidak dapat menambah jabatan di bawah Pelaksana/Fungsional" : "Tambah Bawahan"}
                      disabled={isJbtDisabled}
                      onClickCapture={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (isJbtDisabled) return;
                        openAddModal(node, e);
                      }}
                    >
                       <svg style={{ pointerEvents: 'none' }} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <button type="button" className={`${styles.actionBtn} ${styles.actionBtnWarning}`} title="Edit" onClickCapture={(e) => openEditModal(node, e)}>
                       <svg style={{ pointerEvents: 'none' }} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button type="button" className={`${styles.actionBtn} ${styles.actionBtnDanger}`} title="Hapus" onClickCapture={(e) => handleDelete(node, e)}>
                       <svg style={{ pointerEvents: 'none' }} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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

  return (
    <div className={styles.container}>
      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            Struktur Organisasi
            {isBackgroundRefreshing && (
              <span className={styles.refreshSpinner} title="Sinkronisasi data...">🔄</span>
            )}
          </h1>
          <p className={styles.subtitle}>Peta Jabatan (Tahun {activeYear}) — Master Data Sianjab</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={handleSyncFromSheet} disabled={isSyncing} title="Baca data dari Google Sheet ke Website">
            📥 Impor dari Sheet
          </button>
          <button className={styles.btnSecondary} onClick={handleSyncToSheet} disabled={isSyncing} title="Tulis data dari Website ke Google Sheet">
            📤 Ekspor ke Sheet
          </button>
          <button className={styles.btnPrimary} onClick={handlePublishSitpp} disabled={isSyncing} title="Kompilasi dan Publish Data ke SiTPP" style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}>
            {isSyncing ? "Memproses..." : "🚀 Publish ke SiTPP"}
          </button>
        </div>
      </div>

      {/* Toggle switch for operator edit permission */}
      <div className={`${styles.card} glass-panel`} style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔒 Hak Akses Pengeditan Operator
            </h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '4px 0 0 0' }}>
              Aktifkan untuk mengizinkan operator melakukan pengeditan struktur organisasi masing-masing OPD. Matikan untuk mengunci/mencekal pengeditan.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={orgEditEnabled}
                onChange={handleToggleOrgEdit}
                disabled={isSavingOrgSetting}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: orgEditEnabled ? '#10b981' : '#cbd5e1',
                transition: '.3s', borderRadius: '34px'
              }}>
                <span style={{
                  position: 'absolute', height: '18px', width: '18px', left: '4px', bottom: '4px',
                  backgroundColor: 'white', transition: '.3s', borderRadius: '50%',
                  transform: orgEditEnabled ? 'translateX(24px)' : 'translateX(0)'
                }}/>
              </span>
            </label>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: orgEditEnabled ? '#10b981' : '#64748b' }}>
              {isSavingOrgSetting ? "Menyimpan..." : orgEditEnabled ? "Pengeditan Diizinkan" : "Pengeditan Dicekal"}
            </span>
          </div>
        </div>
      </div>

      <div className={`${styles.card} glass-panel`}>
        <div className={styles.toolbar}>
          <input
            type="text" placeholder="Cari nama unit kerja atau jabatan..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}
          />
          <button type="button" className={styles.btnSecondary} onClick={expandAll} style={{ marginLeft: '12px', whiteSpace: 'nowrap' }}>
            ➕ Kembangkan Semua
          </button>
          <button type="button" className={styles.btnSecondary} onClick={collapseAll} style={{ marginLeft: '12px', whiteSpace: 'nowrap' }}>
            ➖ Ciutkan Semua
          </button>
        </div>

        <div className={styles.treeContainer} style={{ padding: '20px', overflowX: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>
               <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🌳</div>
               Memuat silsilah pohon organisasi...
            </div>
          ) : isEmpty ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', opacity: 0.7 }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏢</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Tabel Organisasi Kosong</h3>
              <p style={{ opacity: 0.7 }}>Silakan kelola OPD di menu Kelola OPD untuk memulai.</p>
            </div>
          ) : (
            <div className={styles.treeContainerWrapper} style={{ minWidth: '800px' }}>
              {renderTreeNodes(paginatedTree)}
              
              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button 
                    type="button"
                    className={styles.pageButton} 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Sebelumnya
                  </button>
                  
                  <span className={styles.paginationInfo}>
                    Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong> ({displayTree.length} OPD)
                  </span>
                  
                  <button 
                    type="button"
                    className={styles.pageButton} 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Berikutnya
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL */}
      {modalMode && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{modalMode === 'add' ? '➕ Tambah' : '✏️ Edit'} {modalData.targetType === 'opd' ? 'Unit Kerja' : 'Jabatan'}</h2>
              <button className={styles.modalClose} onClick={() => setModalMode(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {modalData.targetType === 'opd' ? (
                <>
                  <div className={styles.formGroup}>
                    <label>Nama Unit Kerja</label>
                    <input type="text" className={styles.formInput} value={modalData.nama}
                      onChange={(e) => setModalData({...modalData, nama: e.target.value})}
                      placeholder="Contoh: Dinas Kesehatan"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Induk Unit Kerja (Opsional)</label>
                    <select className={styles.formInput} value={modalData.parentId || ''}
                      onChange={(e) => setModalData({...modalData, parentId: e.target.value})}>
                      <option value="">-- Tidak ada (Ini adalah OPD Induk Utama) --</option>
                      {rawOpds
                        .filter(o => o.id !== modalData.id && !o.parentId) // only allow picking top-level OPDs as parent
                        .sort((a,b) => (a.nama||'').localeCompare(b.nama||''))
                        .map(o => (
                          <option key={o.id} value={o.id}>{o.nama}</option>
                        ))}
                    </select>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>Pilih jika ini adalah sub-unit seperti Puskesmas, UPTD, atau Bagian.</span>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Kode</label>
                    <input type="text" className={styles.formInput} value={modalData.kode}
                      onChange={(e) => setModalData({...modalData, kode: e.target.value})}
                      placeholder="Contoh: 1.02"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Urutan (Opsional)</label>
                    <input type="number" className={styles.formInput} value={modalData.urutan}
                      onChange={(e) => setModalData({...modalData, urutan: parseInt(e.target.value) || 0})}
                      placeholder="Contoh: 1"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.formGroup}>
                    <label>Jenis Jabatan</label>
                    <select className={styles.formInput} value={modalData.jenisJabatan}
                      onChange={(e) => {
                        const val = e.target.value;
                        setModalData({
                          ...modalData,
                          jenisJabatan: val,
                          nama: '' // Reset nama if jenis changes
                        });
                        setReferensiSearch(''); // Reset autocomplete query
                      }}>
                      <option value="">-- Pilih --</option>
                      <option value="Jabatan Pimpinan Tinggi">Jabatan Pimpinan Tinggi</option>
                      <option value="Administrator">Administrator</option>
                      <option value="Pengawas">Pengawas</option>
                      <option value="Pelaksana">Pelaksana</option>
                      <option value="Fungsional Keahlian">Fungsional Keahlian</option>
                      <option value="Fungsional Keterampilan">Fungsional Keterampilan</option>
                    </select>
                  </div>

                  {(modalData.jenisJabatan === 'Pelaksana' || modalData.jenisJabatan.startsWith('Fungsional')) ? (
                    <div className={styles.formGroup} style={{ position: 'relative' }}>
                      <label>Nama Jabatan (Sesuai Referensi)</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          className={styles.formInput}
                          placeholder={`Ketik untuk mencari referensi ${modalData.jenisJabatan}...`}
                          value={referensiSearch}
                          onChange={(e) => {
                            setReferensiSearch(e.target.value);
                            setShowReferensiDropdown(true);
                            // Reset modalData.nama to enforce choosing from references list
                            setModalData({ ...modalData, nama: '' });
                          }}
                          onFocus={() => setShowReferensiDropdown(true)}
                        />
                        {modalData.nama && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalData({ ...modalData, nama: '' });
                              setReferensiSearch('');
                            }}
                            style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: 'var(--foreground)',
                              opacity: 0.5,
                              cursor: 'pointer',
                              fontSize: '1rem'
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {showReferensiDropdown && (
                        <>
                          <div 
                            style={{
                              position: 'fixed',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              zIndex: 999
                            }}
                            onClick={() => setShowReferensiDropdown(false)}
                          />
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            backgroundColor: 'var(--background, #ffffff)',
                            color: 'var(--foreground, #1e293b)',
                            border: '1px solid var(--glass-border, #e2e8f0)',
                            borderRadius: '8px',
                            marginTop: '4px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            zIndex: 1000,
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                          }}>
                            {rawReferensi
                              .filter(ref => {
                                const modalJenis = modalData.jenisJabatan;
                                if (modalJenis === 'Fungsional Keahlian') {
                                  return (ref.jenisJabatan || '').toLowerCase() === 'fungsional' && ref.kategori === 'Keahlian';
                                }
                                if (modalJenis === 'Fungsional Keterampilan') {
                                  return (ref.jenisJabatan || '').toLowerCase() === 'fungsional' && ref.kategori === 'Keterampilan';
                                }
                                if (modalJenis === 'Fungsional') {
                                  return (ref.jenisJabatan || '').toLowerCase() === 'fungsional';
                                }
                                return (ref.jenisJabatan || '').toLowerCase() === modalJenis.toLowerCase();
                              })
                              .filter(ref => (ref.namaBase || '').toLowerCase().includes(referensiSearch.toLowerCase()))
                              .sort((a, b) => (a.namaBase || '').localeCompare(b.namaBase || ''))
                              .map(ref => {
                                const isSelected = ref.namaBase === modalData.nama;
                                return (
                                  <div
                                    key={ref.id}
                                    style={{
                                      padding: '0.5rem 1rem',
                                      cursor: 'pointer',
                                      backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.12)' : 'transparent',
                                      color: isSelected ? '#4f46e5' : 'inherit',
                                      borderBottom: '1px solid var(--glass-border, #f1f5f9)'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                    onClick={() => {
                                      setModalData({ ...modalData, nama: ref.namaBase });
                                      setReferensiSearch(ref.namaBase);
                                      setShowReferensiDropdown(false);
                                    }}
                                  >
                                    {ref.namaBase} {ref.jenisJabatan === 'Fungsional' && ref.kategori ? `(${ref.kategori})` : ''}
                                  </div>
                                );
                              })}
                            {rawReferensi
                              .filter(ref => {
                                const modalJenis = modalData.jenisJabatan;
                                if (modalJenis === 'Fungsional Keahlian') {
                                  return (ref.jenisJabatan || '').toLowerCase() === 'fungsional' && ref.kategori === 'Keahlian';
                                }
                                if (modalJenis === 'Fungsional Keterampilan') {
                                  return (ref.jenisJabatan || '').toLowerCase() === 'fungsional' && ref.kategori === 'Keterampilan';
                                }
                                if (modalJenis === 'Fungsional') {
                                  return (ref.jenisJabatan || '').toLowerCase() === 'fungsional';
                                }
                                return (ref.jenisJabatan || '').toLowerCase() === modalJenis.toLowerCase();
                              })
                              .filter(ref => (ref.namaBase || '').toLowerCase().includes(referensiSearch.toLowerCase())).length === 0 && (
                              <div style={{ padding: '0.5rem 1rem', opacity: 0.5, fontStyle: 'italic' }}>
                                Tidak ada referensi yang cocok
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={styles.formGroup}>
                      <label>Nama Jabatan</label>
                      <input type="text" className={styles.formInput} value={modalData.nama}
                        onChange={(e) => setModalData({...modalData, nama: e.target.value})}
                        placeholder="Contoh: Kepala Seksi"
                        disabled={!modalData.jenisJabatan}
                      />
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label>Urutan (Opsional)</label>
                    <input type="number" className={styles.formInput} value={modalData.urutan}
                      onChange={(e) => setModalData({...modalData, urutan: parseInt(e.target.value) || 0})}
                      placeholder="Contoh: 1"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Kelas Jabatan</label>
                    <input type="number" className={styles.formInput} min={1} max={17}
                      value={modalData.kelasJabatan}
                      onChange={(e) => setModalData({...modalData, kelasJabatan: parseInt(e.target.value) || 1})}
                    />
                  </div>

                  <div className={styles.formGroup} style={{ position: 'relative' }}>
                    <label>Induk Jabatan (Atasan Langsung)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="Ketik untuk mencari atasan langsung... (misal: camat)"
                        value={parentSearch}
                        onChange={(e) => {
                          setParentSearch(e.target.value);
                          setShowParentDropdown(true);
                          if (!e.target.value.trim()) {
                            setModalData({ ...modalData, parentId: '' });
                          }
                        }}
                        onFocus={() => setShowParentDropdown(true)}
                      />
                      {modalData.parentId && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalData({ ...modalData, parentId: '' });
                            setParentSearch('');
                          }}
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: 'var(--foreground)',
                            opacity: 0.5,
                            cursor: 'pointer',
                            fontSize: '1rem'
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {showParentDropdown && (
                      <>
                        <div 
                          style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 999
                          }}
                          onClick={() => setShowParentDropdown(false)}
                        />
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: 'var(--background, #ffffff)',
                          color: 'var(--foreground, #1e293b)',
                          border: '1px solid var(--glass-border, #e2e8f0)',
                          borderRadius: '8px',
                          marginTop: '4px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          zIndex: 1000,
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                        }}>
                          <div 
                            style={{
                              padding: '0.5rem 1rem',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--glass-border, #f1f5f9)',
                              opacity: 0.8,
                              backgroundColor: !modalData.parentId ? 'rgba(0, 0, 0, 0.04)' : 'transparent'
                            }}
                            onClick={() => {
                              setModalData({ ...modalData, parentId: '' });
                              setParentSearch('');
                              setShowParentDropdown(false);
                            }}
                          >
                            -- Tidak Ada / Pimpinan Tertinggi --
                          </div>
                          {rawJabatans
                            .filter(j => j.id !== modalData.id) // cegah set diri sendiri
                            .filter(j => {
                              const opdName = j.unitKerjaId ? rawOpds.find(o => o.id === j.unitKerjaId)?.nama || j.unitKerjaId : "";
                              const label = `${j.namaJabatan} ${opdName}`;
                              return label.toLowerCase().includes(parentSearch.toLowerCase());
                            })
                            .sort((a, b) => (a.namaJabatan || '').localeCompare(b.namaJabatan || ''))
                            .map(j => {
                              const opdName = j.unitKerjaId ? rawOpds.find(o => o.id === j.unitKerjaId)?.nama || j.unitKerjaId : "";
                              const isSelected = j.id === modalData.parentId;
                              return (
                                <div
                                  key={j.id}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    cursor: 'pointer',
                                    backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.12)' : 'transparent',
                                    color: isSelected ? '#4f46e5' : 'inherit',
                                    borderBottom: '1px solid var(--glass-border, #f1f5f9)'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                  onClick={() => {
                                    setModalData({ ...modalData, parentId: j.id });
                                    setParentSearch(`${j.namaJabatan}${opdName ? ` (${opdName})` : ''}`);
                                    setShowParentDropdown(false);
                                  }}
                                >
                                  <strong>{j.namaJabatan}</strong> {opdName ? `(${opdName})` : ''}
                                </div>
                              );
                            })}
                          {rawJabatans.filter(j => j.id !== modalData.id).filter(j => {
                            const opdName = j.unitKerjaId ? rawOpds.find(o => o.id === j.unitKerjaId)?.nama || j.unitKerjaId : "";
                            const label = `${j.namaJabatan} ${opdName}`;
                            return label.toLowerCase().includes(parentSearch.toLowerCase());
                          }).length === 0 && (
                            <div style={{ padding: '0.5rem 1rem', opacity: 0.5, fontStyle: 'italic' }}>
                              Tidak ada atasan yang cocok
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    <span style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>
                      Ketik nama jabatan atasan lalu pilih dari daftar yang muncul.
                    </span>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Unit Kerja</label>
                    <select className={styles.formInput} value={modalData.unitKerjaId}
                      onChange={(e) => setModalData({...modalData, unitKerjaId: e.target.value})}>
                      <option value="">-- Pilih Unit --</option>
                      {rawOpds.map(opd => (
                        <option key={opd.id} value={opd.id}>{opd.nama}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setModalMode(null)}>Batal</button>
              <button className={styles.btnSave} onClick={handleModalSave} disabled={modalSaving || !modalData.nama.trim()}>
                {modalSaving ? 'Menyimpan...' : '💾 Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
