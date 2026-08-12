/* Perekat antara mesin EMA yang murni (core/ema.js) dan penyimpanan (Store + Sync).

   Dipisah dari core/ema.js supaya seluruh aturan penelitian - jadwal, jendela jawab,
   impulse = 6 - control - tetap bisa diuji tanpa Store dan tanpa browser. Di sini
   hanya ada efek samping: menyimpan, mengantre kirim, mencatat fidelitas. */

import { Store, Sync } from './store.js';
import { APP_VERSION } from './config.js';
import { now } from './env.js';
import { wibDate, studyDay, computePhase, isStudyOver } from './tier.js';
import { activeProfile } from './progress.js';
import { NUDGE_EVENT } from './nudge.js';
import { buildDailyChecklist, hasChecklistFor } from './fidelity.js';
import {
  ensureSchedule, sweepSignals, findDueSignal, nextSignal, buildPostSessionSignal,
  buildEntry, buildMissedEntry, recordEntry, complianceSummary, dailyCompliance,
  SIGNAL_TYPE, STATUS,
} from './ema.js';

/* Baris ema_signals dikirim SEKALI saja, saat sinyal dibuat, dengan status 'pending'.
   Antrean sinkron memakai upsert dengan ignoreDuplicates, jadi pengiriman ulang tidak
   akan memperbarui status di server. Itu disengaja: hasil tiap sinyal sudah terekam
   di ema_entries (responded true/false), sehingga tabel jadwal cukup menjawab satu
   pertanyaan saja - "sinyal apa yang dikirim ke partisipan ini" - dan tetap
   tambah-saja seperti seluruh data penelitian lainnya. */

function signalRow(signal, participantId) {
  return {
    participant_id: participantId ?? null,
    signal_id: signal.signalId,
    signal_type: signal.type ?? SIGNAL_TYPE.SCHEDULED,
    session_id: signal.sessionId ?? null,
    scheduled_at: signal.scheduledAt,
    stratum: signal.stratum,
    study_day: signal.studyDay,
    tier: signal.tier,
    phase: signal.phase,
    status: signal.status,
  };
}

function enqueueSignal(signal) {
  Sync.enqueue('ema_signals', signalRow(signal, Store.get().participant?.id ?? null),
    { conflict: 'signal_id' });
}

/**
 * Dipanggil sekali saat boot: buat jadwal hari ini bila belum ada, tutup sinyal yang
 * jendelanya sudah lewat, lalu tulis checklist fidelitas kemarin.
 *
 * Urutannya penting - menjadwalkan dulu, baru menyapu. Kalau dibalik, sinyal yang
 * baru dibuat untuk hari ini bisa langsung ikut tersapu pada perangkat yang jamnya
 * bergeser.
 */
export function bootstrapEma(ts = now()) {
  const state = Store.get();

  const baru = ensureSchedule(state, ts);
  if (baru.length) {
    Store.update((s) => ({ ...s, emaSignals: [...(s.emaSignals || []), ...baru] }));
    for (const s of baru) enqueueSignal(s);
  }

  const { signals, changed } = sweepSignals(Store.get().emaSignals || [], ts);
  if (changed) {
    const terlewat = signals.filter((s) => s.status === STATUS.MISSED && s.closedAt);
    Store.update((s) => ({ ...s, emaSignals: signals }));

    // NONRESPONS = DATA. Satu baris ema_entries dengan responded=false untuk tiap
    // sinyal yang lewat, supaya denominator kepatuhan utuh saat analisis.
    for (const s of terlewat) {
      const sudahAda = (Store.get().emaEntries || []).some((e) => e.signal_id === s.signalId);
      if (sudahAda) continue;
      const row = buildMissedEntry(s, Date.parse(s.closedAt), APP_VERSION);
      Store.push('emaEntries', row);
      Sync.enqueue('ema_entries', { ...row, participant_id: Store.get().participant?.id ?? null },
        { conflict: 'client_id' });
    }
    Store.flush();
  }

  const fidelity = writeDailyChecklist(ts);
  return { scheduled: baru.length, missed: changed, fidelity };
}

/* --- EMA pasca-sesi --- */

/**
 * Membuat sinyal EMA yang melekat pada sesi Kubah yang baru saja ditutup.
 *
 * Inilah pop-up yang diminta Bab 3 3.4.d dan yang selama ini tidak pernah muncul:
 * sebelumnya sesi berakhir langsung ke layar hasil, sehingga satu-satunya EMA yang
 * pernah ada hanyalah tiga sinyal acak harian.
 *
 * Mengembalikan null - bukan sinyal kosong - bila partisipan belum terdaftar atau
 * studinya sudah lewat, karena baris EMA tanpa fase dan hari studi tidak bisa dipakai
 * dalam analisis mana pun.
 */
export function triggerPostSessionEma(sessionRow, ts = now()) {
  if (!sessionRow?.client_id) return null;
  const s = Store.get();
  const p = s.participant;
  if (!p?.tier || !p?.startedOn) return null;

  const day = sessionRow.study_day ?? studyDay(p.startedOn, ts);
  if (day < 1 || isStudyOver(p.tier, day)) return null;

  // Satu sesi hanya boleh memicu satu sinyal, sekeras apa pun tombolnya ditekan.
  const sudahAda = (s.emaSignals || []).some((x) => x && x.sessionId === sessionRow.client_id);
  if (sudahAda) return null;

  const signal = buildPostSessionSignal({
    sessionId: sessionRow.client_id,
    tier: p.tier,
    phase: sessionRow.phase ?? computePhase(p.tier, day),
    studyDay: day,
    ts,
  });

  Store.update((x) => ({ ...x, emaSignals: [...(x.emaSignals || []), signal] }));
  Store.flush();
  enqueueSignal(signal);
  return signal;
}

