/* Checklist fidelitas harian (Bab 3 3.7).

   Inti berkas ini satu kalimat: fidelity_ok membandingkan apa yang SEHARUSNYA terjadi
   menurut fase dengan apa yang BENAR-BENAR terjadi. Karena itu ia menangkap dua
   penyimpangan berlawanan arah - nudge bocor ke baseline, dan nudge gagal muncul di
   intervensi. Keduanya sama-sama membatalkan klaim kausal desain multiple-baseline,
   jadi keduanya harus tercatat, bukan hanya yang pertama. */

import { describe, t, eq, ok } from './harness.js';
import { FIDELITY_EVENT, buildDailyChecklist, hasChecklistFor } from '../core/fidelity.js';
import { PHASE } from '../core/tier.js';

const TS = Date.parse('2026-08-12T21:00:00+07:00');
const dasar = {
  participantId: 'p1', entryDate: '2026-08-12', studyDay: 6, tier: 2,
  profile: 'sprout', appVersion: '0.7.0', ts: TS,
};
const baris = (extra) => buildDailyChecklist({ ...dasar, ...extra });

describe('fidelitas: harapan diturunkan dari fase', () => {
  t('baseline: nudge memang tidak diharapkan', () => {
    const r = baris({ phase: PHASE.BASELINE, nudgeShown: 0 });
    eq(r.expected_nudge, false);
    eq(r.nudge_delivered, false);
    eq(r.fidelity_ok, true);
  });

  t('intervensi: nudge diharapkan dan muncul', () => {
    const r = baris({ phase: PHASE.INTERVENTION, nudgeShown: 2, nudgeAccepted: 1 });
    eq(r.expected_nudge, true);
    eq(r.nudge_delivered, true);
    eq(r.fidelity_ok, true);
  });

  t('penyimpangan 1: nudge bocor ke baseline ditandai gagal', () => {
    const r = baris({ phase: PHASE.BASELINE, nudgeShown: 1 });
    eq(r.fidelity_ok, false);
    eq(r.nudge_shown, 1);
  });

  t('penyimpangan 2: intervensi tanpa nudge juga ditandai gagal', () => {
    // Sisi ini yang paling mudah terlewat. Hari intervensi yang sepi nudge berarti
    // partisipan sebenarnya tidak menerima perlakuan pada hari itu.
    const r = baris({ phase: PHASE.INTERVENTION, nudgeShown: 0 });
    eq(r.fidelity_ok, false);
  });

  t('batas: satu nudge saja sudah dihitung terkirim', () => {
    eq(baris({ phase: PHASE.INTERVENTION, nudgeShown: 1 }).nudge_delivered, true);
    eq(baris({ phase: PHASE.INTERVENTION, nudgeShown: 0 }).nudge_delivered, false);
  });
});

describe('fidelitas: isi baris', () => {
  t('baris memuat konteks yang diperlukan untuk audit', () => {
    const r = baris({ phase: PHASE.INTERVENTION, nudgeShown: 1, emaDelivered: 3, emaAnswered: 2, sessionsStarted: 2, sessionsCompleted: 1 });
    eq(r.event, FIDELITY_EVENT);
    eq(r.entry_date, '2026-08-12');
    eq(r.study_day, 6);
    eq(r.tier, 2);
    eq(r.phase, PHASE.INTERVENTION);
    eq(r.profile, 'sprout');
    eq(r.ema_delivered, 3);
    eq(r.ema_answered, 2);
    eq(r.sessions_started, 2);
    eq(r.sessions_completed, 1);
    eq(r.app_version, '0.7.0');
    ok(r.occurred_at.startsWith('2026-08-12'));
  });

  t('hitungan default nol, bukan undefined yang lolos ke basis data', () => {
    const r = buildDailyChecklist({ entryDate: '2026-08-12', studyDay: 1, tier: 1, phase: PHASE.BASELINE, ts: TS });
    for (const k of ['nudge_shown', 'nudge_accepted', 'ema_delivered', 'ema_answered', 'sessions_started', 'sessions_completed']) {
      eq(r[k], 0, `${k} harus 0`);
    }
  });

  t('client_id deterministik: dua kali membentuk baris hari yang sama tidak menggandakan data', () => {
    eq(baris({ phase: PHASE.BASELINE }).client_id, baris({ phase: PHASE.BASELINE, nudgeShown: 3 }).client_id);
    eq(baris({ phase: PHASE.BASELINE }).client_id, 'fidelity:p1:2026-08-12');
  });

  t('tanggal berbeda menghasilkan client_id berbeda', () => {
    ok(baris({ phase: PHASE.BASELINE }).client_id !== baris({ phase: PHASE.BASELINE, entryDate: '2026-08-13' }).client_id);
  });
});

describe('fidelitas: pencegah baris ganda', () => {
  const log = [
    { event: FIDELITY_EVENT, entry_date: '2026-08-11' },
    { event: 'dome_broken', entry_date: '2026-08-12' },
  ];

  t('tanggal yang sudah tercatat dikenali', () => eq(hasChecklistFor(log, '2026-08-11'), true));
  t('tanggal yang belum tercatat dikenali', () => eq(hasChecklistFor(log, '2026-08-12'), false));
  t('peristiwa lain di tanggal sama tidak dianggap checklist', () => {
    eq(hasChecklistFor([{ event: 'dome_broken', entry_date: '2026-08-12' }], '2026-08-12'), false);
  });
  t('log kosong aman', () => {
    eq(hasChecklistFor([], '2026-08-12'), false);
    eq(hasChecklistFor(undefined, '2026-08-12'), false);
  });
});
