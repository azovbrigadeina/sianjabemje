"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import type { UnitKerja, Jabatan } from "@/lib/types";

interface StructuralNode {
  id: string;
  namaJabatan: string;
  jenisJabatan: string;
  kelasJabatan: number;
  kodeJabatan: string;
  urutan: number;
  staff: Jabatan[];
  children: StructuralNode[];
  parentId?: string;
  unitKerjaId?: string;
}

export default function PetaJabatanPage() {
  const [opds, setOpds] = useState<UnitKerja[]>([]);
  const [selectedOpdId, setSelectedOpdId] = useState<string>("");
  const [hierarchy, setHierarchy] = useState<StructuralNode[]>([]);
  const [abkMap, setAbkMap] = useState<Record<string, { totalKebutuhan: number; formasiPembulatan: number }>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Layout & Visualization Controls
  const [zoom, setZoom] = useState<number>(0.95);
  const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [showDetails, setShowDetails] = useState<boolean>(true);
  const [splitPrintPages, setSplitPrintPages] = useState<boolean>(true);

  // Dragging / Panning State
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 30, y: 30 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Fetch initial OPDs and ABK values
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const [opdData, abkData] = await Promise.all([
          api.getUnitKerja() as Promise<UnitKerja[]>,
          api.readAllEntity('abk', '') as Promise<any[]>
        ]);

        const sortedOpds = [...(opdData || [])].sort((a, b) => 
          (a.nama || '').localeCompare(b.nama || '')
        );
        setOpds(sortedOpds);

        // Map ABK stats
        const tempAbkMap: Record<string, { totalKebutuhan: number; formasiPembulatan: number }> = {};
        if (abkData && Array.isArray(abkData)) {
          abkData.forEach(a => {
            if (a.id) {
              tempAbkMap[a.id] = {
                totalKebutuhan: Number(a.totalKebutuhan) || 0,
                formasiPembulatan: Number(a.formasiPembulatan) || 0
              };
            }
          });
        }
        setAbkMap(tempAbkMap);

        // Set default selected OPD (first root OPD or first item)
        if (sortedOpds.length > 0) {
          const firstRoot = sortedOpds.find(o => !o.parentId);
          setSelectedOpdId(firstRoot ? firstRoot.id : sortedOpds[0].id);
        }
      } catch (err) {
        console.error("Gagal memuat data awal:", err);
        showToast("❌ Gagal memuat data unit kerja");
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Recursive function to get all child unit IDs
  const getDescendantUnitIds = useCallback((unitId: string, allUnits: UnitKerja[]): string[] => {
    const ids = [unitId];
    const children = allUnits.filter(u => u.parentId === unitId);
    children.forEach(c => {
      ids.push(...getDescendantUnitIds(c.id, allUnits));
    });
    return ids;
  }, []);

  // Build the hierarchical tree from linear Jabatan list
  const buildHierarchyTree = useCallback((allJabatans: Jabatan[]): StructuralNode[] => {
    const isStaff = (jbt: Jabatan) => {
      const type = (jbt.jenisJabatan || '').toLowerCase().trim();
      return (
        type === 'pelaksana' ||
        type.startsWith('fungsional') ||
        type === 'jabatan fungsional'
      );
    };

    const structuralList = allJabatans.filter(j => !isStaff(j));
    const staffList = allJabatans.filter(j => isStaff(j));

    // Map structural list to TreeNode structures
    const nodeMap: Record<string, StructuralNode> = {};
    structuralList.forEach(j => {
      nodeMap[j.id] = {
        id: j.id,
        namaJabatan: j.namaJabatan,
        jenisJabatan: j.jenisJabatan,
        kelasJabatan: j.kelasJabatan || 1,
        kodeJabatan: j.kodeJabatan || '',
        urutan: j.urutan || 0,
        parentId: j.parentId,
        unitKerjaId: j.unitKerjaId,
        staff: [],
        children: []
      };
    });

    // Distribute staff to direct structural supervisors
    const orphanStaff: Jabatan[] = [];
    staffList.forEach(s => {
      if (s.parentId && nodeMap[s.parentId]) {
        nodeMap[s.parentId].staff.push(s);
      } else {
        orphanStaff.push(s);
      }
    });

    // Link structural children to parents
    const roots: StructuralNode[] = [];
    structuralList.forEach(j => {
      const node = nodeMap[j.id];
      if (j.parentId && nodeMap[j.parentId]) {
        nodeMap[j.parentId].children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Handle orphan staff
    if (roots.length > 0 && orphanStaff.length > 0) {
      const getEselonWeight = (eselon?: string) => {
        const val = (eselon || '').toLowerCase().trim();
        if (val.includes('pimpinan tinggi')) return 5;
        if (val === 'administrator') return 4;
        if (val === 'pengawas') return 3;
        return 0;
      };

      roots.sort((a, b) => getEselonWeight(b.jenisJabatan) - getEselonWeight(a.jenisJabatan));
      const primaryRoot = roots[0];
      orphanStaff.forEach(s => {
        primaryRoot.staff.push(s);
      });
    }

    // Sort recursive components
    const getEselonWeight = (eselon?: string) => {
      const val = (eselon || '').toLowerCase().trim();
      if (val.includes('pimpinan tinggi')) return 5;
      if (val === 'administrator') return 4;
      if (val === 'pengawas') return 3;
      return 0;
    };

    const sortNodeRecursive = (node: StructuralNode) => {
      node.children.sort((a, b) => {
        if (a.urutan !== b.urutan) return a.urutan - b.urutan;
        if (b.kelasJabatan !== a.kelasJabatan) return b.kelasJabatan - a.kelasJabatan;
        return getEselonWeight(b.jenisJabatan) - getEselonWeight(a.jenisJabatan);
      });

      node.staff.sort((a, b) => {
        const classA = a.kelasJabatan || 0;
        const classB = b.kelasJabatan || 0;
        if (classB !== classA) return classB - classA;
        return a.namaJabatan.localeCompare(b.namaJabatan);
      });

      node.children.forEach(sortNodeRecursive);
    };

    roots.forEach(sortNodeRecursive);

    roots.sort((a, b) => {
      if (a.urutan !== b.urutan) return a.urutan - b.urutan;
      return getEselonWeight(b.jenisJabatan) - getEselonWeight(a.jenisJabatan);
    });

    return roots;
  }, []);

  // 2. Fetch Jabatans for selected OPD and generate tree
  useEffect(() => {
    if (!selectedOpdId || opds.length === 0) return;

    const loadOpdHierarchy = async () => {
      setIsLoading(true);
      try {
        const allJabatans = await api.readAllEntity('jabatan', '') as Jabatan[];
        const targetUnitIds = getDescendantUnitIds(selectedOpdId, opds);
        const filteredJabatans = allJabatans.filter(j => 
          j.unitKerjaId && targetUnitIds.includes(j.unitKerjaId)
        );

        if (filteredJabatans.length === 0) {
          setHierarchy([]);
          setExpandedNodes({});
        } else {
          const tree = buildHierarchyTree(filteredJabatans);
          setHierarchy(tree);
          // Initialize expandedNodes: only roots are expanded by default
          const initialExpanded: Record<string, boolean> = {};
          tree.forEach(root => {
            initialExpanded[root.id] = true;
          });
          setExpandedNodes(initialExpanded);
        }
      } catch (err) {
        console.error("Gagal memuat struktur jabatan:", err);
        showToast("❌ Gagal memuat struktur jabatan");
      } finally {
        setIsLoading(false);
      }
    };

    loadOpdHierarchy();
  }, [selectedOpdId, opds, getDescendantUnitIds, buildHierarchyTree]);

  // Zooming Logic
  const handleZoom = (amount: number) => {
    setZoom(prev => Math.min(Math.max(0.3, prev + amount), 2.0));
  };

  const handleZoomReset = () => {
    setZoom(0.95);
    setPanOffset({ x: 30, y: 30 });
  };

  // Expand / Collapse All logic
  const expandAll = () => {
    const newExpanded: Record<string, boolean> = {};
    const traverse = (nodes: StructuralNode[]) => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          newExpanded[node.id] = true;
          traverse(node.children);
        }
      });
    };
    traverse(hierarchy);
    setExpandedNodes(newExpanded);
    showToast("➕ Semua tingkatan bagan dikembangkan");
  };

  const collapseAll = () => {
    const newExpanded: Record<string, boolean> = {};
    // Keep root nodes expanded so they are visible
    hierarchy.forEach(root => {
      newExpanded[root.id] = true;
    });
    setExpandedNodes(newExpanded);
    showToast("➖ Semua tingkatan bagan diciutkan");
  };

  // Grab-to-pan Canvas Mouse Drag Logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(`.${styles.nodeBox}`) || 
      target.closest('button') || 
      target.closest('select')
    ) {
      return;
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handlePrint = () => {
    window.print();
  };

  // Node Component Render Helper
  const renderNodeBox = (
    node: StructuralNode, 
    isSummaryMode: boolean = false, 
    branchIndex: number = -1,
    showToggle: boolean = false
  ) => {
    const eselonVal = (node.jenisJabatan || '').toLowerCase().trim();
    let eselonClass = styles.eselonLain;
    let badgeClass = styles.badgeEselonLain;
    
    if (eselonVal.includes('pimpinan tinggi')) {
      eselonClass = styles.eselonJpt;
      badgeClass = styles.badgeEselonJpt;
    } else if (eselonVal === 'administrator') {
      eselonClass = styles.eselonAdministrator;
      badgeClass = styles.badgeEselonAdmin;
    } else if (eselonVal === 'pengawas') {
      eselonClass = styles.eselonPengawas;
      badgeClass = styles.badgeEselonPengawas;
    }

    const abkStat = abkMap[node.id] || { totalKebutuhan: 0, formasiPembulatan: 0 };
    const labelFormasi = abkStat.formasiPembulatan > 0 ? abkStat.formasiPembulatan : "-";

    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = !!expandedNodes[node.id];

    return (
      <div className={`${styles.nodeBox} ${eselonClass}`}>
        <div className={styles.nodeHeader}>
          <span className={styles.nodeCode}>{node.kodeJabatan || "JAB-UNMAPPED"}</span>
          <h3 className={styles.nodeTitle}>{node.namaJabatan}</h3>
          
          {showDetails && (
            <div className={styles.nodeMeta}>
              <span className={`${styles.badge} ${badgeClass}`}>{node.jenisJabatan}</span>
              <span className={`${styles.badge} ${styles.badgeKelas}`}>Kelas {node.kelasJabatan}</span>
            </div>
          )}
        </div>

        {showDetails && (
          <div className={styles.nodeStats}>
            <span>Kebutuhan Formasi:</span>
            <span className={styles.statValue}>{labelFormasi}</span>
          </div>
        )}

        {/* Footnote for Print Summary Page */}
        {isSummaryMode && branchIndex !== -1 && (
          <div className={styles.printFootnote}>
            (Lihat rincian pada Lampiran {branchIndex + 1})
          </div>
        )}

        {/* Stacked Vertical Staff List (Hidden in summary print mode) */}
        {!isSummaryMode && node.staff.length > 0 && (
          <div className={styles.staffSection}>
            <hr className={styles.staffDivider} />
            <div className={styles.staffHeader}>Staf & Jabatan Fungsional</div>
            <div className={styles.staffList}>
              {node.staff.map(staff => {
                const staffType = (staff.jenisJabatan || '').toLowerCase().trim();
                let staffBorderClass = styles.staffItemPelaksana;
                
                if (staffType.includes('keahlian')) {
                  staffBorderClass = styles.staffItemJFKeahlian;
                } else if (staffType.includes('keterampilan')) {
                  staffBorderClass = styles.staffItemJFKeterampilan;
                }
                
                const staffAbk = abkMap[staff.id] || { totalKebutuhan: 0, formasiPembulatan: 0 };
                const staffFormasi = staffAbk.formasiPembulatan > 0 ? staffAbk.formasiPembulatan : "-";

                return (
                  <div key={staff.id} className={`${styles.staffItem} ${staffBorderClass}`}>
                    <div className={styles.staffItemLeft}>
                      <span className={styles.staffName}>{staff.namaJabatan}</span>
                      {showDetails && (
                        <div className={styles.staffMeta}>
                          <span>Kls {staff.kelasJabatan}</span>
                          <span>•</span>
                          <span>{staff.jenisJabatan}</span>
                        </div>
                      )}
                    </div>
                    <div className={styles.staffItemRight}>
                      <span className={styles.staffBadgeFormasi} title="Kebutuhan Pegawai (ABK)">
                        {staffFormasi}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Toggle Button for Screen View */}
        {showToggle && hasChildren && (
          <button 
            className={`${styles.toggleBtn} ${layoutMode === 'horizontal' ? styles.toggleBtnHorizontal : styles.toggleBtnVertical} ${isExpanded ? styles.toggleBtnExpanded : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setExpandedNodes(prev => ({
                ...prev,
                [node.id]: !prev[node.id]
              }));
            }}
            title={isExpanded ? "Ciutkan cabang" : "Kembangkan cabang"}
          >
            {isExpanded ? "−" : "+"}
          </button>
        )}
      </div>
    );
  };

  // Recursive Tree Rendering for Screen Canvas
  const renderHierarchyNode = (node: StructuralNode, isRoot: boolean) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = !!expandedNodes[node.id];

    if (layoutMode === 'horizontal') {
      return (
        <div 
          className={`${styles.treeBranchHorizontal} ${isRoot ? styles.rootBranchHorizontal : ''}`} 
          key={node.id}
        >
          {renderNodeBox(node, false, -1, true)}
          
          {hasChildren && isExpanded && (
            <>
              <div className={styles.parentLineHorizontal} />
              <div className={styles.childrenContainerHorizontal}>
                {node.children.map(child => renderHierarchyNode(child, false))}
              </div>
            </>
          )}
        </div>
      );
    }

    return (
      <div 
        className={`${styles.treeBranch} ${isRoot ? styles.rootBranch : ''}`} 
        key={node.id}
      >
        {renderNodeBox(node, false, -1, true)}
        
        {hasChildren && isExpanded && (
          <>
            <div className={styles.parentLine} />
            <div className={styles.childrenContainer}>
              {node.children.map(child => renderHierarchyNode(child, false))}
            </div>
          </>
        )}
      </div>
    );
  };

  // Recursive Tree Rendering for Print Sheets
  const renderPrintBranch = (
    node: StructuralNode, 
    isRoot: boolean, 
    depth: number, 
    isSummaryMode: boolean,
    majorBranchesList: StructuralNode[]
  ): React.ReactNode => {
    const showChildren = !isSummaryMode || depth < 1;
    const hasChildren = showChildren && node.children && node.children.length > 0;
    
    // Find index of major branch for footnote reference
    const branchIndex = majorBranchesList.findIndex(b => b.id === node.id);

    if (layoutMode === 'horizontal') {
      return (
        <div 
          className={`${styles.treeBranchHorizontal} ${isRoot ? styles.rootBranchHorizontal : ''}`} 
          key={node.id}
        >
          {renderNodeBox(node, isSummaryMode && depth === 1, branchIndex, false)}
          
          {hasChildren && (
            <>
              <div className={styles.parentLineHorizontal} />
              <div className={styles.childrenContainerHorizontal}>
                {node.children.map(child => renderPrintBranch(child, false, depth + 1, isSummaryMode, majorBranchesList))}
              </div>
            </>
          )}
        </div>
      );
    }

    return (
      <div 
        className={`${styles.treeBranch} ${isRoot ? styles.rootBranch : ''}`} 
        key={node.id}
      >
        {renderNodeBox(node, isSummaryMode && depth === 1, branchIndex, false)}
        
        {hasChildren && (
          <>
            <div className={styles.parentLine} />
            <div className={styles.childrenContainer}>
              {node.children.map(child => renderPrintBranch(child, false, depth + 1, isSummaryMode, majorBranchesList))}
            </div>
          </>
        )}
      </div>
    );
  };

  const opdNameLabel = opds.find(o => o.id === selectedOpdId)?.nama || "OPD";

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Header Title Section */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>🗺️ Peta Jabatan OPD</h1>
          <p className={styles.subtitle}>
            Bagan Struktur Organisasi & Hierarki Formasi Kebutuhan Pegawai
          </p>
        </div>
      </div>

      <div className="glass-panel">
        {/* Toolbar & Selector Panel */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <span className={styles.opdSelectLabel}>Pilih OPD:</span>
            <select
              className={styles.opdSelect}
              value={selectedOpdId}
              onChange={(e) => setSelectedOpdId(e.target.value)}
            >
              {opds.map(opd => (
                <option key={opd.id} value={opd.id}>
                  {opd.nama || opd.id}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.toolbarRight}>
            {/* Split Print Mode Toggle */}
            <button
              onClick={() => {
                setSplitPrintPages(!splitPrintPages);
                showToast(`✅ Mode Cetak diubah: ${!splitPrintPages ? "Multi-Halaman (Terbagi A4)" : "Satu Halaman Penuh"}`);
              }}
              className={`${styles.btnControl} ${splitPrintPages ? styles.btnControlActive : ''}`}
              title="Jika diaktifkan, cetakan A4 akan dipisah per-Bidang secara otomatis agar muat rapi dan terbaca jelas."
            >
              {splitPrintPages ? '📄 Cetak: Multi-Halaman' : '📄 Cetak: Satu Halaman'}
            </button>

            {/* Layout Toggle */}
            <button
              onClick={() => setLayoutMode(layoutMode === 'vertical' ? 'horizontal' : 'vertical')}
              className={`${styles.btnControl} ${layoutMode === 'horizontal' ? styles.btnControlActive : ''}`}
              title="Ubah Tata Letak Bagan (Vertikal / Horizontal)"
            >
              {layoutMode === 'vertical' ? '📐 Tata Letak Horizontal' : '📐 Tata Letak Vertikal'}
            </button>

            {/* Toggle Details */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className={`${styles.btnControl} ${showDetails ? styles.btnControlActive : ''}`}
              title="Tampilkan/Sembunyikan Informasi Detail Jabatan"
            >
              👁️ {showDetails ? 'Sembunyikan Detail' : 'Tampilkan Detail'}
            </button>

            {/* Collapse/Expand All Buttons */}
            <button
              onClick={expandAll}
              className={styles.btnControl}
              title="Kembangkan semua cabang bagan"
            >
              ➕ Kembangkan Semua
            </button>
            <button
              onClick={collapseAll}
              className={styles.btnControl}
              title="Ciutkan semua cabang bagan (kecuali root)"
            >
              ➖ Ciutkan Semua
            </button>

            {/* Zoom Controls widget */}
            <div className={styles.zoomWidget}>
              <button onClick={() => handleZoom(-0.1)} className={styles.btnZoom} title="Perkecil (-)">-</button>
              <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => handleZoom(0.1)} className={styles.btnZoom} title="Perbesar (+)">+</button>
            </div>

            {/* Reset View */}
            <button onClick={handleZoomReset} className={styles.btnControl} title="Kembalikan Posisi Semula">
              🔄 Reset Posisi
            </button>

            {/* Print / Export to PDF */}
            <button onClick={handlePrint} className={`${styles.btnControl} ${styles.btnPdf}`} title="Cetak ke PDF / Printer">
              🖨️ Cetak PDF
            </button>
          </div>
        </div>

        {/* Grab-to-pan Canvas Viewport (Hidden during printing) */}
        <div 
          className={styles.canvasContainer}
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {isLoading ? (
            <div className={styles.loadingContainer}>
              <div className={styles.emptyIcon}>🔄</div>
              <div>Memproses bagan organisasi dan mengumpulkan formasi...</div>
            </div>
          ) : hierarchy.length === 0 ? (
            <div className={styles.emptyContainer}>
              <div className={styles.emptyIcon}>🏢</div>
              <h3>Peta Jabatan Kosong</h3>
              <p>OPD ini belum memiliki data struktur jabatan terdaftar.</p>
            </div>
          ) : (
            <div 
              className={styles.canvas}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`
              }}
            >
              {layoutMode === 'horizontal' ? (
                <div className={styles.treeContainerHorizontal}>
                  {hierarchy.map(rootNode => renderHierarchyNode(rootNode, true))}
                </div>
              ) : (
                <div className={styles.treeContainer}>
                  {hierarchy.map(rootNode => renderHierarchyNode(rootNode, true))}
                </div>
              )}
            </div>
          )}

          {/* Floating canvas HUD info */}
          <div className={styles.canvasHud}>
            <div className={styles.hudItem}>
              <span>🖱️</span>
              <span>Klik & seret latar untuk menggeser</span>
            </div>
            <div className={styles.hudItem}>
              <span>⭐</span>
              <span>Staf disusun vertikal agar hemat ruang</span>
            </div>
            <div className={styles.hudItem}>
              <span>📄</span>
              <span>Mode Cetak: {splitPrintPages ? 'Terbagi per-Bidang (A4 Rapih)' : 'Satu Halaman Utuh'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY PAGES CONTAINER (Visible ONLY during window.print()) */}
      <div className={styles.printPagesContainer}>
        {splitPrintPages && hierarchy.length > 0 ? (
          <>
            {/* Sheet 1: Peta Induk (Summary structural map down to Eselon III/IV heads) */}
            {hierarchy.map(rootNode => {
              const majorBranches = rootNode.children;
              return (
                <div key={`print-summary-${rootNode.id}`} className={styles.printPage}>
                  <div className={styles.printPageHeader}>
                    <h2>PETA JABATAN INDUK (STRUKTUR UTAMA)</h2>
                    <h3>{opdNameLabel}</h3>
                  </div>
                  <div className={layoutMode === 'horizontal' ? styles.treeContainerHorizontal : styles.treeContainer}>
                    {renderPrintBranch(rootNode, true, 0, true, majorBranches)}
                  </div>
                </div>
              );
            })}

            {/* Sheets 2+: Detailed sub-trees for each major branch/Bidang */}
            {hierarchy.map(rootNode => {
              const majorBranches = rootNode.children;
              return majorBranches.map((branch, idx) => (
                <div key={`print-detail-${branch.id}`} className={styles.printPage}>
                  <div className={styles.printPageHeader}>
                    <h2>LAMPIRAN PETA JABATAN {idx + 1}</h2>
                    <h3>RINCIAN STRUKTUR: {branch.namaJabatan.toUpperCase()}</h3>
                    <h4>{opdNameLabel}</h4>
                  </div>
                  <div className={layoutMode === 'horizontal' ? styles.treeContainerHorizontal : styles.treeContainer}>
                    {renderPrintBranch(branch, true, 0, false, [])}
                  </div>
                </div>
              ));
            })}
          </>
        ) : (
          /* Single page full tree print layout */
          hierarchy.map(rootNode => (
            <div key={`print-full-${rootNode.id}`} className={styles.printPage}>
              <div className={styles.printPageHeader}>
                <h2>PETA JABATAN LENGKAP</h2>
                <h3>{opdNameLabel}</h3>
              </div>
              <div className={layoutMode === 'horizontal' ? styles.treeContainerHorizontal : styles.treeContainer}>
                {renderPrintBranch(rootNode, true, 0, false, [])}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
