/* Logika tier & fase SCED. Ini otak desain penelitian: kalau file ini salah,
   seluruh analisis Tau-U ikut salah. Karena itu semuanya fungsi murni + diuji. */

import { now } from './env.js';

/** Total partisipan (sudah dikoreksi menjadi 14). */
export const N_TOTAL = 14;

/**
 * Konfigurasi tier multiple-baseline. Angka di sini DIAMBIL LANGSUNG dari Bab 3:
 * - kuota tier: 4, 4, 3, 3 partisipan (Bab 3 §3.1)
 * - baseline  : 5, 6, 7, 8 hari (Bab 3 §3.6 "Fase Baseline")
 * - intervensi: 7, 6, 5, 5 hari (Bab 3 §3.6 "Fase Intervensi")
 *
 * total dihitung, bukan ditulis manual, supaya tidak mungkin berbeda dari
 * baseline + intervensi. Perhatikan: total tier 1-3 adalah 12 hari dan tier 4
 * adalah 13 hari - bukan 12/12/13/13.
 */
const TIER_SOURCE = {
  1: { quota: 4, baseline: 5, intervention: 7 },
  2: { quota: 4, baseline: 6, intervention: 6 },
  3: { quota: 3, baseline: 7, intervention: 5 },
  4: { quota: 3, baseline: 8, intervention: 5 },
};

export const TIERS = Object.fromEntries(
  Object.entries(TIER_SOURCE).map(([tier, cfg]) => [
    tier,
    { ...cfg, total: cfg.baseline + cfg.intervention },
  ]),
);

export const PHASE = {
  PRE: 'pre',
  BASELINE: 'baseline',
  INTERVENTION: 'intervention',
  MAINTENANCE: 'maintenance',
};

const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function tierConfig(tier) {
  const cfg = TIERS[Number(tier)];
  if (!cfg) throw new Error(`Tier tidak valid: ${tier}`);
  return cfg;
}

/**
 * Tanggal kalender WIB sebagai 'YYYY-MM-DD'.
 * Semua penentuan "hari studi", streak, dan jadwal EMA memakai ini, BUKAN zona
 * waktu perangkat, supaya data 14 partisipan tetap sebanding.
 */
export function wibDate(ts = now()) {
  return new Date(Number(ts) + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Jam WIB 0-23. Dipakai aturan nudge (mis. risiko streak pada sore/malam). */
export function wibHour(ts = now()) {
  return new Date(Number(ts) + WIB_OFFSET_MS).getUTCHours();
}

/** Timestamp ms untuk jam tertentu pada suatu tanggal WIB. */
export function wibTimestamp(dateStr, hour = 0, minute = 0) {
  return Date.parse(`${dateStr}T00:00:00Z`) - WIB_OFFSET_MS + hour * 3_600_000 + minute * 60_000;
}

/** Selisih hari kalender WIB: dayDiff('2026-08-10','2026-08-12') === 2 */
export function dayDiff(fromDateStr, toDateStr) {
  return Math.round((Date.parse(`${toDateStr}T00:00:00Z`) - Date.parse(`${fromDateStr}T00:00:00Z`)) / DAY_MS);
}

/** Tanggal WIB + n hari. */
export function addDays(dateStr, n) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Hari studi berbasis 1. Hari partisipan mulai = hari 1.
 * Mengembalikan 0 bila belum mulai (startedOn kosong).
 */
export function studyDay(startedOn, ts = now()) {
  if (!startedOn) return 0;
  return dayDiff(startedOn, wibDate(ts)) + 1;
}

/**
 * Fase untuk hari studi tertentu.
 * hari <= baseline           -> baseline (Kubah polos, TANPA nudge tailored)
 * baseline < hari <= total   -> intervensi (nudge adaptif aktif)
 * hari > total               -> maintenance (studi selesai, aplikasi tetap bisa dipakai)
 */
export function computePhase(tier, day) {
  if (!day || day < 1) return PHASE.PRE;
  const { baseline, total } = tierConfig(tier);
  if (day <= baseline) return PHASE.BASELINE;
  if (day <= total) return PHASE.INTERVENTION;
  return PHASE.MAINTENANCE;
}

/** Benar bila seluruh periode pengumpulan data sudah lewat. */
export function isStudyOver(tier, day) {
  return day > tierConfig(tier).total;
}

/** Hari pertama intervensi (dipakai sebagai titik potong visual pada grafik Tau-U). */
export function interventionStartDay(tier) {
  return tierConfig(tier).baseline + 1;
}

/** Ringkasan progres untuk ditampilkan di Beranda. */
export function studyProgress(tier, startedOn, ts = now()) {
  const cfg = tierConfig(tier);
  const day = studyDay(startedOn, ts);
  const phase = computePhase(tier, day);
  return {
    tier: Number(tier),
    day,
    total: cfg.total,
    baselineDays: cfg.baseline,
    phase,
    over: isStudyOver(tier, day),
    daysLeft: Math.max(0, cfg.total - day),
    percent: Math.min(100, Math.round((Math.max(0, day) / cfg.total) * 100)),
  };
}

/** Label bahasa Indonesia yang netral - partisipan tidak boleh tahu ini fase kontrol. */
export function phaseLabel(phase) {
  return {
    [PHASE.PRE]: 'Persiapan',
    [PHASE.BASELINE]: 'Pemantauan',
    [PHASE.INTERVENTION]: 'Pendampingan',
    [PHASE.MAINTENANCE]: 'Selesai',
  }[phase] ?? 'Persiapan';
}

/** Total hari lintas seluruh tier - untuk kalkulasi kuota peneliti. */
export function allTiers() {
  return Object.entries(TIERS).map(([tier, cfg]) => ({ tier: Number(tier), ...cfg }));
}
