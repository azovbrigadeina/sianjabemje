"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import Footer from "@/components/Footer";
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

export default function PublicOrganisasiPage() {
  const [opds, setOpds] = useState<UnitKerja[]>([]);
  const [selectedOpdId, setSelectedOpdId] = useState<string>("");
  const [hierarchy, setHierarchy] = useState<StructuralNode[]>([]);
  const [abkMap, setAbkMap] = useState<Record<string, { totalKebutuhan: number; formasiPembulatan: number }>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isTreeLoading, setIsTreeLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Canvas zoom and pan controls
  const [zoom, setZoom] = useState<number>(0.9);
  const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [showDetails, setShowDetails] = useState<boolean>(true);

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

        // Set default selected OPD (prefer first root OPD or first item in sorted list)
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

  // Recursive function to get all child unit IDs of a given unit
  const getDescendantUnitIds = useCallback((unitId: string, allUnits: UnitKerja[]): string[] => {
    const ids = [unitId];
    const children = allUnits.filter(u => u.parentId === unitId);
    children.forEach(c => {
      ids.push(...getDescendantUnitIds(c.id, allUnits));
    });
    return ids;
  }, []);

  // Build hierarchical tree from linear Jabatan list
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
      setIsTreeLoading(true);
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
        setIsTreeLoading(false);
      }
    };

    loadOpdHierarchy();
  }, [selectedOpdId, opds, getDescendantUnitIds, buildHierarchyTree]);

  // Zooming Logic
  const handleZoom = (amount: number) => {
    setZoom(prev => Math.min(Math.max(0.3, prev + amount), 2.0));
  };

  const handleZoomReset = () => {
    setZoom(0.9);
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

  // Node Component Render Helper
  const renderNodeBox = (node: StructuralNode, showToggle: boolean = false) => {
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

        {/* Stacked Vertical Staff List */}
        {node.staff.length > 0 && (
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

        {/* Toggle Button for Expand / Collapse */}
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
          {renderNodeBox(node, true)}
          
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
        {renderNodeBox(node, true)}
        
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

  // Root unit list (no parentId)
  const rootOpds = opds.filter(o => !o.parentId);

  return (
    <>
      <main className={styles.container}>
        {/* Navigation Header */}
        <nav className={`${styles.nav} glass-panel`}>
          <div className={styles.logo}>
            <span className="text-gradient">SianjabABK EM-JE</span>
          </div>
          <div className={styles.navLinks}>
            <Link href="/">Beranda</Link>
            <Link href="/organisasi">Struktur Organisasi</Link>
            <a href="#">Analisis</a>
          </div>
        </nav>

        {/* Disclaimer Notice Banner */}
        <div className={styles.disclaimerBanner}>
          <span className={styles.disclaimerIcon}>⚠️</span>
          <div className={styles.disclaimerContent}>
            <div className={styles.disclaimerTitle}>Informasi Penting</div>
            <div className={styles.disclaimerText}>
              Data struktur organisasi yang ditampilkan di halaman ini bersifat tentatif dan hanya digunakan sebagai referensi awal. Pembaruan dan penyesuaian regulasi formasi terus dilakukan secara dinamis oleh instansi terkait.
            </div>
          </div>
        </div>

        {/* Controls Toolbar */}
        <div className={`${styles.toolbar} glass-panel`}>
          <div className={styles.toolbarLeft}>
            <label className={styles.opdSelectLabel}>Unit Kerja / OPD:</label>
            <select 
              value={selectedOpdId} 
              onChange={(e) => setSelectedOpdId(e.target.value)}
              className={styles.opdSelect}
              disabled={isLoading}
            >
              {isLoading ? (
                <option>Memuat daftar unit...</option>
              ) : rootOpds.length === 0 ? (
                <option>Tidak ada unit kerja tersedia</option>
              ) : (
                rootOpds.map(opd => (
                  <option key={opd.id} value={opd.id}>
                    {opd.nama} {opd.tahun ? `(${opd.tahun})` : ""}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className={styles.toolbarRight}>
            <button 
              onClick={() => setLayoutMode(prev => prev === 'vertical' ? 'horizontal' : 'vertical')}
              className={styles.btnControl}
              title="Ganti orientasi bagan"
            >
              Mode: {layoutMode === 'vertical' ? '↕️ Vertikal' : '↔️ Horizontal'}
            </button>

            <button 
              onClick={() => setShowDetails(prev => !prev)}
              className={`${styles.btnControl} ${showDetails ? styles.btnControlActive : ''}`}
              title="Tampilkan / Sembunyikan detail kelas & formasi"
            >
              📋 {showDetails ? "Sembunyikan Detail" : "Tampilkan Detail"}
            </button>

            <button 
              onClick={expandAll} 
              className={styles.btnControl}
              title="Kembangkan semua cabang"
            >
              ➕ Expand All
            </button>
            
            <button 
              onClick={collapseAll} 
              className={styles.btnControl}
              title="Ciutkan semua cabang kecuali tingkat pertama"
            >
              ➖ Collapse All
            </button>

            <div className={styles.zoomWidget}>
              <button onClick={() => handleZoom(-0.1)} className={styles.btnZoom} title="Perkecil">−</button>
              <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => handleZoom(0.1)} className={styles.btnZoom} title="Perbesar">+</button>
              <button onClick={handleZoomReset} className={styles.btnZoom} style={{ fontSize: '0.8rem', fontWeight: 600 }} title="Reset Zoom">Reset</button>
            </div>
          </div>
        </div>

        {/* Tree Chart Canvas Area */}
        <div 
          className={styles.canvasContainer}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          ref={canvasRef}
        >
          {isLoading || isTreeLoading ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner}></div>
              <div className={styles.stateTitle}>Memproses Bagan...</div>
              <div className={styles.stateDesc}>Menyusun hierarki struktur organisasi jabatan untuk unit kerja yang dipilih.</div>
            </div>
          ) : hierarchy.length === 0 ? (
            <div className={styles.emptyContainer}>
              <span style={{ fontSize: '3rem' }}>🏢</span>
              <div className={styles.stateTitle}>Bagan Belum Diisi</div>
              <div className={styles.stateDesc}>
                Unit kerja ini belum memiliki data jabatan yang diinput. Hubungi operator atau administrator untuk melakukan penyusunan struktur organisasi.
              </div>
            </div>
          ) : (
            <div 
              className={styles.canvas}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              }}
            >
              {hierarchy.map(rootNode => renderHierarchyNode(rootNode, true))}
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Toast Alert */}
      {toast && (
        <div className={styles.toast}>
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}
