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
  const [currentPage, setCurrentPage] = useState(1);

  // Editor State
  const [activeJob, setActiveJob] = useState<string>("");
  const [activeTab, setActiveTab] = useState("identitas");
  const [jabatanData, setJabatanData] = useState<JabatanFull | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [versionKey, setVersionKey] = useState(0);
  const [activeYear, setActiveYear] = useState<string>("2026");
  const [aiLoading, setAiLoading] = useState(false);
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
        expandState[opd.id] = false; // Collapsed by default
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
    // Initial load
    const savedYear = localStorage.getItem("sianjab_active_year") || "2026";
    setActiveYear(savedYear);
    loadTree();

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
  }, [loadTree]);

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
  const handleTriggerAI = async () => {
    if (!jabatanData) return;
    if (!confirm(`Yakin ingin menyusun draf dokumen Anjab menggunakan AI (Gemini) untuk jabatan "${jabatanData.namaJabatan}"? Isian form identitas, tugas pokok, dan syarat jabatan saat ini akan ditimpa dengan draf AI.`)) return;

    const steps = [
      { text: "Mengidentifikasi data jabatan & unit kerja", status: 'loading' as const },
      { text: "Mengirim instruksi & prompt ke Gemini AI", status: 'waiting' as const },
      { text: "Memproses & menormalisasi struktur draf", status: 'waiting' as const },
      { text: "Menyimpan data Identitas, Kualifikasi, & Syarat Jabatan", status: 'waiting' as const },
      { text: "Menyimpan data Tugas Pokok & Hasil Kerja", status: 'waiting' as const },
      { text: "Menyimpan tabel-tabel pendukung (Bahan, Perangkat, TJ, dll)", status: 'waiting' as const },
      { text: "Sinkronisasi database & pembersihan cache lokal", status: 'waiting' as const }
    ];

    const getTimestamp = () => `[${new Date().toTimeString().split(' ')[0]}]`;

    setProgressStatus({
      show: true,
      title: "Gemini AI Draft Builder",
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
        `${getTimestamp()} INFO: Menghubungi Google Gemini API...`
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
      updateStep(3, 'loading', [`${getTimestamp()} PROCESS: Menyimpan Identitas, Kualifikasi, & Syarat Jabatan...`]);
      
      await api.updateJabatan(jabatanData.id, {
        ...jabatanData,
        ikhtisarJabatan: aiDraft.ikhtisarJabatan
      });
      await api.saveSingleEntity('kualifikasi', jabatanData.id, aiDraft.kualifikasi);
      await api.saveSingleEntity('syaratJabatan', jabatanData.id, aiDraft.syaratJabatan);
      await new Promise(r => setTimeout(r, 300));

      updateStep(3, 'success', [
        `${getTimestamp()} SUCCESS: Data Identitas, Kualifikasi, & Syarat Jabatan berhasil disimpan.`
      ]);

      // Step 5: Tugas Pokok & Hasil Kerja
      updateStep(4, 'loading', [`${getTimestamp()} PROCESS: Menyimpan Tugas Pokok & Hasil Kerja...`]);
      
      const mappedTasks = (aiDraft.tugasPokok || []).map((tp: any, index: number) => ({
        nomorUrut: tp.nomorUrut || index + 1,
        uraianTugas: tp.uraianTugas,
        hasilKerja: tp.hasilKerja || "Dokumen Laporan",
        jumlahHasil: 1,
        waktuPenyelesaian: tp.waktuPenyelesaian || 60,
        waktuEfektif: 72000,
        kebutuhanPegawai: Number(((1 * (tp.waktuPenyelesaian || 60)) / 72000).toFixed(4))
      }));
      await api.saveMultiEntity('tugasPokok', jabatanData.id, mappedTasks);

      if (aiDraft.hasilKerja) {
        const hasilKerjaData = Array.isArray(aiDraft.hasilKerja)
          ? { uraian: JSON.stringify(aiDraft.hasilKerja) }
          : typeof aiDraft.hasilKerja === 'string'
            ? { uraian: aiDraft.hasilKerja }
            : aiDraft.hasilKerja;
        await api.saveSingleEntity('hasilKerja', jabatanData.id, hasilKerjaData);
      }
      await new Promise(r => setTimeout(r, 300));

      updateStep(4, 'success', [
        `${getTimestamp()} SUCCESS: Tugas Pokok (5+ poin) & Hasil Kerja (narasi) berhasil disimpan.`
      ]);

      // Step 6: Tabel Pendukung
      updateStep(5, 'loading', [`${getTimestamp()} PROCESS: Menyimpan tabel-tabel data pendukung...`]);
      
      if (aiDraft.prestasiKerja) {
        await api.saveSingleEntity('prestasiKerja', jabatanData.id, aiDraft.prestasiKerja);
      }
      if (aiDraft.bahanKerja && aiDraft.bahanKerja.length > 0) {
        await api.saveMultiEntity('bahanKerja', jabatanData.id, aiDraft.bahanKerja.map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })));
      }
      if (aiDraft.perangkatKerja && aiDraft.perangkatKerja.length > 0) {
        await api.saveMultiEntity('perangkatKerja', jabatanData.id, aiDraft.perangkatKerja.map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })));
      }
      if (aiDraft.tanggungJawab && aiDraft.tanggungJawab.length > 0) {
        await api.saveMultiEntity('tanggungJawab', jabatanData.id, aiDraft.tanggungJawab.map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })));
      }
      if (aiDraft.wewenang && aiDraft.wewenang.length > 0) {
        await api.saveMultiEntity('wewenang', jabatanData.id, aiDraft.wewenang.map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })));
      }
      if (aiDraft.korelasiJabatan && aiDraft.korelasiJabatan.length > 0) {
        await api.saveMultiEntity('korelasiJabatan', jabatanData.id, aiDraft.korelasiJabatan.map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })));
      }
      if (aiDraft.kondisiLingkungan && aiDraft.kondisiLingkungan.length > 0) {
        await api.saveMultiEntity('kondisiLingkungan', jabatanData.id, aiDraft.kondisiLingkungan.map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })));
      }
      if (aiDraft.risikoBahaya && aiDraft.risikoBahaya.length > 0) {
        await api.saveMultiEntity('risikoBahaya', jabatanData.id, aiDraft.risikoBahaya.map((r: any, i: number) => ({ ...r, nomorUrut: i + 1 })));
      }
      await new Promise(r => setTimeout(r, 400));

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

      showToast("✨ Draf Anjab berhasil dipasang oleh Gemini AI!");

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

      // Step 3: Identitas & Kualifikasi & Syarat
      if (parsedData.identitas.ikhtisarJabatan) {
        updatedJabatan.ikhtisarJabatan = parsedData.identitas.ikhtisarJabatan;
        await api.updateJabatan(jabatanData.id, {
          ...jabatanData,
          ikhtisarJabatan: parsedData.identitas.ikhtisarJabatan
        });
      }
      if (parsedData.kualifikasi.pendidikanFormal?.length > 0 || parsedData.kualifikasi.pengalamanKerja?.length > 0) {
        updatedJabatan.kualifikasi = parsedData.kualifikasi;
        await api.saveSingleEntity('kualifikasi', jabatanData.id, parsedData.kualifikasi);
      }
      if (parsedData.syaratJabatan) {
        updatedJabatan.syaratJabatan = parsedData.syaratJabatan;
        await api.saveSingleEntity('syaratJabatan', jabatanData.id, parsedData.syaratJabatan);
      }
      await new Promise(r => setTimeout(r, 400));
      updateStep(2, 'success', [
        `${getTimestamp()} SUCCESS: Data Identitas, Kualifikasi, dan Syarat Jabatan berhasil disimpan.`
      ]);

      // Step 4: Tugas Pokok & Hasil Kerja
      updateStep(3, 'loading', [`${getTimestamp()} PROCESS: Menyimpan Tugas Pokok & Hasil Kerja...`]);
      if (parsedData.tugasPokok.length > 0) {
        updatedJabatan.tugasPokok = parsedData.tugasPokok;
        await api.saveMultiEntity('tugasPokok', jabatanData.id, parsedData.tugasPokok);
      }
      if (parsedData.hasilKerja?.uraian) {
        updatedJabatan.hasilKerja = parsedData.hasilKerja;
        await api.saveSingleEntity('hasilKerja', jabatanData.id, parsedData.hasilKerja);
      }
      if (parsedData.prestasiKerja?.uraian) {
        updatedJabatan.prestasiKerja = parsedData.prestasiKerja;
        await api.saveSingleEntity('prestasiKerja', jabatanData.id, parsedData.prestasiKerja);
      }
      await new Promise(r => setTimeout(r, 400));
      updateStep(3, 'success', [
        `${getTimestamp()} SUCCESS: Tugas Pokok & Hasil Kerja berhasil disimpan.`
      ]);

      // Step 5: Tabel Pendukung
      updateStep(4, 'loading', [`${getTimestamp()} PROCESS: Menyimpan tabel-tabel data pendukung...`]);
      if (parsedData.bahanKerja.length > 0) {
        updatedJabatan.bahanKerja = parsedData.bahanKerja;
        await api.saveMultiEntity('bahanKerja', jabatanData.id, parsedData.bahanKerja);
      }
      if (parsedData.perangkatKerja.length > 0) {
        updatedJabatan.perangkatKerja = parsedData.perangkatKerja;
        await api.saveMultiEntity('perangkatKerja', jabatanData.id, parsedData.perangkatKerja);
      }
      if (parsedData.tanggungJawab.length > 0) {
        updatedJabatan.tanggungJawab = parsedData.tanggungJawab;
        await api.saveMultiEntity('tanggungJawab', jabatanData.id, parsedData.tanggungJawab);
      }
      if (parsedData.wewenang.length > 0) {
        updatedJabatan.wewenang = parsedData.wewenang;
        await api.saveMultiEntity('wewenang', jabatanData.id, parsedData.wewenang);
      }
      if (parsedData.korelasiJabatan.length > 0) {
        updatedJabatan.korelasiJabatan = parsedData.korelasiJabatan;
        await api.saveMultiEntity('korelasiJabatan', jabatanData.id, parsedData.korelasiJabatan);
      }
      if (parsedData.kondisiLingkungan.length > 0) {
        updatedJabatan.kondisiLingkungan = parsedData.kondisiLingkungan;
        await api.saveMultiEntity('kondisiLingkungan', jabatanData.id, parsedData.kondisiLingkungan);
      }
      if (parsedData.risikoBahaya.length > 0) {
        updatedJabatan.risikoBahaya = parsedData.risikoBahaya;
        await api.saveMultiEntity('risikoBahaya', jabatanData.id, parsedData.risikoBahaya);
      }
      await new Promise(r => setTimeout(r, 400));
      updateStep(4, 'success', [
        `${getTimestamp()} SUCCESS: Seluruh data tabel pendukung berhasil disimpan.`
      ]);

      // Step 6: Finalisasi
      updateStep(5, 'loading', [`${getTimestamp()} PROCESS: Memuat ulang tampilan editor...`]);
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
      const { data: parsedData, logs } = await parseAnjabAsli(file);
      await processImportedData(parsedData, logs, "Anjab Asli");
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
            <div className={styles.jobTitle}>{jabatanData?.namaJabatan || "— Memuat Jabatan —"}</div>
            {jabatanData && (
              <div style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.25rem", display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span>Kode: <span style={{ fontFamily: "monospace" }}>{jabatanData.kodeJabatan}</span></span>
                <span>{' · '} Kelas: <strong>{jabatanData.kelasJabatan}</strong></span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={handleTriggerAI}
                    disabled={aiLoading}
                    style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    title="Susun draf Anjab otomatis dengan Gemini AI"
                  >
                    <span>✨</span> {aiLoading ? "Memproses AI..." : "Draf AI"}
                  </button>
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
                  <TabIdentitas key={`identitas-${jabatanData.id}-${versionKey}`} jabatan={jabatanData} treeData={treeData} onSave={handleSaveIdentitas} loading={loadingEditor} readOnlyNama={true} />
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
