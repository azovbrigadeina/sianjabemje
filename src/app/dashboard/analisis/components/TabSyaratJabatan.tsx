"use client";

import { useState, useEffect } from "react";
import type { JabatanFull, SyaratJabatan, KondisiFisik } from "@/lib/types";
import { BAKAT_KERJA, TEMPERAMEN_KERJA, MINAT_KERJA, UPAYA_FISIK } from "@/lib/types";
import styles from "../page.module.css";

interface Props {
  jabatan: JabatanFull | null;
  onSaveSyarat: (data: Partial<SyaratJabatan>) => void;
  onSavePrestasi: (uraian: string) => void;
  loading?: boolean;
}

function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { kode: string; nama: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const toggle = (kode: string) => {
    if (selected.includes(kode)) {
      onChange(selected.filter((s) => s !== kode));
    } else {
      onChange([...selected, kode]);
    }
  };

  return (
    <div className={styles.formGroup}>
      <label>{label}</label>
      <div className={styles.checkboxGrid}>
        {options.map((opt) => (
          <label key={opt.kode} className={styles.checkboxItem}>
            <input
              type="checkbox"
              checked={selected.includes(opt.kode)}
              onChange={() => toggle(opt.kode)}
            />
            <span className={styles.checkboxLabel}>
              <strong>{opt.kode}</strong> — {opt.nama}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TagCheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((s) => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <div className={styles.formGroup}>
      <label>{label}</label>
      <div className={styles.tagGrid}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`${styles.tagBtn} ${selected.includes(opt) ? styles.tagActive : ""}`}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TabSyaratJabatan({
  jabatan,
  onSaveSyarat,
  onSavePrestasi,
  loading,
}: Props) {
  const [keterampilanKerja, setKeterampilanKerja] = useState("");
  const [bakatKerja, setBakatKerja] = useState<string[]>([]);
  const [temperamenKerja, setTemperamenKerja] = useState<string[]>([]);
  const [minatKerja, setMinatKerja] = useState<string[]>([]);
  const [upayaFisik, setUpayaFisik] = useState<string[]>([]);
  const [kondisiFisik, setKondisiFisik] = useState<KondisiFisik>({
    jenisKelamin: "",
    umur: "",
    tinggiBadan: "",
    beratBadan: "",
    posturBadan: "",
    penampilan: "",
  });
  const [fungsiPekerjaan, setFungsiPekerjaan] = useState("");
  const [prestasiKerja, setPrestasiKerja] = useState("");

  useEffect(() => {
    if (jabatan) {
      const defaultKeterampilan = "Mengoperasikan komputer, Berkomunikasi efektif, Menyusun laporan";
      const defaultBakat = ["G", "N", "V", "Q", "F"];
      const defaultTemperamen = ["D", "I", "F"];
      const defaultMinat = ["3a", "4a", "5a", "2b", "3b", "4b", "5b"];
      const defaultUpaya = ["Berdiri", "Berjalan", "Duduk", "Mengangkat", "Melihat"];
      const defaultFungsi = "D2, O6, B7";
      const defaultPrestasi = "Dapat memberikan kinerja yang baik untuk mendukung kelancaran pelaksanaan tugas pokok dan fungsi jabatan.";

      const sy = jabatan.syaratJabatan;
      if (sy) {
        setKeterampilanKerja(sy.keterampilanKerja && sy.keterampilanKerja.length > 0 ? sy.keterampilanKerja.join(", ") : defaultKeterampilan);
        setBakatKerja(sy.bakatKerja && sy.bakatKerja.length > 0 ? sy.bakatKerja : defaultBakat);
        setTemperamenKerja(sy.temperamenKerja && sy.temperamenKerja.length > 0 ? sy.temperamenKerja : defaultTemperamen);
        setMinatKerja(sy.minatKerja && sy.minatKerja.length > 0 ? sy.minatKerja : defaultMinat);
        setUpayaFisik(sy.upayaFisik && sy.upayaFisik.length > 0 ? sy.upayaFisik : defaultUpaya);
        setKondisiFisik(sy.kondisiFisik || kondisiFisik);
        setFungsiPekerjaan(sy.fungsiPekerjaan && sy.fungsiPekerjaan.length > 0 ? sy.fungsiPekerjaan.join(", ") : defaultFungsi);
      } else {
        setKeterampilanKerja(defaultKeterampilan);
        setBakatKerja(defaultBakat);
        setTemperamenKerja(defaultTemperamen);
        setMinatKerja(defaultMinat);
        setUpayaFisik(defaultUpaya);
        setFungsiPekerjaan(defaultFungsi);
      }
      setPrestasiKerja(jabatan.prestasiKerja?.uraian || defaultPrestasi);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jabatan]);

  const handleSaveAll = () => {
    onSaveSyarat({
      keterampilanKerja: keterampilanKerja.split(",").map((s) => s.trim()).filter(Boolean),
      bakatKerja,
      temperamenKerja,
      minatKerja,
      upayaFisik,
      kondisiFisik,
      fungsiPekerjaan: fungsiPekerjaan.split(",").map((s) => s.trim()).filter(Boolean),
    });
    onSavePrestasi(prestasiKerja);
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className={styles.sectionTitle}>📌 15. Syarat Jabatan</div>

      {/* 15a - Keterampilan Kerja */}
      <div className={styles.formGroup}>
        <label>a. Keterampilan Kerja <span style={{ opacity: 0.5, fontSize: "0.8rem" }}>(pisahkan dengan koma)</span></label>
        <input
          type="text"
          className={styles.formInput}
          value={keterampilanKerja}
          onChange={(e) => setKeterampilanKerja(e.target.value)}
          placeholder="Manajemen, Komunikasi, Analisis Data"
        />
      </div>

      {/* 15b - Bakat Kerja */}
      <CheckboxGroup
        label="b. Bakat Kerja"
        options={BAKAT_KERJA}
        selected={bakatKerja}
        onChange={setBakatKerja}
      />

      {/* 15c - Temperamen Kerja */}
      <CheckboxGroup
        label="c. Temperamen Kerja"
        options={TEMPERAMEN_KERJA}
        selected={temperamenKerja}
        onChange={setTemperamenKerja}
      />

      {/* 15d - Minat Kerja */}
      <CheckboxGroup
        label="d. Minat Kerja"
        options={MINAT_KERJA}
        selected={minatKerja}
        onChange={setMinatKerja}
      />

      {/* 15e - Upaya Fisik */}
      <TagCheckboxGroup
        label="e. Upaya Fisik"
        options={UPAYA_FISIK}
        selected={upayaFisik}
        onChange={setUpayaFisik}
      />

      {/* 15f - Kondisi Fisik */}
      <div className={styles.formGroup}>
        <label>f. Kondisi Fisik</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
          {([
            ["jenisKelamin", "1) Jenis Kelamin"],
            ["umur", "2) Umur"],
            ["tinggiBadan", "3) Tinggi Badan"],
            ["beratBadan", "4) Berat Badan"],
            ["posturBadan", "5) Postur Badan"],
            ["penampilan", "6) Penampilan"],
          ] as [keyof KondisiFisik, string][]).map(([key, lbl]) => (
            <div key={key} className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.8rem" }}>{lbl}</label>
              <input
                type="text"
                className={styles.formInput}
                value={kondisiFisik[key]}
                onChange={(e) => setKondisiFisik({ ...kondisiFisik, [key]: e.target.value })}
                placeholder="Tidak dipersyaratkan"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 15g - Fungsi Pekerjaan */}
      <div className={styles.formGroup}>
        <label>g. Fungsi Pekerjaan <span style={{ opacity: 0.5, fontSize: "0.8rem" }}>(pisahkan dengan koma)</span></label>
        <input
          type="text"
          className={styles.formInput}
          value={fungsiPekerjaan}
          onChange={(e) => setFungsiPekerjaan(e.target.value)}
          placeholder="D0, D1, D2, O0, O1"
        />
      </div>

      {/* 16 - Prestasi Kerja */}
      <div>
        <div className={styles.sectionTitle}>🏆 16. Prestasi Kerja Yang Diharapkan</div>
        <div className={styles.formGroup}>
          <textarea
            className={styles.formInput}
            value={prestasiKerja}
            onChange={(e) => setPrestasiKerja(e.target.value)}
            placeholder="Uraian prestasi kerja yang diharapkan..."
            rows={3}
          />
        </div>
      </div>

      <button className={styles.btnSave} onClick={handleSaveAll} disabled={loading}>
        {loading ? "Menyimpan..." : "💾 Simpan Syarat & Prestasi"}
      </button>
    </div>
  );
}
