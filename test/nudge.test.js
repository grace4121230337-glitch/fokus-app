/* Uji nudge adaptif - penjaga validitas desain.

   Kalau satu test di berkas ini gagal, jangan longgarkan testnya. Test di sini bukan
   memeriksa apakah kode berjalan, melainkan apakah penelitiannya masih bisa
   dipertanggungjawabkan. Yang paling penting: nudge tidak pernah bocor ke baseline. */

import { describe, t, eq, ok } from './harness.js';
import {
  pickBucket, pickCopy, buildNudge, buildNudgeLogRow, questDoneToday, copyBank,
  SESSION_MINUTES, BUCKETS, STREAK_RISK_HOUR, LOW_FOCUS_THRESHOLD, DEFAULT_MINUTES,
  NUDGE_EVENT,
} from '../core/nudge.js';
import { PHASE } from '../core/tier.js';
import { PROFILES } from '../core/progress.js';

const dasar = {
  phase: PHASE.INTERVENTION,
  profile: PROFILES.SPROUT,
  questDone: false,
  streakAtRisk: false,
  hourWIB: 10,
  focusMean: 4,
};

export default function run() {
  describe('nudge - gerbang fase (inti desain SCED)', () => {
    t('BASELINE TIDAK PERNAH menerima nudge', () => {
      eq(buildNudge({ ...dasar, phase: PHASE.BASELINE, streakAtRisk: true, focusMean: 1 }), null);
    });
    t('pra-studi tidak menerima nudge', () => {
      eq(buildNudge({ ...dasar, phase: PHASE.PRE }), null);
    });
    t('setelah studi selesai nudge berhenti', () => {
      eq(buildNudge({ ...dasar, phase: PHASE.MAINTENANCE }), null);
    });
    t('fase tidak dikenal diperlakukan sebagai bukan intervensi', () => {
      // Gagal ke arah aman: fase asing berarti tidak ada nudge, bukan ada nudge.
      eq(buildNudge({ ...dasar, phase: 'entah' }), null);
      eq(buildNudge({ ...dasar, phase: undefined }), null);
    });
    t('intervensi menerima nudge lengkap', () => {
      const n = buildNudge({ ...dasar, rand: () => 0 });
      ok(n && n.text.length > 0);
      ok(BUCKETS.includes(n.bucket));
      eq(n.minutes, SESSION_MINUTES[n.bucket]);
    });
  });

  describe('nudge - urutan pemilihan bucket', () => {
    t('misi selesai mengalahkan semua kondisi lain', () => {
      eq(pickBucket({ questDone: true, streakAtRisk: true, hourWIB: 19, focusMean: 1 }), 'done');
    });
    t('rantai berisiko + sore -> streakRisk', () => {
      eq(pickBucket({ questDone: false, streakAtRisk: true, hourWIB: 17, focusMean: 4 }), 'streakRisk');
    });
    t('rantai berisiko tapi masih pagi -> bukan streakRisk', () => {
      eq(pickBucket({ questDone: false, streakAtRisk: true, hourWIB: 9, focusMean: 4 }), 'normal');
    });
    t('batas jam sore tepat di pukul 16', () => {
      const arg = { questDone: false, streakAtRisk: true, focusMean: 4 };
      eq(pickBucket({ ...arg, hourWIB: STREAK_RISK_HOUR - 1 }), 'normal');
      eq(pickBucket({ ...arg, hourWIB: STREAK_RISK_HOUR }), 'streakRisk');
    });
    t('rantai berisiko mengalahkan energi rendah', () => {
      eq(pickBucket({ questDone: false, streakAtRisk: true, hourWIB: 18, focusMean: 1 }), 'streakRisk');
    });
    t('fokus 2.4 -> lowEnergy, durasi tetap 25 menit', () => {
      const b = pickBucket({ questDone: false, streakAtRisk: false, hourWIB: 10, focusMean: 2.4 });
      eq(b, 'lowEnergy');
      eq(SESSION_MINUTES[b], 25);
    });
    t('fokus tepat di ambang 2.5 -> normal 25 menit', () => {
      const b = pickBucket({ questDone: false, streakAtRisk: false, hourWIB: 10, focusMean: LOW_FOCUS_THRESHOLD });
      eq(b, 'normal');
      eq(SESSION_MINUTES[b], 25);
    });
    t('belum ada data EMA BUKAN berarti energi rendah', () => {
      eq(pickBucket({ questDone: false, streakAtRisk: false, hourWIB: 10, focusMean: null }), 'normal');
      eq(pickBucket({ questDone: false, streakAtRisk: false, hourWIB: 10 }), 'normal');
    });
    t('durasi seragam di semua bucket, agar bukan variabel perancu', () => {
      // Dulu bucket bertekanan sengaja dibuat lebih pendek (15 dan 10 menit). Itu
      // dibatalkan: bila panjang sesi ikut berubah mengikuti kondisi partisipan, kenaikan
      // "sesi selesai" pada fase intervensi bisa berarti partisipan lebih mampu bertahan
      // ATAU sesinya sekadar lebih pendek - dua tafsir yang tidak bisa dipisahkan lagi.
      for (const b of BUCKETS) eq(SESSION_MINUTES[b], 25);
      eq(DEFAULT_MINUTES, SESSION_MINUTES.normal);
    });
  });

  describe('nudge - bank kalimat', () => {
    const bank = copyBank();

    t('kedua profil punya keempat bucket', () => {
      for (const profil of [PROFILES.SPROUT, PROFILES.SPARK]) {
        for (const b of BUCKETS) ok(bank[profil][b]?.length >= 3, `${profil}/${b} kurang kalimat`);
      }
    });

    t('minimal tiga kalimat per bucket agar rotasi punya ruang', () => {
      // Dengan hanya dua kalimat, riwayat tiga nudge terakhir selalu memblokir
      // keduanya dan rotasi anti-habituasi berubah menjadi acak biasa.
      for (const profil of Object.keys(bank)) {
        for (const b of BUCKETS) ok(bank[profil][b].length >= 3);
      }
    });

    t('tidak ada kalimat yang sama antarprofil', () => {
      const sprout = BUCKETS.flatMap((b) => bank[PROFILES.SPROUT][b]);
      const spark = BUCKETS.flatMap((b) => bank[PROFILES.SPARK][b]);
      ok(!sprout.some((teks) => spark.includes(teks)));
    });

    t('durasi yang disebut kalimat cocok dengan durasi bucketnya', () => {
      // Kalimat streakRisk menjanjikan 15 menit sementara tombolnya membuka sesi 25
      // menit adalah jenis ketidakcocokan yang merusak kepercayaan pada aplikasi.
      const angka = { 10: 'sepuluh', 15: 'lima belas', 25: 'dua puluh lima' };
      for (const profil of Object.keys(bank)) {
        for (const b of BUCKETS) {
          for (const teks of bank[profil][b]) {
            const lain = Object.entries(angka)
              .filter(([m]) => Number(m) !== SESSION_MINUTES[b])
              .map(([, kata]) => kata);
            ok(!lain.some((kata) => teks.toLowerCase().includes(kata)),
              `kalimat ${profil}/${b} menyebut durasi yang salah: ${teks}`);
          }
        }
      }
    });
  });

  describe('nudge - rotasi anti-habituasi', () => {
    t('menghindari tiga kalimat terakhir', () => {
      const bank = copyBank()[PROFILES.SPROUT].normal;
      const teks = pickCopy(PROFILES.SPROUT, 'normal', { history: [bank[0], bank[1]], rand: () => 0 });
      eq(teks, bank[2]);
    });

    t('hanya tiga riwayat terakhir yang diperhitungkan', () => {
      const bank = copyBank()[PROFILES.SPROUT].normal;
      // bank[0] dipakai lama sekali - sudah boleh muncul lagi.
      const teks = pickCopy(PROFILES.SPROUT, 'normal', {
        history: [bank[0], 'a', 'b', 'c'], rand: () => 0,
      });
      eq(teks, bank[0]);
    });

    t('semua kalimat baru dipakai: mengulang, bukan mengembalikan kosong', () => {
      const bank = copyBank()[PROFILES.SPROUT].normal;
      const teks = pickCopy(PROFILES.SPROUT, 'normal', { history: bank, rand: () => 0.99 });
      ok(bank.includes(teks));
    });

    t('pengacak di batas atas tidak menghasilkan undefined', () => {
      for (const r of [0, 0.5, 0.999999, 1]) {
        ok(typeof pickCopy(PROFILES.SPARK, 'done', { rand: () => r }) === 'string');
      }
    });

    t('profil tidak dikenal jatuh ke Sprout, bukan error', () => {
      ok(typeof pickCopy('entah', 'normal', { rand: () => 0 }) === 'string');
    });
  });

  describe('nudge - misi dan catatan', () => {
    const sesi = [
      { study_day: 5, outcome: 'completed' },
      { study_day: 6, outcome: 'aborted' },
    ];

    t('misi tuntas hanya bila ada sesi SELESAI hari itu', () => {
      eq(questDoneToday(sesi, 5), true);
      eq(questDoneToday(sesi, 6), false);      // dicoba tapi berhenti di tengah
      eq(questDoneToday(sesi, 7), false);
      eq(questDoneToday([], 5), false);
    });

    t('baris catatan memuat kolom analisis', () => {
      const row = buildNudgeLogRow({
        nudge: { bucket: 'lowEnergy', text: 'Kecil dulu.', minutes: 10 },
        studyDay: 8, tier: 2, phase: PHASE.INTERVENTION, profile: PROFILES.SPARK,
        ts: Date.parse('2026-08-10T03:00:00Z'), entryDate: '2026-08-10',
      });
      eq(row.nudge_bucket, 'lowEnergy');
      eq(row.minutes_offered, 10);
      eq(row.study_day, 8);
      eq(row.event, NUDGE_EVENT.SHOWN);
      eq(row.entry_date, '2026-08-10');
    });

    t('client_id deterministik: membuka Beranda berkali-kali tidak menggandakan baris', () => {
      const arg = {
        nudge: { bucket: 'normal', text: 'a', minutes: 25 },
        studyDay: 8, tier: 1, phase: PHASE.INTERVENTION, profile: PROFILES.SPROUT,
        entryDate: '2026-08-10',
      };
      const a = buildNudgeLogRow({ ...arg, ts: Date.parse('2026-08-10T03:00:00Z') });
      const b = buildNudgeLogRow({ ...arg, ts: Date.parse('2026-08-10T09:00:00Z') });
      eq(a.client_id, b.client_id);
    });

    t('peristiwa ditampilkan dan diterima punya client_id berbeda', () => {
      const arg = {
        nudge: { bucket: 'normal', text: 'a', minutes: 25 },
        studyDay: 8, tier: 1, phase: PHASE.INTERVENTION, profile: PROFILES.SPROUT,
        ts: Date.now(), entryDate: '2026-08-10',
      };
      const shown = buildNudgeLogRow({ ...arg, event: NUDGE_EVENT.SHOWN });
      const accepted = buildNudgeLogRow({ ...arg, event: NUDGE_EVENT.ACCEPTED });
      ok(shown.client_id !== accepted.client_id);
    });

    t('bucket berbeda di hari yang sama tercatat terpisah', () => {
      const arg = {
        studyDay: 8, tier: 1, phase: PHASE.INTERVENTION, profile: PROFILES.SPROUT,
        ts: Date.now(), entryDate: '2026-08-10',
      };
      const pagi = buildNudgeLogRow({ ...arg, nudge: { bucket: 'normal', text: 'a', minutes: 25 } });
      const sore = buildNudgeLogRow({ ...arg, nudge: { bucket: 'streakRisk', text: 'b', minutes: 15 } });
      ok(pagi.client_id !== sore.client_id);
    });
  });
}
