# Drag-and-Drop Organization Reordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a drag-and-drop reordering toggle switch to `/dashboard/organisasi` and `/operator/organisasi` that allows users to reorder positions (`jabatan`) or unit offices (`unitKerja`) among siblings in real-time and persist the new `urutan` values to the backend.

**Architecture:** Integrate HTML5 Drag and Drop event handlers (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) into `TreeNode` rendering. On drop, update React state (`treeData`) immediately and trigger `api.saveMultiEntity()` to persist `urutan` numbers (1, 2, 3...) to Google Apps Script backend.

**Tech Stack:** Next.js 16 (React 19), CSS Modules, Firebase Realtime Database (via GAS backend).

## Global Constraints
- Enforce strict static export compatibility (No Node.js server APIs).
- Maintain serial write queue in `src/lib/api.ts`.
- Follow `RULE[AGENTS.md]` for GAS deployment (`-i AKfycbxbuHWzaPOMyEemDcUsYCboqWkE5g1Lq-FFKwA5eNyBbamd41686X1a2m7OIFI-h-yLWw`).

---

### Task 1: Add Reorder Switch & Styling
**Files:**
- Modify: `src/app/dashboard/organisasi/page.module.css`
- Modify: `src/app/dashboard/organisasi/page.tsx`
- Modify: `src/app/operator/organisasi/page.tsx`

**Interfaces:**
- Produces: `isReorderMode: boolean` state and CSS classes `.reorderSwitch`, `.reorderActive`, `.dragHandle`, `.draggingNode`.

- [ ] **Step 1: Add CSS styles for drag handle and active state**

```css
.reorderSwitch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 8px 14px;
  background: var(--surface-card, #ffffff);
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
}
.reorderSwitchActive {
  background: #f0f9ff;
  border-color: #0284c7;
  color: #0369a1;
}
.dragHandle {
  cursor: grab;
  margin-right: 8px;
  opacity: 0.7;
  font-weight: bold;
}
.dragHandle:hover {
  opacity: 1;
}
.draggableRow {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.dragOverTarget {
  border-top: 2px solid #0284c7 !important;
  background-color: #f0f9ff !important;
}
```

- [ ] **Step 2: Add switch toggle state and UI button in `src/app/dashboard/organisasi/page.tsx`**

```tsx
const [isReorderMode, setIsReorderMode] = useState(false);

// In toolbar:
<button 
  type="button" 
  className={`${styles.reorderSwitch} ${isReorderMode ? styles.reorderSwitchActive : ''}`}
  onClick={() => setIsReorderMode(prev => !prev)}
>
  ⇄ Mode Atur Urutan {isReorderMode ? '(Aktif)' : ''}
</button>
```

- [ ] **Step 3: Add switch toggle state and UI button in `src/app/operator/organisasi/page.tsx`**

```tsx
const [isReorderMode, setIsReorderMode] = useState(false);

// In toolbar:
{orgEditEnabled && (
  <button 
    type="button" 
    className={`${styles.reorderSwitch} ${isReorderMode ? styles.reorderSwitchActive : ''}`}
    onClick={() => setIsReorderMode(prev => !prev)}
  >
    ⇄ Mode Atur Urutan {isReorderMode ? '(Aktif)' : ''}
  </button>
)}
```

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/app/dashboard/organisasi/page.module.css src/app/dashboard/organisasi/page.tsx src/app/operator/organisasi/page.tsx
git commit -m "feat(organisasi): add reorder mode toggle switch UI"
```

---

### Task 2: Implement Drag-and-Drop Event Handlers & Persistence Logic
**Files:**
- Modify: `src/app/dashboard/organisasi/page.tsx`
- Modify: `src/app/operator/organisasi/page.tsx`

**Interfaces:**
- Consumes: `isReorderMode`, `treeData`
- Produces: `handleDragStart`, `handleDragOver`, `handleDrop` reordering sibling nodes & calling `api.saveMultiEntity('jabatan', ...)`

- [ ] **Step 1: Implement reorder helper function in `src/app/dashboard/organisasi/page.tsx`**

```tsx
const [draggedNode, setDraggedNode] = useState<TreeNode | null>(null);
const [dragOverId, setDragOverId] = useState<string | null>(null);

