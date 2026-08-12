/* Perekat nudge ke Store dan antrean sinkron.

   core/nudge.js memuat seluruh aturan dan tetap murni supaya bisa diuji tanpa browser.
   Berkas ini yang tahu soal Store, jam dinding, dan pengiriman data - dan sengaja
   dibuat setipis mungkin, karena setiap aturan yang menyelinap ke sini adalah aturan
   yang tidak lagi terlindungi oleh test. */

import { Store, currentPhase, phaseOf, today } from './store.js';
import { Sync } from './supabase.js';
import { now } from './env.js';
import { wibHour } from './tier.js';
import { isStreakAtRisk, recentFocusMean, activeProfile } from './progress.js';
import { APP_VERSION } from './config.js';
import {
  buildNudge, questDoneToday, buildNudgeLogRow, DEFAULT_MINUTES, NUDGE_EVENT,
} from './nudge.js';

/** Catatan nudge hari ini untuk bucket tertentu, bila sudah pernah ditampilkan. */
function logHariIni(state, tanggal, bucket, event) {
  return (state.nudgeLog || []).find(
    (r) => r.entry_date === tanggal && r.nudge_bucket === bucket && r.event === event,
  ) || null;
}

/**
 * Nudge yang berlaku sekarang, atau null bila fase saat ini tidak menerimanya.
 *
 * Kalimatnya dikunci per hari per bucket. Kalau teksnya diundi ulang setiap kali
 * Beranda dirender, partisipan akan melihat kalimat berbeda hanya karena berpindah
 * tab - dan variasi itu masuk ke data sebagai seolah-olah beberapa nudge berbeda.
 *
 * Efek samping yang disengaja: peristiwa 'shown' dicatat sekali per hari per bucket.
 */
export function currentNudge(ts = now()) {
  const s = Store.get();
  const fase = phaseOf(s, ts);
  const prog = currentPhase(s, ts);
  if (!prog) return null;

  const tanggal = today(ts);
  const history = (s.nudgeLog || []).map((r) => r.nudge_text).filter(Boolean);

  const nudge = buildNudge({
    phase: fase,
    profile: activeProfile(s),
    questDone: questDoneToday(s.sessions || [], prog.day),
    streakAtRisk: isStreakAtRisk(s, ts),
    hourWIB: wibHour(ts),
    focusMean: recentFocusMean(s.emaEntries || []),
    history,
  });
  if (!nudge) return null;

  // Sudah pernah tampil hari ini untuk bucket yang sama: pakai kalimat yang sama.
  const lama = logHariIni(s, tanggal, nudge.bucket, NUDGE_EVENT.SHOWN);
  if (lama) return { bucket: lama.nudge_bucket, text: lama.nudge_text, minutes: lama.minutes_offered };

  const row = buildNudgeLogRow({
    nudge,
    studyDay: prog.day,
    tier: s.participant?.tier ?? null,
    phase: fase,
    profile: activeProfile(s),
    ts,
    entryDate: tanggal,
    event: NUDGE_EVENT.SHOWN,
    appVersion: APP_VERSION,
  });
  Store.push('nudgeLog', row);
  Store.flush();
  Sync.enqueue('nudge_log', { ...row, participant_id: s.participant?.id ?? null },
    { conflict: 'client_id' });

  return nudge;
}

/**
 * Mencatat bahwa partisipan benar-benar memulai sesi dari sebuah nudge.
 *
 * Dipanggil saat sesi dimulai, bukan saat tombol ditekan di Beranda, supaya yang
 * tercatat adalah perilaku yang terjadi - bukan niat yang batal di tengah jalan.
 */
export function acceptNudge(bucket, ts = now()) {
  if (!bucket) return null;
  const s = Store.get();
  const tanggal = today(ts);
  const asal = logHariIni(s, tanggal, bucket, NUDGE_EVENT.SHOWN);
  if (!asal) return null;
  if (logHariIni(s, tanggal, bucket, NUDGE_EVENT.ACCEPTED)) return null;   // sudah dicatat

  const row = buildNudgeLogRow({
    nudge: { bucket, text: asal.nudge_text, minutes: asal.minutes_offered },
    studyDay: asal.study_day,
    tier: asal.tier,
    phase: asal.phase,
    profile: asal.profile,
    ts,
    entryDate: tanggal,
    event: NUDGE_EVENT.ACCEPTED,
    appVersion: APP_VERSION,
  });
  Store.push('nudgeLog', row);
  Store.flush();
  Sync.enqueue('nudge_log', { ...row, participant_id: s.participant?.id ?? null },
    { conflict: 'client_id' });
  return row;
}

/**
 * Durasi yang ditawarkan sekarang. Selalu 25 menit di luar fase intervensi -
 * kesempatan berlatih tidak pernah ditahan, hanya penyesuaiannya.
 */
export function offeredMinutes(ts = now()) {
  return currentNudge(ts)?.minutes ?? DEFAULT_MINUTES;
}

/** Bucket yang berlaku sekarang, untuk ditulis ke kolom sessions.nudge_bucket. */
export function currentBucket(ts = now()) {
  return currentNudge(ts)?.bucket ?? null;
}

/** Ringkasan penerimaan nudge - dipakai peneliti, bukan ditampilkan ke partisipan. */
export function nudgeAcceptance(state = Store.get()) {
  const log = state.nudgeLog || [];
  const shown = log.filter((r) => r.event === NUDGE_EVENT.SHOWN).length;
  const accepted = log.filter((r) => r.event === NUDGE_EVENT.ACCEPTED).length;
  return { shown, accepted, rate: shown ? accepted / shown : null };
}
