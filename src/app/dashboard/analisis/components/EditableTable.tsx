"use client";

import { useState } from "react";
import styles from "./EditableTable.module.css";

export interface ColumnDef {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number";
  width?: string;
  computed?: boolean;
}

interface EditableTableProps {
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  onAdd: () => void;
  onUpdate: (index: number, row: Record<string, unknown>) => void;
  onDelete: (index: number) => void;
  loading?: boolean;
  entityName?: string;
}

export default function EditableTable({
  columns,
  rows,
  onAdd,
  onUpdate,
  onDelete,
  loading,
  entityName = "Data",
}: EditableTableProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Record<string, unknown>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditRow({ ...rows[idx] });
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditRow({});
  };

  const saveEdit = () => {
    if (editingIdx !== null) {
      onUpdate(editingIdx, editRow);
      setEditingIdx(null);
      setEditRow({});
    }
  };

  const confirmDelete = (idx: number) => {
    onDelete(idx);
    setDeleteConfirm(null);
  };

  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableHeader}>
        <span className={styles.tableTitle}>{entityName}</span>
        <button className={styles.btnAdd} onClick={onAdd} disabled={loading}>
          + Tambah
        </button>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <span style={{ fontSize: "2rem" }}>📭</span>
          <p>Belum ada data {entityName.toLowerCase()}.</p>
        </div>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: "50px" }}>No</th>
                {columns.map((col) => (
                  <th key={col.key} style={col.width ? { width: col.width } : {}}>
                    {col.label}
                  </th>
                ))}
                <th style={{ width: "100px" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className={editingIdx === idx ? styles.editing : ""}>
                  <td className={styles.numCol}>{idx + 1}</td>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {editingIdx === idx && !col.computed ? (
                        col.type === "textarea" ? (
                          <textarea
                            className={styles.cellInput}
                            value={String(editRow[col.key] ?? "")}
                            onChange={(e) =>
                              setEditRow({ ...editRow, [col.key]: e.target.value })
                            }
                            rows={2}
                          />
                        ) : col.type === "number" ? (
                          <input
                            className={styles.cellInput}
                            type="number"
                            value={String(editRow[col.key] ?? "")}
                            onChange={(e) =>
                              setEditRow({
                                ...editRow,
                                [col.key]: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        ) : (
                          <input
                            className={styles.cellInput}
                            type="text"
                            value={String(editRow[col.key] ?? "")}
                            onChange={(e) =>
                              setEditRow({ ...editRow, [col.key]: e.target.value })
                            }
                          />
                        )
                      ) : (
                        <span className={col.computed ? styles.computed : ""}>
                          {col.type === "number"
                            ? Number(row[col.key] ?? 0).toLocaleString("id-ID")
                            : String(row[col.key] ?? "-")}
                        </span>
                      )}
                    </td>
                  ))}
                  <td>
                    <div className={styles.actions}>
                      {editingIdx === idx ? (
                        <>
                          <button className={styles.btnSave} onClick={saveEdit}>✓</button>
                          <button className={styles.btnCancel} onClick={cancelEdit}>✕</button>
                        </>
                      ) : deleteConfirm === idx ? (
                        <>
                          <button className={styles.btnConfirmDel} onClick={() => confirmDelete(idx)}>Hapus?</button>
                          <button className={styles.btnCancel} onClick={() => setDeleteConfirm(null)}>Batal</button>
                        </>
                      ) : (
                        <>
                          <button className={styles.btnEdit} onClick={() => startEdit(idx)} title="Edit">✎</button>
                          <button className={styles.btnDel} onClick={() => setDeleteConfirm(idx)} title="Hapus">🗑</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
