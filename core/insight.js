/* Struk Fokus - ringkasan yang boleh dilihat PARTISIPAN.

   Kenapa modul ini ada. Sampai versi 0.7.0 seluruh angka perilaku hanya bisa dibaca
   peneliti di layar #dev yang terkunci PIN. Untuk tujuan penelitian itu benar, tetapi
   untuk tujuan kedua aplikasi ini - melatih fokus - itu berarti partisipan berlatih
   14 hari tanpa pernah melihat hasil latihannya sendiri. Umpan balik yang tertunda
   sampai studi selesai bukan umpan balik.

   DUA PAGAR yang membuat struk ini aman ada di tangan partisipan selama studi:

   1. DESKRIPTIF, BUKAN PRESKRIPTIF. Struk hanya menghitung ulang apa yang sudah
      dilakukan partisipan: berapa sesi, berapa menit, berapa sinyal dijawab. Ia tidak
      pernah menyarankan apa pun - tidak ada "coba sesi pagi", tidak ada "kamu paling
      fokus jam 9". Saran yang dipersonalisasi ADALAH intervensi yang sedang diteliti
      (core/nudge.js), dan intervensi hanya boleh menyala pada fase intervensi. Struk
      yang memberi saran akan mengintervensi fase baseline dan meruntuhkan desain
      multiple-baseline.
   2. BENTUKNYA IDENTIK DI SEMUA FASE. Baris yang sama, urutan yang sama, kalimat
      penutup yang sama persis, baik pada hari ke-2 (baseline) maupun hari ke-12
      (intervensi). Kalau struk ikut berubah saat intervensi mulai, kenaikan yang
      terukur bisa berasal dari struk, bukan dari nudge yang diteliti.

   Konsekuensi yang disengaja: struk ini terasa "datar" dibanding aplikasi produktivitas
   komersial. Itu harga validitas internal, dan harganya dibayar di sini, bukan di
   analisis.

   Seluruh isi berkas murni: state masuk, objek keluar. Tidak ada DOM, tidak ada
   jaringan, tidak ada Date.now() langsung - supaya bisa diuji di `node test/run.js`. */

import { now } from './env.js';
import { wibDate, dayDiff, addDays, studyProgress, phaseLabel } from './tier.js';
import { levelBreakdown, activeProfile, companionName, stageName } from './progress.js';
import { SIGNAL_TYPE, STATUS } from './ema.js';
import { STUDY } from './config.js';

export const SCOPE = {
  WEEK: 'week',      // 7 hari kalender terakhir termasuk hari ini
  ALL: 'all',        // sejak hari pertama studi
};

/** Rentang tanggal WIB untuk sebuah cakupan. Inklusif di kedua ujung. */
export function periodRange(state = {}, scope = SCOPE.WEEK, ts = now()) {
  const end = wibDate(ts);
  const startedOn = state.participant?.startedOn || null;
  if (scope === SCOPE.ALL) {
    return { start: startedOn || end, end };
  }
  const weekStart = addDays(end, -6);
  // Tidak pernah mundur melewati hari pertama studi: "7 hari terakhir" pada hari ke-3
  // hanya berarti 3 hari, bukan 4 hari kosong yang terbaca sebagai kemunduran.
  if (startedOn && dayDiff(startedOn, weekStart) < 0) return { start: startedOn, end };
  return { start: weekStart, end };
}

