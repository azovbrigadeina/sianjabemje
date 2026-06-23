"use client";

import { useState, useEffect, FormEvent } from "react";
import { api } from "@/lib/api";
import type { User, UnitKerja } from "@/lib/types";
import styles from "./users.module.css";

interface UserFormData {
  username: string;
  password: string;
  namaLengkap: string;
  role: "admin" | "operator";
  unitKerjaId: string;
  isActive: boolean;
}

const defaultForm: UserFormData = {
  username: "",
  password: "",
  namaLengkap: "",
  role: "operator",
  unitKerjaId: "",
  isActive: true,
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [opds, setOpds] = useState<UnitKerja[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRaw, opdsRaw] = await Promise.all([
        api.getUsers(),
        api.getUnitKerja(),
      ]);
      setUsers((usersRaw as User[]) || []);
      // Show only top-level OPD (no parent) for assignment
      const allOpds = (opdsRaw as UnitKerja[]) || [];
      setOpds(allOpds);
    } catch (err) {
      console.error("Gagal memuat data", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setForm(defaultForm);
    setError("");
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setForm({
      username: u.username,
      password: "",
      namaLengkap: u.namaLengkap,
      role: u.role,
      unitKerjaId: u.unitKerjaId || "",
      isActive: u.isActive,
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (editingUser) {
        // Update: only send password if filled
        const updatePayload: Partial<UserFormData> & { password?: string } = {
          namaLengkap: form.namaLengkap,
          role: form.role,
          unitKerjaId: form.role === "operator" ? form.unitKerjaId : "",
          isActive: form.isActive,
        };
        if (form.password) updatePayload.password = form.password;
        await api.updateUser(editingUser.id, updatePayload);
        setSuccessMsg("User berhasil diperbarui.");
      } else {
        if (!form.password) {
          setError("Password wajib diisi untuk user baru.");
          setSaving(false);
          return;
        }
        await api.createUser({
          username: form.username,
          password: form.password,
          namaLengkap: form.namaLengkap,
          role: form.role,
          unitKerjaId: form.role === "operator" ? form.unitKerjaId : "",
          isActive: form.isActive,
        });
        setSuccessMsg("User baru berhasil dibuat.");
      }
      setShowModal(false);
      await loadData();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
    setSaving(false);
  };

  const handleToggleActive = async (u: User) => {
    try {
      await api.updateUser(u.id, { isActive: !u.isActive });
      await loadData();
    } catch (err) {
      console.error("Gagal mengubah status user", err);
    }
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`Yakin ingin menghapus user "${u.username}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      await api.deleteUser(u.id);
      await loadData();
    } catch (err) {
      console.error("Gagal menghapus user", err);
    }
  };

  const getOpdName = (unitKerjaId?: string) => {
    if (!unitKerjaId) return "-";
    const opd = opds.find((o) => o.id === unitKerjaId);
    return opd ? opd.nama : unitKerjaId;
  };

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Manajemen User</h1>
          <p className={styles.pageSubtitle}>Kelola akun admin dan operator per OPD</p>
        </div>
        <button id="btn-tambah-user" className="btn-primary" onClick={openCreate}>
          + Tambah User
        </button>
      </div>

      {successMsg && (
        <div className={styles.successBanner}>
          ✅ {successMsg}
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.loadSpinner} />
          <p>Memuat data user...</p>
        </div>
      ) : (
        <div className={`${styles.tableCard} glass-panel`}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Nama Lengkap</th>
                  <th>Role</th>
                  <th>OPD</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyRow}>
                      Belum ada user terdaftar.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className={styles.usernameCell}>
                          <div className={styles.userAvatar} data-role={u.role}>
                            {u.namaLengkap?.charAt(0).toUpperCase() || u.username.charAt(0).toUpperCase()}
                          </div>
                          <span>{u.username}</span>
                        </div>
                      </td>
                      <td>{u.namaLengkap || "-"}</td>
                      <td>
                        <span className={`${styles.roleBadge} ${u.role === "admin" ? styles.badgeAdmin : styles.badgeOperator}`}>
                          {u.role === "admin" ? "🛡️ Admin" : "👤 Operator OPD"}
                        </span>
                      </td>
                      <td className={styles.opdCell}>
                        {u.role === "operator" ? getOpdName(u.unitKerjaId) : <span style={{ opacity: 0.4 }}>Semua OPD</span>}
                      </td>
                      <td>
                        <button
                          className={`${styles.statusToggle} ${u.isActive ? styles.statusActive : styles.statusInactive}`}
                          onClick={() => handleToggleActive(u)}
                          title={u.isActive ? "Klik untuk nonaktifkan" : "Klik untuk aktifkan"}
                        >
                          {u.isActive ? "● Aktif" : "○ Nonaktif"}
                        </button>
                      </td>
                      <td>
                        <div className={styles.actionButtons}>
                          <button className={styles.btnEdit} onClick={() => openEdit(u)}>
                            ✏️ Edit
                          </button>
                          <button className={styles.btnDelete} onClick={() => handleDelete(u)}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editingUser ? "Edit User" : "Tambah User Baru"}</h2>
              <button className={styles.modalClose} onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form className={styles.modalForm} onSubmit={handleSubmit}>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label htmlFor="form-username">Username *</label>
                  <input
                    id="form-username"
                    className={styles.formInput}
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    disabled={!!editingUser}
                    required={!editingUser}
                    placeholder="Contoh: user.dinkes"
                  />
                  {editingUser && <span className={styles.hint}>Username tidak dapat diubah</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="form-nama">Nama Lengkap</label>
                  <input
                    id="form-nama"
                    className={styles.formInput}
                    type="text"
                    value={form.namaLengkap}
                    onChange={(e) => setForm({ ...form, namaLengkap: e.target.value })}
                    placeholder="Nama lengkap pengguna"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="form-password">
                    Password {editingUser && <span className={styles.hint}>(kosongkan jika tidak diubah)</span>}
                  </label>
                  <input
                    id="form-password"
                    className={styles.formInput}
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingUser ? "Biarkan kosong jika tidak diubah" : "Minimal 6 karakter"}
                    required={!editingUser}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="form-role">Role *</label>
                  <select
                    id="form-role"
                    className={styles.formInput}
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "operator", unitKerjaId: "" })}
                  >
                    <option value="admin">🛡️ Administrator (Semua OPD)</option>
                    <option value="operator">👤 Operator OPD (satu OPD)</option>
                  </select>
                </div>

                {form.role === "operator" && (
                  <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="form-opd">OPD / Unit Kerja *</label>
                    <select
                      id="form-opd"
                      className={styles.formInput}
                      value={form.unitKerjaId}
                      onChange={(e) => setForm({ ...form, unitKerjaId: e.target.value })}
                      required={form.role === "operator"}
                    >
                      <option value="">— Pilih OPD —</option>
                      {opds
                        .filter((o) => !o.parentId)
                        .sort((a, b) => (a.nama || "").localeCompare(b.nama || ""))
                        .map((o) => (
                          <option key={o.id} value={o.id}>{o.nama}</option>
                        ))}
                      {opds.filter((o) => o.parentId).length > 0 && (
                        <>
                          <optgroup label="── Sub Unit ──">
                            {opds
                              .filter((o) => o.parentId)
                              .sort((a, b) => (a.nama || "").localeCompare(b.nama || ""))
                              .map((o) => (
                                <option key={o.id} value={o.id}>{o.nama}</option>
                              ))}
                          </optgroup>
                        </>
                      )}
                    </select>
                  </div>
                )}

                <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
                  <label className={styles.checkboxLabel}>
                    <input
                      id="form-active"
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    />
                    <span>Akun Aktif (dapat login)</span>
                  </label>
                </div>
              </div>

              {error && (
                <div className={styles.formError}>
                  ⚠️ {error}
                </div>
              )}

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)}>
                  Batal
                </button>
                <button id="btn-simpan-user" type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Menyimpan..." : editingUser ? "Simpan Perubahan" : "Buat User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
