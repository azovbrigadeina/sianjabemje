"use client";

import { useState, useEffect } from "react";
import type { JabatanFull } from "@/lib/types";
import { ASPEK_LINGKUNGAN } from "@/lib/types";
import EditableTable, { ColumnDef } from "./EditableTable";
import styles from "../page.module.css";

interface Props {
  jabatan: JabatanFull | null;
  onSave: (entity: string, rows: Record<string, unknown>[]) => void;
  loading?: boolean;
  readOnly?: boolean;
}

const KORELASI_COLS: ColumnDef[] = [
  { key: "namaJabatanTerkait", label: "Nama Jabatan", type: "text" },
  { key: "unitKerjaInstansi", label: "Unit Kerja / Instansi", type: "text" },
  { key: "dalamHal", label: "Dalam Hal", type: "text" },
];

const KONDISI_COLS: ColumnDef[] = [
  { key: "aspek", label: "Aspek", type: "text" },
  { key: "faktor", label: "Faktor", type: "text" },
];

const RISIKO_COLS: ColumnDef[] = [
  { key: "namaRisiko", label: "Nama Risiko", type: "text" },
  { key: "penyebab", label: "Penyebab", type: "text" },
];

const getGeneralFallbackFactor = (aspek: string): string => {
  const cleanAspek = aspek.toLowerCase().trim();
  if (cleanAspek.includes('tempat kerja')) return 'Di dalam ruangan';
  if (cleanAspek.includes('suhu')) return 'Dingin/Sejuk';
  if (cleanAspek.includes('udara')) return 'Segar/Bersih';
  if (cleanAspek.includes('keadaan ruangan') || cleanAspek.includes('keadaan ruang')) return 'Nyaman/Cukup';
  if (cleanAspek.includes('letak')) return 'Datar/Strategis';
  if (cleanAspek.includes('penerangan')) return 'Terang/Cukup';
  if (cleanAspek.includes('suara')) return 'Tenang/Sunyi';
  if (cleanAspek.includes('keadaan tempat')) return 'Bersih/Rapi';
  if (cleanAspek.includes('getaran')) return 'Tidak ada';
  return 'Normal';
};

export default function TabKorelasiLingkungan({ jabatan, onSave, loading, readOnly }: Props) {
  const [korelasiRows, setKorelasiRows] = useState<Record<string, unknown>[]>([]);
  const [kondisiRows, setKondisiRows] = useState<Record<string, unknown>[]>([]);
  const [risikoRows, setRisikoRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (jabatan) {
      setKorelasiRows((jabatan.korelasiJabatan || []) as unknown as Record<string, unknown>[]);
      // Pre-fill kondisi with standard aspects if empty
      const existingKondisi = jabatan.kondisiLingkungan || [];
      if (existingKondisi.length === 0) {
        setKondisiRows(
          ASPEK_LINGKUNGAN.map((aspek, i) => ({
            aspek,
            faktor: getGeneralFallbackFactor(aspek),
            nomorUrut: i + 1,
          }))
        );
      } else {
        setKondisiRows(existingKondisi as unknown as Record<string, unknown>[]);
      }
      setRisikoRows((jabatan.risikoBahaya || []) as unknown as Record<string, unknown>[]);
    }
  }, [jabatan]);

  const makeHandlers = (
    rows: Record<string, unknown>[],
    setRows: React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>,
    defaultRow: Record<string, unknown>
  ) => ({
    onAdd: () => setRows([...rows, { ...defaultRow }]),
    onUpdate: (idx: number, row: Record<string, unknown>) => {
      const updated = [...rows];
      updated[idx] = row;
      setRows(updated);
    },
    onDelete: (idx: number) => setRows(rows.filter((_, i) => i !== idx)),
  });

  const korelasiH = makeHandlers(korelasiRows, setKorelasiRows, {
    namaJabatanTerkait: "",
    unitKerjaInstansi: "",
    dalamHal: "",
  });
  const kondisiH = makeHandlers(kondisiRows, setKondisiRows, { aspek: "", faktor: "" });
  const risikoH = makeHandlers(risikoRows, setRisikoRows, { namaRisiko: "", penyebab: "" });

  const handleSaveAll = () => {
    onSave("korelasiJabatan", korelasiRows.map((r, i) => ({ ...r, nomorUrut: i + 1 })));
    onSave("kondisiLingkungan", kondisiRows.map((r, i) => ({ ...r, nomorUrut: i + 1 })));
    onSave("risikoBahaya", risikoRows.map((r, i) => ({ ...r, nomorUrut: i + 1 })));
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <div className={styles.sectionTitle}>🔗 12. Korelasi Jabatan</div>
        <EditableTable columns={KORELASI_COLS} rows={korelasiRows} {...korelasiH} loading={loading} entityName="Korelasi Jabatan" readOnly={readOnly} />
      </div>

      <div>
        <div className={styles.sectionTitle}>🌍 13. Kondisi Lingkungan Kerja</div>
        <EditableTable columns={KONDISI_COLS} rows={kondisiRows} {...kondisiH} loading={loading} entityName="Kondisi Lingkungan" readOnly={readOnly} />
      </div>

      <div>
        <div className={styles.sectionTitle}>⚠️ 14. Risiko Bahaya</div>
        <EditableTable columns={RISIKO_COLS} rows={risikoRows} {...risikoH} loading={loading} entityName="Risiko Bahaya" readOnly={readOnly} />
      </div>

      {!readOnly && (
        <button className={styles.btnSave} onClick={handleSaveAll} disabled={loading}>
          {loading ? "Menyimpan..." : "💾 Simpan Korelasi, Lingkungan & Risiko"}
        </button>
      )}
    </div>
  );
}
