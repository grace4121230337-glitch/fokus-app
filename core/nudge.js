/* Nudge adaptif - inti variabel bebas penelitian ini.

   Berkas ini adalah PEMISAH antara fase baseline dan fase intervensi. Kalau ada satu
   berkas di aplikasi ini yang tidak boleh "dirapikan" tanpa berpikir, ini berkasnya:
   seluruh klaim kausal desain multiple-baseline bergantung pada satu fakta sederhana,
   yaitu partisipan di fase baseline TIDAK PERNAH menerima nudge yang disesuaikan.

   Kalau nudge bocor ke baseline, garis dasarnya bukan lagi garis dasar, dan kenaikan
   apa pun setelah intervensi dimulai tidak bisa lagi dikaitkan dengan perlakuan.
   Tidak ada analisis statistik yang bisa menambal kebocoran itu di belakang.

   Semua fungsi di sini murni: tanpa DOM, tanpa Store, tanpa jaringan, tanpa Math.random
   dan Date.now() yang tersembunyi. Pengacak dan jam selalu disuntikkan lewat argumen,
   supaya perilaku yang menentukan validitas penelitian bisa diuji sampai ke tiap cabang.
   Perekat ke Store ada di core/nudgeRuntime.js. */

import { PHASE } from './tier.js';
import { PROFILES } from './progress.js';

/** Ambang jam sore untuk pengingat rantai. Sebelum jam ini, hari masih panjang. */
export const STREAK_RISK_HOUR = 16;

/** Rerata fokus di bawah angka ini dianggap energi rendah. */
export const LOW_FOCUS_THRESHOLD = 2.5;

/* Durasi sesi per bucket - SEMUANYA 25 MENIT, dan itu keputusan metodologis.

   Versi sebelumnya menurunkan durasi pada bucket bertekanan (15 menit saat rantai
   berisiko, 10 menit saat energi rendah) dengan alasan target kecil lebih mungkin
   dimulai. Alasan itu masuk akal secara desain produk, tetapi merusak penelitian ini.

   Sebabnya: variabel dependen di Bab 3 mencakup durasi dan penyelesaian sesi. Kalau
   panjang sesi ikut berubah mengikuti kondisi partisipan, kenaikan angka "sesi selesai"
   di fase intervensi bisa berarti dua hal yang tidak bisa dipisahkan lagi - partisipan
   memang lebih mampu bertahan, ATAU sesinya sekadar dibuat lebih pendek sehingga lebih
   mudah diselesaikan. Itu variabel perancu yang ditanam sendiri oleh aplikasi.

   Bab 3 pun tidak pernah meminta durasi berbeda. Yang dibedakan antar-kondisi hanyalah
   ISI dan NADA nudge (Sprout vs Spark), bukan panjang sesinya. Jadi durasi ditahan
   konstan, dan seluruh perbedaan antar-fase tetap dapat diatribusikan pada nudge. */
export const SESSION_MINUTES = { done: 25, streakRisk: 25, lowEnergy: 25, normal: 25 };

export const BUCKETS = ['done', 'streakRisk', 'lowEnergy', 'normal'];

/** Label bucket untuk peneliti - tidak pernah ditampilkan ke partisipan. */
export const BUCKET_LABEL = {
  done: 'Misi hari ini sudah tuntas',
  streakRisk: 'Rantai berisiko putus',
  lowEnergy: 'Energi fokus sedang rendah',
  normal: 'Kondisi biasa',
};

/* Bank kalimat.

   Dua profil, empat bucket, tiga kalimat masing-masing. Tiga - bukan dua - supaya
   rotasi anti-habituasi punya ruang gerak: dengan hanya dua kalimat, riwayat tiga
   nudge terakhir selalu memblokir keduanya dan rotasi berubah menjadi acak biasa.

   Nada sengaja berbeda antarprofil tetapi ISI TUNTUTANNYA sama persis. Sprout
   (orientasi menghindar) mendapat kalimat yang menurunkan taruhan; Spark (orientasi
   stimulasi) mendapat kalimat yang mengarahkan energi. Yang tidak boleh berbeda
   adalah berapa besar yang diminta - kalau satu profil diminta lebih sedikit,
   perbedaan hasil antarprofil menjadi artefak kalimat, bukan temuan. */
/* Catatan: sejak durasi disamakan 25 menit, tidak ada satu kalimat pun yang boleh
   menyebut angka menit. Kalimat yang menjanjikan "sepuluh menit" sementara tombolnya
   membuka sesi 25 menit bukan sekadar salah tulis - itu membuat partisipan merasa
   dibohongi aplikasi, dan kepercayaan yang hilang di hari ketiga akan terbaca sebagai
   penurunan kepatuhan di data. Ukuran tetap disampaikan, tetapi secara kualitatif
   ("satu sesi", "kecil dulu"). */
