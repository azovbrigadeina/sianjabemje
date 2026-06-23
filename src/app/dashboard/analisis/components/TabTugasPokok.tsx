"use client";

import { useState, useEffect } from "react";
import type { JabatanFull, TugasPokok, Kualifikasi } from "@/lib/types";
import EditableTable, { ColumnDef } from "./EditableTable";
import styles from "../page.module.css";

interface Props {
  jabatan: JabatanFull | null;
  onSaveTugas: (rows: Partial<TugasPokok>[]) => void;
  onSaveKualifikasi: (data: Partial<Kualifikasi>) => void;
  onSaveHasilKerja: (uraian: string) => void;
  loading?: boolean;
}

const TUGAS_COLUMNS: ColumnDef[] = [
  { key: "uraianTugas", label: "Uraian Tugas", type: "textarea" },
  { key: "hasilKerja", label: "Hasil Kerja", type: "text" },
  { key: "jumlahHasil", label: "Jumlah Hasil", type: "number", width: "120px" },
];

const HASIL_KERJA_COLUMNS: ColumnDef[] = [
  { key: "uraian", label: "Uraian Hasil Kerja", type: "textarea" }
];

const PENDIDIKAN_STANDAR = [
  "SMA/ Sederajat",
  "Diploma I",
  "Diploma II",
  "Diploma III",
  "S1",
  "S2",
  "S3",
];