const handleDragStart = (e: React.DragEvent, node: TreeNode) => {
  if (!isReorderMode) return;
  setDraggedNode(node);
  e.dataTransfer.setData('text/plain', node.id);
  e.dataTransfer.effectAllowed = 'move';
};

const handleDragOver = (e: React.DragEvent, targetNode: TreeNode) => {
  if (!isReorderMode || !draggedNode) return;
  // Restrict to same parent
  if (draggedNode.parentId === targetNode.parentId && draggedNode.id !== targetNode.id) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(targetNode.id);
  }
};

const handleDrop = async (e: React.DragEvent, targetNode: TreeNode) => {
  e.preventDefault();
  setDragOverId(null);
  if (!isReorderMode || !draggedNode) return;
  if (draggedNode.parentId !== targetNode.parentId || draggedNode.id === targetNode.id) return;

  // Reorder siblings locally
  const reorderSiblings = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.map(n => {
      if (n.children && n.children.length > 0) {
        // Check if children contain target and dragged nodes
        const hasDragged = n.children.some(c => c.id === draggedNode.id);
        const hasTarget = n.children.some(c => c.id === targetNode.id);
        if (hasDragged && hasTarget) {
          const newChildren = [...n.children];
          const draggedIdx = newChildren.findIndex(c => c.id === draggedNode.id);
          const targetIdx = newChildren.findIndex(c => c.id === targetNode.id);
          const [movedItem] = newChildren.splice(draggedIdx, 1);
          newChildren.splice(targetIdx, 0, movedItem);
          
          // Re-assign urutan (1, 2, 3...)
          return {
            ...n,
            children: newChildren.map((child, idx) => ({ ...child, urutan: idx + 1 }))
          };
        }
        return { ...n, children: reorderSiblings(n.children) };
      }
      return n;
    });
  };

  const updatedTree = reorderSiblings(treeData);
  setTreeData(updatedTree);
  showToast(`✅ Urutan ${draggedNode.label} berhasil diperbarui`);

  // Persist to backend
  const parentId = targetNode.parentId || targetNode.unitKerjaId;
  if (parentId) {
    const parentNode = findNodeById(updatedTree, parentId);
    if (parentNode && parentNode.children) {
      const payload = parentNode.children.map((c, idx) => ({
        id: c.id,
        nama: c.label,
        namaJabatan: c.label,
        urutan: idx + 1
      }));
      try {
        await api.saveMultiEntity(targetNode.type === 'OPD' ? 'unitKerja' : 'jabatan', parentId, payload);
      } catch (err) {
        console.error("Gagal menyimpan urutan:", err);
      }
    }
  }
  setDraggedNode(null);
};
```

- [ ] **Step 2: Attach drag attributes & handle icon to tree node rows**

```tsx
<div 
  className={`${treeStyles.treeNodeContent} ${dragOverId === node.id ? styles.dragOverTarget : ''}`}
  draggable={isReorderMode}
  onDragStart={(e) => handleDragStart(e, node)}
  onDragOver={(e) => handleDragOver(e, node)}
  onDrop={(e) => handleDrop(e, node)}
>
  {isReorderMode && <span className={styles.dragHandle} title="Geser urutan">⋮⋮</span>}
  ...
</div>
```

- [ ] **Step 3: Port drag handlers to `src/app/operator/organisasi/page.tsx`**

- [ ] **Step 4: Verify typecheck & static build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/organisasi/page.tsx src/app/operator/organisasi/page.tsx
git commit -m "feat(organisasi): implement drag and drop reordering logic and persistence"
```
