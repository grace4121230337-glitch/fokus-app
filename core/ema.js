/* Mesin EMA (Ecological Momentary Assessment).

   DUA JENIS SINYAL, dan perbedaannya penting untuk analisis:

   1. 'scheduled' - tiga sinyal per hari, satu di tiap strata waktu, jamnya diacak di
      dalam strata. Inilah "EMA harian" pada Bab 3 3.4.d. Sifatnya time-contingent:
      ia mengukur keadaan partisipan pada momen acak, terlepas dari apa yang sedang
      ia lakukan.

   2. 'post_session' - satu sinyal segera setelah sesi Kubah ditutup. Sifatnya
      event-contingent: ia mengukur keadaan yang MELEKAT pada sesi tertentu, dan
      karena itu membawa kolom session_id.

   Keduanya sengaja tidak digabung. Sinyal acak menjawab "bagaimana keadaanmu hari ini
   secara umum", sinyal pasca-sesi menjawab "bagaimana sesi barusan". Menggabungkannya
   akan membuat rerata harian bergeser ke arah momen-momen setelah sesi - yaitu momen
   yang paling tidak mewakili hari partisipan, dan justru momen yang paling dipengaruhi
   intervensi. Kolom signal_type menjaga keduanya tetap bisa dipisah saat analisis.

   Semua di berkas ini murni - tidak ada DOM, tidak ada Store, tidak ada jaringan -
   supaya bisa diuji tanpa browser dan tanpa menunggu jam dinding nyata. */

import { wibDate, wibTimestamp, wibHour, computePhase, studyDay, isStudyOver, PHASE } from './tier.js';
import { uuid, now } from './env.js';

/** Jendela menjawab sinyal harian. Lewat dari ini, sinyal menjadi nonrespons - bukan hilang. */
export const WINDOW_MS = 60 * 60_000;

/* Jendela sinyal pasca-sesi jauh lebih pendek, dan itu disengaja.

   Nilai EMA pasca-sesi terletak pada kedekatannya dengan peristiwa yang dinilai.
   Jawaban yang masuk 50 menit setelah sesi bukan lagi laporan momen, melainkan
   ingatan tentang momen - dan ingatan itulah bias yang justru ingin dihindari EMA. */
export const POST_SESSION_WINDOW_MS = 15 * 60_000;

/** Hadiah tetap, tidak bergantung isi jawaban. Lihat catatan di bawah berkas ini. */
export const MANA_REWARD = 12;

/** Pagi, siang, malam (WIB). Jam akhir bersifat eksklusif. */
export const STRATA = [[9, 12], [13, 16], [17, 20]];
export const STRATA_LABEL = ['pagi', 'siang', 'malam'];
export const SIGNALS_PER_DAY = STRATA.length;

export const STATUS = {
  PENDING: 'pending',
  ANSWERED: 'answered',
  MISSED: 'missed',
};

export const SIGNAL_TYPE = {
  SCHEDULED: 'scheduled',
  POST_SESSION: 'post_session',
};

/* --- Butir EMA ---
   Nama konstruk sengaja dipertahankan: focus, control, context. Bukan "Energy" atau
   "Mood" - dua istilah itu mengukur hal lain dan akan membuat variabel di Bab 3 tidak
   cocok dengan yang benar-benar ditanyakan ke partisipan. */
export const EMA_ITEMS = [
  {
    key: 'focus',
    question: 'Seberapa fokus kamu dalam satu jam terakhir?',
    scale: ['Sama sekali tidak', 'Kurang', 'Cukup', 'Fokus', 'Sangat fokus'],
  },
  {
    key: 'control',
    question: 'Seberapa mampu kamu menahan diri dari hal yang mengganggu?',
    scale: ['Tidak mampu', 'Sulit', 'Kadang bisa', 'Mampu', 'Sangat mampu'],
  },
  {
    key: 'context',
    question: 'Seberapa mendukung lingkunganmu untuk belajar sekarang?',
    scale: ['Sangat mengganggu', 'Mengganggu', 'Biasa', 'Mendukung', 'Sangat mendukung'],
  },
];

/* Butir coping - AKTIF HANYA DI FASE INTERVENSI.

   Bab 3 3.6 Fase Intervensi: "Elemen nudge dengan mekanisme dedupe serta item coping
   pada EMA turut diaktifkan pada fase ini." Jadi butir ini bukan tambahan gaya-gayaan;
   ketiadaannya membuat fase intervensi di aplikasi tidak sama dengan fase intervensi
   yang dijanjikan naskah.

   Konsekuensi metodologis yang harus disadari saat menulis Bab 4: karena butir ini
   hanya ada di fase B, ia TIDAK BISA masuk perbandingan Tau-U antar-fase - tidak ada
   nilai baseline untuk dibandingkan. Ia data deskriptif tentang bagaimana partisipan
   merespons nudge, bukan variabel dependen. */