function inRange(dateStr, { start, end }) {
  if (!dateStr) return false;
  return dayDiff(start, dateStr) >= 0 && dayDiff(dateStr, end) >= 0;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Metrik mentah untuk satu rentang tanggal. Semua angka dihitung dari state perangkat,
 * bukan dari server - struk harus tetap bisa dibuat saat partisipan sedang offline.
 */
export function summarize(state = {}, scope = SCOPE.WEEK, ts = now()) {
  const range = periodRange(state, scope, ts);
  const sessions = (state.sessions || []).filter((s) => inRange(s?.session_date, range));
  const completed = sessions.filter((s) => s.outcome === 'completed');

  const focusSec = sessions.reduce((sum, s) => sum + (Number(s.elapsed_sec) || 0), 0);
  const hpValues = completed.map((s) => Number(s.hp_end)).filter(Number.isFinite);

  /* Sinyal terjadwal dan pasca-sesi dipisah, sama seperti di analisis.
     Menggabungkannya membuat penyebut berubah-ubah mengikuti berapa kali partisipan
     berlatih, sehingga "8 dari 11" tidak berarti apa-apa sebagai ukuran kepatuhan. */
  const signals = (state.emaSignals || []).filter((s) => inRange(wibDate(Date.parse(s?.scheduledAt || 0)), range));
  const scheduled = signals.filter((s) => (s.type ?? SIGNAL_TYPE.SCHEDULED) === SIGNAL_TYPE.SCHEDULED);
  const answeredScheduled = scheduled.filter((s) => s.status === STATUS.ANSWERED).length;
  const deliveredScheduled = scheduled.filter((s) => s.status !== STATUS.PENDING).length;

  const entries = (state.emaEntries || []).filter((e) => inRange(e?.entry_date, range) && e?.responded !== false);
  const focusScores = entries.map((e) => Number(e.focus)).filter(Number.isFinite);

  // Hari aktif = hari kalender yang punya minimal satu sesi. Ini ukuran konsistensi
  // yang jujur; total menit bisa besar hanya karena satu hari maraton.
  const activeDays = new Set(sessions.map((s) => s.session_date)).size;
  const spanDays = dayDiff(range.start, range.end) + 1;

  return {
    range,
    spanDays,
    activeDays,
    sessionsStarted: sessions.length,
    sessionsCompleted: completed.length,
    focusMinutes: Math.round(focusSec / 60),
    xpEarned: sessions.reduce((sum, s) => sum + (Number(s.xp_awarded) || 0), 0),
    hpMean: hpValues.length ? round1(hpValues.reduce((a, b) => a + b, 0) / hpValues.length) : null,
    awaySec: sessions.reduce((sum, s) => sum + (Number(s.away_total_sec) || 0), 0),
    emaAnswered: answeredScheduled,
    emaDelivered: deliveredScheduled,
    // null, bukan 0: belum ada sinyal terkirim berarti belum ada penyebut.
    emaRate: deliveredScheduled ? round1((answeredScheduled / deliveredScheduled) * 100) : null,
    focusMean: focusScores.length ? round1(focusScores.reduce((a, b) => a + b, 0) / focusScores.length) : null,
    entriesAnswered: entries.length,
  };
}

/**
 * Nomor struk yang stabil: struk untuk periode yang sama selalu bernomor sama,
 * sehingga partisipan yang mengunduh dua kali tidak merasa mendapat dua hasil berbeda.
 * Bukan pengenal keamanan - hanya penanda visual, jadi hash sederhana sudah cukup.
 */
export function receiptNo(code, range) {
  const seed = `${code || 'FOKUS'}|${range.start}|${range.end}`;
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `FKS-${String(h % 10000).padStart(4, '0')}`;
}

function fmtTanggal(dateStr) {
  const BULAN = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  const [y, m, d] = String(dateStr).split('-');
  if (!y || !m || !d) return String(dateStr).toUpperCase();
  return `${d} ${BULAN[Number(m) - 1] ?? m} ${y}`;
}

function jam(ts) {
  return new Date(Number(ts) + 7 * 3_600_000).toISOString().slice(11, 16);
}

/**
 * Model struk siap render. Dipakai OLEH DUA renderer sekaligus - HTML di layar dan
 * kanvas saat diunduh - supaya gambar yang diunduh tidak mungkin berbeda isi dari
 * yang dilihat partisipan sebelum menekan unduh.
 */
export function receiptData(state = {}, { scope = SCOPE.WEEK, ts = now() } = {}) {
  const m = summarize(state, scope, ts);
  const p = state.participant || {};
  const prog = p.tier && p.startedOn ? studyProgress(p.tier, p.startedOn, ts) : null;
  const lvl = levelBreakdown(state.xp || 0);
  const profile = activeProfile(state);

  const rataHari = m.spanDays ? round1(m.focusMinutes / m.spanDays) : 0;

  /* Baris struk. Urutan dan bunyinya TETAP di semua fase - lihat pagar nomor 2 di
     kepala berkas. Kolom "qty" mengikuti bahasa struk belanja: berapa kali, bukan skor. */
  const lines = [
    { qty: m.sessionsCompleted, label: 'SESI TUNTAS', amount: String(m.sessionsCompleted) },
    { qty: m.sessionsStarted, label: 'SESI DIMULAI', amount: String(m.sessionsStarted) },
    { qty: m.activeDays, label: 'HARI BERLATIH', amount: `${m.activeDays}/${m.spanDays}` },
    { qty: 1, label: 'MENIT FOKUS', amount: String(m.focusMinutes) },
    { qty: 1, label: 'RATA MENIT/HARI', amount: String(rataHari) },
    { qty: m.emaDelivered, label: 'SINYAL DIJAWAB', amount: `${m.emaAnswered}/${m.emaDelivered}` },
    { qty: 1, label: 'XP PERIODE INI', amount: String(m.xpEarned) },
  ];

  /* Ketahanan rata-rata hanya muncul bila ADA sesi tuntas. Menampilkan "0" saat belum
     pernah ada sesi membuat partisipan membaca nilai nol sebagai penilaian buruk,
     padahal yang terjadi adalah belum ada yang diukur. */
  if (m.hpMean !== null) {
    lines.push({ qty: m.sessionsCompleted, label: 'RATA KETAHANAN', amount: `${m.hpMean}` });
  }

  return {
    title: STUDY.appName,
    subtitle: scope === SCOPE.ALL ? '[SELURUH PERJALANAN]' : '[7 HARI TERAKHIR]',
    receiptNo: receiptNo(p.code, m.range),
    meta: [
      { key: 'KODE', value: p.code || '-' },
      { key: 'PERIODE', value: `${fmtTanggal(m.range.start)} - ${fmtTanggal(m.range.end)}` },
      { key: 'DICETAK', value: `${fmtTanggal(wibDate(ts))} ${jam(ts)} WIB` },
      { key: 'PENDAMPING', value: `${companionName(profile)} - ${stageName(profile, lvl.level)}`.toUpperCase() },
    ],
    lines,
    totals: [
      { key: 'JUMLAH BARIS', value: String(lines.length) },
      { key: 'TOTAL JAM FOKUS', value: round1(m.focusMinutes / 60).toFixed(1), strong: true },
      { key: 'LEVEL', value: `${lvl.level} (${lvl.intoLevel}/${lvl.need} XP)` },
      { key: 'HARI BERTURUT', value: String(state.streak || 0) },
    ],
    // Bukan "tier 2 dari 4": partisipan tidak perlu tahu posisinya dalam desain
    // penelitian, dan mengetahuinya bisa mengubah cara ia berperilaku.
    authCode: prog ? `HARI ${prog.day}/${prog.total} - ${phaseLabel(prog.phase).toUpperCase()}` : 'PERSIAPAN',
    /* Kalimat penutup TETAP - tidak dipilih berdasarkan performa. Kalimat pujian yang
       muncul hanya saat angka bagus adalah umpan balik kontingen, dan itu perlakuan. */
    footer: 'TERIMA KASIH SUDAH BERLATIH HARI INI',
    footerNote: STUDY.receiptFooter,
    barcode: barcodePattern(receiptNo(p.code, m.range)),
    metrics: m,
  };
}

/**
 * Pola garis barcode dekoratif, deterministik dari nomor struk.
 * Tidak menyandikan data apa pun - hanya visual. Kalau suatu saat ingin barcode yang
 * benar-benar bisa dipindai, ia harus dibuat dari kode partisipan, dan itu justru
 * membuat kode partisipan tercetak di gambar yang dibagikan ke media sosial.
 * Karena itu di sini sengaja BUKAN barcode sungguhan.
 */
export function barcodePattern(seedText) {
  const bars = [];
  let h = 7;
  for (let i = 0; i < String(seedText).length; i += 1) h = (h * 33 + String(seedText).charCodeAt(i)) >>> 0;
  for (let i = 0; i < 34; i += 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push({ w: 1 + ((h >>> 3) % 4), gap: 1 + ((h >>> 9) % 3) });
  }
  return bars;
}

/** Teks satu baris bergaya struk: LABEL...........NILAI pada lebar karakter tetap. */
export function dotLeader(label, value, width = 32) {
  const l = String(label);
  const v = String(value);
  const dots = Math.max(1, width - l.length - v.length);
  return `${l}${'.'.repeat(dots)}${v}`;
}

/** Versi teks polos - dipakai sebagai cadangan bila kanvas tidak tersedia sama sekali. */
export function receiptText(data) {
  const garis = '-'.repeat(32);
  const baris = [
    data.title.toUpperCase(),
    data.subtitle,
    // Nomor struk ikut dicetak di versi teks: bila partisipan menyalin strukanya ke
    // WhatsApp alih-alih mengunduh gambar, nomor inilah yang membuat dua salinan
    // periode yang sama bisa dikenali sebagai satu dokumen, bukan dua capaian.
    `NO. ${data.receiptNo}`,
    garis,
    ...data.meta.map((x) => dotLeader(x.key, x.value)),
    garis,
    ...data.lines.map((x) => dotLeader(x.label, x.amount)),
    garis,
    ...data.totals.map((x) => dotLeader(x.key, x.value)),
    garis,
    data.authCode,
    data.footer,
    data.footerNote,
  ];
  return baris.join('\n');
}
