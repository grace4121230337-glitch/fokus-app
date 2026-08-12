/* Agregasi pemantauan lintas partisipan - otak layar #monitor dan /api/monitor.js.

   Masalah yang diselesaikan berkas ini. Sampai 0.7.0, satu-satunya cara peneliti tahu
   apa yang terjadi pada 14 partisipan adalah membuka Table Editor Supabase atau menarik
   CSV lewat /api/export.js. Keduanya bekerja, tetapi keduanya BERSIFAT TARIK dan mentah:
   peneliti harus tahu lebih dulu apa yang dicari. Akibatnya masalah yang paling mahal
   dalam studi lapangan - satu partisipan berhenti mengisi sejak tiga hari lalu - baru
   ketahuan saat data ditutup, ketika sudah tidak ada yang bisa dilakukan.

   Yang dibutuhkan justru kebalikannya: satu layar yang langsung menunjukkan siapa yang
   perlu dihubungi HARI INI. Itu sebabnya kolom terpenting di sini bukan rata-rata
   melainkan `lastSeenDays` dan `flags`.

   Murni dan bebas jaringan supaya bisa diuji di `node test/run.js`: baris masuk apa
   adanya dari PostgREST, ringkasan keluar. */

import { TIERS, computePhase, dayDiff, phaseLabel } from './tier.js';
import { EMA_MIN_RATE, MIN_DATA_POINTS } from './compliance.js';

/** Ambang "partisipan perlu dihubungi" dalam hari tanpa aktivitas apa pun. */
export const SILENT_DAYS = 2;

function num(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }

function maxDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}

function round1(n) { return Math.round(n * 10) / 10; }

/**
 * Menggabungkan baris mentah menjadi satu baris ringkas per partisipan.
 *
 * @param {object} data { participants, sessions, emaSignals, emaEntries, fidelity, nudge }
 * @param {object} opts { today: 'YYYY-MM-DD' } tanggal WIB acuan
 */
export function monitorRows(data = {}, { today } = {}) {
  const participants = data.participants || [];
  const byId = new Map(participants.map((p) => [p.id, p]));

  const bucket = () => ({
    sessions: [], emaSignals: [], emaEntries: [], fidelity: [], nudge: [],
  });
  const groups = new Map(participants.map((p) => [p.id, bucket()]));
  const push = (key, rows) => {
    for (const row of rows || []) {
      const g = groups.get(row?.participant_id);
      if (g) g[key].push(row);
    }
  };
  push('sessions', data.sessions);
  push('emaSignals', data.emaSignals);
  push('emaEntries', data.emaEntries);
  push('fidelity', data.fidelity);
  push('nudge', data.nudge);

  return participants.map((p) => {
    const g = groups.get(p.id) || bucket();
    const cfg = TIERS[Number(p.tier)] || null;

    const day = p.started_on && today ? dayDiff(p.started_on, today) + 1 : 0;
    const phase = cfg && day >= 1 ? computePhase(p.tier, day) : 'pre';

    const sessionsToday = g.sessions.filter((s) => s.session_date === today);
    const completed = g.sessions.filter((s) => s.outcome === 'completed');

    /* Hanya sinyal TERJADWAL yang dihitung sebagai kepatuhan EMA. Sinyal pasca-sesi
       jumlahnya mengikuti berapa kali partisipan berlatih, jadi memasukkannya membuat
       penyebut berubah-ubah antarpartisipan dan angka persennya tidak bisa dibandingkan -
       padahal justru perbandingan antarpartisipan yang dicari di layar ini. */
    const scheduled = g.emaSignals.filter((s) => (s.signal_type ?? 'scheduled') === 'scheduled');
    const delivered = scheduled.filter((s) => s.status && s.status !== 'pending');
    const answered = delivered.filter((s) => s.status === 'answered');
    const deliveredToday = delivered.filter((s) => String(s.scheduled_at || '').slice(0, 10) === today);
    const answeredToday = deliveredToday.filter((s) => s.status === 'answered');

    const hp = completed.map((s) => num(s.hp_end)).filter((v) => v > 0);

    /* "Terakhir terlihat" sengaja diambil dari tanggal DATA, bukan dari created_at baris.
       Perangkat yang lama offline mengirim borongan begitu dapat sinyal; kalau kita
       memakai waktu kiriman, partisipan yang tidak berlatih tiga hari akan terbaca
       "aktif hari ini" hanya karena hari ini HP-nya tersambung WiFi sekolah. */
    let lastSeen = null;
    for (const s of g.sessions) lastSeen = maxDate(lastSeen, s.session_date);
    for (const e of g.emaEntries) lastSeen = maxDate(lastSeen, e.entry_date);
    for (const f of g.fidelity) lastSeen = maxDate(lastSeen, f.entry_date);

    const lastSeenDays = lastSeen && today ? dayDiff(lastSeen, today) : null;
    const emaRate = delivered.length ? answered.length / delivered.length : null;

    const fidelityBad = g.fidelity.filter((f) => f.fidelity_ok === false).length;

    /* Bendera. Sengaja hanya empat, dan semuanya bisa ditindaklanjuti HARI INI.
       Bendera yang tidak bisa ditindaklanjuti hanya melatih peneliti mengabaikan
       bendera. */
    const flags = [];
    if (!p.started_on) flags.push('belum mulai');
    else if (lastSeenDays === null) flags.push('belum ada data');
    else if (lastSeenDays >= SILENT_DAYS) flags.push(`sunyi ${lastSeenDays} hari`);
    if (emaRate !== null && emaRate < EMA_MIN_RATE) flags.push('EMA di bawah ambang');
    if (day > 0 && cfg && completed.length < MIN_DATA_POINTS && day > cfg.baseline) {
      flags.push('titik data kurang');
    }
    if (fidelityBad > 0) flags.push(`fidelitas ${fidelityBad} hari`);

    return {
      code: p.code || '-',
      school: p.school || null,
      tier: Number(p.tier) || null,
      day,
      totalDays: cfg?.total ?? null,
      phase,
      phaseLabel: phaseLabel(phase),
      startedOn: p.started_on || null,
      lastSeen,
      lastSeenDays,
      sessionsToday: sessionsToday.length,
      sessionsTotal: g.sessions.length,
      sessionsCompleted: completed.length,
      focusMinutes: Math.round(g.sessions.reduce((sum, s) => sum + num(s.elapsed_sec), 0) / 60),
      hpMean: hp.length ? round1(hp.reduce((a, b) => a + b, 0) / hp.length) : null,
      emaAnswered: answered.length,
      emaDelivered: delivered.length,
      emaRate: emaRate === null ? null : round1(emaRate * 100),
      emaTodayAnswered: answeredToday.length,
      emaTodayDelivered: deliveredToday.length,
      nudgeShown: g.nudge.filter((n) => n.event === 'shown' || n.shown).length,
      nudgeAccepted: g.nudge.filter((n) => n.event === 'accepted' || n.accepted).length,
      fidelityDays: g.fidelity.length,
      fidelityBad,
      posttestOn: p.posttest_on || null,
      followupOn: p.followup_on || null,
      flags,
    };
  }).sort((a, b) => {
    // Yang perlu dihubungi naik ke atas. Layar pemantauan yang mengurutkan berdasarkan
    // abjad memaksa peneliti memindai 14 baris setiap pagi untuk mencari satu masalah.
    if (a.flags.length !== b.flags.length) return b.flags.length - a.flags.length;
    return String(a.code).localeCompare(String(b.code));
  });
}

