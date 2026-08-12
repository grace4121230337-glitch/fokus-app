/* Tahap studi setelah fase intervensi berakhir (Bab 3 3.6).

   Bab 3 menyebut lima tahap: penyaringan, baseline, intervensi, PASCATES, dan
   MAINTENANCE/FOLLOW-UP. Dua tahap terakhir sebelumnya tidak pernah dijalankan
   aplikasi - POSTTEST_ORDER sudah ada di core/instruments.js tetapi tidak satu layar
   pun memanggilnya, dan penjadwalan berhenti total begitu masa studi habis. Akibatnya
   dua dari lima tahap prosedur hanya hidup di naskah.

   Berkas ini yang menentukan urutannya. Murni: menerima state, mengembalikan nama
   tahap - tidak menyentuh Store, DOM, maupun jaringan. */

import { studyDay, isStudyOver, tierConfig } from './tier.js';
import { now } from './env.js';

/**
 * Jarak hari antara hari terakhir studi dan probe follow-up.
 *
 * Bab 3 meminta probe susulan setelah pascates tanpa menyebut angka. Tujuh hari
 * dipilih karena cukup jauh untuk membedakan efek yang bertahan dari efek yang hanya
 * muncul selagi aplikasi aktif, tetapi masih cukup dekat agar partisipan bisa
 * dihubungi sebelum masa lomba berakhir. Angka ini WAJIB dikonfirmasi pembimbing dan
 * dituliskan eksplisit di Bab 3.
 */
export const FOLLOWUP_DELAY_DAYS = 7;

export const STAGE = {
  RUNNING: 'running',       // baseline atau intervensi masih berjalan
  POSTTEST: 'posttest',     // APS-S + SMD ulang, refleksi, penghapusan identitas
  SOCIAL: 'social',         // validitas sosial (Bab 3 3.7)
  WAITING: 'waiting',       // jeda menuju probe follow-up
  FOLLOWUP: 'followup',     // probe durabilitas efek
  DONE: 'done',
};

/** Hari studi saat probe follow-up mulai boleh diisi. */
export function followupDay(tier) {
  return tierConfig(tier).total + FOLLOWUP_DELAY_DAYS;
}

export function hasPosttest(state = {}) { return Boolean(state.posttest?.completedAt); }
export function hasSocialValidity(state = {}) { return Boolean(state.socialValidity?.completedAt); }
export function hasFollowup(state = {}) { return Boolean(state.followup?.completedAt); }

/**
 * Tahap yang berlaku sekarang, mengikuti urutan Bab 3 secara harfiah:
 * intervensi selesai -> pascates -> validitas sosial -> jeda -> follow-up -> selesai.
 */
export function currentStage(state = {}, ts = now()) {
  const p = state.participant;
  if (!p?.tier || !p?.startedOn) return STAGE.RUNNING;

  const day = studyDay(p.startedOn, ts);
  if (!isStudyOver(p.tier, day)) return STAGE.RUNNING;

  if (!hasPosttest(state)) return STAGE.POSTTEST;
  if (!hasSocialValidity(state)) return STAGE.SOCIAL;
  if (hasFollowup(state)) return STAGE.DONE;

  return day >= followupDay(p.tier) ? STAGE.FOLLOWUP : STAGE.WAITING;
}

/** Sisa hari menuju probe follow-up (0 bila sudah waktunya). Untuk teks di layar. */
export function daysUntilFollowup(state = {}, ts = now()) {
  const p = state.participant;
  if (!p?.tier || !p?.startedOn) return null;
  return Math.max(0, followupDay(p.tier) - studyDay(p.startedOn, ts));
}

/**
 * Patch yang menghapus identitas partisipan di perangkat.
 *
 * Bab 3 Tahap Pascates mewajibkan nomor WhatsApp dihapus sesuai prosedur privasi yang
 * disepakati saat consent. Nomor aslinya memang tidak pernah disimpan (lihat
 * core/identity.js), jadi yang dihapus di sini hash-nya - setelah ini tidak ada lagi
 * jalan menghubungkan baris data ke nomor mana pun, bahkan bila salt-nya bocor.
 */
export function purgeIdentityPatch(participant) {
  if (!participant) return {};
  return {
    participant: {
      ...participant,
      waHash: null,
      waHint: null,
      identityPurgedAt: new Date().toISOString(),
    },
  };
}
