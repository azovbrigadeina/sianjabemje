"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * ErrorBoundary — Menangkap error JavaScript di child components
 * sehingga error di satu bagian tidak meng-crash seluruh halaman.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || "Terjadi kesalahan" };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "300px",
            padding: "2rem",
            textAlign: "center",
            gap: "1rem",
          }}
        >
          <div style={{ fontSize: "3rem" }}>⚠️</div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
            {this.props.fallbackMessage || "Terjadi Kesalahan"}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "0.875rem",
              opacity: 0.7,
              maxWidth: "400px",
            }}
          >
            {this.state.errorMessage}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 1.5rem",
              border: "1px solid hsl(var(--border, 220 13% 80%))",
              borderRadius: "8px",
              background: "hsl(var(--surface, 0 0% 100%))",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            🔄 Coba Lagi
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
