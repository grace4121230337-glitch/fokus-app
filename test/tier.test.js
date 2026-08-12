/* Test logika tier & fase. Ini test terpenting di repo: kalau ada yang gagal di sini,
   data penelitian akan salah label fase dan analisis Tau-U tidak sah. */

import { describe, t, eq, ok, throws } from './harness.js';
import {
  TIERS, N_TOTAL, PHASE, tierConfig, wibDate, wibHour, dayDiff, addDays,
  studyDay, computePhase, isStudyOver, interventionStartDay, studyProgress, allTiers,
} from '../core/tier.js';

export default function run() {
  describe('tier: konfigurasi');

  t('kuota seluruh tier berjumlah 14 partisipan', () => {
    const total = allTiers().reduce((sum, x) => sum + x.quota, 0);
    eq(total, N_TOTAL);
  });

  t('baseline bertingkat (inti multiple-baseline)', () => {
    eq([1, 2, 3, 4].map((x) => TIERS[x].baseline), [5, 6, 7, 8]);
  });

  t('setiap tier punya fase intervensi minimal 5 hari', () => {
    for (const { tier, baseline, total } of allTiers()) {
      ok(total - baseline >= 5, `tier ${tier} hanya ${total - baseline} hari intervensi`);
    }
  });

  t('tier tidak valid ditolak, bukan dibiarkan lolos diam-diam', () => {
    throws(() => tierConfig(5));
    throws(() => tierConfig(0));
  });

  describe('tier: tanggal WIB');

  t('pukul 23:30 WIB masih dihitung hari yang sama', () => {
    // 2026-08-10T16:30:00Z = 2026-08-10 23:30 WIB
    eq(wibDate(Date.parse('2026-08-10T16:30:00Z')), '2026-08-10');
  });

  t('pukul 00:30 WIB sudah dihitung hari berikutnya', () => {
    // 2026-08-10T17:30:00Z = 2026-08-11 00:30 WIB
    eq(wibDate(Date.parse('2026-08-10T17:30:00Z')), '2026-08-11');
  });

  t('jam WIB dihitung dari UTC+7, bukan zona perangkat', () => {
    eq(wibHour(Date.parse('2026-08-10T10:00:00Z')), 17);
    eq(wibHour(Date.parse('2026-08-10T17:00:00Z')), 0);
  });

  t('selisih dan penambahan hari melewati akhir bulan', () => {
    eq(dayDiff('2026-08-30', '2026-09-02'), 3);
    eq(addDays('2026-08-30', 3), '2026-09-02');
    eq(dayDiff('2026-08-10', '2026-08-10'), 0);
  });

  describe('tier: hari studi & fase');

  t('hari pertama adalah hari 1, bukan hari 0', () => {
    eq(studyDay('2026-08-10', Date.parse('2026-08-10T05:00:00Z')), 1);
  });

  t('hari studi bertambah sesuai kalender', () => {
    eq(studyDay('2026-08-10', Date.parse('2026-08-14T05:00:00Z')), 5);
  });

  t('belum mulai = hari 0 dan fase pra-studi', () => {
    eq(studyDay(null), 0);
    eq(computePhase(1, 0), PHASE.PRE);
  });

  t('tier 1: hari 1-5 baseline, hari 6-12 intervensi', () => {
    eq(computePhase(1, 5), PHASE.BASELINE);
    eq(computePhase(1, 6), PHASE.INTERVENTION);
    eq(computePhase(1, 12), PHASE.INTERVENTION);
  });

  t('tier 4: hari 8 masih baseline, hari 9 mulai intervensi', () => {
    eq(computePhase(4, 8), PHASE.BASELINE);
    eq(computePhase(4, 9), PHASE.INTERVENTION);
  });

  t('batas fase setiap tier persis di hari baseline + 1', () => {
    for (const { tier, baseline } of allTiers()) {
      eq(computePhase(tier, baseline), PHASE.BASELINE, `tier ${tier}`);
      eq(computePhase(tier, baseline + 1), PHASE.INTERVENTION, `tier ${tier}`);
      eq(interventionStartDay(tier), baseline + 1, `tier ${tier}`);
    }
  });

  t('lewat hari terakhir menjadi maintenance, dan studi dinyatakan selesai', () => {
    // Angka di bawah mengikuti Bab 3: baseline 5/6/7/8 dan intervensi 7/6/5/5,
    // sehingga total menjadi 12/12/12/13 - bukan 12/12/13/13 seperti asumsi awal.
    eq(computePhase(1, 13), PHASE.MAINTENANCE);
    ok(!isStudyOver(1, 12), 'hari 12 tier 1 belum selesai');
    ok(isStudyOver(1, 13), 'hari 13 tier 1 sudah selesai');
    ok(!isStudyOver(3, 12), 'tier 3 berjalan 12 hari');
    ok(isStudyOver(3, 13), 'tier 3 selesai pada hari 13');
    ok(!isStudyOver(4, 13), 'hanya tier 4 yang berjalan 13 hari');
    ok(isStudyOver(4, 14));
  });

  t('panjang intervensi setiap tier persis seperti Bab 3: 7, 6, 5, 5 hari', () => {
    eq(allTiers().map((x) => TIERS[x.tier].intervention).join(','), '7,6,5,5');
    eq(allTiers().map((x) => TIERS[x.tier].total).join(','), '12,12,12,13');
    for (const { tier } of allTiers()) {
      eq(TIERS[tier].baseline + TIERS[tier].intervention, TIERS[tier].total, `tier ${tier}`);
      ok(TIERS[tier].intervention >= 5, `tier ${tier} minimal 5 titik data intervensi`);
    }
  });

  describe('tier: ringkasan progres');

  t('ringkasan menyediakan semua angka yang dibutuhkan Beranda', () => {
    const p = studyProgress(2, '2026-08-10', Date.parse('2026-08-16T05:00:00Z'));
    eq(p.tier, 2);
    eq(p.day, 7);
    eq(p.total, 12);
    eq(p.baselineDays, 6);
    eq(p.phase, PHASE.INTERVENTION);
    eq(p.daysLeft, 5);
    ok(p.percent > 50 && p.percent < 65, 'persentase wajar');
  });

  t('persentase tidak pernah melebihi 100 walau hari terlampaui', () => {
    const p = studyProgress(1, '2026-08-01', Date.parse('2026-09-01T05:00:00Z'));
    eq(p.percent, 100);
    eq(p.daysLeft, 0);
    ok(p.over);
  });
}