export default function TabTugasPokok({
  jabatan,
  onSaveTugas,
  onSaveKualifikasi,
  onSaveHasilKerja,
  loading,
}: Props) {
  const [tugasRows, setTugasRows] = useState<Record<string, unknown>[]>([]);
  const [kualifikasi, setKualifikasi] = useState({
    pendidikanFormal: "",
    pendidikanPelatihan: "",
    pengalamanKerja: "",
  });
  const [hasilKerjaRows, setHasilKerjaRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (jabatan) {
      const draftKey = `anjab_draft_tugas_${jabatan.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setTugasRows(parsed.tugasRows || []);
          setKualifikasi(parsed.kualifikasi || {
            pendidikanFormal: "", pendidikanPelatihan: "", pengalamanKerja: "",
          });
          setHasilKerjaRows(parsed.hasilKerjaRows || []);
          return;
        } catch (e) {}
      }

      const rows = (jabatan.tugasPokok || []).map((t) => ({
        ...t,
        waktuEfektif: t.waktuEfektif || 1250,
      })) as unknown as Record<string, unknown>[];
      setTugasRows(rows);

      if (jabatan.kualifikasi) {
        setKualifikasi({
          pendidikanFormal: (jabatan.kualifikasi.pendidikanFormal || []).join(", "),
          pendidikanPelatihan: (jabatan.kualifikasi.pendidikanPelatihan || []).join(", "),
          pengalamanKerja: (jabatan.kualifikasi.pengalamanKerja || []).join(", "),
        });
      }

      let parsedHasilKerja = [];
      if (jabatan.hasilKerja?.uraian) {
        try {
          const parsed = JSON.parse(jabatan.hasilKerja.uraian);
          if (Array.isArray(parsed)) {
            parsedHasilKerja = parsed.map((item: any) => typeof item === 'string' ? { uraian: item } : item);
          } else {
            parsedHasilKerja = [{ uraian: jabatan.hasilKerja.uraian }];
          }
        } catch (e) {
          parsedHasilKerja = jabatan.hasilKerja.uraian.split('\n').filter(Boolean).map(s => ({ uraian: s }));
        }
      }
      setHasilKerjaRows(parsedHasilKerja);
    }
  }, [jabatan]);

  useEffect(() => {
    if (jabatan && (tugasRows.length > 0 || hasilKerjaRows.length > 0 || kualifikasi.pendidikanFormal)) {
      localStorage.setItem(`anjab_draft_tugas_${jabatan.id}`, JSON.stringify({
        tugasRows,
        kualifikasi,
        hasilKerjaRows
      }));
    }
  }, [tugasRows, kualifikasi, hasilKerjaRows, jabatan]);

  const addTugasRow = () => {
    setTugasRows([
      ...tugasRows,
      {
        uraianTugas: "",
        hasilKerja: "",
        jumlahHasil: 0,
        waktuPenyelesaian: 0,
        waktuEfektif: 1250,
      },
    ]);
  };

  const updateTugasRow = (idx: number, row: Record<string, unknown>) => {
    const updated = [...tugasRows];
    updated[idx] = row;
    setTugasRows(updated);
  };

  const deleteTugasRow = (idx: number) => {
    setTugasRows(tugasRows.filter((_, i) => i !== idx));
  };

  const handleSaveAll = () => {
    onSaveTugas(tugasRows.map((r, i) => ({ ...r, nomorUrut: i + 1 } as Partial<TugasPokok>)));
    onSaveKualifikasi({
      pendidikanFormal: kualifikasi.pendidikanFormal.split(",").map((s) => s.trim()).filter(Boolean),
      pendidikanPelatihan: kualifikasi.pendidikanPelatihan.split(",").map((s) => s.trim()).filter(Boolean),
      pengalamanKerja: kualifikasi.pengalamanKerja.split(",").map((s) => s.trim()).filter(Boolean),
    });
    const hasilKerjaSerialized = JSON.stringify(hasilKerjaRows.map(r => r.uraian).filter(Boolean));
    onSaveHasilKerja(hasilKerjaSerialized);
    if (jabatan) localStorage.removeItem(`anjab_draft_tugas_${jabatan.id}`);
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Kualifikasi Jabatan */}
      <div>
        <div className={styles.sectionTitle}>🎓 5. Kualifikasi Jabatan</div>
        <div className={styles.formGroup}>
          <label>a. Pendidikan Formal <span style={{ opacity: 0.5, fontSize: "0.8rem" }}>(pisahkan dengan koma atau klik saran di bawah)</span></label>
          <input
            type="text"
            className={styles.formInput}
            value={kualifikasi.pendidikanFormal}
            onChange={(e) => setKualifikasi({ ...kualifikasi, pendidikanFormal: e.target.value })}
            placeholder="S1 Administrasi Negara, S1 Hukum..."
          />
          <div className={styles.tagGrid} style={{ marginTop: "4px" }}>
            {PENDIDIKAN_STANDAR.map((pend) => (
              <button
                key={pend}
                type="button"
                className={styles.tagBtn}
                onClick={() => {
                  const current = kualifikasi.pendidikanFormal;
                  const arr = current.split(",").map((s) => s.trim()).filter(Boolean);
                  if (!arr.includes(pend)) {
                    setKualifikasi({
                      ...kualifikasi,
                      pendidikanFormal: arr.length > 0 ? `${current}, ${pend}` : pend,
                    });
                  }
                }}
              >
                + {pend}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.formGroup}>
          <label>b. Pendidikan & Pelatihan <span style={{ opacity: 0.5, fontSize: "0.8rem" }}>(pisahkan dengan koma)</span></label>
          <input
            type="text"
            className={styles.formInput}
            value={kualifikasi.pendidikanPelatihan}
            onChange={(e) => setKualifikasi({ ...kualifikasi, pendidikanPelatihan: e.target.value })}
            placeholder="Diklat PIM III, Diklat Manajemen Kepegawaian"
          />
        </div>
        <div className={styles.formGroup}>
          <label>c. Pengalaman Kerja <span style={{ opacity: 0.5, fontSize: "0.8rem" }}>(pisahkan dengan koma)</span></label>
          <input
            type="text"
            className={styles.formInput}
            value={kualifikasi.pengalamanKerja}
            onChange={(e) => setKualifikasi({ ...kualifikasi, pengalamanKerja: e.target.value })}
            placeholder="Pengalaman di bidang administrasi minimal 5 tahun"
          />
        </div>
      </div>

      {/* Tugas Pokok */}
      <div>
        <div className={styles.sectionTitle}>📋 6. Tugas Pokok</div>
        <EditableTable
          columns={TUGAS_COLUMNS}
          rows={tugasRows}
          onAdd={addTugasRow}
          onUpdate={updateTugasRow}
          onDelete={deleteTugasRow}
          loading={loading}
          entityName="Tugas Pokok"
        />
      </div>

      {/* Hasil Kerja */}
      <div>
        <div className={styles.sectionTitle}>📦 7. Hasil Kerja</div>
        <EditableTable
          columns={HASIL_KERJA_COLUMNS}
          rows={hasilKerjaRows}
          onAdd={() => setHasilKerjaRows([...hasilKerjaRows, { uraian: "" }])}
          onUpdate={(idx, row) => {
            const updated = [...hasilKerjaRows];
            updated[idx] = row;
            setHasilKerjaRows(updated);
          }}
          onDelete={(idx) => setHasilKerjaRows(hasilKerjaRows.filter((_, i) => i !== idx))}
          loading={loading}
          entityName="Hasil Kerja"
        />
      </div>

      <button className={styles.btnSave} onClick={handleSaveAll} disabled={loading}>
        {loading ? "Menyimpan..." : "💾 Simpan Tugas & Kualifikasi"}
      </button>
    </div>
  );
}
