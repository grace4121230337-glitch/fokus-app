#!/usr/bin/env bash
# Gerbang QA visual otomatis.
#
# Alasan skrip ini ada: bug tampilan paling sering muncul bukan di layar yang sedang
# dikerjakan, melainkan di layar lain dan di ukuran layar lain. Skrip ini memotret
# setiap rute penting pada 3 ukuran (HP kecil, HP besar, laptop), lalu menggabungkannya
# menjadi satu lembar kontak yang bisa diperiksa sekali lihat.
#
# Pakai: bash tools/qa-shots.sh

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-4173}"
OUT="qa"
mkdir -p "$OUT"
rm -f "$OUT"/*.png

# --- Cari Chromium ---
BROWSER=""
for c in chromium chromium-browser google-chrome google-chrome-stable; do
  if command -v "$c" >/dev/null 2>&1; then BROWSER="$c"; break; fi
done
if [ -z "$BROWSER" ]; then
  echo "Chromium tidak ditemukan. Lewati QA visual (test logika tetap berjalan)."
  exit 0
fi

# --- Server statis lokal ---
# ES module tidak bisa dimuat lewat file:// (diblokir CORS), jadi WAJIB lewat http.
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 1.2

BASE="http://localhost:$PORT"

# Rute yang dipotret: nama|query
ROUTES=(
  # Onboarding (Checkpoint 2). stage= memundurkan tahap onboarding pada mode mock,
  # sehingga ketiga layar ini bisa dipotret tanpa mengisi 26 butir kuesioner.
  "01-register|?mock=1&stage=pre#register"
  "02-consent|?mock=1&stage=consent&tier=2#consent"
  "03-pretest|?mock=1&stage=pretest&tier=2#pretest"
  # Kubah Fokus (Checkpoint 3). Yang dipotret layar persiapannya; sesi berjalan
  # bergantung pada jam dinding, jadi tidak stabil untuk dijadikan tangkapan acuan.
  "04-dome|?mock=1&tier=2&day=8&level=5&profile=sprout#dome"
  # Sinyal EMA (Checkpoint 4). ema=due menyuntikkan satu sinyal yang jatuh tempo
  # 5 menit lalu, sehingga layar ini bisa dipotret tanpa menunggu jadwal acak.
  "05-ema|?mock=1&tier=2&day=8&level=5&profile=sprout&ema=due#ema"
  # Beranda fase BASELINE: kartu ajakan harus netral, tanpa saran durasi dan tanpa
  # kalimat personal. Tangkapan ini pasangan pembanding untuk 06-home-nudge di bawah;
  # kalau keduanya mulai terlihat mirip, ada kebocoran nudge ke baseline.
  "home-sprout|?mock=1&tier=1&day=3&level=2&profile=sprout#home"
  "home-spark|?mock=1&tier=4&day=10&level=7&profile=spark#home"
  # Nudge adaptif (Checkpoint 5). tier=1 hari ke-9 sudah lewat 5 hari baseline,
  # jadi fase intervensi aktif dan kartu nudge muncul.
  "06-home-nudge|?mock=1&tier=1&day=9&level=5&profile=spark#home"
  "dex|?mock=1&tier=2&day=8&level=5#dex"
  "quest|?mock=1&tier=2&day=8&level=5#quest"
  "rank|?mock=1&tier=2&day=8&level=5#rank"
  "coop|?mock=1&tier=2&day=8&level=5#coop"
  # Validitas sosial (Checkpoint 6). day=13 pada tier 1 sudah melewati total 12 hari,
  # sehingga gerbang router memaksa layar ini begitu socialValidity masih kosong.
  "07-survey|?mock=1&tier=1&day=13&level=6&profile=sprout#survey"
  # Setelah tersimpan (sv=1), gerbang tidak lagi memaksa - layar ini diakses langsung.
  "08-done|?mock=1&tier=1&day=13&level=7&profile=spark&sv=1#done"
)

# Ukuran: nama|lebar,tinggi
SIZES=("s|360,760" "m|390,844" "l|1280,900")

shoot() {
  local name="$1" url="$2" size="$3"
  "$BROWSER" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --virtual-time-budget=2500 \
    --window-size="$size" --screenshot="$OUT/$name.png" "$url" >/dev/null 2>&1 || true
}

for r in "${ROUTES[@]}"; do
  rname="${r%%|*}"; rquery="${r#*|}"
  for s in "${SIZES[@]}"; do
    sname="${s%%|*}"; ssize="${s#*|}"
    shoot "${rname}_${sname}" "$BASE/$rquery" "$ssize"
  done
done

# --- Gabungkan menjadi lembar kontak ---
if command -v magick >/dev/null 2>&1; then
  magick montage "$OUT"/*_m.png -tile 3x -geometry 300x+6+6 -background '#101415' \
    -fill '#e8eaf0' -pointsize 13 -label '%f' "$OUT/sheet-mobile.png" 2>/dev/null || true
  magick montage "$OUT"/*_l.png -tile 2x -geometry 520x+6+6 -background '#101415' \
    -fill '#e8eaf0' -pointsize 13 -label '%f' "$OUT/sheet-laptop.png" 2>/dev/null || true
fi

# --- Gerbang objektif: tangkap layar kosong / gagal render ---
fail=0
for f in "$OUT"/*_m.png; do
  [ -e "$f" ] || continue
  # Layar yang gagal render biasanya nyaris seragam satu warna.
  sd=$(magick "$f" -colorspace gray -format "%[fx:standard_deviation]" info: 2>/dev/null || echo 1)
  small=$(magick "$f" -format "%[fx:w<200||h<200?1:0]" info: 2>/dev/null || echo 0)
  if awk -v a="$sd" 'BEGIN{exit !(a < 0.02)}'; then
    echo "  GAGAL $f terlihat kosong (sd=$sd)"; fail=$((fail+1))
  elif [ "$small" = "1" ]; then
    echo "  GAGAL $f ukurannya tidak wajar"; fail=$((fail+1))
  else
    echo "  ok    $(basename "$f") (sd=$sd)"
  fi
done

echo
if [ "$fail" -gt 0 ]; then
  echo "QA visual: $fail tangkapan bermasalah. Periksa folder $OUT/"
  exit 1
fi
echo "QA visual: semua rute merender isi. Lembar kontak: $OUT/sheet-mobile.png"