export const COPING_ITEM = {
  key: 'coping',
  question: 'Ketika tadi ingin menunda, seberapa berhasil kamu memakai cara untuk tetap lanjut?',
  scale: ['Tidak mencoba', 'Mencoba, gagal', 'Sedikit berhasil', 'Berhasil', 'Sangat berhasil'],
};

/** Butir yang berlaku untuk suatu fase. Satu-satunya tempat aturan ini ditulis. */
export function itemsForPhase(phase) {
  return phase === PHASE.INTERVENTION ? [...EMA_ITEMS, COPING_ITEM] : [...EMA_ITEMS];
}

export const EMA_KEYS = EMA_ITEMS.map((i) => i.key);

/* --- Penjadwalan --- */

/* Menjepit jawaban ke 1-5. Butir kosong WAJIB mengembalikan null, bukan 1.
   Perangkap yang sempat lolos di sini: Number(null) bernilai 0, jadi butir yang belum
   dijawab akan terjepit menjadi 1 dan tersimpan seolah partisipan menjawab "paling
   rendah". Nilai palsu seperti itu tidak akan pernah ketahuan saat analisis. */
function clampAnswer(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, n));
}

/** Jendela menjawab untuk sinyal tertentu, sesuai jenisnya. */
export function windowMsFor(signal) {
  return signal?.type === SIGNAL_TYPE.POST_SESSION ? POST_SESSION_WINDOW_MS : WINDOW_MS;
}

/**
 * Membuat jadwal satu hari: satu sinyal acak per strata.
 *
 * Pengacakan berstrata, bukan acak bebas sepanjang hari. Acak bebas bisa menaruh
 * ketiga sinyal dalam rentang dua jam yang sama, sehingga variasi harian yang mau
 * diukur justru tidak terekam.
 */
export function scheduleForDay(dateStr, tier, day, { rand = Math.random, after = null } = {}) {
  const out = [];
  STRATA.forEach(([h1, h2], i) => {
    const minute = Math.floor(rand() * (h2 - h1) * 60);
    const at = wibTimestamp(dateStr, h1, 0) + minute * 60_000;
    if (after != null && at < after) return;
    out.push({
      signalId: `${dateStr}-${i}-${uuid().slice(0, 8)}`,
      type: SIGNAL_TYPE.SCHEDULED,
      stratum: i,
      scheduledAt: new Date(at).toISOString(),
      studyDay: day,
      tier,
      phase: computePhase(tier, day),
      sessionId: null,
      status: STATUS.PENDING,
    });
  });
  return out;
}

/**
 * Sinyal EMA yang melekat pada satu sesi Kubah.
 *
 * stratum sengaja null: sinyal ini tidak berasal dari strata waktu mana pun, dan
 * mengisinya dengan angka akan membuatnya ikut terhitung saat menganalisis variasi
 * pagi/siang/malam.
 */
export function buildPostSessionSignal({ sessionId, tier, phase, studyDay: day, ts = now() }) {
  return {
    signalId: `${wibDate(ts)}-ps-${uuid().slice(0, 8)}`,
    type: SIGNAL_TYPE.POST_SESSION,
    stratum: null,
    scheduledAt: new Date(ts).toISOString(),
    studyDay: day ?? null,
    tier: tier ?? null,
    phase: phase ?? null,
    sessionId: sessionId ?? null,
    status: STATUS.PENDING,
  };
}

/* Hanya sinyal terjadwal yang menentukan "hari ini sudah punya jadwal".

   Ini pernah menjadi bug halus saat sinyal pasca-sesi diperkenalkan: pemeriksaan lama
   memakai signalId.startsWith(tanggal), sehingga satu sesi Kubah pagi hari membuat
   aplikasi mengira jadwal harian sudah dibuat - dan ketiga sinyal acak hari itu tidak
   pernah muncul. */
export function hasScheduleFor(signals = [], dateStr) {
  return signals.some((s) => s
    && (s.type ?? SIGNAL_TYPE.SCHEDULED) === SIGNAL_TYPE.SCHEDULED
    && typeof s.signalId === 'string'
    && s.signalId.startsWith(`${dateStr}-`));
}

/**
 * Menyiapkan jadwal hari ini bila belum ada. Fungsi murni: menerima state,
 * mengembalikan daftar sinyal baru (kosong bila tidak perlu menjadwalkan).
 */
