/* Sumber kebenaran tunggal untuk state aplikasi.

   Aturan: layar tidak boleh menyimpan state sendiri. Semua baca lewat Store.get(),
   semua tulis lewat Store.patch()/update(). Ini yang membuat data konsisten ketika
   partisipan menutup aplikasi di tengah sesi lalu membukanya lagi. */

import { KEYS, APP_VERSION } from './config.js';
import { storage, uuid, now, log } from './env.js';
import { wibDate, studyProgress, computePhase, studyDay } from './tier.js';
import { Sync } from './supabase.js';

function blankState() {
  return {
    version: 1,
    appVersion: APP_VERSION,
    clientId: uuid(),                 // identitas perangkat, dipakai untuk deduplikasi
    createdAt: new Date().toISOString(),

    participant: null,                // { id, code, tier, startedOn, userId }
    consent: null,                    // { acceptedAt, statements: {s1..s4} }
    pretest: null,                    // { completedAt, scores, profile, confidence }
    posttest: null,                   // { completedAt, scores } - Bab 3 Tahap Pascates
    followup: null,                   // { completedAt, scores } - probe maintenance

    xp: 0,
    // MANA sengaja dipisah dari XP: XP diperoleh dari sesi Kubah (variabel perilaku),
    // MANA dari menjawab EMA (kepatuhan pengukuran). Kalau digabung, kepatuhan
    // mengisi kuesioner akan menaikkan level companion dan mengaburkan efek intervensi.
    mana: 0,
    level: 1,
    streak: 0,
    longestStreak: 0,
    lastSessionDate: null,

    activeSession: null,              // sesi Kubah yang belum tuntas (untuk pemulihan)
    sessions: [],
    emaSignals: [],
    emaEntries: [],
    nudgeLog: [],
    socialValidity: null,
    // Checklist fidelitas harian (Bab 3 3.7). Disimpan lokal sebagai penjaga duplikat;
    // sumber kebenarannya tetap tabel fidelity_log di server.
    fidelityLog: [],

    // Waktu terakhir mode peneliti dibuka. Bukan kata sandi, hanya penanda kunci -
    // PIN-nya sendiri tidak pernah disimpan di perangkat, lihat core/devmode.js.
    devUnlockedAt: null,

    settings: { sound: true, wakeLock: true },
  };
}

let state = null;
const listeners = new Set();
let saveTimer = null;

function persistNow() {
  try {
    storage.setItem(KEYS.state, JSON.stringify(state));
  } catch (err) {
    log('Gagal menyimpan state:', err);
  }
}

/** Simpan ditunda 150ms: mencegah puluhan penulisan saat timer Kubah berdetak. */
function schedulePersist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; persistNow(); }, 150);
}

function notify() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { log('Listener error:', err); }
  }
}

export const Store = {
  /** Memuat state dari penyimpanan. Idempoten - aman dipanggil dua kali. */
  init() {
    if (state) return state;
    let loaded = null;
    try {
      const raw = storage.getItem(KEYS.state);
      if (raw) loaded = JSON.parse(raw);
    } catch (err) {
      log('State rusak, memulai ulang:', err);
    }
    // Gabung dengan state kosong: field baru dari versi aplikasi berikutnya
    // otomatis punya nilai default, jadi pembaruan aplikasi tidak merusak data lama.
    state = loaded ? { ...blankState(), ...loaded } : blankState();
    persistNow();
    return state;
  },

  get() { return state ?? Store.init(); },

  /** Menimpa sebagian field di level teratas. */
  patch(partial) {
    state = { ...Store.get(), ...partial };
    schedulePersist();
    notify();
    return state;
  },

  /** Pembaruan berbasis fungsi: update(s => ({ ...s, xp: s.xp + 10 })). */
  update(fn) {
    const next = fn(Store.get());
    if (!next || typeof next !== 'object') throw new Error('update() harus mengembalikan state');
    state = next;
    schedulePersist();
    notify();
    return state;
  },

  /** Menambahkan item ke array di state (sessions, emaEntries, dll). */
  push(key, item) {
    return Store.update((s) => ({ ...s, [key]: [...(s[key] || []), item] }));
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Menulis segera - dipakai sebelum halaman berpotensi ditutup. */
  flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    persistNow();
  },

  /** Reset total. Hanya dipakai mode mock & tombol keluar peneliti. */
  reset() {
    state = blankState();
    persistNow();
    Sync.clear();
    notify();
    return state;
  },

  /** Khusus test: menyuntikkan state buatan tanpa menyentuh penyimpanan nyata. */
  _setForTest(partial) {
    state = { ...blankState(), ...partial };
    return state;
  },
};

/* --- Turunan state yang sering dipakai layar --- */

export function hasParticipant(s = Store.get()) { return Boolean(s.participant?.code && s.participant?.tier); }
export function hasConsent(s = Store.get())     { return Boolean(s.consent?.acceptedAt); }
export function hasPretest(s = Store.get())     { return Boolean(s.pretest?.completedAt); }

/** Ringkasan hari & fase studi. Mengembalikan null bila partisipan belum terdaftar. */
export function currentPhase(s = Store.get(), ts = now()) {
  if (!hasParticipant(s) || !s.participant.startedOn) return null;
  return studyProgress(s.participant.tier, s.participant.startedOn, ts);
}

/** Fase mentah ('baseline'|'intervention'|...) - dipakai gerbang nudge. */
export function phaseOf(s = Store.get(), ts = now()) {
  if (!hasParticipant(s) || !s.participant.startedOn) return 'pre';
  return computePhase(s.participant.tier, studyDay(s.participant.startedOn, ts));
}

/** Tanggal WIB hari ini - dipakai jadwal EMA & streak. */
export function today(ts = now()) { return wibDate(ts); }

export { Sync };
