"use client";

import { useState, useEffect, useMemo } from "react";
import styles from "./page.module.css";
import { api } from "@/lib/api";
import type { UnitKerja, Jabatan } from "@/lib/types";

interface JobWithStatus extends Jabatan {
  anjabTerisi: boolean;
  abkTerisi: boolean;
}

interface UnitStats {
  total: number;
  anjabFilled: number;
  anjabUnfilled: number;
  anjabPct: number;
  abkFilled: number;
  abkUnfilled: number;
  abkPct: number;
  jobs: JobWithStatus[];
}

interface OpdNode {
  opd: UnitKerja;
  aggregated: UnitStats;
  direct: UnitStats;
  subUnits: {
    opd: UnitKerja;
    stats: UnitStats;
  }[];
}

export default function VerifikasiPage() {
  const [opds, setOpds] = useState<UnitKerja[]>([]);
  const [jabatans, setJabatans] = useState<Jabatan[]>([]);
  const [tugasPokoks, setTugasPokoks] = useState<any[]>([]);
  const [abks, setAbks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"semua" | "anjab-belum" | "abk-belum" | "lengkap">("semua");

  // State to track expanded rows (Induk OPD IDs)
  const [expandedOpds, setExpandedOpds] = useState<Record<string, boolean>>({});

  // Modal State for detail
  const [selectedOpdName, setSelectedOpdName] = useState<string | null>(null);
  const [selectedOpdJobs, setSelectedOpdJobs] = useState<JobWithStatus[] | null>(null);
  const [modalSearch, setModalSearch] = useState("");
  const [modalFilter, setModalFilter] = useState<"semua" | "anjab-terisi" | "anjab-belum" | "abk-terisi" | "abk-belum">("semua");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [opdsRaw, jabatansRaw, tugasPokoksRaw, abksRaw] = await Promise.all([
        api.getUnitKerja(),
        api.readAllEntity("jabatan", ""),
        api.readAllEntity("tugasPokok", ""),
        api.readAllEntity("abk", ""),
      ]);

      setOpds((opdsRaw || []) as UnitKerja[]);
      setJabatans((jabatansRaw || []) as Jabatan[]);
      setTugasPokoks((tugasPokoksRaw || []) as any[]);
      setAbks((abksRaw || []) as any[]);
    } catch (err) {
      console.error("Gagal memuat data verifikasi", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Map to check if a job has tugas pokok
  const tpMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    if (tugasPokoks && Array.isArray(tugasPokoks)) {
      tugasPokoks.forEach((tp) => {
        if (tp.jabatanId) map[tp.jabatanId] = true;
      });
    }
    return map;
  }, [tugasPokoks]);

  // Map to check if a job has ABK filled
  const abkMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    if (abks && Array.isArray(abks)) {
      abks.forEach((a) => {
        if (a.id) map[a.id] = true;
      });
    }
    return map;
  }, [abks]);

  // Overall statistics for Kabupaten
  const overallStats = useMemo(() => {
    let total = 0;
    let anjabFilled = 0;
    let abkFilled = 0;

    jabatans.forEach((jbt) => {
      total++;
      const isAnjabFilled =
        (jbt.ikhtisarJabatan && jbt.ikhtisarJabatan.length > 5) ||
        !!tpMap[jbt.id];
      const isAbkFilled = !!abkMap[jbt.id];

      if (isAnjabFilled) anjabFilled++;
      if (isAbkFilled) abkFilled++;
    });

    const anjabUnfilled = total - anjabFilled;
    const anjabPct = total > 0 ? Math.round((anjabFilled / total) * 100) : 0;

    const abkUnfilled = total - abkFilled;
    const abkPct = total > 0 ? Math.round((abkFilled / total) * 100) : 0;

    return {
      total,
      anjabFilled,
      anjabUnfilled,
      anjabPct,
      abkFilled,
      abkUnfilled,
      abkPct,
    };
  }, [jabatans, tpMap, abkMap]);

  // Process data hierarchical
  const processedData = useMemo<OpdNode[]>(() => {
    if (opds.length === 0) return [];

    // Map jobs by unit
    const jobsByUnit: Record<string, JobWithStatus[]> = {};
    jabatans.forEach((jbt) => {
      const isAnjabFilled =
        (jbt.ikhtisarJabatan && jbt.ikhtisarJabatan.length > 5) ||
        !!tpMap[jbt.id];
      const isAbkFilled = !!abkMap[jbt.id];
      const jobWithStatus: JobWithStatus = {
        ...jbt,
        anjabTerisi: isAnjabFilled,
        abkTerisi: isAbkFilled,
      };

      if (!jobsByUnit[jbt.unitKerjaId]) {
        jobsByUnit[jbt.unitKerjaId] = [];
      }
      jobsByUnit[jbt.unitKerjaId].push(jobWithStatus);
    });

    // Map children by parent ID
    const childrenMap: Record<string, UnitKerja[]> = {};
    opds.forEach((opd) => {
      if (opd.parentId) {
        if (!childrenMap[opd.parentId]) {
          childrenMap[opd.parentId] = [];
        }
        childrenMap[opd.parentId].push(opd);
      }
    });

    // Recursive helper to get all descendant unit IDs
    const getDescendantIds = (id: string): string[] => {
      const list = [id];
      const children = childrenMap[id] || [];
      children.forEach((c) => {
        list.push(...getDescendantIds(c.id));
      });
      return list;
    };

    // Helper to calculate stats for a list of unit IDs
    const calculateStats = (unitIds: string[]): UnitStats => {
      let total = 0;
      let anjabFilled = 0;
      let abkFilled = 0;
      const jobsList: JobWithStatus[] = [];

      unitIds.forEach((uid) => {
        const jobs = jobsByUnit[uid] || [];
        total += jobs.length;
        anjabFilled += jobs.filter((j) => j.anjabTerisi).length;
        abkFilled += jobs.filter((j) => j.abkTerisi).length;
        jobsList.push(...jobs);
      });

      // Sort jobs alphabetically
      jobsList.sort((a, b) => a.namaJabatan.localeCompare(b.namaJabatan));

      return {
        total,
        anjabFilled,
        anjabUnfilled: total - anjabFilled,
        anjabPct: total > 0 ? Math.round((anjabFilled / total) * 100) : 0,
        abkFilled,
        abkUnfilled: total - abkFilled,
        abkPct: total > 0 ? Math.round((abkFilled / total) * 100) : 0,
        jobs: jobsList,
      };
    };

    // Filter Induk OPD (no parentId)
    const indukOpds = opds.filter((o) => !o.parentId);
    indukOpds.sort(
      (a, b) => (a.urutan ?? 999) - (b.urutan ?? 999) || a.nama.localeCompare(b.nama)
    );

    return indukOpds.map((induk) => {
      const subUnits = childrenMap[induk.id] || [];
      subUnits.sort(
        (a, b) => (a.urutan ?? 999) - (b.urutan ?? 999) || a.nama.localeCompare(b.nama)
      );

      const allUnitIds = getDescendantIds(induk.id);

      return {
        opd: induk,
        aggregated: calculateStats(allUnitIds),
        direct: calculateStats([induk.id]),
        subUnits: subUnits.map((sub) => ({
          opd: sub,
          stats: calculateStats([sub.id]),
        })),
      };
    });
  }, [opds, jabatans, tpMap, abkMap]);

  // Filter & search processed data
  const filteredData = useMemo(() => {
    if (!searchQuery && filterStatus === "semua") return processedData;

    return processedData
      .map((node) => {
        // Match search query against Induk OPD
        const indukMatches =
          node.opd.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.opd.kode.toLowerCase().includes(searchQuery.toLowerCase());

        // Match against Sub-units
        const filteredSubs = node.subUnits.filter(
          (sub) =>
            sub.opd.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
            sub.opd.kode.toLowerCase().includes(searchQuery.toLowerCase())
        );

        const subMatches = filteredSubs.length > 0;

        // If searching and neither matches, discard this entire node
        if (searchQuery && !indukMatches && !subMatches) return null;

        // If filtering by status
        const isAnjabLengkap = node.aggregated.anjabPct === 100;
        const isAbkLengkap = node.aggregated.abkPct === 100;
        
        if (filterStatus === "lengkap" && (!isAnjabLengkap || !isAbkLengkap)) return null;
        if (filterStatus === "anjab-belum" && isAnjabLengkap) return null;
        if (filterStatus === "abk-belum" && isAbkLengkap) return null;

        return {
          ...node,
          subUnits: searchQuery && !indukMatches ? filteredSubs : node.subUnits,
        };
      })
      .filter((n): n is OpdNode => n !== null);
  }, [processedData, searchQuery, filterStatus]);

  // Auto-expand nodes when searching
  useEffect(() => {
    if (searchQuery.trim().length > 1) {
      const autoExpanded: Record<string, boolean> = {};
      filteredData.forEach((node) => {
        if (node.subUnits.length > 0) {
          autoExpanded[node.opd.id] = true;
        }
      });
      setExpandedOpds(autoExpanded);
    }
  }, [searchQuery, filteredData]);

  const toggleExpand = (id: string) => {
    setExpandedOpds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const openDetailModal = (name: string, jobs: JobWithStatus[]) => {
    setSelectedOpdName(name);
    setSelectedOpdJobs(jobs);
    setModalSearch("");
    setModalFilter("semua");
  };

  // Filtered jobs inside details modal
  const filteredModalJobs = useMemo(() => {
    if (!selectedOpdJobs) return [];
    return selectedOpdJobs.filter((job) => {
      const matchQuery =
        job.namaJabatan.toLowerCase().includes(modalSearch.toLowerCase()) ||
        job.kodeJabatan.toLowerCase().includes(modalSearch.toLowerCase());

      if (modalFilter === "anjab-terisi") return matchQuery && job.anjabTerisi;
      if (modalFilter === "anjab-belum") return matchQuery && !job.anjabTerisi;
      if (modalFilter === "abk-terisi") return matchQuery && job.abkTerisi;
      if (modalFilter === "abk-belum") return matchQuery && !job.abkTerisi;
      return matchQuery;
    });
  }, [selectedOpdJobs, modalSearch, modalFilter]);

  const modalStats = useMemo(() => {
    if (!selectedOpdJobs) {
      return {
        total: 0,
        anjabFilled: 0,
        anjabUnfilled: 0,
        anjabPct: 0,
        abkFilled: 0,
        abkUnfilled: 0,
        abkPct: 0,
      };
    }
    const total = selectedOpdJobs.length;
    const anjabFilled = selectedOpdJobs.filter((j) => j.anjabTerisi).length;
    const abkFilled = selectedOpdJobs.filter((j) => j.abkTerisi).length;
    return {
      total,
      anjabFilled,
      anjabUnfilled: total - anjabFilled,
      anjabPct: total > 0 ? Math.round((anjabFilled / total) * 100) : 0,
      abkFilled,
      abkUnfilled: total - abkFilled,
      abkPct: total > 0 ? Math.round((abkFilled / total) * 100) : 0,
    };
  }, [selectedOpdJobs]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Verifikasi Pengisian Anjab & ABK</h1>
        <p className={styles.subtitle}>
          Pantau progres kelengkapan dokumen Analisis Jabatan (Anjab) dan Analisis Beban Kerja (ABK) untuk masing-masing OPD.
        </p>
      </div>

      {/* Summary Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "rgba(99, 102, 241, 0.1)", color: "#818cf8" }}>🏢</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Unit Kerja</span>
            <span className={styles.statValue}>{isLoading ? "..." : opds.length}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6" }}>👥</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Jabatan</span>
            <span className={styles.statValue}>{isLoading ? "..." : overallStats.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Anjab stats block */}
        <div className={styles.statCard} style={{ borderLeft: "4px solid #10b981" }}>
          <div className={styles.statIcon} style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>📝</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Anjab Terisi</span>
            <span className={styles.statValue}>{isLoading ? "..." : `${overallStats.anjabPct}%`}</span>
            <span style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "4px" }}>
              {overallStats.anjabFilled} / {overallStats.total} Jabatan
            </span>
          </div>
        </div>

        {/* ABK stats block */}
        <div className={styles.statCard} style={{ borderLeft: "4px solid #7c3aed" }}>
          <div className={styles.statIcon} style={{ background: "rgba(124, 58, 237, 0.1)", color: "#c084fc" }}>⚖️</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>ABK Terisi</span>
            <span className={styles.statValue}>{isLoading ? "..." : `${overallStats.abkPct}%`}</span>
            <span style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "4px" }}>
              {overallStats.abkFilled} / {overallStats.total} Jabatan
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filter bar */}
      <div className={styles.controlsRow}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Cari OPD / Unit Kerja..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className={styles.filterSelect}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
        >
          <option value="semua">Semua Status Progres</option>
          <option value="lengkap">Selesai 100% (Anjab & ABK)</option>
          <option value="anjab-belum">Anjab Belum Selesai</option>
          <option value="abk-belum">ABK Belum Selesai</option>
        </select>
      </div>

      {/* Main Table */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: "35%" }}>Unit Kerja / OPD</th>
              <th style={{ width: "7%" }}>Tipe</th>
              <th style={{ width: "10%" }}>Jml Jabatan</th>
              <th style={{ width: "21%" }}>Progres Anjab</th>
              <th style={{ width: "21%" }}>Progres ABK</th>
              <th style={{ width: "6%", textAlign: "center" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", opacity: 0.6 }}>
                  Memuat data progres verifikasi...
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", opacity: 0.6 }}>
                  Tidak ada data unit kerja yang cocok dengan pencarian / filter.
                </td>
              </tr>
            ) : (
              filteredData.map((node) => {
                const hasSubs = node.subUnits.length > 0;
                const isExpanded = !!expandedOpds[node.opd.id];

                return (
                  <>
                    {/* Parent OPD Row */}
                    <tr key={node.opd.id} className={styles.rowMainOpd}>
                      <td style={{ fontWeight: 600 }}>
                        {hasSubs && (
                          <button
                            className={`${styles.expandBtn} ${isExpanded ? styles.expanded : ""}`}
                            onClick={() => toggleExpand(node.opd.id)}
                            title={isExpanded ? "Collapse" : "Expand Sub-unit"}
                          >
                            ▶
                          </button>
                        )}
                        {!hasSubs && <span style={{ display: "inline-block", width: "29px" }} />}
                        {node.opd.nama}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeInduk}`}>Induk</span>
                      </td>
                      <td>{node.aggregated.total}</td>
                      
                      {/* Anjab Progress */}
                      <td>
                        <div className={styles.progressWrapper}>
                          <div className={styles.progressLabel}>
                            <span>{node.aggregated.anjabPct}%</span>
                            <span style={{ opacity: 0.7, fontWeight: 500 }}>
                              {node.aggregated.anjabFilled}/{node.aggregated.total}
                            </span>
                          </div>
                          <div className={styles.progressTrack}>
                            <div
                              className={`${styles.progressBar} ${
                                node.aggregated.anjabPct === 100 ? styles.completed : ""
                              }`}
                              style={{ width: `${node.aggregated.anjabPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* ABK Progress */}
                      <td>
                        <div className={styles.progressWrapper}>
                          <div className={styles.progressLabel}>
                            <span>{node.aggregated.abkPct}%</span>
                            <span style={{ opacity: 0.7, fontWeight: 500 }}>
                              {node.aggregated.abkFilled}/{node.aggregated.total}
                            </span>
                          </div>
                          <div className={styles.progressTrack}>
                            <div
                              className={`${styles.progressBar} ${
                                node.aggregated.abkPct === 100 ? styles.completed : ""
                              }`}
                              style={{
                                width: `${node.aggregated.abkPct}%`,
                                background: "linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%)",
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td style={{ textAlign: "center" }}>
                        <button
                          className={styles.btnDetail}
                          onClick={() => openDetailModal(node.opd.nama, node.aggregated.jobs)}
                        >
                          👁️ Detail
                        </button>
                      </td>
                    </tr>

                    {/* Sub Units Rows (Collapsible) */}
                    {hasSubs &&
                      isExpanded && [
                        // Direct parent positions if any
                        node.direct.total > 0 && (
                          <tr key={`${node.opd.id}-direct`} className={styles.rowSubUnit}>
                            <td style={{ paddingLeft: "3rem", fontStyle: "italic", opacity: 0.8 }}>
                              [Kantor Induk / Sekretariat]
                            </td>
                            <td>
                              <span className={`${styles.badge} ${styles.badgeSub}`}>Kantor</span>
                            </td>
                            <td>{node.direct.total}</td>
                            
                            {/* Direct Anjab */}
                            <td>
                              <div className={styles.progressWrapper}>
                                <div className={styles.progressLabel}>
                                  <span>{node.direct.anjabPct}%</span>
                                  <span style={{ opacity: 0.7, fontWeight: 500 }}>
                                    {node.direct.anjabFilled}/{node.direct.total}
                                  </span>
                                </div>
                                <div className={styles.progressTrack}>
                                  <div
                                    className={`${styles.progressBar} ${
                                      node.direct.anjabPct === 100 ? styles.completed : ""
                                    }`}
                                    style={{ width: `${node.direct.anjabPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Direct ABK */}
                            <td>
                              <div className={styles.progressWrapper}>
                                <div className={styles.progressLabel}>
                                  <span>{node.direct.abkPct}%</span>
                                  <span style={{ opacity: 0.7, fontWeight: 500 }}>
                                    {node.direct.abkFilled}/{node.direct.total}
                                  </span>
                                </div>
                                <div className={styles.progressTrack}>
                                  <div
                                    className={`${styles.progressBar} ${
                                      node.direct.abkPct === 100 ? styles.completed : ""
                                    }`}
                                    style={{
                                      width: `${node.direct.abkPct}%`,
                                      background: "linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%)",
                                    }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td style={{ textAlign: "center" }}>
                              <button
                                className={styles.btnDetail}
                                onClick={() =>
                                  openDetailModal(
                                    `${node.opd.nama} (Kantor Induk)`,
                                    node.direct.jobs
                                  )
                                }
                              >
                                👁️ Detail
                              </button>
                            </td>
                          </tr>
                        ),
                        // Real sub units
                        ...node.subUnits.map((sub) => (
                          <tr key={sub.opd.id} className={styles.rowSubUnit}>
                            <td style={{ paddingLeft: "3rem" }}>{sub.opd.nama}</td>
                            <td>
                              <span className={`${styles.badge} ${styles.badgeSub}`}>Sub Unit</span>
                            </td>
                            <td>{sub.stats.total}</td>
                            
                            {/* Sub Anjab */}
                            <td>
                              <div className={styles.progressWrapper}>
                                <div className={styles.progressLabel}>
                                  <span>{sub.stats.anjabPct}%</span>
                                  <span style={{ opacity: 0.7, fontWeight: 500 }}>
                                    {sub.stats.anjabFilled}/{sub.stats.total}
                                  </span>
                                </div>
                                <div className={styles.progressTrack}>
                                  <div
                                    className={`${styles.progressBar} ${
                                      sub.stats.anjabPct === 100 ? styles.completed : ""
                                    }`}
                                    style={{ width: `${sub.stats.anjabPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Sub ABK */}
                            <td>
                              <div className={styles.progressWrapper}>
                                <div className={styles.progressLabel}>
                                  <span>{sub.stats.abkPct}%</span>
                                  <span style={{ opacity: 0.7, fontWeight: 500 }}>
                                    {sub.stats.abkFilled}/{sub.stats.total}
                                  </span>
                                </div>
                                <div className={styles.progressTrack}>
                                  <div
                                    className={`${styles.progressBar} ${
                                      sub.stats.abkPct === 100 ? styles.completed : ""
                                    }`}
                                    style={{
                                      width: `${sub.stats.abkPct}%`,
                                      background: "linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%)",
                                    }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td style={{ textAlign: "center" }}>
                              <button
                                className={styles.btnDetail}
                                onClick={() => openDetailModal(sub.opd.nama, sub.stats.jobs)}
                              >
                                👁️ Detail
                              </button>
                            </td>
                          </tr>
                        )),
                      ]}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedOpdJobs && selectedOpdName && (
        <div className={styles.modalOverlay} onClick={() => setSelectedOpdJobs(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeButton} onClick={() => setSelectedOpdJobs(null)}>
              ✕
            </button>

            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Detail Jabatan OPD</h2>
              <p className={styles.modalSubtitle}>{selectedOpdName}</p>
            </div>

            {/* Modal Mini Stats */}
            <div className={styles.modalStats}>
              <div className={styles.modalStatItem}>
                <span>Total Jabatan:</span>
                <span style={{ color: "#818cf8" }}>{modalStats.total}</span>
              </div>
              <div className={styles.modalStatItem} style={{ borderLeft: "3px solid #10b981" }}>
                <span>Anjab Terisi:</span>
                <span style={{ color: "#10b981" }}>{modalStats.anjabFilled} ({modalStats.anjabPct}%)</span>
              </div>
              <div className={styles.modalStatItem} style={{ borderLeft: "3px solid #7c3aed" }}>
                <span>ABK Terisi:</span>
                <span style={{ color: "#c084fc" }}>{modalStats.abkFilled} ({modalStats.abkPct}%)</span>
              </div>
            </div>

            {/* Modal Controls */}
            <div className={styles.controlsRow} style={{ marginTop: 0, marginBottom: 0 }}>
              <div className={styles.searchWrapper}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Cari nama jabatan / kode..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                />
              </div>

              <select
                className={styles.filterSelect}
                value={modalFilter}
                onChange={(e) => setModalFilter(e.target.value as any)}
              >
                <option value="semua">Semua Jabatan</option>
                <option value="anjab-terisi">Anjab Terisi</option>
                <option value="anjab-belum">Anjab Belum</option>
                <option value="abk-terisi">ABK Terisi</option>
                <option value="abk-belum">ABK Belum</option>
              </select>
            </div>

            {/* Modal Body Table */}
            <div className={styles.modalBody}>
              <table className={styles.jabatanTable}>
                <thead>
                  <tr>
                    <th style={{ width: "5%", textAlign: "left" }}>No</th>
                    <th style={{ width: "40%", textAlign: "left" }}>Nama Jabatan</th>
                    <th style={{ width: "15%", textAlign: "left" }}>Jenis</th>
                    <th style={{ width: "8%", textAlign: "center" }}>Kelas</th>
                    <th style={{ width: "16%", textAlign: "center" }}>Status Anjab</th>
                    <th style={{ width: "16%", textAlign: "center" }}>Status ABK</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModalJobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", opacity: 0.6, padding: "2rem" }}>
                        Tidak ada jabatan yang cocok.
                      </td>
                    </tr>
                  ) : (
                    filteredModalJobs.map((job, idx) => (
                      <tr key={job.id}>
                        <td>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{job.namaJabatan}</div>
                          <div style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "0.15rem" }}>
                            {job.kodeJabatan || "-"}
                          </div>
                          {job.ikhtisarJabatan && (
                            <div
                              style={{
                                fontSize: "0.78rem",
                                opacity: 0.8,
                                marginTop: "0.35rem",
                                padding: "0.4rem 0.6rem",
                                background: "rgba(120, 120, 120, 0.05)",
                                borderRadius: "4px",
                                borderLeft: "2px solid var(--glass-border)",
                              }}
                            >
                              <strong>Ikhtisar:</strong> {job.ikhtisarJabatan.slice(0, 120)}
                              {job.ikhtisarJabatan.length > 120 ? "..." : ""}
                            </div>
                          )}
                        </td>
                        <td>{job.jenisJabatan || "-"}</td>
                        <td style={{ textAlign: "center" }}>{job.kelasJabatan || "-"}</td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className={`${styles.jabatanBadge} ${
                              job.anjabTerisi ? styles.isi : styles.belum
                            }`}
                          >
                            {job.anjabTerisi ? "✓ Terisi" : "✗ Belum"}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className={`${styles.jabatanBadge} ${
                              job.abkTerisi ? styles.isi : styles.belum
                            }`}
                            style={
                              job.abkTerisi
                                ? {
                                    background: "rgba(124, 58, 237, 0.15)",
                                    color: "#c084fc",
                                    borderColor: "rgba(124, 58, 237, 0.25)",
                                  }
                                : undefined
                            }
                          >
                            {job.abkTerisi ? "✓ Terisi" : "✗ Belum"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