export function ensureSchedule(state, ts = now(), { rand = Math.random } = {}) {
  const p = state?.participant;
  if (!p?.tier || !p?.startedOn) return [];
  const dateStr = wibDate(ts);
  if (hasScheduleFor(state.emaSignals || [], dateStr)) return [];

  const day = studyDay(p.startedOn, ts);
  if (day < 1) return [];
  if (isStudyOver(p.tier, day)) return [];

  return scheduleForDay(dateStr, p.tier, day, { rand, after: ts });
}

/* --- Status sinyal --- */

/**
 * Menandai sinyal kedaluwarsa sebagai `missed`.
 * NONRESPONS ADALAH DATA: sinyal yang lewat tidak dihapus dan tidak dibiarkan
 * `pending` selamanya, karena denominator kepatuhan EMA dihitung dari jumlah
 * sinyal yang dikirim, bukan dari jumlah yang kebetulan dijawab.
 */
export function sweepSignals(signals = [], ts = now()) {
  let changed = 0;
  const next = signals.map((s) => {
    if (!s || s.status !== STATUS.PENDING) return s;
    if (ts - Date.parse(s.scheduledAt) <= windowMsFor(s)) return s;
    changed += 1;
    return { ...s, status: STATUS.MISSED, closedAt: new Date(ts).toISOString() };
  });
  return { signals: next, changed };
}

/**
 * Sinyal yang sedang dalam jendela jawab.
 *
 * Sinyal pasca-sesi DIDAHULUKAN. Bila keduanya kebetulan jatuh tempo bersamaan,
 * yang jendelanya 15 menit harus dijawab lebih dulu daripada yang jendelanya 60 menit -
 * urutan sebaliknya membuat sinyal pasca-sesi hangus tanpa perlu.
 */
export function findDueSignal(signals = [], ts = now()) {
  const due = signals.filter((s) => {
    if (!s || s.status !== STATUS.PENDING) return false;
    const d = ts - Date.parse(s.scheduledAt);
    return d >= 0 && d <= windowMsFor(s);
  });
  return due.find((s) => s.type === SIGNAL_TYPE.POST_SESSION) || due[0] || null;
}

/** Sinyal berikutnya yang belum waktunya - dipakai teks "sinyal berikutnya sekitar ...". */
export function nextSignal(signals = [], ts = now()) {
  const upcoming = signals
    .filter((s) => s && s.status === STATUS.PENDING && Date.parse(s.scheduledAt) > ts)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  return upcoming[0] || null;
}

/** Sisa waktu menjawab dalam milidetik (0 bila sudah habis). */
export function remainingWindowMs(signal, ts = now()) {
  if (!signal) return 0;
  return Math.max(0, windowMsFor(signal) - (ts - Date.parse(signal.scheduledAt)));
}

/** Angka kepatuhan - dipakai layar peneliti dan analisis. */
export function complianceSummary(signals = []) {
  const delivered = signals.filter((s) => s && s.status !== STATUS.PENDING).length;
  const answered = signals.filter((s) => s && s.status === STATUS.ANSWERED).length;
  const missed = signals.filter((s) => s && s.status === STATUS.MISSED).length;
  const pending = signals.filter((s) => s && s.status === STATUS.PENDING).length;
  return {
    delivered,
    answered,
    missed,
    pending,
    rate: delivered ? answered / delivered : null,
  };
}

/** Kepatuhan sinyal harian saja, untuk SATU tanggal. Dipakai kartu Beranda.
    Sinyal pasca-sesi dikecualikan: jumlahnya bergantung pada berapa kali partisipan
    berlatih, sehingga "2 dari 5" akan membingungkan dan bukan ukuran kepatuhan. */
export function dailyCompliance(signals = [], dateStr) {
  const hari = signals.filter((s) => s
    && (s.type ?? SIGNAL_TYPE.SCHEDULED) === SIGNAL_TYPE.SCHEDULED
    && wibDate(Date.parse(s.scheduledAt)) === dateStr);
  return {
    total: hari.length,
    answered: hari.filter((s) => s.status === STATUS.ANSWERED).length,
    missed: hari.filter((s) => s.status === STATUS.MISSED).length,
    pending: hari.filter((s) => s.status === STATUS.PENDING).length,
  };
}

/* --- Jawaban --- */

/**
 * Membentuk satu baris data EMA. Satu baris per sinyal, bukan per butir:
 * butir-butirnya diukur pada momen yang sama dan dianalisis bersama.
 *
 * `coping` hanya diisi pada fase intervensi. Di fase lain nilainya null, BUKAN 0 -
 * nol berarti "diukur dan hasilnya nol", null berarti "memang tidak ditanyakan".
 */
