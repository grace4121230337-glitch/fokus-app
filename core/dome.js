/* Kubah Fokus - mesin state sesi fokus.

   Ini modul paling kritis untuk validitas internal penelitian, karena HP akhir dan
   perilaku "keluar aplikasi" adalah variabel dependen utama. Tiga aturan dijaga ketat:

   1. WAKTU DARI JAM DINDING. elapsed = now - startedAt. Timer 250ms di UI hanya
      MENGGAMBAR, tidak MENGHITUNG. Kalau HP partisipan men-suspend tab (sangat umum
      di Android saat layar mati), hitungan tetap benar begitu tab kembali.

   2. PENALTI OBJEKTIF, ALASAN SUBJEKTIF TERPISAH. Penalti HP dihitung dari durasi
      keluar aplikasi yang terukur, SEBELUM partisipan ditanya alasannya. Jawaban
      "tadi cuma mengunci layar" tidak pernah mengubah HP. Kalau alasan bisa mengurangi
      penalti, partisipan belajar menjawab yang menguntungkan dan variabel dependen rusak.

   3. TANPA DOM. Semua di sini fungsi murni: menerima objek, mengembalikan objek baru.
      Wake Lock, visibilitychange, dan timer gambar ada di ui/screens/dome.js.
      Itulah sebabnya seluruh berkas ini bisa diuji dengan `node test/run.js`. */

import { uuid, now } from './env.js';
import { wibDate } from './tier.js';
import { awardXp, registerSession } from './progress.js';

/* --- Konstanta kontrak (angka ini muncul di Bab 3, jangan diubah diam-diam) --- */

/** Ambang klasifikasi tiga tingkat, dalam milidetik. */
export const AWAY = { GLANCE_MS: 3_000, MID_MS: 15_000 };

/** Penalti HP per jenis keluar aplikasi. */
export const PENALTY = { glance: 5, mid: 10, switch: 20 };

/** Sesi yang ditinggalkan lebih lama dari ini dianggap basi, bukan sesi hidup. */
export const STALE_MS = 6 * 3_600_000;

/** Durasi baku bila tidak ada nudge yang menyarankan durasi lain. */
export const DEFAULT_MINUTES = 25;

/** Durasi yang boleh dipilih. Dibatasi agar sesi tetap sebanding antar partisipan. */
export const ALLOWED_MINUTES = [10, 15, 25, 45];

/** Pilihan disambiguasi satu ketuk. Nilai disimpan apa adanya ke basis data. */
export const AWAY_REASONS = [
  { id: 'lock', label: 'Mengunci layar' },
  { id: 'switch_app', label: 'Buka aplikasi lain' },
  { id: 'interrupted', label: 'Diganggu orang/keadaan' },
  { id: 'unsure', label: 'Tidak yakin' },
];

export const OUTCOME = {
  COMPLETED: 'completed',   // timer habis - sesi utuh
  BROKEN: 'broken',         // HP habis - kubah retak
  ABORTED: 'aborted',       // dihentikan partisipan
  EXPIRED: 'expired',       // aplikasi ditutup, sesi ditemukan basi saat boot
};

/* --- Fungsi murni --- */

/**
 * Klasifikasi tiga tingkat berdasarkan lama keluar aplikasi.
 * < 3 detik      -> 'glance'  (melirik notifikasi; hampir tak terhindarkan)
 * 3 s.d. 15 detik-> 'mid'     (membalas cepat / mengunci layar)
 * > 15 detik     -> 'switch'  (benar-benar berpindah aktivitas)
 *
 * Batasnya inklusif di 15.000 ms supaya "tepat 15 detik" tidak pernah jatuh ke
 * kategori terberat hanya karena pembulatan milidetik perangkat.
 */
export function classifyAway(ms) {
  const v = Math.max(0, Number(ms) || 0);
  if (v < AWAY.GLANCE_MS) return 'glance';
  if (v <= AWAY.MID_MS) return 'mid';
  return 'switch';
}

/** Penalti HP untuk satu peristiwa keluar aplikasi. */
export function awayPenalty(kind) {
  return PENALTY[kind] ?? 0;
}

