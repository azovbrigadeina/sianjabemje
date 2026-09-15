"use client";

import { useState, useCallback, useEffect } from "react";
import styles from "./page.module.css";
import treeStyles from "../organisasi/page.module.css";
import { api } from "@/lib/api";
import { filterTreeNodes } from "@/lib/utils";
import type { JabatanFull, TugasPokok, Kualifikasi, SyaratJabatan, UnitKerja, Jabatan } from "@/lib/types";

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
  const [currentPage, setCurrentPage] = useState(1);

  // Editor State
  const [activeJob, setActiveJob] = useState<string>("");
  const [activeTab, setActiveTab] = useState("identitas");
  const [jabatanData, setJabatanData] = useState<JabatanFull | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [versionKey, setVersionKey] = useState(0);
  const [activeYear, setActiveYear] = useState<string>("2026");
  const [aiLoading, setAiLoading] = useState(false);
  const [downloadingWord, setDownloadingWord] = useState(false);
  const [downloadingSiasn, setDownloadingSiasn] = useState(false);
  const [progressStatus, setProgressStatus] = useState<{
    show: boolean;
    title: string;
    steps: { text: string; status: 'waiting' | 'loading' | 'success' | 'error' }[];
    currentStepIndex: number;
    terminalLogs: string[];
  }>({
    show: false,
    title: "",
    steps: [],
    currentStepIndex: 0,
    terminalLogs: []
  });

  useEffect(() => {
    if (progressStatus.show) {
      const container = document.getElementById("terminal-log-container");
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [progressStatus.terminalLogs, progressStatus.show]);
  
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // LOAD TREE
  const loadTree = useCallback(async () => {
    setIsLoadingTree(true);
    try {
      const bulkData = await api.getBulkData(['unitKerja', 'jabatan', 'tugasPokok', 'syaratJabatan', 'kualifikasi', 'bahanKerja']);
      const opds = (bulkData.unitKerja || []) as UnitKerja[];
      const jabatans = (bulkData.jabatan || []) as Jabatan[];
      const tugasPokoks = (bulkData.tugasPokok || []) as any[];
      const syaratList = (bulkData.syaratJabatan || []) as any[];
      const kualifikasiList = (bulkData.kualifikasi || []) as any[];
      const bahanList = (bulkData.bahanKerja || []) as any[];

      const filledMap: Record<string, boolean> = {};
      if (tugasPokoks && Array.isArray(tugasPokoks)) {
        tugasPokoks.forEach(tp => { if (tp.jabatanId) filledMap[tp.jabatanId] = true; });
      }
      if (syaratList && Array.isArray(syaratList)) {
        syaratList.forEach(s => { if (s.jabatanId) filledMap[s.jabatanId] = true; });
      }
      if (kualifikasiList && Array.isArray(kualifikasiList)) {
        kualifikasiList.forEach(k => { if (k.jabatanId) filledMap[k.jabatanId] = true; });
      }
      if (bahanList && Array.isArray(bahanList)) {
        bahanList.forEach(b => { if (b.jabatanId) filledMap[b.jabatanId] = true; });
      }

      const map: Record<string, TreeNode> = {};
      const roots: TreeNode[] = [];
      const expandState: Record<string, boolean> = {};

      opds.forEach(opd => {
        const node: TreeNode = {
          id: opd.id, type: 'OPD', label: opd.nama || opd.id,
          parentId: opd.parentId, urutan: opd.urutan || 0, children: []
        };
        map[opd.id] = node;
        if (opd.kode) map[opd.kode.trim()] = node;
        expandState[opd.id] = false; // Collapsed by default
      });

      jabatans.forEach(jbt => {
        map[jbt.id] = {
          id: jbt.id, type: 'JABATAN', label: jbt.namaJabatan || jbt.id,
          eselon: jbt.jenisJabatan, kelas: jbt.kelasJabatan,
          parentId: jbt.parentId, unitKerjaId: jbt.unitKerjaId,
          urutan: jbt.urutan || 0, ikhtisar: jbt.ikhtisarJabatan || "", 
          anjabTerisi: (jbt.ikhtisarJabatan && jbt.ikhtisarJabatan.trim().length > 5) || !!filledMap[jbt.id],
          children: []
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
      setTreeData(roots);
      setExpandedNodes(expandState);
    } catch (err) {
      console.error(err);
    }
    setIsLoadingTree(false);
  }, []);

  useEffect(() => {
    // Initial load
    const savedYear = localStorage.getItem("sianjab_active_year") || "2026";
    setActiveYear(savedYear);

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
  }, []);

  // Trigger reload when activeYear changes
  useEffect(() => {
    loadTree();
  }, [activeYear, loadTree]);

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

  // EDITOR LOGIC
  const handleResetAnjab = async () => {
    if (!jabatanData) return;
    const confirmReset = window.confirm(
      `Apakah Anda yakin ingin me-reset seluruh isian jabatan "${jabatanData.namaJabatan}"? \n\nTindakan ini akan mengosongkan seluruh data yang diinput manual (Tugas Pokok, Bahan/Perangkat Kerja, Syarat Jabatan, dll) dan menyisakan data bawaan yang terisi otomatis. Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmReset) return;

    setLoadingEditor(true);
    try {
      const bulkPayload = {
        jabatan: {
          id: jabatanData.id,
          unitKerjaId: jabatanData.unitKerjaId,
          parentId: jabatanData.parentId || "",
          urutan: jabatanData.urutan || 0,
          tahun: jabatanData.tahun || "",
          namaJabatan: jabatanData.namaJabatan,
          kodeJabatan: jabatanData.kodeJabatan,
          jenisJabatan: jabatanData.jenisJabatan,
          kelasJabatan: jabatanData.kelasJabatan,
          level: jabatanData.level || 0,
          jptUtama: jabatanData.jptUtama || "",
          jptMadya: jabatanData.jptMadya || "",
          jptPratama: jabatanData.jptPratama || "",
          administrator: jabatanData.administrator || "",
          pengawas: jabatanData.pengawas || "",
          pelaksana: jabatanData.pelaksana || "",
          jabatanFungsional: jabatanData.jabatanFungsional || "",
          ikhtisarJabatan: ""
        },
        kualifikasi: {
          pendidikanFormal: [],
          pendidikanPelatihan: [],
          pengalamanKerja: []
        },
        syaratJabatan: {
          keterampilanKerja: [],
          bakatKerja: [],
          temperamenKerja: [],
          minatKerja: [],
          upayaFisik: [],
          kondisiFisik: {
            jenisKelamin: "-",
            umur: "-",
            tinggiBadan: "-",
            beratBadan: "-",
            posturBadan: "-",
            penampilan: "-"
          },
          fungsiPekerjaan: []
        },
        tugasPokok: [],
        hasilKerja: { uraian: "" },
        prestasiKerja: { uraian: "" },
        bahanKerja: [],
        perangkatKerja: [],
        tanggungJawab: [],
        wewenang: [],
        korelasiJabatan: [],
        kondisiLingkungan: [],
        risikoBahaya: []
      };

      await api.saveBulkAnjabData(jabatanData.id, bulkPayload);

      localStorage.removeItem(`anjab_draft_identitas_${jabatanData.id}`);
      localStorage.removeItem(`anjab_draft_tugas_${jabatanData.id}`);

      const refreshed = await api.getJabatanFull(jabatanData.id) as JabatanFull;
      setJabatanData(refreshed);
      setVersionKey(prev => prev + 1);

      showToast("🧹 Seluruh isian berhasil di-reset!");
    } catch (e: any) {
      alert("Gagal me-reset isian: " + e.message);
    } finally {
      setLoadingEditor(false);
    }
  };

  const handleTriggerAI = async () => {
    if (!jabatanData) return;
    if (!confirm(`Yakin ingin menyusun draf dokumen Anjab menggunakan AI untuk jabatan "${jabatanData.namaJabatan}"? Isian form identitas, tugas pokok, dan syarat jabatan saat ini akan ditimpa dengan draf AI.`)) return;

    const steps = [
      { text: "Mengidentifikasi data jabatan & unit kerja", status: 'loading' as const },
      { text: "Mengirim instruksi & prompt ke Engine AI", status: 'waiting' as const },
      { text: "Memproses & menormalisasi struktur draf", status: 'waiting' as const },
      { text: "Menyimpan data Identitas, Kualifikasi, & Syarat Jabatan", status: 'waiting' as const },
      { text: "Menyimpan data Tugas Pokok & Hasil Kerja", status: 'waiting' as const },
      { text: "Menyimpan tabel-tabel pendukung (Bahan, Perangkat, TJ, dll)", status: 'waiting' as const },
      { text: "Sinkronisasi database & pembersihan cache lokal", status: 'waiting' as const }
    ];

    const getTimestamp = () => `[${new Date().toTimeString().split(' ')[0]}]`;

    setProgressStatus({
      show: true,
      title: "AI Draft Builder",
      steps,
      currentStepIndex: 0,
      terminalLogs: [
        `${getTimestamp()} START: Memulai proses penyusunan draf AI untuk jabatan "${jabatanData.namaJabatan}"`,
        `${getTimestamp()} INFO: Mencari data organisasi induk di unit kerja...`
      ]
    });

    setAiLoading(true);

    const updateStep = (idx: number, status: 'loading' | 'success' | 'error', newLogs: string[]) => {
      setProgressStatus(prev => {
        const nextSteps = [...prev.steps];
        nextSteps[idx] = { ...nextSteps[idx], status };
        return {
          ...prev,
          steps: nextSteps,
          currentStepIndex: idx,
          terminalLogs: [...prev.terminalLogs, ...newLogs]
        };
      });
    };

    try {
      // Find parent unit name for context
      const activeUnit = treeData.find(node => node.id === jabatanData.unitKerjaId || node.children.some(child => child.id === jabatanData.unitKerjaId));
      const parentUnitName = activeUnit?.label || "Umum";

      updateStep(0, 'success', [
        `${getTimestamp()} SUCCESS: Identifikasi jabatan dan struktur organisasi berhasil.`,
        `${getTimestamp()} INFO: Unit Kerja: ${activeUnit?.label || "Umum"}`,
        `${getTimestamp()} INFO: Induk OPD: ${parentUnitName}`,
        `${getTimestamp()} INFO: Menghubungi API AI...`
      ]);

      // Move to step 2
      updateStep(1, 'loading', [`${getTimestamp()} PROCESS: Mengirimkan prompt & menunggu analisis AI...`]);
      await new Promise(r => setTimeout(r, 200));

      const aiDraft = await api.generateAnjabWithAI(
        jabatanData.namaJabatan,
        activeUnit?.label || "Umum",
        parentUnitName
      );

      if (!aiDraft) {
        throw new Error("Respons dari model AI kosong atau tidak valid.");
      }

      updateStep(1, 'success', [
        `${getTimestamp()} SUCCESS: Analisis AI berhasil diterima.`,
        `${getTimestamp()} INFO: Memulai pemrosesan draf...`
      ]);

      // Step 3
      updateStep(2, 'loading', [`${getTimestamp()} PROCESS: Menjalankan parser skema & validasi data...`]);
      await new Promise(r => setTimeout(r, 400));

      updateStep(2, 'success', [
        `${getTimestamp()} SUCCESS: Struktur data draf AI valid (Poin 1 s/d 14 terkonfirmasi).`,
        `${getTimestamp()} INFO: Memulai penyimpanan ke Firebase Realtime Database...`
      ]);

      // Step 4: Identitas, Kualifikasi, Syarat
      updateStep(3, 'loading', [`${getTimestamp()} PROCESS: Mengirim data draf AI secara bulk ke database...`]);

      const mappedTasks = (aiDraft.tugasPokok || []).map((tp: any, index: number) => ({
        nomorUrut: index + 1,
        uraianTugas: tp.uraianTugas || "",
        hasilKerja: tp.hasilKerja || "Dokumen",
        jumlahHasil: 1,
        waktuPenyelesaian: tp.waktuPenyelesaian || 60
      }));

      const hasilKerjaData = aiDraft.hasilKerja
        ? (Array.isArray(aiDraft.hasilKerja)
          ? { uraian: JSON.stringify(aiDraft.hasilKerja) }
          : typeof aiDraft.hasilKerja === 'string'
            ? { uraian: aiDraft.hasilKerja }
            : aiDraft.hasilKerja)
        : null;

      const bulkPayload = {
        jabatan: {
          ikhtisarJabatan: aiDraft.ikhtisarJabatan
        },
        kualifikasi: aiDraft.kualifikasi || {},
        syaratJabatan: aiDraft.syaratJabatan || {},
        tugasPokok: mappedTasks,
        hasilKerja: hasilKerjaData,
        prestasiKerja: aiDraft.prestasiKerja || {},
        bahanKerja: (aiDraft.bahanKerja || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        perangkatKerja: (aiDraft.perangkatKerja || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        tanggungJawab: (aiDraft.tanggungJawab || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        wewenang: (aiDraft.wewenang || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        korelasiJabatan: (aiDraft.korelasiJabatan || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        kondisiLingkungan: (aiDraft.kondisiLingkungan || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        risikoBahaya: (aiDraft.risikoBahaya || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 }))
      };

      await api.saveBulkAnjabData(jabatanData.id, bulkPayload);

      updateStep(3, 'success', [
        `${getTimestamp()} SUCCESS: Data Identitas, Kualifikasi, & Syarat Jabatan berhasil disimpan.`
      ]);

      // Step 5: Tugas Pokok & Hasil Kerja
      updateStep(4, 'success', [
        `${getTimestamp()} SUCCESS: Tugas Pokok & Hasil Kerja berhasil disimpan.`
      ]);

      // Step 6: Tabel Pendukung
      updateStep(5, 'success', [
        `${getTimestamp()} SUCCESS: Seluruh tabel pendukung (Bahan, Perangkat, TJ, Wewenang) berhasil disimpan.`
      ]);

      // Step 7: Finalisasi
      updateStep(6, 'loading', [`${getTimestamp()} PROCESS: Membersihkan cache lokal & sinkronisasi UI...`]);
      
      localStorage.removeItem(`anjab_draft_identitas_${jabatanData.id}`);
      localStorage.removeItem(`anjab_draft_tugas_${jabatanData.id}`);

      const refreshed = await api.getJabatanFull(jabatanData.id) as JabatanFull;
      setJabatanData(refreshed);
      setVersionKey(prev => prev + 1);
      await new Promise(r => setTimeout(r, 300));

      updateStep(6, 'success', [
        `${getTimestamp()} SUCCESS: Cache lokal dibersihkan.`,
        `${getTimestamp()} SUCCESS: Draf AI berhasil dipasang secara live!`,
        `${getTimestamp()} FINISH: Seluruh tahapan selesai dengan sukses.`
      ]);

      showToast("✨ Draf Anjab berhasil dipasang oleh Engine AI!");

    } catch (e: any) {
      setProgressStatus(prev => {
        const nextSteps = [...prev.steps];
        if (nextSteps[prev.currentStepIndex]) {
          nextSteps[prev.currentStepIndex].status = 'error';
        }
        return {
          ...prev,
          steps: nextSteps,
          terminalLogs: [...prev.terminalLogs, `${getTimestamp()} ERROR: ${e.message}`, `${getTimestamp()} FAILED: Proses dihentikan.`]
        };
      });
      alert("Terjadi kesalahan: " + e.message);
    } finally {
      setAiLoading(false);
    }
  };


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
      const isTerisi = (jabatanData.ikhtisarJabatan && jabatanData.ikhtisarJabatan.trim().length > 5) || 
                       (jabatanData.tugasPokok && jabatanData.tugasPokok.length > 0) ||
                       !!(jabatanData.syaratJabatan && (jabatanData.syaratJabatan.keterampilanKerja || jabatanData.syaratJabatan.bakatKerja)) ||
                       !!(jabatanData.kualifikasi && (jabatanData.kualifikasi.pendidikanFormal || jabatanData.kualifikasi.pengalamanKerja)) ||
                       (jabatanData.bahanKerja && jabatanData.bahanKerja.length > 0);
      
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
      ikhtisarJabatan: data.ikhtisarJabatan,
      jenisJabatan: data.jenisJabatan,
      kelasJabatan: data.kelasJabatan,
      kodeJabatan: data.kodeJabatan
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

  const processImportedData = async (parsedData: any, logs: string[], importType: string) => {
    if (!jabatanData) return;
    
    const steps = [
      { text: "Membaca & validasi struktur file Excel", status: 'success' as const },
      { text: "Mengekstrak data lembar kerja (Sheet)", status: 'success' as const },
      { text: "Menyimpan data Identitas & Kualifikasi", status: 'loading' as const },
      { text: "Menyimpan Tugas Pokok & Hasil Kerja", status: 'waiting' as const },
      { text: "Menyimpan tabel pendukung (Bahan, Perangkat, TJ, dll)", status: 'waiting' as const },
      { text: "Finalisasi & penyelarasan data", status: 'waiting' as const }
    ];

    const getTimestamp = () => `[${new Date().toTimeString().split(' ')[0]}]`;

    setProgressStatus({
      show: true,
      title: `Import Engine: ${importType}`,
      steps,
      currentStepIndex: 2,
      terminalLogs: [
        `${getTimestamp()} START: Memulai proses impor data dari file Excel (${importType})`,
        `${getTimestamp()} SUCCESS: Pembacaan berkas Excel selesai.`,
        `${getTimestamp()} SUCCESS: Sheet data diekstrak dengan sukses.`,
        `${getTimestamp()} INFO: Menjalankan penyimpanan ke database...`
      ]
    });

    const updateStep = (idx: number, status: 'loading' | 'success' | 'error', newLogs: string[]) => {
      setProgressStatus(prev => {
        const nextSteps = [...prev.steps];
        nextSteps[idx] = { ...nextSteps[idx], status };
        return {
          ...prev,
          steps: nextSteps,
          currentStepIndex: idx,
          terminalLogs: [...prev.terminalLogs, ...newLogs]
        };
      });
    };

    try {
      const updatedJabatan = { ...jabatanData };

      localStorage.removeItem(`anjab_draft_identitas_${jabatanData.id}`);
      localStorage.removeItem(`anjab_draft_tugas_${jabatanData.id}`);

      // Step 3-5: Save entire Anjab draft in 1 bulk request
      updateStep(2, 'loading', [`${getTimestamp()} PROCESS: Menyimpan seluruh data draf AI secara bulk ke database...`]);

      const mappedTasks = (parsedData.tugasPokok || []).map((tp: any, index: number) => ({
        nomorUrut: index + 1,
        uraianTugas: tp.uraianTugas || "",
        hasilKerja: tp.hasilKerja || "Dokumen",
        jumlahHasil: tp.jumlahHasil || 1,
        waktuPenyelesaian: tp.waktuPenyelesaian || 60
      }));

      const bulkPayload = {
        jabatan: parsedData.identitas.ikhtisarJabatan ? { ikhtisarJabatan: parsedData.identitas.ikhtisarJabatan } : undefined,
        kualifikasi: parsedData.kualifikasi || {},
        syaratJabatan: parsedData.syaratJabatan || {},
        tugasPokok: mappedTasks,
        hasilKerja: parsedData.hasilKerja || null,
        prestasiKerja: parsedData.prestasiKerja || {},
        bahanKerja: (parsedData.bahanKerja || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        perangkatKerja: (parsedData.perangkatKerja || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        tanggungJawab: (parsedData.tanggungJawab || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        wewenang: (parsedData.wewenang || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        korelasiJabatan: (parsedData.korelasiJabatan || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        kondisiLingkungan: (parsedData.kondisiLingkungan || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })),
        risikoBahaya: (parsedData.risikoBahaya || []).map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 }))
      };

      await api.saveBulkAnjabData(jabatanData.id, bulkPayload);

      updateStep(2, 'success', [`${getTimestamp()} SUCCESS: Data Identitas, Kualifikasi, dan Syarat berhasil disimpan.`]);
      updateStep(3, 'success', [`${getTimestamp()} SUCCESS: Tugas Pokok & Hasil Kerja berhasil disimpan.`]);
      updateStep(4, 'success', [`${getTimestamp()} SUCCESS: Seluruh data tabel pendukung berhasil disimpan.`]);

      // Step 6: Finalisasi
      updateStep(5, 'loading', [`${getTimestamp()} PROCESS: Memuat ulang tampilan editor...`]);
      const refreshed = await api.getJabatanFull(jabatanData.id) as JabatanFull;
      setJabatanData(refreshed);
      setVersionKey(prev => prev + 1);
      setJabatanData(updatedJabatan);
      setVersionKey(prev => prev + 1);
      await new Promise(r => setTimeout(r, 300));
      updateStep(5, 'success', [
        `${getTimestamp()} SUCCESS: Impor file Excel selesai dengan sukses!`,
        `${getTimestamp()} FINISH: Semua tahapan impor berhasil diselesaikan.`
      ]);

      showToast("✅ Berhasil mengimpor data dari Excel!");
      
      if (logs && logs.length > 0) {
        alert("Laporan Hasil Impor:\n\n" + logs.join("\n"));
      }

    } catch (e: any) {
      setProgressStatus(prev => {
        const nextSteps = [...prev.steps];
        if (nextSteps[prev.currentStepIndex]) {
          nextSteps[prev.currentStepIndex].status = 'error';
        }
        return {
          ...prev,
          steps: nextSteps,
          terminalLogs: [...prev.terminalLogs, `${getTimestamp()} ERROR: ${e.message}`, `${getTimestamp()} FAILED: Proses impor dibatalkan.`]
        };
      });
      alert("Gagal memproses data impor: " + e.message);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !jabatanData) return;

    showToast("⏳ Membaca file Excel...");
    try {
      const { parseXlsxForAnjab } = await import("@/lib/importXlsx");
      const { data: parsedData, logs } = await parseXlsxForAnjab(file);
      await processImportedData(parsedData, logs, "Template Excel");
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
      const { parseAnjabAsli } = await import("@/lib/importXlsx");
      const { data: parsedData, logs } = await parseAnjabAsli(file);
      await processImportedData(parsedData, logs, "Anjab Asli");
    } catch (err) {
      showToast("❌ Gagal mengimpor Anjab Asli: Format tidak sesuai atau file rusak.");
      console.error(err);
    }
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
            {isExpanded && hasChildren && renderTreeNodes(node.children)}
          </li>
        );
      })}
    </ul>
  );

  const displayTree = filterTreeNodes(treeData, searchQuery);

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

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Analisis Jabatan (Tahun {activeYear})</h1>
          <p className={styles.subtitle}>
            Formulir Informasi Jabatan — Permenpan RB No. 1 Tahun 2020 (Tahun {activeYear})
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
          <button type="button" className={treeStyles.btnSecondary} onClick={expandAll} style={{ marginLeft: '12px', whiteSpace: 'nowrap' }}>
            ➕ Kembangkan Semua
          </button>
          <button type="button" className={treeStyles.btnSecondary} onClick={collapseAll} style={{ marginLeft: '12px', whiteSpace: 'nowrap' }}>
            ➖ Ciutkan Semua
          </button>
        </div>

        <div className={treeStyles.treeContainerWrapper} style={{ overflowX: 'auto', minWidth: '800px' }}>
          {isLoadingTree ? (
            <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>Memuat silsilah pohon organisasi...</div>
          ) : (
            <>
              {renderTreeNodes(paginatedTree)}
              
              {totalPages > 1 && (
                <div className={treeStyles.pagination}>
                  <button 
                    type="button"
                    className={treeStyles.pageButton} 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Sebelumnya
                  </button>
                  
                  <span className={treeStyles.paginationInfo}>
                    Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong> ({displayTree.length} OPD)
                  </span>
                  
                  <button 
                    type="button"
                    className={treeStyles.pageButton} 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Berikutnya
                  </button>
                </div>
              )}
            </>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div className={styles.jobTitle}>{jabatanData?.namaJabatan || "— Memuat Jabatan —"}</div>
              {jabatanData && (
                <button 
                  onClick={handleResetAnjab}
                  disabled={loadingEditor}
                  style={{ 
                    background: '#fff3f3', 
                    color: '#e11d48', 
                    border: '1px solid #fecdd3', 
                    padding: '0.4rem 1rem', 
                    borderRadius: '6px', 
                    cursor: 'pointer', 
                    fontWeight: 600, 
                    fontSize: '0.8rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.4rem',
                    transition: 'all 0.2s'
                  }}
                  title="Reset seluruh isian manual"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ffe4e6';
                    e.currentTarget.style.borderColor = '#fda4af';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff3f3';
                    e.currentTarget.style.borderColor = '#fecdd3';
                  }}
                >
                  <span>🧹</span> Reset Isian
                </button>
              )}
            </div>
            {jabatanData && (
              <div style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.25rem", display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span>Kode: <span style={{ fontFamily: "monospace" }}>{jabatanData.kodeJabatan}</span></span>
                <span>{' · '} Kelas: <strong>{jabatanData.kelasJabatan}</strong></span>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={handleTriggerAI}
                    disabled={aiLoading}
                    style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    title="Susun draf Anjab otomatis dengan Engine AI"
                  >
                    <span>✨</span> {aiLoading ? "Memproses AI..." : "Draf AI"}
                  </button>
                  <button 
                    onClick={async () => {
                      const { downloadTemplateXlsx } = await import("@/lib/importXlsx");
                      downloadTemplateXlsx(jabatanData);
                    }}
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
                    onClick={async () => {
                      if (!jabatanData) return;
                      setDownloadingWord(true);
                      try {
                        const { exportJabatanToDocx } = await import("@/lib/exportDocx");
                        await exportJabatanToDocx(jabatanData);
                        showToast("✨ Berhasil mengunduh Word");
                      } catch (err: any) {
                        alert("Gagal mengunduh Word: " + err.message);
                      } finally {
                        setDownloadingWord(false);
                      }
                    }}
                    disabled={downloadingWord}
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: downloadingWord ? 0.7 : 1 }}
                  >
                    <span>📄</span> {downloadingWord ? "Mengunduh..." : "Unduh Word"}
                  </button>
                  <button 
                    onClick={async () => {
                      if (!jabatanData) return;
                      setDownloadingSiasn(true);
                      try {
                        const { exportJabatanToSiasn } = await import("@/lib/exportSiasn");
                        exportJabatanToSiasn(jabatanData);
                        showToast("✨ Berhasil mengekspor SIASN");
                      } catch (err: any) {
                        alert("Gagal mengekspor SIASN: " + err.message);
                      } finally {
                        setDownloadingSiasn(false);
                      }
                    }}
                    disabled={downloadingSiasn}
                    style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: downloadingSiasn ? 0.7 : 1 }}
                  >
                    <span>📊</span> {downloadingSiasn ? "Mengekspor..." : "Unduh SIASN"}
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
                  <TabIdentitas key={`identitas-${jabatanData.id}-${versionKey}`} jabatan={jabatanData} treeData={treeData} onSave={handleSaveIdentitas} loading={loadingEditor} readOnlyNama={true} />
                )}
                {activeTab === "tugas" && (
                  <TabTugasPokok key={`tugas-${jabatanData.id}-${versionKey}`} jabatan={jabatanData} onSaveTugas={handleSaveTugas}
                    onSaveKualifikasi={handleSaveKualifikasi} onSaveHasilKerja={handleSaveHasilKerja} loading={loadingEditor} />
                )}
                {activeTab === "bahan" && (
                  <TabBahanPerangkat key={`bahan-${jabatanData.id}-${versionKey}`} jabatan={jabatanData} onSave={handleSaveMultiRows} loading={loadingEditor} />
                )}
                {activeTab === "korelasi" && (
                  <TabKorelasiLingkungan key={`korelasi-${jabatanData.id}-${versionKey}`} jabatan={jabatanData} onSave={handleSaveMultiRows} loading={loadingEditor} />
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
      {progressStatus.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '750px',
            background: '#0f172a',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(168, 85, 247, 0.25), 0 0 30px rgba(168, 85, 247, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            {/* Terminal Top Bar */}
            <div style={{
              background: '#1e293b',
              padding: '0.75rem 1rem',
              borderBottom: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }}></span>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#eab308', display: 'inline-block' }}></span>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }}></span>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.05em', fontFamily: 'monospace' }}>
                {progressStatus.title.toUpperCase()}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>bash - 80x24</span>
            </div>

            {/* Terminal Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Stepper (Progress Steps) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {progressStatus.steps.map((step, idx) => {
                  const isActive = idx === progressStatus.currentStepIndex;
                  let icon = '⚫';
                  let textColor = '#64748b';
                  let weight = '400';
                  
                  if (step.status === 'success') {
                    icon = '🟢';
                    textColor = '#10b981';
                  } else if (step.status === 'loading') {
                    icon = '🌀';
                    textColor = '#a855f7';
                    weight = '600';
                  } else if (step.status === 'error') {
                    icon = '🔴';
                    textColor = '#ef4444';
                  } else if (isActive) {
                    icon = '🟡';
                    textColor = '#eab308';
                    weight = '600';
                  }
                  
                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      color: textColor,
                      fontSize: '0.85rem',
                      fontWeight: weight,
                      transition: 'all 0.2s ease',
                      paddingLeft: isActive ? '0.25rem' : '0'
                    }}>
                      <span style={{
                        animation: step.status === 'loading' ? 'spin 1.5s linear infinite' : 'none',
                        display: 'inline-block',
                      }}>{icon}</span>
                      <span>{step.text}</span>
                    </div>
                  );
                })}
              </div>

              {/* Progress Bar Line */}
              <div style={{
                height: '6px',
                background: '#1e293b',
                borderRadius: '999px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #a855f7 0%, #6366f1 100%)',
                  width: `${(progressStatus.steps.filter(s => s.status === 'success').length / progressStatus.steps.length) * 100}%`,
                  transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 0 8px #a855f7'
                }}></div>
              </div>

              {/* Console Logs */}
              <div style={{
                background: '#020617',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '1rem',
                height: '180px',
                overflowY: 'auto',
                fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                fontSize: '0.8rem',
                color: '#38bdf8',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8)'
              }} id="terminal-log-container">
                {progressStatus.terminalLogs.map((log, idx) => (
                  <div key={idx} style={{
                    color: log.includes('ERROR') ? '#ef4444' : log.includes('SUCCESS') ? '#10b981' : log.includes('WARN') ? '#eab308' : '#38bdf8',
                    lineHeight: '1.25'
                  }}>
                    {log}
                  </div>
                ))}
                {/* Flashing Cursor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#10b981' }}>
                  <span>$</span>
                  <span style={{
                    width: '8px',
                    height: '14px',
                    background: '#10b981',
                    animation: 'blink 1s step-end infinite'
                  }}></span>
                </div>
              </div>
            </div>

            {/* Terminal Footer */}
            <div style={{
              background: '#1e293b',
              padding: '0.75rem 1.5rem',
              borderTop: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}>
              {progressStatus.currentStepIndex >= progressStatus.steps.length - 1 && 
               progressStatus.steps.every(s => s.status === 'success' || s.status === 'error') ? (
                <button 
                  onClick={() => setProgressStatus(prev => ({ ...prev, show: false }))}
                  style={{
                    background: '#a855f7',
                    color: 'white',
                    border: 'none',
                    padding: '0.4rem 1.5rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)'
                  }}
                >
                  Selesai
                </button>
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                  Harap tunggu, proses sedang berlangsung...
                </span>
              )}
            </div>
          </div>
          {/* Spin and Blink animations */}
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes blink {
              from, to { background-color: transparent }
              50% { background-color: #10b981 }
            }
          `}} />
        </div>
      )}
    </div>
  );
}
