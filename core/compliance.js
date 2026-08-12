/* Ambang kepatuhan minimum (Bab 3 3.6, "Penanganan Data Hilang dan Non-Kepatuhan").

   Bab 3 menetapkan adanya ambang kepatuhan minimum sebagai kriteria data dianggap
   lengkap pada tiap fase, tetapi tidak menyebut angkanya. Angka di bawah adalah usulan
   yang WAJIB dikonfirmasi pembimbing lalu dituliskan eksplisit di Bab 3 - dan sengaja
   ditaruh di satu tempat supaya begitu angkanya berubah, layar peneliti dan pelaporan
   ikut berubah bersamaan.

   Yang TIDAK dilakukan modul ini: membuang siapa pun. Ia hanya menandai. Keputusan
   inklusi tetap milik peneliti, dan partisipan di bawah ambang tetap dilaporkan -
   itu bunyi Bab 3, dan itu pula yang membedakan pelaporan jujur dari data yang
   dirapikan diam-diam. */

import { PHASE } from './tier.js';

/** Rasio minimum sinyal EMA terjawab per fase. Rujukan lazim literatur EMA: 0,6-0,8. */
export const EMA_MIN_RATE = 0.6;

/** Minimum titik data sesi per fase - syarat 3-5 titik pada desain multiple-baseline. */
export const MIN_DATA_POINTS = 3;

export const THRESHOLD_NOTE =
  `EMA >= ${Math.round(EMA_MIN_RATE * 100)}% sinyal terjawab dan >= ${MIN_DATA_POINTS} titik data sesi per fase`;

const COUNTED_PHASES = [PHASE.BASELINE, PHASE.INTERVENTION];

/** Ringkasan kepatuhan untuk SATU fase. */
export function phaseCompliance(signals = [], sessions = [], phase) {
  const s = signals.filter((x) => x && x.phase === phase);
  const delivered = s.filter((x) => x.status !== 'pending').length;
  const answered = s.filter((x) => x.status === 'answered').length;
  const rate = delivered ? answered / delivered : null;
  const points = sessions.filter((x) => x && x.phase === phase).length;

  return {
    phase,
    delivered,
    answered,
    missed: delivered - answered,
    // null, bukan 0: belum ada sinyal terkirim berarti belum ada penyebut.
    rate: rate === null ? null : Number(rate.toFixed(4)),
    dataPoints: points,
    meetsEma: rate !== null && rate >= EMA_MIN_RATE,
    meetsPoints: points >= MIN_DATA_POINTS,
    // Fase tanpa sinyal sama sekali BUKAN fase yang lulus - ia fase yang belum bisa dinilai.
    complete: rate !== null && rate >= EMA_MIN_RATE && points >= MIN_DATA_POINTS,
  };
}

/** Kepatuhan baseline dan intervensi sekaligus. Maintenance dan pra-studi tidak dinilai:
    keduanya di luar perbandingan Tau-U. */
export function complianceReport(state = {}) {
  const signals = state.emaSignals || [];
  const sessions = state.sessions || [];
  const phases = COUNTED_PHASES.map((p) => phaseCompliance(signals, sessions, p));
  return {
    threshold: { emaMinRate: EMA_MIN_RATE, minDataPoints: MIN_DATA_POINTS, note: THRESHOLD_NOTE },
    phases,
    // "flagged" berarti dilaporkan terpisah, BUKAN dibuang.
    flagged: phases.filter((p) => !p.complete).map((p) => p.phase),
    allComplete: phases.every((p) => p.complete),
  };
}
