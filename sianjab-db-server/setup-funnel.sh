#!/usr/bin/env bash
# ==============================================================================
# Skrip Setup Tailscale Funnel untuk Sianjab Homeserver DB (Port 3098 -> 8443)
# Berdampingan secara aman dengan SiTPP Failover Server (Port 3099 -> 443)
# ==============================================================================
set -euo pipefail

LOCAL_PORT="${LOCAL_PORT:-3098}"
FUNNEL_PORT="${FUNNEL_PORT:-8443}"

echo "============================================================"
echo "  Menyiapkan Tailscale Funnel untuk Sianjab DB Server"
echo "  Local Backend : http://127.0.0.1:${LOCAL_PORT}"
echo "  Public HTTPS  : port ${FUNNEL_PORT}"
echo "============================================================"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "❌ Error: perintah 'tailscale' tidak ditemukan. Pastikan Tailscale sudah terinstal."
  exit 1
fi

TS_DNS=$(tailscale status --json | node -e "
  let d = '';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try {
      const j = JSON.parse(d);
      console.log((j.Self && j.Self.DNSName || '').replace(/\.$/, ''));
    } catch (e) { console.log(''); }
  });
")

echo "➡️  Hostname Tailscale terdeteksi: ${TS_DNS:-<tidak diketahui>}"
echo "➡️  Mengaktifkan Tailscale Funnel pada HTTPS port ${FUNNEL_PORT} -> http://127.0.0.1:${LOCAL_PORT} ..."

if tailscale funnel --bg --https="${FUNNEL_PORT}" "http://127.0.0.1:${LOCAL_PORT}" 2>/dev/null; then
  echo "✅ Tailscale Funnel berhasil diaktifkan tanpa sudo!"
else
  echo "⚠️  Memerlukan izin root/operator untuk mengatur Tailscale Funnel, mencoba dengan sudo..."
  sudo tailscale funnel --bg --https="${FUNNEL_PORT}" "http://127.0.0.1:${LOCAL_PORT}"
  echo "✅ Tailscale Funnel berhasil diaktifkan dengan sudo!"
fi

echo ""
echo "📊 Status Tailscale Funnel saat ini:"
tailscale funnel status || true

echo ""
echo "============================================================"
if [ -n "${TS_DNS}" ]; then
  echo "🎉 URL Publik Sianjab Homeserver Anda:"
  echo "   👉 https://${TS_DNS}:${FUNNEL_PORT}"
  echo "   👉 Live Monitor: https://${TS_DNS}:${FUNNEL_PORT}/"
  echo "   👉 Endpoint API: https://${TS_DNS}:${FUNNEL_PORT}/api"
fi
echo "============================================================"
