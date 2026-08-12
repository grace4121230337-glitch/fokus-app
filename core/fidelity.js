/* Log checklist fidelitas harian (Bab 3 3.7).

   Bab 3 meminta fidelitas prosedural diverifikasi lewat log checklist HARIAN OTOMATIS
   yang mencatat apakah nudge dan elemen kondisi Sprout/Spark terkirim sesuai jadwal
   untuk setiap partisipan.

   Sebelumnya aplikasi hanya mencatat empat peristiwa lepas (consent, pretest, kubah
   retak, validitas sosial). Itu bukan checklist harian, dan tidak bisa menjawab
   pertanyaan yang sebenarnya diajukan Bab 3: pada hari ke-n, apakah partisipan ini
   benar-benar menerima perlakuan yang seharusnya?

   Baris di bawah menjawabnya per hari per partisipan, termasuk untuk hari-hari
   baseline - sebab bukti bahwa nudge TIDAK terkirim selama baseline sama pentingnya
   dengan bukti bahwa ia terkirim selama intervensi. Murni: tanpa Store, tanpa jaringan. */

import { PHASE } from './tier.js';

export const FIDELITY_EVENT = 'daily_checklist';

/**
 * Membentuk satu baris checklist harian.
 *
 * expected_nudge diturunkan dari FASE, bukan dari apa yang kebetulan terjadi. Dengan
 * begitu fidelity_ok bernilai false pada dua penyimpangan yang berlawanan arah:
 * nudge bocor ke baseline, ATAU nudge gagal muncul di intervensi. Keduanya merusak
 * desain multiple-baseline, jadi keduanya harus terlihat di log.
 */
export function buildDailyChecklist({
  participantId = null, entryDate, studyDay, tier, phase, profile,
  nudgeShown = 0, nudgeAccepted = 0,
  emaDelivered = 0, emaAnswered = 0,
  sessionsStarted = 0, sessionsCompleted = 0,
  appVersion = null, ts,
}) {
  const expectedNudge = phase === PHASE.INTERVENTION;
  const nudgeDelivered = nudgeShown > 0;

  return {
    client_id: `fidelity:${participantId ?? 'local'}:${entryDate}`,
    participant_id: participantId,
    event: FIDELITY_EVENT,
    entry_date: entryDate,
    study_day: studyDay,
    tier,
    phase,
    profile,
    expected_nudge: expectedNudge,
    nudge_delivered: nudgeDelivered,
    nudge_shown: nudgeShown,
    nudge_accepted: nudgeAccepted,
    ema_delivered: emaDelivered,
    ema_answered: emaAnswered,
    sessions_started: sessionsStarted,
    sessions_completed: sessionsCompleted,
    fidelity_ok: expectedNudge === nudgeDelivered,
    occurred_at: new Date(ts).toISOString(),
    app_version: appVersion,
  };
}

/** Sudah ada checklist untuk tanggal ini? Mencegah baris ganda saat aplikasi dibuka
    berkali-kali dalam sehari. */
export function hasChecklistFor(log = [], entryDate) {
  return log.some((r) => r && r.event === FIDELITY_EVENT && r.entry_date === entryDate);
}