/**
 * XP sesi.
 *   completed -> plannedMinutes + (hp/100)*30   (bonus ketahanan, maksimal 30)
 *   selain itu-> plannedMinutes * rasio waktu * 0.25
 *
 * Sesi yang gagal tetap diberi XP kecil, bukan nol mutlak: partisipan yang bertahan
 * 20 dari 25 menit tetap melakukan sesuatu yang nyata. Nol mutlak mendorong orang
 * berhenti memakai aplikasi setelah satu kegagalan - dan drop-out jauh lebih merusak
 * data SCED daripada XP yang sedikit murah hati.
 */
export function computeXp({ outcome, hp = 0, plannedMinutes = DEFAULT_MINUTES, elapsedMs = 0 }) {
  const base = Math.max(0, Number(plannedMinutes) || 0);
  if (outcome === OUTCOME.COMPLETED) {
    return Math.round(base + (Math.max(0, Math.min(100, hp)) / 100) * 30);
  }
  const planMs = base * 60_000;
  const ratio = planMs > 0 ? Math.min(1, Math.max(0, elapsedMs) / planMs) : 0;
  return Math.round(base * ratio * 0.25);
}

/** Membuat sesi baru. Belum menyentuh Store - pemanggil yang menyimpannya. */
export function createSession({
  plannedMinutes = DEFAULT_MINUTES,
  tier = null,
  phase = null,
  studyDay = null,
  nudgeBucket = null,
  startedAt = now(),
} = {}) {
  const minutes = ALLOWED_MINUTES.includes(Number(plannedMinutes))
    ? Number(plannedMinutes)
    : DEFAULT_MINUTES;
  return {
    clientId: uuid(),
    plannedMinutes: minutes,
    tier,
    phase,
    studyDay,
    nudgeBucket,
    hp: 100,
    startedAt,
    lastTickAt: startedAt,
    hiddenAt: null,
    marks: [],            // riwayat keluar aplikasi
    wakeLock: false,      // apakah Wake Lock sempat aktif (dicatat sebagai fidelitas)
    stale: false,
  };
}

/** Sisa waktu & progres. Selalu dihitung ulang dari jam dinding. */
export function sessionTiming(session, ts = now()) {
  const planMs = session.plannedMinutes * 60_000;
  const elapsedMs = Math.max(0, ts - session.startedAt);
  const remainingMs = Math.max(0, planMs - elapsedMs);
  return {
    elapsedMs,
    remainingMs,
    planMs,
    percent: planMs ? Math.min(100, Math.round((elapsedMs / planMs) * 100)) : 0,
    finished: remainingMs <= 0,
  };
}

/** Sesi basi: aplikasi jelas sudah lama ditutup, tidak boleh dilanjutkan. */
export function isStale(session, ts = now()) {
  if (!session) return false;
  return ts - (session.lastTickAt || session.startedAt || 0) > STALE_MS;
}

/**
 * Mencatat satu peristiwa keluar aplikasi.
 * Mengembalikan sesi baru + mark yang dibuat + apakah kubah retak (HP habis).
 * Penalti sudah final di sini; setAwayReason() sesudahnya tidak mengubah HP.
 */
export function applyAway(session, { awayMs, at = now() }) {
  const kind = classifyAway(awayMs);
  const penalty = awayPenalty(kind);
  const hp = Math.max(0, session.hp - penalty);
  const mark = {
    id: uuid(),
    at: new Date(at).toISOString(),
    atMs: at,
    awayMs: Math.max(0, Math.round(awayMs)),
    kind,
    penalty,
    hpAfter: hp,
    reason: null,
    elapsedAtMs: Math.max(0, at - session.startedAt),
  };
  return {
    session: { ...session, hp, hiddenAt: null, lastTickAt: at, marks: [...session.marks, mark] },
    mark,
    broken: hp <= 0,
    // 'glance' tidak ditanyai: menginterupsi partisipan tiap kali notifikasi lewat
    // justru menciptakan gangguan yang sedang kita ukur.
    needsReason: kind !== 'glance',
  };
}

/** Melekatkan alasan subjektif ke satu mark. Tidak menyentuh HP - itu disengaja. */
export function setAwayReason(session, markId, reason) {
  return {
    ...session,
    marks: session.marks.map((m) => (m.id === markId ? { ...m, reason } : m)),
  };
}