const COPY = {
  [PROFILES.SPROUT]: {
    done: [
      'Hari ini tumbuh sedikit. Itu tetap tumbuh.',
      'Cukup untuk hari ini. Akarnya menguat.',
      'Sudah selesai. Istirahat juga bagian dari tumbuh.',
    ],
    streakRisk: [
      'Satu sesi kecil menjaga rantaimu.',
      'Belum terlambat. Satu sesi masih muat hari ini.',
      'Hari belum habis. Mulai dari yang paling kecil.',
    ],
    lowEnergy: [
      'Energimu sedang rendah. Ambil satu sesi yang tenang.',
      'Kecil dulu. Tidak perlu besar hari ini.',
      'Mulai pelan lebih baik daripada menunggu semangat datang.',
    ],
    normal: [
      'Waktunya menumbuhkan satu hal.',
      'Mulai dengan satu sesi tenang.',
      'Pilih satu hal saja, lalu kerjakan sampai selesai.',
    ],
  },
  [PROFILES.SPARK]: {
    done: [
      'Nyalamu sudah tuntas hari ini.',
      'Selesai. Simpan sisa energimu.',
      'Target hari ini kena. Berhenti di puncak.',
    ],
    streakRisk: [
      'Nyalamu hampir padam - satu sesi cepat.',
      'Jaga percikannya, satu sesi saja.',
      'Rantaimu tinggal satu sesi lagi. Ambil sekarang.',
    ],
    lowEnergy: [
      'Turunkan intensitas: satu sesi fokus tajam.',
      'Bakar kecil saja, satu sesi cukup.',
      'Bukan hari untuk banyak sesi. Satu sesi, satu target.',
    ],
    normal: [
      'Arahkan energimu ke satu titik.',
      'Sesi dua puluh lima menit, satu target.',
      'Satu sasaran, satu sesi penuh. Mulai.',
    ],
  },
};

/**
 * Memilih bucket sesuai urutan cek di flowchart: done > streakRisk > lowEnergy > normal.
 *
 * Urutan ini bagian dari kontrak, bukan gaya penulisan. Membalik dua cabang mana pun
 * akan mengubah bucket mana yang tercatat di kolom sessions.nudge_bucket, dan analisis
 * per bucket ikut berubah artinya.
 *
 * @param {object} args
 * @param {boolean} args.questDone   - sudah ada sesi selesai hari ini.
 * @param {boolean} args.streakAtRisk - punya rantai berjalan tapi belum berlatih hari ini.
 * @param {number}  args.hourWIB     - jam WIB saat nudge dibentuk (0-23).
 * @param {number|null} args.focusMean - rerata fokus 2 EMA terakhir, null bila belum ada.
 * @returns {'done'|'streakRisk'|'lowEnergy'|'normal'}
 */
export function pickBucket({ questDone, streakAtRisk, hourWIB, focusMean } = {}) {
  if (questDone) return 'done';

  // Syarat jam sore itu penting: mengatakan "rantaimu hampir putus" pukul 9 pagi
  // adalah tekanan yang tidak berdasar, dan tekanan palsu adalah cara tercepat
  // membuat partisipan berhenti membaca nudge sama sekali.
  if (streakAtRisk && hourWIB >= STREAK_RISK_HOUR) return 'streakRisk';

  // focusMean null berarti belum ada data EMA - bukan berarti energinya rendah.
  // Menganggap "belum ada data" sebagai "rendah" akan membuat partisipan baru
  // selalu masuk bucket lowEnergy di hari-hari pertama intervensi.
  if (focusMean !== null && focusMean !== undefined && focusMean < LOW_FOCUS_THRESHOLD) return 'lowEnergy';

  return 'normal';
}

/**
 * Memilih kalimat dengan rotasi anti-habituasi.
 *
 * Kalimat yang sama diulang tiap hari berhenti dibaca dalam hitungan hari - dan
 * nudge yang tidak dibaca tetap tercatat sebagai "nudge diberikan" di data, sehingga
 * efek intervensi terlihat lebih lemah daripada seharusnya. Rotasi ini menjaga agar
 * yang diukur adalah isi nudge, bukan kebosanan terhadap satu kalimat.
 *
 * Murni: riwayat dan pengacak disuntikkan, tidak ada yang ditulis ke Store di sini.
 *
 * @param {string} profile - 'sprout' | 'spark'.
 * @param {string} bucket
 * @param {object} [opts]
 * @param {string[]} [opts.history] - kalimat yang sudah pernah dipakai, terbaru di akhir.
 * @param {() => number} [opts.rand]
 * @returns {string}
 */
