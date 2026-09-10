# Edit Referensi Jabatan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to edit existing Referensi Jabatan names and categories directly from the table on `/dashboard/referensi`.

**Architecture:** Add state variables for edit modal in `src/app/dashboard/referensi/page.tsx`. Add "✏️ Edit" button in the table actions column. Render a modal dialog when editing an item. On save, call `api.updateEntity('referensiJabatan', id, updatedData)` which updates GAS/Firebase and invalidates cache.

**Tech Stack:** Next.js (React Client Component), CSS Modules (`page.module.css`), TypeScript, Custom API client (`api.ts`).

## Global Constraints

- Must maintain existing responsive styling and glassmorphism UI theme.
- Must call `api.updateEntity` to perform write operations (ensures cache invalidation).
- No new third-party libraries.

---

### Task 1: Add Modal State, Table Edit Button, and Edit Modal UI

**Files:**
- Modify: `src/app/dashboard/referensi/page.tsx`
- Modify: `src/app/dashboard/referensi/page.module.css`

**Interfaces:**
- Consumes: `api.updateEntity('referensiJabatan', id, data)` from `src/lib/api.ts`
- Produces: Updated Referensi Jabatan in database and UI state

- [ ] **Step 1: Add edit state and handlers in `page.tsx`**

In `src/app/dashboard/referensi/page.tsx`:
Add state variables:
```typescript
const [editingItem, setEditingItem] = useState<ReferensiJabatan | null>(null);
const [editNamaBase, setEditNamaBase] = useState("");
const [editKategori, setEditKategori] = useState<'Keahlian' | 'Keterampilan'>('Keahlian');
const [isSavingEdit, setIsSavingEdit] = useState(false);
```

Add handlers:
```typescript
const handleOpenEdit = (item: ReferensiJabatan) => {
  setEditingItem(item);
  setEditNamaBase(item.namaBase || "");
  setEditKategori((item.kategori as 'Keahlian' | 'Keterampilan') || 'Keahlian');
};

const handleSaveEdit = async () => {
  if (!editingItem || !editingItem.id) return;
  if (!editNamaBase.trim()) {
    setMessage({ type: 'error', text: 'Nama jabatan tidak boleh kosong.' });
    return;
  }

  setIsSavingEdit(true);
  try {
    const updatedData: ReferensiJabatan = {
      ...editingItem,
      namaBase: editNamaBase.trim(),
      kategori: editingItem.jenisJabatan === 'Fungsional' ? editKategori : undefined
    };

    await api.updateEntity('referensiJabatan', editingItem.id, updatedData);
    setSavedData(prev => prev.map(item => item.id === editingItem.id ? { ...item, ...updatedData } : item));
    setMessage({ type: 'success', text: 'Data referensi berhasil diperbarui.' });
    setEditingItem(null);
  } catch (err: any) {
    setMessage({ type: 'error', text: err.message || 'Gagal memperbarui referensi.' });
  } finally {
    setIsSavingEdit(false);
  }
};
```

- [ ] **Step 2: Add Edit button in table and render Modal UI in `page.tsx`**

In table action cell:
```tsx
<div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
  <button 
    onClick={() => handleOpenEdit(item)}
    style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}
    title="Edit Nama/Kategori"
  >
    ✏️ Edit
  </button>
  <button 
    onClick={() => item.id && handleDelete(item.id)}
    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem', borderRadius: '4px' }}
    title="Hapus"
  >
    🗑️ Hapus
  </button>
</div>
```

Render modal at the end of the return statement in `page.tsx`:
```tsx
{editingItem && (
  <div className={styles.modalOverlay}>
    <div className={styles.modalContent}>
      <h2>Edit Referensi Jabatan</h2>
      <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
        <label>Nama Jabatan</label>
        <input 
          type="text"
          className={styles.textarea}
          style={{ height: '42px', resize: 'none' }}
          value={editNamaBase}
          onChange={(e) => setEditNamaBase(e.target.value)}
        />
      </div>

      {editingItem.jenisJabatan === 'Fungsional' && (
        <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
          <label>Kategori Jenjang Fungsional</label>
          <select 
            className={styles.textarea}
            style={{ height: '42px' }}
            value={editKategori}
            onChange={(e) => setEditKategori(e.target.value as 'Keahlian' | 'Keterampilan')}
          >
            <option value="Keahlian">Keahlian (Ahli Pertama, Muda, Madya, Utama)</option>
            <option value="Keterampilan">Keterampilan (Pemula, Terampil, Mahir, Penyelia)</option>
          </select>
        </div>
      )}

      <div className={styles.buttonGroup} style={{ marginTop: '1.5rem', justifyContent: 'flex-end', display: 'flex', gap: '0.5rem' }}>
        <button 
          className={styles.btnSecondary} 
          onClick={() => setEditingItem(null)}
          disabled={isSavingEdit}
        >
          Batal
        </button>
        <button 
          className={styles.btnPrimary} 
          onClick={handleSaveEdit}
          disabled={isSavingEdit}
        >
          {isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add CSS modal styles in `page.module.css`**

In `src/app/dashboard/referensi/page.module.css`:
```css
.modalOverlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 1rem;
}

.modalContent {
  background: rgba(30, 41, 59, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  color: #f8fafc;
}
```

---

### Task 2: Build & Verification

- [ ] **Step 1: Test Next.js build**

Run: `npm run build`
Expected: Successful build with 0 errors.
