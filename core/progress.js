/* Progresi gamifikasi: XP, level, evolusi companion, streak.
   Semua fungsi murni: menerima state, mengembalikan state baru. Tidak menyentuh DOM
   maupun penyimpanan, supaya bisa diuji dan tidak pernah menimbulkan efek samping ganda. */

import { wibDate, dayDiff } from './tier.js';

export const PROFILES = { SPROUT: 'sprout', SPARK: 'spark' };

/** Kurva XP: 100, 150, 200, 250, ... (100 + 50 * (level - 1)). */
export function xpToNext(level) {
  return 100 + 50 * (Math.max(1, level) - 1);
}

/** Level dari total XP kumulatif. Level 1 adalah awal. */
export function levelFromXp(totalXp) {
  let level = 1;
  let remaining = Math.max(0, Number(totalXp) || 0);
  while (remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level += 1;
    if (level > 99) break;              // pagar pengaman terhadap loop tak berujung
  }
  return level;
}

/** XP yang sudah terkumpul di dalam level saat ini, dan sisa yang dibutuhkan. */
export function levelBreakdown(totalXp) {
  let level = 1;
  let remaining = Math.max(0, Number(totalXp) || 0);
  while (remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level += 1;
    if (level > 99) break;
  }
  const need = xpToNext(level);
  return {
    level,
    intoLevel: remaining,
    need,
    percent: Math.min(100, Math.round((remaining / need) * 100)),
  };
}

/** Tahap evolusi: 1 (level < 4), 2 (4-6), 3 (level >= 7). */
export function evolutionStage(level) {
  if (level >= 7) return 3;
  if (level >= 4) return 2;
  return 1;
}

/** Berkas gambar companion. Nama file harus cocok dengan folder /assets/img. */
export function companionArt(profile, level) {
  const p = profile === PROFILES.SPARK ? PROFILES.SPARK : PROFILES.SPROUT;
  return `/assets/img/companion-${p}-${evolutionStage(level)}.webp`;
}

export function companionName(profile) {
  return profile === PROFILES.SPARK ? 'Spark' : 'Sprout';
}

/** Nama tahap yang ditampilkan ke partisipan. */
export function stageName(profile, level) {
  const stage = evolutionStage(level);
  const names = {
    [PROFILES.SPROUT]: ['Kuncup', 'Setengah Mekar', 'Mekar Penuh'],
    [PROFILES.SPARK]: ['Percik', 'Nyala', 'Supernova'],
  };
  return (names[profile] ?? names[PROFILES.SPROUT])[stage - 1];
}

/**
 * Menambahkan XP. Mengembalikan state baru + info apakah naik level/evolusi,
 * supaya UI bisa memutuskan menampilkan animasi tanpa menghitung ulang.
 */
export function awardXp(state, amount) {
  const add = Math.max(0, Math.round(Number(amount) || 0));
  const beforeLevel = levelFromXp(state.xp || 0);
  const xp = (state.xp || 0) + add;
  const level = levelFromXp(xp);
  return {
    state: { ...state, xp, level },
    gained: add,
    leveledUp: level > beforeLevel,
    evolved: evolutionStage(level) > evolutionStage(beforeLevel),
    level,
  };
}

/**
 * Mencatat aktivitas hari ini untuk streak, berbasis tanggal kalender WIB.
 * Hari yang sama = tidak berubah. Hari berurutan = +1. Ada jeda = kembali ke 1.
 */
export function registerSession(state, ts) {
  const today = wibDate(ts);
  const last = state.lastSessionDate || null;
  if (last === today) return { ...state };
  const gap = last ? dayDiff(last, today) : null;
  const streak = gap === 1 ? (state.streak || 0) + 1 : 1;
  return { ...state, streak, lastSessionDate: today, longestStreak: Math.max(state.longestStreak || 0, streak) };
}

/**
 * Streak berisiko: ada streak berjalan, tapi hari ini belum ada sesi.
 * Dipakai bucket nudge "streakRisk".
 */
export function isStreakAtRisk(state, ts) {
  if (!state.streak || state.streak < 1) return false;
  return state.lastSessionDate !== wibDate(ts);
}

/** Rerata fokus dari 2 entri EMA terakhir. null bila belum ada data. */
export function recentFocusMean(emaEntries = []) {
  const answered = emaEntries.filter((e) => e && e.responded !== false && Number.isFinite(Number(e.focus)));
  if (!answered.length) return null;
  const last2 = answered.slice(-2);
  return last2.reduce((sum, e) => sum + Number(e.focus), 0) / last2.length;
}

/**
 * Profil aktif partisipan.
 * Sumber kebenarannya adalah hasil pretest (klasifikasi IUS-12 vs SMD); field pada
 * participant hanya cadangan. Urutan ini penting: kalau dibalik, partisipan bisa
 * melihat companion yang tidak sesuai hasil klasifikasinya.
 */
export function activeProfile(state = {}) {
  const p = state.pretest?.profile || state.participant?.profile;
  return p === PROFILES.SPARK ? PROFILES.SPARK : PROFILES.SPROUT;
}

/** Ringkasan untuk kartu companion di Beranda. */
export function progressSummary(state) {
  const { level, intoLevel, need, percent } = levelBreakdown(state.xp || 0);
  const profile = activeProfile(state);
  return {
    level,
    intoLevel,
    need,
    percent,
    profile,
    stage: evolutionStage(level),
    stageName: stageName(profile, level),
    art: companionArt(profile, level),
    name: companionName(profile),
    streak: state.streak || 0,
    xp: state.xp || 0,
  };
}