export function pickCopy(profile, bucket, { history = [], rand = Math.random } = {}) {
  const bank = COPY[profile] || COPY[PROFILES.SPROUT];
  const opsi = bank[bucket] || bank.normal;

  const terakhir = history.slice(-3);
  const belum = opsi.filter((teks) => !terakhir.includes(teks));

  // Bila semua kalimat kebetulan baru saja dipakai, jangan mengembalikan string
  // kosong - lebih baik mengulang kalimat daripada menampilkan kartu nudge kosong.
  const kolam = belum.length ? belum : opsi;
  return kolam[Math.min(kolam.length - 1, Math.floor(rand() * kolam.length))];
}

/**
 * Membentuk nudge lengkap, atau null bila fase saat ini tidak boleh menerimanya.
 *
 * Mengembalikan null pada SEMUA fase selain intervensi:
 *   pre         - partisipan belum mulai, belum ada apa pun untuk disesuaikan.
 *   baseline    - pemantauan pasif; ini inti desain SCED-nya.
 *   maintenance - studi sudah selesai, pengukuran berhenti.
 *
 * @param {object} args
 * @param {string} args.phase
 * @param {string} args.profile
 * @param {boolean} args.questDone
 * @param {boolean} args.streakAtRisk
 * @param {number} args.hourWIB
 * @param {number|null} args.focusMean
 * @param {string[]} [args.history]
 * @param {() => number} [args.rand]
 * @returns {{bucket: string, text: string, minutes: number}|null}
 */
export function buildNudge({
  phase, profile, questDone, streakAtRisk, hourWIB, focusMean,
  history = [], rand = Math.random,
} = {}) {
  if (phase !== PHASE.INTERVENTION) return null;

  const bucket = pickBucket({ questDone, streakAtRisk, hourWIB, focusMean });
  return {
    bucket,
    text: pickCopy(profile, bucket, { history, rand }),
    minutes: SESSION_MINUTES[bucket],
  };
}

/**
 * Durasi sesi yang ditawarkan saat tidak ada nudge (baseline dan pra-studi).
 *
 * Selalu 25 menit. Tombol "Mulai sesi" harus tetap ada di baseline - yang ditahan
 * hanyalah penyesuaian, bukan kesempatan berlatih. Kalau partisipan baseline tidak
 * bisa berlatih sama sekali, yang terukur adalah ketiadaan aplikasi, bukan
 * ketiadaan nudge.
 */
export const DEFAULT_MINUTES = 25;

/**
 * Menentukan apakah misi utama hari ini sudah tuntas: ada sesi selesai hari ini.
 *
 * @param {Array} sessions
 * @param {number} studyDay
 */
export function questDoneToday(sessions = [], studyDay) {
  return sessions.some((s) => s && s.study_day === studyDay && s.outcome === 'completed');
}

/* Dua peristiwa yang dicatat untuk tiap nudge. Sengaja BUKAN satu baris dengan kolom
   accepted yang diperbarui belakangan: antrean sinkron bersifat tambah-saja, jadi
   pembaruan tidak akan pernah sampai ke server. Dengan dua baris peristiwa, tingkat
   penerimaan nudge = jumlah 'accepted' dibagi jumlah 'shown', dan keduanya bertahan
   walau perangkat offline berhari-hari. */
export const NUDGE_EVENT = { SHOWN: 'shown', ACCEPTED: 'accepted' };

/**
 * Baris catatan nudge.
 *
 * Nudge yang muncul lalu diabaikan tetap data. Tanpa catatan ini, satu-satunya jejak
 * nudge ada di sessions.nudge_bucket - dan itu hanya terisi bila partisipan menekan
 * tombolnya, sehingga justru nudge yang gagal menghilang dari data. Padahal nudge yang
 * gagal itulah yang paling perlu diketahui saat menafsirkan hasil.
 *
 * client_id dibentuk deterministik dari tanggal + bucket + peristiwa. Jadi membuka
 * Beranda sepuluh kali dalam satu hari tetap menghasilkan satu baris 'shown', bukan
 * sepuluh - tanpa perlu logika anti-duplikat di lapisan UI.
 */
export function buildNudgeLogRow({
  nudge, studyDay, tier, phase, profile, ts, entryDate,
  event = NUDGE_EVENT.SHOWN, appVersion = null,
}) {
  const at = new Date(ts);
  return {
    client_id: `${entryDate}-${nudge.bucket}-${event}`,
    event,
    nudge_bucket: nudge.bucket,
    nudge_text: nudge.text,
    minutes_offered: nudge.minutes,
    profile,
    tier,
    phase,
    study_day: studyDay,
    entry_date: entryDate,
    occurred_at: at.toISOString(),
    app_version: appVersion,
  };
}

/** Daftar kalimat per profil dan bucket - dipakai test dan alat QA. */
export function copyBank() {
  return COPY;
}
