#!/bin/bash
# ==========================================
# SCRIPT BACKUP FIREBASE REALTIME DATABASE
# SEC-K3: secret TIDAK lagi di sini — wajib via environment variable
# (lihat .env.example di sianjab-db-server/)
# ==========================================

# 1. KONFIGURASI — bawa dari ENV, tidak ada default. Fail keras bila kosong.
FIREBASE_URL="${FIREBASE_URL:?Set FIREBASE_URL di environment}"
FIREBASE_SECRET="${FIREBASE_SECRET:?Set FIREBASE_SECRET di environment}"

# 2. LOAD DARI FILE ENV (Jika ada)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

FIREBASE_URL=${FIREBASE_URL:-$FIREBASE_URL}
FIREBASE_SECRET=${FIREBASE_SECRET:-$FIREBASE_SECRET}

# 3. VALIDASI
if [[ "$FIREBASE_URL" == *"YOUR_PROJECT_ID"* ]]; then
  echo "=========================================================="
  echo "ERROR: FIREBASE_URL belum dikonfigurasi!"
  echo "Silakan edit file ini atau isi variabel di dalamnya."
  echo "=========================================================="
  exit 1
fi
# 4. PROSES BACKUP
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="$BACKUP_DIR/backup_$TIMESTAMP.json"

echo "Menghubungkan ke Firebase: $FIREBASE_URL ..."

# Jalankan curl
if [ -n "$FIREBASE_SECRET" ] && [ "$FIREBASE_SECRET" != "YOUR_FIREBASE_SECRET" ]; then
  HTTP_STATUS=$(curl -s -w "%{http_code}" -o "$OUTPUT_FILE" "$FIREBASE_URL/.json?auth=$FIREBASE_SECRET")
else
  HTTP_STATUS=$(curl -s -w "%{http_code}" -o "$OUTPUT_FILE" "$FIREBASE_URL/.json")
fi

# 5. VERIFIKASI HASIL
if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "----------------------------------------------------------"
  echo "BACKUP BERHASIL!"
  echo "File disimpan di: $OUTPUT_FILE"
  echo "Ukuran file: $(du -sh "$OUTPUT_FILE" | cut -f1)"
  echo "----------------------------------------------------------"
else
  echo "----------------------------------------------------------"
  echo "ERROR: Gagal backup database. HTTP Status: $HTTP_STATUS"
  echo "Pastikan URL dan Secret benar, serta koneksi internet aktif."
  echo "----------------------------------------------------------"
  # Hapus file kosong jika gagal
  rm -f "$OUTPUT_FILE"
  exit 1
fi