/** Rekap jenis gangguan - dipakai ringkasan sesi dan kolom analisis. */
export function summarizeMarks(marks = []) {
  const out = { glance: 0, mid: 0, switch: 0, total: marks.length, awayMsTotal: 0 };
  for (const m of marks) {
    if (out[m.kind] !== undefined) out[m.kind] += 1;
    out.awayMsTotal += m.awayMs || 0;
  }
  return out;
}

/**
 * Menutup sesi menjadi satu baris data penelitian (append-only).
 * Bentuk baris ini persis kolom tabel `sessions` di db/checkpoint3.sql.
 */
export function finishSession(session, { outcome, ts = now(), appVersion = null } = {}) {
  const { elapsedMs } = sessionTiming(session, ts);
  const xp = computeXp({ outcome, hp: session.hp, plannedMinutes: session.plannedMinutes, elapsedMs });
  const marks = summarizeMarks(session.marks);
  return {
    client_id: session.clientId,
    tier: session.tier,
    phase: session.phase,
    study_day: session.studyDay,
    session_date: wibDate(session.startedAt),
    planned_minutes: session.plannedMinutes,
    elapsed_sec: Math.round(elapsedMs / 1000),
    hp_end: session.hp,
    outcome,
    xp_awarded: xp,
    nudge_bucket: session.nudgeBucket,
    away_glance: marks.glance,
    away_mid: marks.mid,
    away_switch: marks.switch,
    away_total_sec: Math.round(marks.awayMsTotal / 1000),
    away_marks: session.marks.map((m) => ({
      at: m.at, away_ms: m.awayMs, kind: m.kind, penalty: m.penalty, reason: m.reason,
    })),
    wake_lock: Boolean(session.wakeLock),
    app_version: appVersion,
    started_at: new Date(session.startedAt).toISOString(),
    ended_at: new Date(ts).toISOString(),
  };
}

/**
 * Menerapkan hasil sesi ke state: simpan baris, tambah XP, perbarui streak,
 * dan kosongkan activeSession. Murni - tidak menulis ke penyimpanan maupun jaringan.
 *
 * Streak hanya dihitung untuk sesi yang SELESAI. Kalau sesi yang dibatalkan setelah
 * 30 detik ikut menjaga streak, angka "hari berturut" berhenti berarti apa pun.
 */
export function recordSession(state, row, ts = now()) {
  const withRow = { ...state, sessions: [...(state.sessions || []), row], activeSession: null };
  const awarded = awardXp(withRow, row.xp_awarded);
  const next = row.outcome === OUTCOME.COMPLETED
    ? registerSession(awarded.state, ts)
    : awarded.state;
  return {
    state: next,
    xp: row.xp_awarded,
    leveledUp: awarded.leveledUp,
    evolved: awarded.evolved,
    level: awarded.level,
    streak: next.streak || 0,
  };
}

/** Judul ringkasan akhir sesi. */
export function outcomeTitle(outcome) {
  return {
    [OUTCOME.COMPLETED]: 'Sesi selesai',
    [OUTCOME.BROKEN]: 'Kubah retak',
    [OUTCOME.ABORTED]: 'Sesi dihentikan',
    [OUTCOME.EXPIRED]: 'Sesi kedaluwarsa',
  }[outcome] ?? 'Sesi berakhir';
}

/** Kalimat penutup. Sengaja tanpa nada menghakimi, termasuk saat sesi gagal. */
export function outcomeNote(outcome) {
  return {
    [OUTCOME.COMPLETED]: 'Kamu bertahan sampai akhir. Companion-mu ikut bertumbuh.',
    [OUTCOME.BROKEN]: 'Ketahanan kubah habis sebelum waktunya. Itu informasi, bukan kegagalan - besok coba durasi yang lebih pendek.',
    [OUTCOME.ABORTED]: 'Sesi dihentikan lebih awal. Yang sudah kamu jalani tetap dicatat.',
    [OUTCOME.EXPIRED]: 'Aplikasi tertutup terlalu lama, jadi sesi ini ditutup otomatis.',
  }[outcome] ?? '';
}
