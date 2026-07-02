"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import styles from "../opd/page.module.css"; // Reuse card/panel styles
import formStyles from "../analisis/page.module.css";

export default function PengaturanAIPage() {
  const [activeProvider, setActiveProvider] = useState("gemini");
  
  // API Keys
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [openaiCompatibleApiKey, setOpenaiCompatibleApiKey] = useState("");

  // Selected Model (dropdown value)
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [groqModel, setGroqModel] = useState("llama-3.3-70b-versatile");
  const [openrouterModel, setOpenrouterModel] = useState("google/gemini-2.5-flash");

  // Custom Base URL & Model for OpenAI Compatible
  const [openaiCompatibleBaseUrl, setOpenaiCompatibleBaseUrl] = useState("https://api.openai.com/v1");
  const [openaiCompatibleModel, setOpenaiCompatibleModel] = useState("gpt-4o-mini");

  // Custom Model inputs
  const [geminiCustomModel, setGeminiCustomModel] = useState("");
  const [openaiCustomModel, setOpenaiCustomModel] = useState("");
  const [deepseekCustomModel, setDeepseekCustomModel] = useState("");
  const [groqCustomModel, setGroqCustomModel] = useState("");
  const [openrouterCustomModel, setOpenrouterCustomModel] = useState("");
  const [customPromptTemplate, setCustomPromptTemplate] = useState("");

  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    type: "success" | "error" | "warning" | null;
    message: string;
    models?: { name: string; displayName: string }[];
  }>({
    type: null,
    message: ""
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await api.getAiConfig();
        if (config) {
          setActiveProvider(config.activeProvider || "gemini");

          // API Keys
          setGeminiApiKey(config.geminiApiKey || "");
          setOpenaiApiKey(config.openaiApiKey || "");
          setDeepseekApiKey(config.deepseekApiKey || "");
          setGroqApiKey(config.groqApiKey || "");
          setOpenrouterApiKey(config.openrouterApiKey || "");
          setOpenaiCompatibleApiKey(config.openaiCompatibleApiKey || "");

          // Custom OpenAI Compatible settings
          setOpenaiCompatibleBaseUrl(config.openaiCompatibleBaseUrl || "https://api.openai.com/v1");
          setOpenaiCompatibleModel(config.openaiCompatibleModel || "gpt-4o-mini");

          // Models mapping
          const geminiVal = config.geminiModel || "gemini-2.5-flash";
          if (["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash"].includes(geminiVal)) {
            setGeminiModel(geminiVal);
            setGeminiCustomModel("");
          } else {
            setGeminiModel("custom");
            setGeminiCustomModel(geminiVal);
          }

          const openaiVal = config.openaiModel || "gpt-4o-mini";
          if (["gpt-4o-mini", "gpt-4o"].includes(openaiVal)) {
            setOpenaiModel(openaiVal);
            setOpenaiCustomModel("");
          } else {
            setOpenaiModel("custom");
            setOpenaiCustomModel(openaiVal);
          }

          const deepseekVal = config.deepseekModel || "deepseek-chat";
          if (["deepseek-chat", "deepseek-reasoner"].includes(deepseekVal)) {
            setDeepseekModel(deepseekVal);
            setDeepseekCustomModel("");
          } else {
            setDeepseekModel("custom");
            setDeepseekCustomModel(deepseekVal);
          }

          const groqVal = config.groqModel || "llama-3.3-70b-versatile";
          if (["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "deepseek-r1-distill-llama-70b"].includes(groqVal)) {
            setGroqModel(groqVal);
            setGroqCustomModel("");
          } else {
            setGroqModel("custom");
            setGroqCustomModel(groqVal);
          }

          const openrouterVal = config.openrouterModel || "google/gemini-2.5-flash";
          if (["google/gemini-2.5-flash", "google/gemini-2.5-pro", "deepseek/deepseek-chat", "openai/gpt-4o-mini"].includes(openrouterVal)) {
            setOpenrouterModel(openrouterVal);
            setOpenrouterCustomModel("");
            } else {
              setOpenrouterModel("custom");
              setOpenrouterCustomModel(openrouterVal);
            }

            setCustomPromptTemplate(config.customPromptTemplate || "");
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

  const getActiveApiKey = () => {
    if (activeProvider === "gemini") return geminiApiKey;
    if (activeProvider === "openai") return openaiApiKey;
    if (activeProvider === "deepseek") return deepseekApiKey;
    if (activeProvider === "groq") return groqApiKey;
    if (activeProvider === "openrouter") return openrouterApiKey;
    return openaiCompatibleApiKey;
  };

  const handleTestConnection = async () => {
    const key = getActiveApiKey();
    if (!key.trim()) {
      alert("Harap masukkan API Key terlebih dahulu.");
      return;
    }
    setTesting(true);
    setTestStatus({ type: null, message: "" });
    try {
      const res = await api.testAiConnection({
        activeProvider,
        geminiApiKey: geminiApiKey.trim(),
        openaiApiKey: openaiApiKey.trim(),
        deepseekApiKey: deepseekApiKey.trim(),
        groqApiKey: groqApiKey.trim(),
        openrouterApiKey: openrouterApiKey.trim(),
        openaiCompatibleApiKey: openaiCompatibleApiKey.trim(),
        openaiCompatibleBaseUrl: openaiCompatibleBaseUrl.trim(),
        openaiCompatibleModel: openaiCompatibleModel.trim(),
        geminiModel: geminiModel === "custom" ? geminiCustomModel.trim() : geminiModel,
        openaiModel: openaiModel === "custom" ? openaiCustomModel.trim() : openaiModel,
        deepseekModel: deepseekModel === "custom" ? deepseekCustomModel.trim() : deepseekModel,
        groqModel: groqModel === "custom" ? groqCustomModel.trim() : groqModel,
        openrouterModel: openrouterModel === "custom" ? openrouterCustomModel.trim() : openrouterModel,
      });

      if (res && res.success) {
        setTestStatus({
          type: "success",
          message: res.message || "Koneksi berhasil! Kunci API aktif dan siap digunakan.",
          models: res.models
        });
      } else {
        const isQuota = res?.status === "RESOURCE_EXHAUSTED" || res?.code === 429;
        setTestStatus({
          type: isQuota ? "warning" : "error",
          message: res?.error || "Gagal melakukan tes koneksi."
        });
      }
    } catch (err: any) {
      setTestStatus({
        type: "error",
        message: err.message || "Terjadi kesalahan saat menghubungi API."
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await api.saveAiConfig({
        activeProvider,
        geminiApiKey: geminiApiKey.trim(),
        openaiApiKey: openaiApiKey.trim(),
        deepseekApiKey: deepseekApiKey.trim(),
        groqApiKey: groqApiKey.trim(),
        openrouterApiKey: openrouterApiKey.trim(),
        openaiCompatibleApiKey: openaiCompatibleApiKey.trim(),
        openaiCompatibleBaseUrl: openaiCompatibleBaseUrl.trim(),
        openaiCompatibleModel: openaiCompatibleModel.trim(),
        geminiModel: geminiModel === "custom" ? geminiCustomModel.trim() : geminiModel,
        openaiModel: openaiModel === "custom" ? openaiCustomModel.trim() : openaiModel,
        deepseekModel: deepseekModel === "custom" ? deepseekCustomModel.trim() : deepseekModel,
        groqModel: groqModel === "custom" ? groqCustomModel.trim() : groqModel,
        openrouterModel: openrouterModel === "custom" ? openrouterCustomModel.trim() : openrouterModel,
        customPromptTemplate: customPromptTemplate,
      });
      showToast("✅ Pengaturan AI berhasil disimpan!");
    } catch (err: any) {
      alert("Gagal menyimpan pengaturan: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const setModelForActiveProvider = (modelName: string) => {
    if (activeProvider === "gemini") {
      if (["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash"].includes(modelName)) {
        setGeminiModel(modelName);
      } else {
        setGeminiModel("custom");
        setGeminiCustomModel(modelName);
      }
    } else if (activeProvider === "openai") {
      if (["gpt-4o-mini", "gpt-4o"].includes(modelName)) {
        setOpenaiModel(modelName);
      } else {
        setOpenaiModel("custom");
        setOpenaiCustomModel(modelName);
      }
    } else if (activeProvider === "deepseek") {
      if (["deepseek-chat", "deepseek-reasoner"].includes(modelName)) {
        setDeepseekModel(modelName);
      } else {
        setDeepseekModel("custom");
        setDeepseekCustomModel(modelName);
      }
    } else if (activeProvider === "groq") {
      if (["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "deepseek-r1-distill-llama-70b"].includes(modelName)) {
        setGroqModel(modelName);
      } else {
        setGroqModel("custom");
        setGroqCustomModel(modelName);
      }
    } else if (activeProvider === "openrouter") {
      if (["google/gemini-2.5-flash", "google/gemini-2.5-pro", "deepseek/deepseek-chat", "openai/gpt-4o-mini"].includes(modelName)) {
        setOpenrouterModel(modelName);
      } else {
        setOpenrouterModel("custom");
        setOpenrouterCustomModel(modelName);
      }
    } else if (activeProvider === "openai-compatible") {
      setOpenaiCompatibleModel(modelName);
    }
  };

  const getProviderInfo = () => {
    switch (activeProvider) {
      case "gemini":
        return {
          title: "Informasi Google AI Studio:",
          desc: <>Buat <strong>Gemini API Key</strong> secara gratis di <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7", fontWeight: 600, textDecoration: "underline" }}>Google AI Studio</a>. Model <strong>Gemini 2.5 Flash</strong> disarankan untuk kecepatan dan kestabilan.</>
        };
      case "openai":
        return {
          title: "Informasi OpenAI Developer Platform:",
          desc: <>Dapatkan API Key di <a href="https://platform.openai.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7", fontWeight: 600, textDecoration: "underline" }}>OpenAI Platform</a>. Model <strong>gpt-4o-mini</strong> sangat hemat biaya dan cepat.</>
        };
      case "deepseek":
        return {
          title: "Informasi DeepSeek API:",
          desc: <>Dapatkan API Key di <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7", fontWeight: 600, textDecoration: "underline" }}>DeepSeek Platform</a>. Model <strong>deepseek-chat</strong> menawarkan performa tinggi dengan harga sangat ekonomis.</>
        };
      case "groq":
        return {
          title: "Informasi Groq Cloud:",
          desc: <>Buat API Key di <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7", fontWeight: 600, textDecoration: "underline" }}>Groq Cloud Console</a>. Menawarkan pemrosesan instan lewat model open-source seperti Llama 3.</>
        };
      case "openrouter":
        return {
          title: "Informasi OpenRouter Agregator:",
          desc: <>Daftar akun di <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7", fontWeight: 600, textDecoration: "underline" }}>OpenRouter</a>. Anda cukup pakai satu API key ini untuk mengakses ratusan model AI dari berbagai provider.</>
        };
      case "openai-compatible":
        return {
          title: "Informasi OpenAI Compatible Server:",
          desc: <>Hubungkan ke server LLM mandiri atau provider API lainnya (seperti Ollama, LM Studio, Together AI, Mistral, dll.) yang mendukung format OpenAI. Masukkan Base URL endpoint dan API key server Anda.</>
        };
      default:
        return { title: "", desc: null };
    }
  };

  const providerInfo = getProviderInfo();

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Pengaturan Model AI</h1>
          <p className={styles.subtitle}>
            Konfigurasi Kunci API dan Model Generatif multi-provider untuk pembuatan draf Anjab otomatis secara fleksibel.
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
            
            {/* Active Provider Selector */}
            <div className={formStyles.formGroup}>
              <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                Pilih Provider AI Utama
              </label>
              <select
                value={activeProvider}
                onChange={(e) => {
                  setActiveProvider(e.target.value);
                  setTestStatus({ type: null, message: "" });
                }}
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
                <option value="gemini">Google Gemini AI</option>
                <option value="openai">OpenAI (GPT)</option>
                <option value="deepseek">DeepSeek AI</option>
                <option value="groq">Groq Cloud (Llama/Mixtral)</option>
                <option value="openrouter">OpenRouter (Multi-model Agregator)</option>
                <option value="openai-compatible">OpenAI Compatible (Custom Base URL)</option>
              </select>
            </div>

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
              💡 <strong>{providerInfo.title}</strong><br />
              {providerInfo.desc}
            </div>

            {/* Conditionally Render API Key and Model Selector */}
            {activeProvider === "gemini" && (
              <>
                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    Gemini API Key
                  </label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="Masukkan Gemini API Key (Kosongkan jika ingin pakai default server)"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
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
                    >
                      {showKey ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>

                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    Pilih Model Gemini
                  </label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
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
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="custom">Kustom / Model Lainnya</option>
                  </select>
                </div>

                {geminiModel === "custom" && (
                  <div className={formStyles.formGroup}>
                    <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                      Nama Model Kustom
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: gemini-2.5-pro"
                      value={geminiCustomModel}
                      onChange={(e) => setGeminiCustomModel(e.target.value)}
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
              </>
            )}

            {activeProvider === "openai" && (
              <>
                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    OpenAI API Key
                  </label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="sk-..."
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
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
                    >
                      {showKey ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>

                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    Pilih Model OpenAI
                  </label>
                  <select
                    value={openaiModel}
                    onChange={(e) => setOpenaiModel(e.target.value)}
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
                    <option value="gpt-4o-mini">gpt-4o-mini (Cepat & Hemat)</option>
                    <option value="gpt-4o">gpt-4o (Cerdas & Komprehensif)</option>
                    <option value="custom">Kustom / Model Lainnya</option>
                  </select>
                </div>

                {openaiModel === "custom" && (
                  <div className={formStyles.formGroup}>
                    <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                      Nama Model Kustom
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: o1-mini atau o3-mini"
                      value={openaiCustomModel}
                      onChange={(e) => setOpenaiCustomModel(e.target.value)}
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
              </>
            )}

            {activeProvider === "deepseek" && (
              <>
                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    DeepSeek API Key
                  </label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="Masukkan DeepSeek API Key"
                      value={deepseekApiKey}
                      onChange={(e) => setDeepseekApiKey(e.target.value)}
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
                    >
                      {showKey ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>

                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    Pilih Model DeepSeek
                  </label>
                  <select
                    value={deepseekModel}
                    onChange={(e) => setDeepseekModel(e.target.value)}
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
                    <option value="deepseek-chat">deepseek-chat (DeepSeek-V3)</option>
                    <option value="deepseek-reasoner">deepseek-reasoner (DeepSeek-R1)</option>
                    <option value="custom">Kustom / Model Lainnya</option>
                  </select>
                </div>

                {deepseekModel === "custom" && (
                  <div className={formStyles.formGroup}>
                    <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                      Nama Model Kustom
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: deepseek-chat"
                      value={deepseekCustomModel}
                      onChange={(e) => setDeepseekCustomModel(e.target.value)}
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
              </>
            )}

            {activeProvider === "groq" && (
              <>
                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    Groq API Key
                  </label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="gsk-..."
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
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
                    >
                      {showKey ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>

                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    Pilih Model Groq
                  </label>
                  <select
                    value={groqModel}
                    onChange={(e) => setGroqModel(e.target.value)}
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
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                    <option value="deepseek-r1-distill-llama-70b">deepseek-r1-distill-llama-70b</option>
                    <option value="custom">Kustom / Model Lainnya</option>
                  </select>
                </div>

                {groqModel === "custom" && (
                  <div className={formStyles.formGroup}>
                    <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                      Nama Model Kustom
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: llama3-8b-8192"
                      value={groqCustomModel}
                      onChange={(e) => setGroqCustomModel(e.target.value)}
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
              </>
            )}

            {activeProvider === "openrouter" && (
              <>
                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    OpenRouter API Key
                  </label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="sk-or-v1-..."
                      value={openrouterApiKey}
                      onChange={(e) => setOpenrouterApiKey(e.target.value)}
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
                    >
                      {showKey ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>

                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    Pilih Model OpenRouter
                  </label>
                  <select
                    value={openrouterModel}
                    onChange={(e) => setOpenrouterModel(e.target.value)}
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
                    <option value="google/gemini-2.5-flash">google/gemini-2.5-flash</option>
                    <option value="google/gemini-2.5-pro">google/gemini-2.5-pro</option>
                    <option value="deepseek/deepseek-chat">deepseek/deepseek-chat</option>
                    <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
                    <option value="custom">Kustom / Model Lainnya</option>
                  </select>
                </div>

                {openrouterModel === "custom" && (
                  <div className={formStyles.formGroup}>
                    <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                      Nama Model Kustom
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: meta-llama/llama-3-8b-instruct:free"
                      value={openrouterCustomModel}
                      onChange={(e) => setOpenrouterCustomModel(e.target.value)}
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
              </>
            )}

            {activeProvider === "openai-compatible" && (
              <>
                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    Base URL API
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: https://api.openai.com/v1 atau http://localhost:11434/v1"
                    value={openaiCompatibleBaseUrl}
                    onChange={(e) => setOpenaiCompatibleBaseUrl(e.target.value)}
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

                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    API Key
                  </label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="Masukkan API Key (Kosongkan jika server tidak butuh auth)"
                      value={openaiCompatibleApiKey}
                      onChange={(e) => setOpenaiCompatibleApiKey(e.target.value)}
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
                    >
                      {showKey ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>

                <div className={formStyles.formGroup}>
                  <label style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                    Model AI
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: gpt-4o-mini, llama3, dll."
                    value={openaiCompatibleModel}
                    onChange={(e) => setOpenaiCompatibleModel(e.target.value)}
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
              </>
            )}

            {/* Custom Prompt Template */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
              <label style={{ fontWeight: 600, color: "var(--foreground)", fontSize: "0.95rem" }}>
                📝 Template Prompt Kustom untuk Draf AI
              </label>
              <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                Gunakan placeholder berikut untuk injeksi data dinamis: <code style={{ background: "rgba(0,0,0,0.1)", padding: "2px 4px", borderRadius: "4px" }}>{`{namaJabatan}`}</code>, <code style={{ background: "rgba(0,0,0,0.1)", padding: "2px 4px", borderRadius: "4px" }}>{`{unitKerja}`}</code>, dan <code style={{ background: "rgba(0,0,0,0.1)", padding: "2px 4px", borderRadius: "4px" }}>{`{namaOPD}`}</code>. Kosongkan untuk menggunakan prompt default sistem.
              </span>
              <textarea
                value={customPromptTemplate}
                onChange={(e) => setCustomPromptTemplate(e.target.value)}
                placeholder="Buat dokumen Analisis Jabatan (Anjab) Permenpan RB No 1 Tahun 2020 lengkap untuk Jabatan: {namaJabatan} yang berada di Unit Kerja: {unitKerja} di bawah OPD: {namaOPD}..."
                rows={12}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid var(--glass-border)",
                  background: "var(--glass-bg)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  fontFamily: "monospace",
                  outline: "none",
                  resize: "vertical"
                }}
              />
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--glass-border)", margin: "1rem 0" }} />

            {/* Test Status Indicator */}
            {testStatus.type && (
              <div style={{
                background: testStatus.type === "success" 
                  ? "rgba(34, 197, 94, 0.1)" 
                  : testStatus.type === "warning"
                    ? "rgba(234, 179, 8, 0.1)"
                    : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${
                  testStatus.type === "success" 
                    ? "rgb(34, 197, 94)" 
                    : testStatus.type === "warning"
                      ? "rgb(234, 179, 8)"
                      : "rgb(239, 68, 68)"
                }`,
                padding: "1rem",
                borderRadius: "10px",
                fontSize: "0.9rem",
                color: "var(--foreground)",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                  <span>
                    {testStatus.type === "success" ? "🟢" : testStatus.type === "warning" ? "🟡" : "🔴"}
                  </span>
                  <span>
                    {testStatus.type === "success" 
                      ? "Koneksi Sukses" 
                      : testStatus.type === "warning" 
                        ? "Limit Kuota Habis" 
                        : "Koneksi Gagal"}
                  </span>
                </div>
                <div>{testStatus.message}</div>
              </div>
            )}

            {/* List of models if available */}
            {testStatus.models && testStatus.models.length > 0 && (
              <div style={{
                background: "var(--glass-bg)",
                border: "1px solid var(--glass-border)",
                padding: "1.25rem",
                borderRadius: "12px",
                fontSize: "0.875rem"
              }}>
                <strong style={{ display: "block", marginBottom: "0.75rem", color: "var(--foreground)" }}>
                  🤖 Model Teks Tersedia untuk Kunci API ini:
                </strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {testStatus.models.slice(0, 50).map((m) => (
                    <span 
                      key={m.name} 
                      onClick={() => setModelForActiveProvider(m.name)}
                      style={{
                        padding: "4px 10px",
                        background: "hsla(260, 50%, 50%, 0.15)",
                        border: "1px solid hsla(260, 50%, 50%, 0.3)",
                        borderRadius: "20px",
                        fontSize: "0.8rem",
                        color: "var(--foreground)",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                      title="Klik untuk memilih model ini"
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: "0.75rem", opacity: 0.5, marginTop: "0.5rem", display: "block" }}>
                  * Klik nama model di atas untuk langsung menerapkannya di formulir input.
                </span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !getActiveApiKey().trim()}
                style={{
                  background: "var(--glass-bg)",
                  border: "1px solid var(--glass-border)",
                  color: "var(--foreground)",
                  padding: "14px 28px",
                  borderRadius: "12px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  opacity: (!getActiveApiKey().trim() || testing) ? 0.5 : 1
                }}
              >
                {testing ? "🔍 Mengetes..." : "🔍 Tes Koneksi AI"}
              </button>

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
                  boxShadow: "0 4px 14px rgba(168, 85, 247, 0.3)"
                }}
              >
                {saving ? "Menyimpan..." : "💾 Simpan Konfigurasi"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