export function buildEntry({
  signal, focus, control, context, coping = null, ts = now(), appVersion = null,
}) {
  const f = clampAnswer(focus);
  const c = clampAnswer(control);
  const x = clampAnswer(context);
  if (f == null || c == null || x == null) throw new Error('Ketiga butir EMA wajib terisi');

  const butuhCoping = signal?.phase === PHASE.INTERVENTION;
  const cop = butuhCoping ? clampAnswer(coping) : null;
  if (butuhCoping && cop == null) throw new Error('Butir coping wajib terisi pada fase intervensi');

  const scheduled = Date.parse(signal.scheduledAt);
  return {
    client_id: uuid(),
    signal_id: signal.signalId,
    signal_type: signal.type ?? SIGNAL_TYPE.SCHEDULED,
    session_id: signal.sessionId ?? null,
    tier: signal.tier ?? null,
    phase: signal.phase ?? null,
    study_day: signal.studyDay ?? null,
    entry_date: wibDate(ts),
    hour_wib: wibHour(ts),
    stratum: signal.stratum ?? null,
    focus: f,
    control: c,
    context: x,
    coping: cop,
    // Impulsivitas dibalik dari kontrol diri, sesuai flowchart Bab 3. Ditulis di sini
    // sekali saja - jangan pernah dihitung ulang di layar atau di kueri analisis,
    // karena dua tempat perhitungan berarti dua kemungkinan angka.
    impulse: 6 - c,
    responded: true,
    latency_sec: Math.max(0, Math.round((ts - scheduled) / 1000)),
    mana_awarded: MANA_REWARD,
    scheduled_at: signal.scheduledAt,
    answered_at: new Date(ts).toISOString(),
    app_version: appVersion,
  };
}

/** Baris untuk sinyal yang tidak dijawab. Bentuk kolomnya sengaja sama dengan baris
    terjawab supaya analisis tidak perlu menggabungkan dua tabel berbeda. */
export function buildMissedEntry(signal, ts = now(), appVersion = null) {
  return {
    client_id: uuid(),
    signal_id: signal.signalId,
    signal_type: signal.type ?? SIGNAL_TYPE.SCHEDULED,
    session_id: signal.sessionId ?? null,
    tier: signal.tier ?? null,
    phase: signal.phase ?? null,
    study_day: signal.studyDay ?? null,
    entry_date: wibDate(Date.parse(signal.scheduledAt)),
    hour_wib: wibHour(Date.parse(signal.scheduledAt)),
    stratum: signal.stratum ?? null,
    focus: null,
    control: null,
    context: null,
    coping: null,
    impulse: null,
    responded: false,
    latency_sec: null,
    mana_awarded: 0,
    scheduled_at: signal.scheduledAt,
    answered_at: null,
    app_version: appVersion,
  };
}

/** Menandai satu sinyal terjawab. Murni: mengembalikan daftar baru. */
export function markAnswered(signals = [], signalId, ts = now()) {
  return signals.map((s) => (s && s.signalId === signalId
    ? { ...s, status: STATUS.ANSWERED, closedAt: new Date(ts).toISOString() }
    : s));
}

/**
 * Reducer state setelah partisipan menjawab: simpan baris, tandai sinyal,
 * tambah MANA. Tidak menyentuh XP - XP milik sesi Kubah, MANA milik EMA.
 */
export function recordEntry(state, entry) {
  const mana = (state.mana || 0) + (entry.mana_awarded || 0);
  return {
    state: {
      ...state,
      emaEntries: [...(state.emaEntries || []), entry],
      emaSignals: markAnswered(state.emaSignals || [], entry.signal_id),
      mana,
    },
    mana,
    gained: entry.mana_awarded || 0,
  };
}

/** Rerata fokus dua EMA terakhir yang terjawab. Dipakai nudge adaptif (checkpoint 5). */
export function recentFocusMean(emaEntries = []) {
  const answered = emaEntries.filter((e) => e && e.responded !== false && Number.isFinite(Number(e.focus)));
  if (!answered.length) return null;
  const last2 = answered.slice(-2);
  return last2.reduce((sum, e) => sum + Number(e.focus), 0) / last2.length;
}

/* Kenapa MANA selalu 12, berapa pun jawabannya?
   Kalau besarnya hadiah bergantung pada isi jawaban, partisipan cepat belajar
   menjawab yang menguntungkan, dan variabel EMA berubah menjadi ukuran kepintaran
   bermain, bukan ukuran keadaan sebenarnya. Hadiah tetap memberi insentif untuk
   MENJAWAB, bukan untuk menjawab sesuatu yang tertentu. */
