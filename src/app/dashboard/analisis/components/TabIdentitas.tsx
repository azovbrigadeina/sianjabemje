import { useState, useEffect, useRef } from "react";
import type { JabatanFull } from "@/lib/types";
import type { TreeNode } from "../page";
import styles from "../page.module.css";

interface Props {
  jabatan: JabatanFull | null;
  treeData: TreeNode[];
  onSave: (data: Partial<JabatanFull>) => void;
  loading?: boolean;
  readOnlyNama?: boolean;
}

export default function TabIdentitas({ jabatan, treeData, onSave, loading, readOnlyNama }: Props) {
  const [form, setForm] = useState({
    namaJabatan: "",
    kodeJabatan: "",
    jenisJabatan: "",
    ikhtisarJabatan: "",
    kelasJabatan: 0,
  });

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (jabatan) {
      const draftKey = `anjab_draft_identitas_${jabatan.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setForm(parsed);
          isInitialMount.current = false;
          return;
        } catch (e) {}
      }

      isInitialMount.current = true;

      const normalizeJenisJabatan = (jenis: string) => {
        const j = (jenis || "").toLowerCase();
        if (j.includes("utama")) return "JPT Utama";
        if (j.includes("madya")) return "JPT Madya";
        if (j.includes("pratama") || j.includes("pimpinan tinggi")) return "JPT Pratama";
        if (j === "administrator") return "Administrator";
        if (j === "pengawas") return "Pengawas";
        if (j === "pelaksana") return "Pelaksana";
        if (j.includes("fungsional")) return "Fungsional";
        return jenis || "";
      };

      setForm({
        namaJabatan: jabatan.namaJabatan || "",
        kodeJabatan: jabatan.kodeJabatan || "",
        jenisJabatan: normalizeJenisJabatan(jabatan.jenisJabatan || ""),
        ikhtisarJabatan: jabatan.ikhtisarJabatan || "",
        kelasJabatan: jabatan.kelasJabatan || 0,
      });
    }
  }, [jabatan]);

  // Save to draft whenever form changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (jabatan && form.namaJabatan) {
      localStorage.setItem(`anjab_draft_identitas_${jabatan.id}`, JSON.stringify(form));
    }
  }, [form, jabatan]);

  // Efek berjalan otomatis: Update Kode Jabatan jika Jenis Jabatan berubah atau ketika dimuat
  useEffect(() => {
    if (jabatan) {
      const opdCode = jabatan.unitKerjaId ? (jabatan.unitKerjaId.length % 90) + 10 : 14; 
      const levelCode = jabatan.level !== undefined ? jabatan.level : 2;
      const subCode = form.jenisJabatan === "Administrator" ? 1 : 
                      form.jenisJabatan === "Pengawas" ? 2 : 
                      form.jenisJabatan === "Pelaksana" ? 3 : 0;
      
      // Ambil sequence dari data asal, jika belum ada kasih angka random/urut simulasi
      let seqCode = 1;
      if (jabatan.kodeJabatan) {
        const parts = jabatan.kodeJabatan.split(".");
        if (parts.length === 4) {
          seqCode = parseInt(parts[3]) || 1;
        } else {
           seqCode = Math.floor(Math.random() * 9) + 1;
        }
      }

      const generatedKode = `${opdCode}.${levelCode}.${subCode}.${seqCode}`;
      
      if (form.kodeJabatan !== generatedKode) {
         setForm(prev => ({ ...prev, kodeJabatan: generatedKode }));
      }
    }
  }, [jabatan, form.jenisJabatan]);

  const hierarchy = jabatan?.hierarchy as Record<string, string> | undefined;

  const getSubordinates = () => {
    if (!jabatan || !treeData) return {} as Record<string, string>;
    
    let currentNode: TreeNode | null = null;
    const findNode = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.id === jabatan.id) {
          currentNode = n;
          return;
        }
        findNode(n.children);
      }
    };
    findNode(treeData);

    if (!currentNode) return {} as Record<string, string>;

    const subs: Record<string, string[]> = {
      jptUtama: [], jptMadya: [], jptPratama: [], administrator: [], pengawas: [], pelaksana: [], jabatanFungsional: []
    };

    const traverse = (n: TreeNode) => {
      for (const child of n.children) {
        if (child.type === 'JABATAN') {
          const type = (child.eselon || '').toLowerCase();
          if (type.includes('utama')) subs.jptUtama.push(child.label);
          else if (type.includes('madya')) subs.jptMadya.push(child.label);
          else if (type.includes('pratama') || type.includes('pimpinan tinggi')) subs.jptPratama.push(child.label);
          else if (type === 'administrator') subs.administrator.push(child.label);
          else if (type === 'pengawas') subs.pengawas.push(child.label);
          else if (type === 'pelaksana') subs.pelaksana.push(child.label);
          else if (type.includes('fungsional')) subs.jabatanFungsional.push(child.label);
        }
        traverse(child);
      }
    };
    traverse(currentNode);

    return {
      jptUtama: subs.jptUtama.join(', '),
      jptMadya: subs.jptMadya.join(', '),
      jptPratama: subs.jptPratama.join(', '),
      administrator: subs.administrator.join(', '),
      pengawas: subs.pengawas.join(', '),
      pelaksana: subs.pelaksana.join(', '),
      jabatanFungsional: subs.jabatanFungsional.join(', '),
    };
  };

  const getAncestors = () => {
    if (!jabatan || !treeData) return {} as Record<string, string>;
    
    let path: TreeNode[] = [];
    const findPath = (nodes: TreeNode[], currentPath: TreeNode[]): boolean => {
      for (const n of nodes) {
        if (n.id === jabatan.id) {
          path = currentPath; 
          return true;
        }
        if (findPath(n.children, [...currentPath, n])) return true;
      }
      return false;
    };
    
    findPath(treeData, []);
    
    const ancestors: Record<string, string> = {};
    for (const p of path) {
      const type = (p.eselon || '').toLowerCase();
      if (type.includes('utama')) ancestors.jptUtama = p.label;
      else if (type.includes('madya')) ancestors.jptMadya = p.label;
      else if (type.includes('pratama') || type.includes('pimpinan tinggi')) ancestors.jptPratama = p.label;
      else if (type === 'administrator') ancestors.administrator = p.label;
      else if (type === 'pengawas') ancestors.pengawas = p.label;
      else if (type === 'pelaksana') ancestors.pelaksana = p.label;
      else if (type.includes('fungsional')) ancestors.jabatanFungsional = p.label;
    }
    return ancestors;
  };

  const subordinates = getSubordinates();
  const treeAncestors = getAncestors();

  const handleSubmit = () => {
    onSave(form);
    if (jabatan) localStorage.removeItem(`anjab_draft_identitas_${jabatan.id}`);
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column" }}>
      {/* Informasi Jabatan */}
      <div className={styles.sectionTitle}>📋 Informasi Jabatan</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className={styles.formGroup}>
          <label>1. Nama Jabatan</label>
          <input
            type="text"
            className={styles.formInput}
            value={form.namaJabatan}
            onChange={(e) => setForm({ ...form, namaJabatan: e.target.value })}
            disabled={readOnlyNama}
            placeholder="Masukkan nama jabatan"
          />
        </div>
        <div className={styles.formGroup}>
          <label>2. Kode Jabatan (Otomatis)</label>
          <input
            type="text"
            className={styles.formInput}
            value={form.kodeJabatan}
            disabled
            placeholder="Akan digenerate otomatis..."
            style={{ fontFamily: "monospace", opacity: 0.6 }}
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Jenis Jabatan</label>
        <select
          className={styles.formInput}
          value={form.jenisJabatan}
          onChange={(e) => setForm({ ...form, jenisJabatan: e.target.value })}
          disabled
        >
          <option value="">-- Pilih Jenis Jabatan --</option>
          <option value="JPT Utama">JPT Utama</option>
          <option value="JPT Madya">JPT Madya</option>
          <option value="JPT Pratama">JPT Pratama</option>
          <option value="Administrator">Administrator</option>
          <option value="Pengawas">Pengawas</option>
          <option value="Pelaksana">Pelaksana</option>
          <option value="Fungsional">Jabatan Fungsional</option>
        </select>
      </div>

      {/* Unit Kerja (Auto-filled from hierarchy) */}
      <div className={styles.sectionTitle}>🏢 Unit Kerja</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {[
          { key: "jptUtama", label: "a. JPT Utama", match: "JPT Utama" },
          { key: "jptMadya", label: "b. JPT Madya", match: "JPT Madya" },
          { key: "jptPratama", label: "c. JPT Pratama", match: "JPT Pratama" },
          { key: "administrator", label: "d. Administrator", match: "Administrator" },
          { key: "pengawas", label: "e. Pengawas", match: "Pengawas" },
          { key: "pelaksana", label: "f. Pelaksana", match: "Pelaksana" },
          { key: "jabatanFungsional", label: "g. Jabatan Fungsional", match: "Fungsional" },
        ].map((field) => {
          const currentLevel = (form.jenisJabatan || "").toLowerCase();
          
          let val = "-";
          if (jabatan) {
             val = treeAncestors[field.key]
                || (jabatan as any)[field.key] 
                || hierarchy?.[field.key] 
                || "-";
             
             // Fallback khusus untuk JPT Pratama yang di database mungkin bernama jabatanPimpinanTinggi
             if (field.key === "jptPratama" && val === "-") {
                val = (jabatan as any).jabatanPimpinanTinggi || hierarchy?.["jabatanPimpinanTinggi"] || "-";
             }
          }

          if (currentLevel === field.match.toLowerCase() || (currentLevel.includes('pratama') && field.key === 'jptPratama')) {
            val = ""; // Kosongkan di level yang sama
          } else if (subordinates[field.key]) {
            val = subordinates[field.key]; // Isi bawahan jika ada
          }

          // Bersihkan jika backend mengirimkan nama jabatan ini sendiri sebagai hirarki
          if (val.trim().toLowerCase() === (form.namaJabatan || "").trim().toLowerCase()) {
            val = "";
          }

          return (
            <div className={styles.formGroup} key={field.key}>
              <label>{field.label}</label>
              <input
                type="text"
                className={styles.formInput}
                value={val}
                disabled
                style={{ opacity: 0.55, fontStyle: "italic" }}
              />
            </div>
          );
        })}
      </div>

      {/* Ikhtisar Jabatan */}
      <div className={styles.sectionTitle}>📝 Ikhtisar & Kelas Jabatan</div>

      <div className={styles.formGroup}>
        <label>4. Ikhtisar Jabatan</label>
        <textarea
          className={styles.formInput}
          value={form.ikhtisarJabatan}
          onChange={(e) => setForm({ ...form, ikhtisarJabatan: e.target.value })}
          placeholder="Deskripsi ringkasan jabatan..."
          rows={3}
        />
      </div>

      <div className={styles.formGroup} style={{ maxWidth: "200px" }}>
        <label>17. Kelas Jabatan</label>
        <input
          type="number"
          className={styles.formInput}
          value={form.kelasJabatan}
          onChange={(e) => setForm({ ...form, kelasJabatan: parseInt(e.target.value) || 0 })}
          min={1}
          max={17}
        />
      </div>

      <button className={styles.btnSave} onClick={handleSubmit} disabled={loading}>
        {loading ? "Menyimpan..." : "💾 Simpan Identitas"}
      </button>
    </div>
  );
}
