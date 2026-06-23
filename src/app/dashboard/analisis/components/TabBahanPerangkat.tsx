"use client";

import { useState, useEffect } from "react";
import type { JabatanFull } from "@/lib/types";
import EditableTable, { ColumnDef } from "./EditableTable";
import styles from "../page.module.css";

interface Props {
  jabatan: JabatanFull | null;
  onSave: (entity: string, rows: Record<string, unknown>[]) => void;
  loading?: boolean;
}

const BAHAN_COLS: ColumnDef[] = [
  { key: "namaBahan", label: "Bahan Kerja", type: "text" },
  { key: "penggunaanDalamTugas", label: "Penggunaan Dalam Tugas", type: "text" },
];

const PERANGKAT_COLS: ColumnDef[] = [
  { key: "namaPerangkat", label: "Perangkat Kerja", type: "text" },
  { key: "penggunaanUntukTugas", label: "Penggunaan Untuk Tugas", type: "text" },
];

const TJ_COLS: ColumnDef[] = [
  { key: "uraian", label: "Uraian Tanggung Jawab", type: "textarea" },
];

const WW_COLS: ColumnDef[] = [
  { key: "uraian", label: "Uraian Wewenang", type: "textarea" },
];

export default function TabBahanPerangkat({ jabatan, onSave, loading }: Props) {
  const [bahanRows, setBahanRows] = useState<Record<string, unknown>[]>([]);
  const [perangkatRows, setPerangkatRows] = useState<Record<string, unknown>[]>([]);
  const [tjRows, setTjRows] = useState<Record<string, unknown>[]>([]);
  const [wwRows, setWwRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (jabatan) {
      setBahanRows((jabatan.bahanKerja || []) as unknown as Record<string, unknown>[]);
      setPerangkatRows((jabatan.perangkatKerja || []) as unknown as Record<string, unknown>[]);
      setTjRows((jabatan.tanggungJawab || []) as unknown as Record<string, unknown>[]);
      setWwRows((jabatan.wewenang || []) as unknown as Record<string, unknown>[]);
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

  const bahanH = makeHandlers(bahanRows, setBahanRows, { namaBahan: "", penggunaanDalamTugas: "" });
  const perangkatH = makeHandlers(perangkatRows, setPerangkatRows, { namaPerangkat: "", penggunaanUntukTugas: "" });
  const tjH = makeHandlers(tjRows, setTjRows, { uraian: "" });
  const wwH = makeHandlers(wwRows, setWwRows, { uraian: "" });

  const handleSaveAll = () => {
    onSave("bahanKerja", bahanRows.map((r, i) => ({ ...r, nomorUrut: i + 1 })));
    onSave("perangkatKerja", perangkatRows.map((r, i) => ({ ...r, nomorUrut: i + 1 })));
    onSave("tanggungJawab", tjRows.map((r, i) => ({ ...r, nomorUrut: i + 1 })));
    onSave("wewenang", wwRows.map((r, i) => ({ ...r, nomorUrut: i + 1 })));
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <div className={styles.sectionTitle}>📦 8. Bahan Kerja</div>
        <EditableTable columns={BAHAN_COLS} rows={bahanRows} {...bahanH} loading={loading} entityName="Bahan Kerja" />
      </div>

      <div>
        <div className={styles.sectionTitle}>🔧 9. Perangkat Kerja</div>
        <EditableTable columns={PERANGKAT_COLS} rows={perangkatRows} {...perangkatH} loading={loading} entityName="Perangkat Kerja" />
      </div>

      <div>
        <div className={styles.sectionTitle}>✅ 10. Tanggung Jawab</div>
        <EditableTable columns={TJ_COLS} rows={tjRows} {...tjH} loading={loading} entityName="Tanggung Jawab" />
      </div>

      <div>
        <div className={styles.sectionTitle}>⚡ 11. Wewenang</div>
        <EditableTable columns={WW_COLS} rows={wwRows} {...wwH} loading={loading} entityName="Wewenang" />
      </div>

      <button className={styles.btnSave} onClick={handleSaveAll} disabled={loading}>
        {loading ? "Menyimpan..." : "💾 Simpan Bahan, Perangkat, TJ & Wewenang"}
      </button>
    </div>
  );
}