/** Angka tingkat studi untuk kepala layar pemantauan. */
export function studyRollup(rows = [], { expectedParticipants = 14 } = {}) {
  const active = rows.filter((r) => r.startedOn);
  const emaRates = rows.map((r) => r.emaRate).filter((v) => v !== null);
  return {
    registered: rows.length,
    expected: expectedParticipants,
    started: active.length,
    activeToday: rows.filter((r) => r.lastSeenDays === 0).length,
    needsContact: rows.filter((r) => r.flags.length > 0).length,
    sessionsToday: rows.reduce((sum, r) => sum + r.sessionsToday, 0),
    sessionsTotal: rows.reduce((sum, r) => sum + r.sessionsTotal, 0),
    emaRateMean: emaRates.length ? round1(emaRates.reduce((a, b) => a + b, 0) / emaRates.length) : null,
    fidelityBadDays: rows.reduce((sum, r) => sum + r.fidelityBad, 0),
    byPhase: ['pre', 'baseline', 'intervention', 'maintenance'].map((p) => ({
      phase: p,
      label: phaseLabel(p),
      count: rows.filter((r) => r.phase === p).length,
    })),
  };
}

/** Kolom CSV pemantauan - dipakai tombol ekspor di layar peneliti. */
export const MONITOR_COLUMNS = [
  'code', 'school', 'tier', 'day', 'totalDays', 'phase', 'startedOn', 'lastSeen', 'lastSeenDays',
  'sessionsToday', 'sessionsTotal', 'sessionsCompleted', 'focusMinutes', 'hpMean',
  'emaAnswered', 'emaDelivered', 'emaRate', 'nudgeShown', 'nudgeAccepted',
  'fidelityDays', 'fidelityBad', 'posttestOn', 'followupOn', 'flags',
];

export function monitorCsvRows(rows = []) {
  return rows.map((r) => Object.fromEntries(
    MONITOR_COLUMNS.map((c) => [c, c === 'flags' ? (r.flags || []).join('; ') : r[c] ?? '']),
  ));
}