/* --- Pembacaan --- */

/** Sinyal yang sedang jatuh tempo, atau null. Dipakai gerbang router dan Beranda. */
export function dueSignal(ts = now()) {
  return findDueSignal(Store.get().emaSignals || [], ts);
}

export function upcomingSignal(ts = now()) {
  return nextSignal(Store.get().emaSignals || [], ts);
}

export function emaCompliance() {
  return complianceSummary(Store.get().emaSignals || []);
}

/** Kepatuhan sinyal terjadwal HARI INI saja - untuk kartu "x dari 3" di Beranda. */
export function todayCompliance(ts = now()) {
  return dailyCompliance(Store.get().emaSignals || [], wibDate(ts));
}

/**
 * Menyapu sinyal kedaluwarsa tanpa menjadwalkan apa pun.
 * Dipakai pengawas berkala di router, yang berjalan tiap menit selama aplikasi
 * terbuka. Sengaja tidak memanggil bootstrapEma(): menjadwalkan ulang setiap menit
 * berisiko membuat jadwal ganda saat tengah malam WIB terlewati.
 */
export function sweepNow(ts = now()) {
  const { signals, changed } = sweepSignals(Store.get().emaSignals || [], ts);
  if (!changed) return 0;
  const terlewat = signals.filter((s) => s.status === STATUS.MISSED && s.closedAt);
  Store.update((s) => ({ ...s, emaSignals: signals }));
  for (const s of terlewat) {
    const sudahAda = (Store.get().emaEntries || []).some((e) => e.signal_id === s.signalId);
    if (sudahAda) continue;
    const row = buildMissedEntry(s, Date.parse(s.closedAt), APP_VERSION);
    Store.push('emaEntries', row);
    Sync.enqueue('ema_entries', { ...row, participant_id: Store.get().participant?.id ?? null },
      { conflict: 'client_id' });
  }
  Store.flush();
  return changed;
}

/* --- Penulisan jawaban --- */

/**
 * Menyimpan jawaban EMA. Mengembalikan { row, mana, gained }.
 * Data ditulis ke perangkat lebih dulu, pengiriman menyusul - partisipan yang
 * sedang tanpa sinyal tidak boleh kehilangan datanya.
 */
export function submitEma({ signal, focus, control, context, coping = null, ts = now() }) {
  const row = buildEntry({ signal, focus, control, context, coping, ts, appVersion: APP_VERSION });
  const result = recordEntry(Store.get(), row);
  Store.update(() => result.state);
  Store.flush();

  Sync.enqueue('ema_entries', { ...row, participant_id: Store.get().participant?.id ?? null },
    { conflict: 'client_id' });

  return { row, mana: result.mana, gained: result.gained };
}

/* --- Checklist fidelitas harian (Bab 3 3.7) --- */

/**
 * Menulis satu baris checklist untuk HARI KEMARIN, bukan hari ini.
 *
 * Hari ini belum selesai: nudge sore hari belum tentu sudah tampil, dan sinyal EMA
 * malam belum ditutup. Baris fidelitas yang ditulis siang hari akan mencatat
 * "nudge tidak terkirim" untuk hari yang sebenarnya masih berjalan - lalu tersimpan
 * permanen sebagai pelanggaran fidelitas yang tidak pernah terjadi.
 */
export function writeDailyChecklist(ts = now()) {
  const s = Store.get();
  const p = s.participant;
  if (!p?.tier || !p?.startedOn) return null;

  const kemarin = wibDate(ts - 86_400_000);
  if (hasChecklistFor(s.fidelityLog || [], kemarin)) return null;

  const day = studyDay(p.startedOn, ts) - 1;
  if (day < 1) return null;                       // kemarin belum masuk masa studi
  if (isStudyOver(p.tier, day)) return null;      // kemarin sudah di luar masa studi

  const phase = computePhase(p.tier, day);
  const nudge = (s.nudgeLog || []).filter((r) => r.entry_date === kemarin);
  const sinyal = (s.emaSignals || []).filter(
    (x) => x && wibDate(Date.parse(x.scheduledAt)) === kemarin,
  );
  const sesi = (s.sessions || []).filter((r) => r.session_date === kemarin);

  const row = buildDailyChecklist({
    participantId: p.id ?? null,
    entryDate: kemarin,
    studyDay: day,
    tier: p.tier,
    phase,
    profile: activeProfile(s),
    nudgeShown: nudge.filter((r) => r.event === NUDGE_EVENT.SHOWN).length,
    nudgeAccepted: nudge.filter((r) => r.event === NUDGE_EVENT.ACCEPTED).length,
    emaDelivered: sinyal.filter((x) => x.status !== STATUS.PENDING).length,
    emaAnswered: sinyal.filter((x) => x.status === STATUS.ANSWERED).length,
    sessionsStarted: sesi.length,
    sessionsCompleted: sesi.filter((r) => r.outcome === 'completed').length,
    appVersion: APP_VERSION,
    ts,
  });

  Store.push('fidelityLog', row);
  Store.flush();
  Sync.enqueue('fidelity_log', row, { conflict: 'client_id' });
  return row;
}
