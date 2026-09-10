# Design Specification: Drag-and-Drop Reordering for Organization Structure

> **Date:** September 10, 2026  
> **Target Modules:** `/dashboard/organisasi`, `/operator/organisasi`  
> **Status:** Approved by User  

---

## 1. Overview & Purpose
Provides an intuitive drag-and-drop mechanism for reordering positions (`jabatan`) and unit offices (`unitKerja`) within the organization structure tree. Instead of opening an edit modal to manually type a number in the `urutan` field, users can activate a "Mode Atur Urutan" toggle switch and drag rows up or down within the same parent node.

---

## 2. Requirements & Behavior

### 2.1 Mode Switch Toggle
- Added a switch button `⇄ Mode Atur Urutan` to the top toolbar in both `/dashboard/organisasi` and `/operator/organisasi`.
- When switch is **OFF** (Default):
  - Normal tree view behavior.
  - Add (+), Edit (✎), and Delete (🗑) action buttons are active.
  - Rows are not draggable.
- When switch is **ON**:
  - Drag handle icon (`⋮⋮`) appears on the left of each tree node content row.
  - Cursor changes to `grab` on hover and `grabbing` on drag.
  - Action buttons are dimmed or hidden to prevent accidental clicks while dragging.

### 2.2 Sibling-Constrained Drag & Drop Rules
- Reordering is strictly constrained to **siblings sharing the same `parentId` or `unitKerjaId`**.
- Example: Under "Sekretariat Dinas", dragging "Kepala Sub Bagian Umum" above "Perencana Ahli Muda" will swap/reorder items under "Sekretariat Dinas" without changing their parent assignment.
- Dragging an item across different parent containers is ignored/blocked to preserve valid organizational hierarchy.

### 2.3 Order Calculation & Batch Persistence
- On `drop`:
  1. Local React state (`treeData`) is updated immediately for instant UI feedback (0ms latency).
  2. The sequence `urutan` values (`1, 2, 3, ...`) for all affected sibling nodes under that parent are recalculated.
  3. A serial write request (`api.saveMultiEntity('jabatan' | 'unitKerja', parentId, updatedSiblings)`) is sent to the backend.
  4. A lightweight toast notification displays: `"✅ Urutan [Nama Node] berhasil diperbarui"`.

---

## 3. Component Architecture & Data Flow

```
[OrganisasiPage (dashboard/operator)]
       │
       ├── State: [isReorderMode, setIsReorderMode]
       ├── State: [treeData, setTreeData]
       ├── State: [draggedNodeId, setDraggedNodeId]
       │
       └── Render Node Row (drag handlers):
              ├── draggable={isReorderMode}
              ├── onDragStart: captures dragged node ID & parentId
              ├── onDragOver: prevents default if target node shares same parentId
              ├── onDrop: reorders siblings in treeData, recalculates urutan, calls API
```

---

## 4. Verification Plan
- **Type Check**: Run `npx tsc --noEmit` to ensure type safety.
- **Build Check**: Run `npm run build` to confirm static pages compile cleanly.
- **Manual Verification**:
  1. Navigate to `/dashboard/organisasi` & `/operator/organisasi`.
  2. Toggle `⇄ Mode Atur Urutan`.
  3. Drag a sub-section/position above its sibling item.
  4. Verify the order swaps instantly in the tree view.
  5. Refresh page to confirm `urutan` values persisted in database.
