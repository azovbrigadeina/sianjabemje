"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import styles from "../opd/page.module.css"; // Reuse card/panel styles
import formStyles from "../analisis/page.module.css";

export default function PengaturanAIPage() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [customModel, setCustomModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await api.getAiConfig();
        if (config) {
          setApiKey(config.geminiApiKey || "");
          const modelVal = config.geminiModel || "gemini-2.5-flash";
          
          if (["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash"].includes(modelVal)) {
            setModel(modelVal);
            setCustomModel("");
          } else {
            setModel("custom");
            setCustomModel(modelVal);
          }
        }
      } catch (err) {
        console.error("Gagal memuat konfigurasi AI:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const finalModel = model === "custom" ? customModel.trim() : model;
    if (model === "custom" && !finalModel) {
      alert("Harap masukkan nama model kustom Anda.");
      setSaving(false);
      return;
    }

    try {
      await api.saveAiConfig({
        geminiApiKey: apiKey.trim(),
        geminiModel: finalModel
      });
      showToast("✅ Pengaturan AI berhasil disimpan!");
    } catch (err: any) {
      alert("Gagal menyimpan pengaturan: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Pengaturan Model AI</h1>
          <p className={styles.subtitle}>
            Konfigurasi Kunci API dan Model Generatif Google Gemini untuk Draf Anjab Otomatis.
          </p>
        </div>
      </div>

      <div className={`${styles.card} glass-panel`} style={{ padding: "2.5rem", maxWidth: "680px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem", opacity: 0.5 }}>
            <span>Memuat konfigurasi...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            {/* Info Box */}
            <div style={{
              background: "linear-gradient(135deg, hsla(270, 76%, 50%, 0.08) 0%, hsla(200, 80%, 50%, 0.08) 100%)",
              border: "1px solid hsla(260, 60%, 50%, 0.2)",
              padding: "1.25rem",
              borderRadius: "12px",
              fontSize: "0.875rem",
              lineHeight: "1.5",
              color: "var(--foreground)"
            }}>
              💡 <strong>Informasi Akun Google Pro:</strong><br />
              Jika Anda memiliki akun Google Pro atau Google Cloud, Anda dapat membuat <strong>Gemini API Key</strong> secara gratis di <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7", fontWeight: 600, textDecoration: "underline" }}>Google AI Studio</a>. Model <strong>Gemini 1.5 Pro</strong> sangat direkomendasikan untuk menyusun draf Anjab dengan kedalaman materi yang maksimal.
            </div>

            {/* API Key Input */}
            <div className={formStyles.formGroup}>
              <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                Gemini API Key
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="Masukkan AI Studio / Google Cloud API Key (Kosongkan untuk menggunakan bawaan)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    paddingRight: "50px",
                    borderRadius: "10px",
                    border: "1px solid var(--glass-border)",
                    background: "var(--glass-bg)",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                    outline: "none"
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "1.1rem",
                    color: "var(--foreground)",
                    opacity: 0.6
                  }}
                  title={showKey ? "Sembunyikan Kunci" : "Tampilkan Kunci"}
                >
                  {showKey ? "👁️" : "🙈"}
                </button>
              </div>
              <span style={{ fontSize: "0.75rem", opacity: 0.5, marginTop: "0.35rem", display: "block" }}>
                Kunci ini disimpan dengan aman di database Firebase Anda dan diproses secara langsung oleh server Google Apps Script.
              </span>
            </div>

            {/* Model Select */}
            <div className={formStyles.formGroup}>
              <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                Pilih Model Gemini AI
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid var(--glass-border)",
                  background: "var(--glass-bg)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  outline: "none",
                  cursor: "pointer"
                }}
              >
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Cepat & Standar)</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Cerdas, Detail & Rekomendasi Pro)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Model Generasi Baru)</option>
                <option value="custom">Kustom / Masukkan Model Sendiri (misal: gemini-2.5-pro, dll.)</option>
              </select>
            </div>

            {/* Custom Model Input */}
            {model === "custom" && (
              <div className={formStyles.formGroup} style={{ animation: "slideDown 0.2s ease" }}>
                <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                  Nama Model Kustom
                </label>
                <input
                  type="text"
                  placeholder="Contoh: gemini-2.5-pro atau model masa depan lainnya"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: "10px",
                    border: "1px solid var(--glass-border)",
                    background: "var(--glass-bg)",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                    outline: "none"
                  }}
                  required
                />
              </div>
            )}

            <hr style={{ border: "none", borderTop: "1px solid var(--glass-border)", margin: "1rem 0" }} />

            <button
              type="submit"
              disabled={saving}
              style={{
                background: "linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)",
                color: "white",
                padding: "14px 28px",
                border: "none",
                borderRadius: "12px",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: "pointer",
                transition: "all 0.2s",
                alignSelf: "flex-end",
                boxShadow: "0 4px 14px rgba(168, 85, 247, 0.3)"
              }}
            >
              {saving ? "Menyimpan..." : "💾 Simpan Konfigurasi"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
