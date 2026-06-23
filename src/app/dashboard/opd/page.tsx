"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import { UnitKerja } from "@/lib/types";

type TreeNode = {
  id: string;
  label: string;
  kode: string;
  parentId?: string;
  urutan?: number;
  children: TreeNode[];
};

type ModalMode = 'add' | 'edit' | null;

interface ModalData {
  id?: string;
  nama: string;
  kode: string;
  parentId: string;
  urutan: number;
}

const EMPTY_MODAL: ModalData = {
  nama: '',
  kode: '',
  parentId: '',
  urutan: 0
};

export default function OPDManagementPage() {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Modal State
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalData, setModalData] = useState<ModalData>(EMPTY_MODAL);
  const [modalSaving, setModalSaving] = useState(false);

  // Raw data for parent selection and filtering
  const [rawOpds, setRawOpds] = useState<UnitKerja[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

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
      await loadData(true);
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async (silent = false) => {
    if (silent) {
      setIsBackgroundRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const opdsRaw = await api.getUnitKerja();
      const opds = (opdsRaw || []) as UnitKerja[];
      setRawOpds(opds);

      if (opds.length === 0) {
        setIsEmpty(true);
        setTreeData([]);
        setIsLoading(false);
        setIsBackgroundRefreshing(false);
        return;
      }

      setIsEmpty(false);

      // Build tree
      const map: Record<string, TreeNode> = {};
      const roots: TreeNode[] = [];

      opds.forEach(opd => {
        map[opd.id] = {
          id: opd.id,
          label: opd.nama || opd.id,
          kode: opd.kode || '',
          parentId: opd.parentId,
          urutan: opd.urutan || 0,
          children: []
        };
      });

      opds.forEach(opd => {
        if (opd.parentId && map[opd.parentId]) {
          map[opd.parentId].children.push(map[opd.id]);
        } else {
          roots.push(map[opd.id]);
        }
      });

      // Sort nodes recursively by urutan first, then label
      const sortNodes = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => {
          const urutA = a.urutan ?? 999;
          const urutB = b.urutan ?? 999;
          if (urutA !== urutB) return urutA - urutB;
          return a.label.localeCompare(b.label);
        });
        nodes.forEach(n => {
          if (n.children.length > 0) {
            sortNodes(n.children);
          }
        });
      };

      sortNodes(roots);
      setTreeData(roots);

      // Expand all nodes by default initially if not expanded before
      setExpandedNodes(prev => {
        const next = { ...prev };
        opds.forEach(opd => {
          if (next[opd.id] === undefined) {
            next[opd.id] = true;
          }
        });
        return next;
      });

    } catch (error) {
      console.error("Gagal memuat data Unit Kerja", error);
      showToast("❌ Gagal memuat data");
    } finally {
      setIsLoading(false);
      setIsBackgroundRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // --- MODAL HANDLERS ---
  const openAddOpdModal = () => {
    setModalData({
      ...EMPTY_MODAL,
      parentId: ''
    });
    setModalMode('add');
  };

  const openAddSubUnitModal = (parentNode: TreeNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setModalData({
      ...EMPTY_MODAL,
      parentId: parentNode.id
    });
    setModalMode('add');
  };

  const openEditModal = (node: TreeNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const opd = rawOpds.find(o => o.id === node.id);
    setModalData({
      id: node.id,
      nama: opd?.nama || node.label,
      kode: opd?.kode || node.kode,
      parentId: opd?.parentId || '',
      urutan: opd?.urutan || node.urutan || 0
    });
    setModalMode('edit');
  };

  const handleDelete = async (node: TreeNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if the node has children
    if (node.children.length > 0) {
      alert(`Tidak dapat menghapus "${node.label}" karena memiliki ${node.children.length} sub-unit kerja. Hapus sub-unit terlebih dahulu.`);
      return;
    }

    if (!confirm(`Yakin ingin menghapus unit kerja: "${node.label}"? Tindakan ini tidak bisa dibatalkan.`)) return;

    try {
      await api.deleteUnitKerja(node.id);
      showToast(`✅ Unit kerja "${node.label}" berhasil dihapus.`);
      await loadData(true);
    } catch (error) {
      console.error("Gagal menghapus unit kerja", error);
      alert("Gagal menghapus: " + error);
    }
  };

  const handleModalSave = async () => {
    if (!modalData.nama.trim()) return;

    setModalSaving(true);
    try {
      const opdPayload = {
        nama: modalData.nama.trim(),
        kode: modalData.kode.trim(),
        parentId: modalData.parentId || null,
        urutan: modalData.urutan || 0,
        tahun: "2026",
        statusValidasi: "Draft"
      };

      if (modalMode === 'edit' && modalData.id) {
        await api.updateUnitKerja(modalData.id, opdPayload);
        showToast("✅ Unit Kerja berhasil diperbarui.");
      } else {
        await api.createUnitKerja(opdPayload);
        showToast("✅ Unit Kerja baru berhasil ditambahkan.");
      }

      // Auto-expand parent if added
      if (modalMode === 'add' && modalData.parentId) {
        setExpandedNodes(prev => ({ ...prev, [modalData.parentId]: true }));
      }

      setModalMode(null);
      await loadData(true);
    } catch (error) {
      console.error("Gagal menyimpan unit kerja", error);
      alert("Gagal menyimpan: " + error);
    } finally {
      setModalSaving(false);
    }
  };

  // --- CYCLE PREVENTION HELPER ---
  // Returns a set of all descendants of the given unitId
  const getDescendants = (unitId: string, units: UnitKerja[]): Set<string> => {
    const descendants = new Set<string>();
    const visit = (id: string) => {
      units.forEach(u => {
        if (u.parentId === id) {
          descendants.add(u.id);
          visit(u.id);
        }
      });
    };
    visit(unitId);
    return descendants;
  };

  // --- SEARCH FILTER ---
  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;
    const q = query.toLowerCase();
    return nodes.reduce<TreeNode[]>((acc, node) => {
      const match = node.label.toLowerCase().includes(q) || node.kode.toLowerCase().includes(q);
      const filteredChildren = filterTree(node.children, query);
      if (match || filteredChildren.length > 0) {
        acc.push({ ...node, children: match ? node.children : filteredChildren });
      }
      return acc;
    }, []);
  };

  const displayTree = filterTree(treeData, searchQuery);

  // Recursive Tree Node Renderer
  const renderTreeNodes = (nodes: TreeNode[]) => (
    <ul>
      {nodes.map(node => {
        const isExpanded = !!expandedNodes[node.id];
        const hasChildren = node.children.length > 0;
        const isTopLevel = !node.parentId;

        return (
          <li key={node.id} className={styles.treeNode}>
            <div onClick={(e) => toggleNode(node.id, e)} className={styles.treeNodeContent}>
              <div className={styles.treeToggle}>
                {hasChildren ? (
                  <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                ) : <span></span>}
              </div>
              <div className={styles.treeIcon}>{isTopLevel ? '🏢' : '📁'}</div>
              <div className={styles.treeTitleRow}>
                {node.kode && <span className={styles.badgeKode}>{node.kode}</span>}
                <span className={styles.titleLabel}>{node.label}</span>
                <span className={`${styles.badgeType} ${isTopLevel ? styles.badgeOpdUtama : styles.badgeSubUnit}`}>
                  {isTopLevel ? 'OPD Utama' : 'Sub-Unit'}
                </span>
              </div>
              <div className={styles.rightSection}>
                <div className={styles.treeActions}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                    title="Tambah Sub-Unit Kerja"
                    onClickCapture={(e) => openAddSubUnitModal(node, e)}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnWarning}`}
                    title="Edit"
                    onClickCapture={(e) => openEditModal(node, e)}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    title="Hapus"
                    onClickCapture={(e) => handleDelete(node, e)}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
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

  // Compute available parent choices (filtering out self and descendants to avoid cycles)
  const descendants = modalData.id ? getDescendants(modalData.id, rawOpds) : new Set<string>();
  const parentChoices = rawOpds
    .filter(o => o.id !== modalData.id && !descendants.has(o.id))
    .sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            Kelola OPD & Sub Unit Kerja
            {isBackgroundRefreshing && (
              <span className={styles.refreshSpinner} title="Sinkronisasi data...">🔄</span>
            )}
          </h1>
          <p className={styles.subtitle}>Atur hirarki perangkat daerah dan sub unit kerja di bawahnya.</p>
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

      {/* Main Panel */}
      <div className={`${styles.card} glass-panel`}>
        <div className={styles.toolbar}>
          <input
            type="text"
            placeholder="Cari kode atau nama unit kerja..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className={styles.btnSave} onClick={openAddOpdModal}>
            ➕ Tambah OPD Utama
          </button>
        </div>

        <div className={styles.treeContainer} style={{ padding: '10px 0', overflowX: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏢</div>
              Memuat data unit kerja...
            </div>
          ) : isEmpty ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', opacity: 0.7 }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏢</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Unit Kerja Kosong</h3>
              <p style={{ opacity: 0.7 }}>Silakan tambah OPD baru untuk memulai.</p>
            </div>
          ) : (
            <div className={styles.treeContainerWrapper} style={{ minWidth: '700px' }}>
              {renderTreeNodes(displayTree)}
            </div>
          )}
        </div>
      </div>

      {/* MODAL ADD/EDIT */}
      {modalMode && (
        <div className={styles.modalOverlay} onClick={() => setModalMode(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{modalMode === 'add' ? '➕ Tambah' : '✏️ Edit'} Unit Kerja</h2>
              <button className={styles.modalClose} onClick={() => setModalMode(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Nama Unit Kerja</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={modalData.nama}
                  onChange={(e) => setModalData({ ...modalData, nama: e.target.value })}
                  placeholder="Contoh: Dinas Kesehatan"
                  autoFocus
                />
              </div>

              <div className={styles.formGroup}>
                <label>Kode Unit Kerja</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={modalData.kode}
                  onChange={(e) => setModalData({ ...modalData, kode: e.target.value })}
                  placeholder="Contoh: 1.02.01"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Induk Unit Kerja (Opsional)</label>
                <select
                  className={styles.formInput}
                  value={modalData.parentId}
                  onChange={(e) => setModalData({ ...modalData, parentId: e.target.value })}
                >
                  <option value="">-- Tidak Ada (Ini OPD Utama / Top-Level) --</option>
                  {parentChoices.map(opd => (
                    <option key={opd.id} value={opd.id}>
                      {opd.kode ? `[${opd.kode}] ` : ''}{opd.nama}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '2px' }}>
                  Pilih induk jika unit ini merupakan sub-bagian dari OPD lain.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label>Urutan Tampilan</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={modalData.urutan}
                  onChange={(e) => setModalData({ ...modalData, urutan: parseInt(e.target.value) || 0 })}
                  placeholder="Contoh: 1"
                  min={0}
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setModalMode(null)}>Batal</button>
              <button
                className={styles.btnSave}
                onClick={handleModalSave}
                disabled={modalSaving || !modalData.nama.trim()}
              >
                {modalSaving ? 'Menyimpan...' : '💾 Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
