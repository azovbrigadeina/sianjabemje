# Design Spec: Edit Referensi Jabatan

**Tanggal**: 2026-08-27  
**Fitur**: Edit Nama & Kategori Referensi Jabatan  
**Halaman**: `/dashboard/referensi` ([`src/app/dashboard/referensi/page.tsx`](file:///home/falcon/Documents/Proyek%20Sianjab/src/app/dashboard/referensi/page.tsx))

---

## 1. Ringkasan
Menambahkan kemampuan bagi pengelola/user untuk merubah (`edit`) nama referensi (`namaBase`) dan kategori jenjang (`kategori`) dari item **Referensi Jabatan** yang sudah tersimpan di database.

---

## 2. Alur Penggunaan (User Experience)
1. User membuka menu **Referensi Jabatan** (`/dashboard/referensi`).
2. Di tabel **Daftar Referensi [Pelaksana / Fungsional] Tersimpan**, kolom **Aksi** sekarang menampilkan dua tombol:
   - ✏️ **Edit**
   - 🗑️ **Hapus**
3. Ketika tombol ✏️ **Edit** diklik:
   - Sebuah modal dialog ("Edit Referensi Jabatan") akan muncul.
   - Form di dalam modal terisi otomatis dengan data nama jabatan saat ini.
   - Untuk **Jabatan Pelaksana**: Form menyediakan field input teks `Nama Jabatan`.
   - Untuk **Jabatan Fungsional**: Form menyediakan field input teks `Nama Jabatan Dasar` serta pilihan `Kategori Jenjang` (`Keahlian` / `Keterampilan`).
4. User mengubah data sesuai kebutuhan dan menekan tombol **Simpan Perubahan**.
5. Aplikasi mengirimkan permintaan update ke backend melalui `api.updateEntity('referensiJabatan', id, updatedData)`.
6. Setelah update berhasil:
   - Cache otomatis di-invalidate oleh API client (`api.ts` & GAS).
   - Modal tertutup.
   - Pesan sukses ditampilkan.
   - Data tabel diperbarui secara otomatis.

---

## 3. Detail Perubahan Kode

### Component State (`src/app/dashboard/referensi/page.tsx`)
- `editingItem`: `ReferensiJabatan | null` — Menyimpan data item yang sedang diedit.
- `editNamaBase`: `string` — Input terkontrol untuk nama jabatan dasar.
- `editKategori`: `'Keahlian' | 'Keterampilan' | ''` — Pilihan kategori jenjang (untuk Jabatan Fungsional).
- `isSavingEdit`: `boolean` — Loading state saat proses simpan.

### Modal Layout & Styling (`page.module.css` / `glass-panel`)
- Menggunakan overlay modal transparan dengan styling glassmorphism.
- Form mencakup input text dan select box / radio button untuk kategori jika jenis jabatannya `Fungsional`.

### API Calls
```typescript
await api.updateEntity('referensiJabatan', editingItem.id, {
  ...editingItem,
  namaBase: editNamaBase.trim(),
  kategori: editingItem.jenisJabatan === 'Fungsional' ? editKategori : undefined
});
```

---

## 4. Rencana Verifikasi
1. **Manual Testing**:
   - Buka `/dashboard/referensi` di browser.
   - Klik tombol **Edit** pada salah satu item Jabatan Pelaksana, ubah nama, lalu simpan. Verifikasi data di tabel berubah.
   - Klik tombol **Edit** pada salah satu item Jabatan Fungsional, ubah nama & kategori, lalu simpan. Verifikasi data di tabel berubah.
   - Verifikasi pengujian tidak memecah dropdown referensi di menu Organisasi (`/dashboard/organisasi`).
2. **Build Verification**:
   - Jalankan `npm run build` untuk memastikan tidak ada error TypeScript/Next.js.
