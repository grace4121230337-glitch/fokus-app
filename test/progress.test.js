/* Test progresi: XP, level, evolusi, streak.
   Bug di sini tidak merusak data penelitian, tapi langsung merusak pengalaman
   partisipan (companion tidak berevolusi, streak hilang) - jadi tetap diuji ketat. */

import { describe, t, eq, ok, near } from './harness.js';
import {
  xpToNext, levelFromXp, levelBreakdown, evolutionStage, companionArt, companionName,
  stageName, awardXp, registerSession, isStreakAtRisk, recentFocusMean, progressSummary,
  activeProfile, PROFILES,
} from '../core/progress.js';

const base = {
  xp: 0, level: 1, streak: 0, longestStreak: 0, lastSessionDate: null,
  participant: { profile: PROFILES.SPROUT },
};

export default function run() {
  describe('progress: kurva XP');

  t('kurva 100 + 50 x (level - 1)', () => {
    eq([1, 2, 3, 4].map(xpToNext), [100, 150, 200, 250]);
  });

  t('level dihitung kumulatif, batas persis', () => {
    eq(levelFromXp(0), 1);
    eq(levelFromXp(99), 1);
    eq(levelFromXp(100), 2);
    eq(levelFromXp(249), 2);
    eq(levelFromXp(250), 3);   // 100 + 150
    eq(levelFromXp(450), 4);   // 100 + 150 + 200
  });

  t('XP negatif atau tidak valid tidak merusak level', () => {
    eq(levelFromXp(-500), 1);
    eq(levelFromXp(null), 1);
    eq(levelFromXp('abc'), 1);
  });

  t('rincian level konsisten dengan kurva', () => {
    const b = levelBreakdown(120);
    eq(b.level, 2);
    eq(b.intoLevel, 20);
    eq(b.need, 150);
    ok(b.percent === 13, `persen ${b.percent}`);
  });

  describe('progress: evolusi companion');

  t('tiga tahap dengan batas level 4 dan 7', () => {
    eq([1, 3, 4, 6, 7, 12].map(evolutionStage), [1, 1, 2, 2, 3, 3]);
  });

  t('nama berkas gambar cocok dengan aset yang dikirim', () => {
    eq(companionArt(PROFILES.SPROUT, 1), '/assets/img/companion-sprout-1.webp');
    eq(companionArt(PROFILES.SPROUT, 5), '/assets/img/companion-sprout-2.webp');
    eq(companionArt(PROFILES.SPARK, 9),  '/assets/img/companion-spark-3.webp');
  });

  t('profil tidak dikenal jatuh ke sprout, bukan gambar rusak', () => {
    eq(companionArt('entah', 1), '/assets/img/companion-sprout-1.webp');
    eq(companionName(undefined), 'Sprout');
  });

  t('nama tahap berbeda antar profil', () => {
    eq(stageName(PROFILES.SPROUT, 1), 'Kuncup');
    eq(stageName(PROFILES.SPARK, 8), 'Supernova');
  });

  describe('progress: pemberian XP');

  t('XP bertambah dan naik level terdeteksi sekali', () => {
    const r = awardXp({ ...base, xp: 90 }, 20);
    eq(r.state.xp, 110);
    eq(r.level, 2);
    ok(r.leveledUp);
    ok(!r.evolved);
  });

  t('evolusi terdeteksi saat menembus level 4', () => {
    const r = awardXp({ ...base, xp: 249 }, 250);   // 499 -> level 4
    eq(r.level, 4);
    ok(r.evolved, 'harus berevolusi ke tahap 2');
  });

  t('XP tidak pernah berkurang walau diberi nilai negatif', () => {
    const r = awardXp({ ...base, xp: 100 }, -50);
    eq(r.state.xp, 100);
    eq(r.gained, 0);
  });

  t('state asal tidak dimutasi (fungsi murni)', () => {
    const s = { ...base, xp: 10 };
    awardXp(s, 100);
    eq(s.xp, 10);
  });

  describe('progress: streak berbasis tanggal WIB');

  const d = (iso) => Date.parse(iso);

  t('sesi pertama membuat streak 1', () => {
    const s = registerSession(base, d('2026-08-10T05:00:00Z'));
    eq(s.streak, 1);
    eq(s.lastSessionDate, '2026-08-10');
  });

  t('dua sesi di hari yang sama tidak menambah streak', () => {
    const a = registerSession(base, d('2026-08-10T05:00:00Z'));
    const b = registerSession(a, d('2026-08-10T14:00:00Z'));
    eq(b.streak, 1);
  });

  t('hari berurutan menambah streak', () => {
    const a = registerSession(base, d('2026-08-10T05:00:00Z'));
    const b = registerSession(a, d('2026-08-11T05:00:00Z'));
    eq(b.streak, 2);
  });

  t('satu hari terlewat mengembalikan streak ke 1 tapi rekor tersimpan', () => {
    let s = registerSession(base, d('2026-08-10T05:00:00Z'));
    s = registerSession(s, d('2026-08-11T05:00:00Z'));
    s = registerSession(s, d('2026-08-13T05:00:00Z'));
    eq(s.streak, 1);
    eq(s.longestStreak, 2);
  });

  t('sesi pukul 23:50 dan 00:10 WIB dihitung dua hari berurutan', () => {
    const a = registerSession(base, d('2026-08-10T16:50:00Z'));  // 23:50 WIB
    const b = registerSession(a, d('2026-08-10T17:10:00Z'));     // 00:10 WIB hari berikutnya
    eq(a.lastSessionDate, '2026-08-10');
    eq(b.lastSessionDate, '2026-08-11');
    eq(b.streak, 2);
  });

  t('streak berisiko hanya bila hari ini belum ada sesi', () => {
    const s = registerSession(base, d('2026-08-10T05:00:00Z'));
    ok(!isStreakAtRisk(s, d('2026-08-10T14:00:00Z')), 'sudah ada sesi hari ini');
    ok(isStreakAtRisk(s, d('2026-08-11T14:00:00Z')), 'belum ada sesi hari ini');
    ok(!isStreakAtRisk(base, d('2026-08-11T14:00:00Z')), 'belum punya streak');
  });

  describe('progress: rerata fokus EMA');

  t('memakai dua entri terakhir yang terjawab', () => {
    near(recentFocusMean([{ focus: 5, responded: true }, { focus: 2, responded: true }, { focus: 4, responded: true }]), 3);
  });

  t('nonrespons diabaikan, bukan dihitung nol', () => {
    near(recentFocusMean([{ focus: 4, responded: true }, { responded: false }]), 4);
  });

  t('belum ada data mengembalikan null, bukan 0', () => {
    eq(recentFocusMean([]), null);
    eq(recentFocusMean([{ responded: false }]), null);
  });

  describe('progress: ringkasan Beranda');

  t('ringkasan lengkap dan aman untuk state minimal', () => {
    const s = progressSummary({ xp: 300, streak: 4, participant: { profile: PROFILES.SPARK } });
    eq(s.level, 3);
    eq(s.stage, 1);
    eq(s.profile, PROFILES.SPARK);
    eq(s.art, '/assets/img/companion-spark-1.webp');
    eq(s.streak, 4);
  });

  t('state kosong tidak membuat Beranda error', () => {
    const s = progressSummary({});
    eq(s.level, 1);
    eq(s.profile, PROFILES.SPROUT);
    eq(s.streak, 0);
  });

  describe('progress: sumber profil');

  t('profil diambil dari hasil pretest, bukan dari field participant', () => {
    // Bug yang tertangkap QA visual: layar menampilkan "Sprout" padahal hasil
    // klasifikasi pretest adalah Spark.
    eq(activeProfile({ pretest: { profile: PROFILES.SPARK } }), PROFILES.SPARK);
    eq(activeProfile({
      pretest: { profile: PROFILES.SPARK },
      participant: { profile: PROFILES.SPROUT },
    }), PROFILES.SPARK);
  });

  t('participant dipakai hanya sebagai cadangan', () => {
    eq(activeProfile({ participant: { profile: PROFILES.SPARK } }), PROFILES.SPARK);
  });

  t('tanpa data profil, jatuh ke sprout dan tidak error', () => {
    eq(activeProfile({}), PROFILES.SPROUT);
    eq(activeProfile(), PROFILES.SPROUT);
    eq(activeProfile({ pretest: { profile: 'ngawur' } }), PROFILES.SPROUT);
  });

  t('ringkasan Beranda ikut memakai profil pretest', () => {
    const s = progressSummary({ xp: 900, pretest: { profile: PROFILES.SPARK }, participant: { profile: PROFILES.SPROUT } });
    eq(s.profile, PROFILES.SPARK);
    eq(s.name, 'Spark');
    eq(s.art, `/assets/img/companion-spark-${s.stage}.webp`);
  });
}
