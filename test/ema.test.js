/* Uji mesin EMA.

   Semua uji memakai jam buatan dan pengacak buatan. Test yang bergantung pada jam
   nyata akan lulus pukul 10.00 dan gagal pukul 21.00 - dan test yang hasilnya
   tergantung waktu menjalankannya lebih berbahaya daripada tidak ada test sama sekali. */

import { describe, t, eq, ok, throws } from './harness.js';
import {
  WINDOW_MS, MANA_REWARD, STRATA, SIGNALS_PER_DAY, STATUS, EMA_ITEMS,
  scheduleForDay, hasScheduleFor, ensureSchedule, sweepSignals, findDueSignal,
  nextSignal, remainingWindowMs, complianceSummary, buildEntry, buildMissedEntry,
  markAnswered, recordEntry, recentFocusMean,
} from '../core/ema.js';
import { wibTimestamp, wibDate } from '../core/tier.js';

const HARI = '2026-08-10';

/** Pengacak yang bisa ditebak: selalu di tengah rentang strata. */
const tengah = () => 0.5;
const awal = () => 0;
const akhir = () => 0.999;

function sinyal(overrides = {}) {
  return {
    signalId: `${HARI}-1-abcd1234`,
    stratum: 1,
    scheduledAt: new Date(wibTimestamp(HARI, 14, 0)).toISOString(),
    studyDay: 6,
    tier: 2,
    phase: 'intervention',
    status: STATUS.PENDING,
    ...overrides,
  };
}

export default function run() {
  describe('ema - kontrak angka', () => {
    t('jendela menjawab 60 menit', () => eq(WINDOW_MS, 3_600_000));
    t('MANA tetap 12 apa pun jawabannya', () => eq(MANA_REWARD, 12));
    t('tiga strata: pagi, siang, malam', () => {
      eq(SIGNALS_PER_DAY, 3);
      eq(JSON.stringify(STRATA), JSON.stringify([[9, 12], [13, 16], [17, 20]]));
    });
    t('tiga butir dengan konstruk yang benar', () => {
      eq(EMA_ITEMS.map((i) => i.key).join(','), 'focus,control,context');
      ok(EMA_ITEMS.every((i) => i.scale.length === 5));
    });
  });

  describe('ema - jadwal acak berstrata', () => {
    t('tiga sinyal per hari, satu tiap strata', () => {
      const s = scheduleForDay(HARI, 1, 3, { rand: tengah });
      eq(s.length, 3);
      eq(s.map((x) => x.stratum).join(','), '0,1,2');
    });

    t('sinyal selalu urut waktu', () => {
      // Kasus terburuk: strata pertama diacak paling akhir, strata terakhir paling awal.
      let rand = akhir;
      const s = scheduleForDay(HARI, 1, 3, { rand: () => (rand === akhir ? 0.999 : 0) });
      const ms = s.map((x) => Date.parse(x.scheduledAt));
      ok(ms.every((v, i) => i === 0 || v > ms[i - 1]));
    });

    t('setiap sinyal jatuh di dalam stratanya', () => {
      for (const r of [awal, tengah, akhir]) {
        scheduleForDay(HARI, 1, 3, { rand: r }).forEach((s, i) => {
          const [h1, h2] = STRATA[i];
          const at = Date.parse(s.scheduledAt);
          ok(at >= wibTimestamp(HARI, h1, 0), `sinyal ${i} terlalu pagi`);
          ok(at < wibTimestamp(HARI, h2, 0), `sinyal ${i} terlalu malam`);
        });
      }
    });

    t('tidak pernah dijadwalkan di luar 09.00-20.00 WIB', () => {
      const s = scheduleForDay(HARI, 1, 3, { rand: akhir });
      const paling = Date.parse(s[s.length - 1].scheduledAt);
      ok(paling < wibTimestamp(HARI, 20, 0));   // tidak mengganggu waktu tidur
    });

    t('fase ikut tercatat di sinyal, bukan dihitung ulang saat analisis', () => {
      const s = scheduleForDay(HARI, 1, 3, { rand: tengah });     // tier 1 baseline 5 hari
      eq(s[0].phase, 'baseline');
      eq(scheduleForDay(HARI, 1, 9, { rand: tengah })[0].phase, 'intervention');
    });

    t('signalId unik per strata dan berawalan tanggal', () => {
      const s = scheduleForDay(HARI, 1, 3, { rand: tengah });
      ok(s.every((x) => x.signalId.startsWith(`${HARI}-`)));
      eq(new Set(s.map((x) => x.signalId)).size, 3);
    });

    t('slot yang jamnya sudah lewat tidak dibuat pada hari pendaftaran', () => {
      // Partisipan mendaftar pukul 16.00 WIB. Dengan pengacak di awal strata,
      // slot pagi (09.00) dan siang (13.00) sudah lewat; hanya slot malam tersisa.
      const s = scheduleForDay(HARI, 1, 1, { rand: awal, after: wibTimestamp(HARI, 16, 0) });
      eq(s.length, 1);
      eq(s[0].stratum, 2);
    });

    t('mendaftar lewat pukul 20.00 tidak menghasilkan sinyal sama sekali', () => {
      // Nol sinyal itu benar: nonrespons hanya boleh dicatat untuk sinyal yang
      // benar-benar sempat dikirim ke partisipan.
      eq(scheduleForDay(HARI, 1, 1, { rand: akhir, after: wibTimestamp(HARI, 21, 0) }).length, 0);
    });
  });

  describe('ema - penjadwalan harian', () => {
    const peserta = { participant: { id: 'p', tier: 1, startedOn: HARI }, emaSignals: [] };
    const pagi = wibTimestamp(HARI, 8, 0);

    t('membuat jadwal saat hari studi dimulai', () => {
      eq(ensureSchedule(peserta, pagi, { rand: tengah }).length, 3);
    });

    t('tidak menjadwal dua kali di hari yang sama', () => {
      const signals = ensureSchedule(peserta, pagi, { rand: tengah });
      const lagi = ensureSchedule({ ...peserta, emaSignals: signals }, pagi, { rand: tengah });
      eq(lagi.length, 0);
    });

    t('hasScheduleFor mengenali tanggal yang sudah punya jadwal', () => {
      const signals = ensureSchedule(peserta, pagi, { rand: tengah });
      eq(hasScheduleFor(signals, HARI), true);
      eq(hasScheduleFor(signals, '2026-08-11'), false);
    });

    t('tanpa partisipan tidak ada jadwal, dan tidak error', () => {
      eq(ensureSchedule({}, pagi).length, 0);
      eq(ensureSchedule({ participant: { tier: 1 } }, pagi).length, 0);
    });

    t('setelah hari terakhir studi, sinyal berhenti', () => {
      // Tier 1 total 12 hari. Hari ke-13 tidak boleh menghasilkan sinyal.
      const lewat = { participant: { id: 'p', tier: 1, startedOn: '2026-07-01' }, emaSignals: [] };
      eq(ensureSchedule(lewat, pagi, { rand: tengah }).length, 0);
    });
  });

  describe('ema - jendela jawab dan nonrespons', () => {
    const jam14 = wibTimestamp(HARI, 14, 0);

    t('sinyal jatuh tempo tepat pada jadwalnya', () => {
      const s = [sinyal()];
      eq(findDueSignal(s, jam14 - 1), null);          // belum waktunya
      ok(findDueSignal(s, jam14));                     // batas bawah
      ok(findDueSignal(s, jam14 + WINDOW_MS));         // batas atas, masih boleh
      eq(findDueSignal(s, jam14 + WINDOW_MS + 1), null);
    });

    t('sinyal yang sudah dijawab tidak muncul lagi', () => {
      eq(findDueSignal([sinyal({ status: STATUS.ANSWERED })], jam14), null);
    });

    t('sweep menutup sinyal lewat 60 menit sebagai missed', () => {
      const r = sweepSignals([sinyal()], jam14 + WINDOW_MS + 1);
      eq(r.changed, 1);
      eq(r.signals[0].status, STATUS.MISSED);
      ok(r.signals[0].closedAt);
    });

    t('sweep tidak menyentuh sinyal yang masih dalam jendela', () => {
      const r = sweepSignals([sinyal()], jam14 + 59 * 60_000);
      eq(r.changed, 0);
      eq(r.signals[0].status, STATUS.PENDING);
    });

    t('sweep dua kali tidak menghitung ganda', () => {
      const a = sweepSignals([sinyal()], jam14 + WINDOW_MS + 1);
      const b = sweepSignals(a.signals, jam14 + WINDOW_MS + 5_000);
      eq(b.changed, 0);
    });

    t('sisa waktu menjawab tidak pernah negatif', () => {
      eq(remainingWindowMs(sinyal(), jam14), WINDOW_MS);
      eq(remainingWindowMs(sinyal(), jam14 + 30 * 60_000), 30 * 60_000);
      eq(remainingWindowMs(sinyal(), jam14 + 5 * 3_600_000), 0);
    });

    t('sinyal berikutnya adalah yang paling dekat, bukan yang pertama di daftar', () => {
      const malam = sinyal({ signalId: 'b', scheduledAt: new Date(wibTimestamp(HARI, 19, 0)).toISOString() });
      const siang = sinyal({ signalId: 'a', scheduledAt: new Date(wibTimestamp(HARI, 15, 0)).toISOString() });
      eq(nextSignal([malam, siang], wibTimestamp(HARI, 10, 0)).signalId, 'a');
    });

    t('kepatuhan: null saat belum ada sinyal yang tuntas', () => {
      eq(complianceSummary([sinyal()]).rate, null);
      eq(complianceSummary([]).rate, null);
    });

    t('kepatuhan dihitung dari sinyal terkirim, bukan dari yang dijawab saja', () => {
      const c = complianceSummary([
        sinyal({ signalId: '1', status: STATUS.ANSWERED }),
        sinyal({ signalId: '2', status: STATUS.MISSED }),
        sinyal({ signalId: '3', status: STATUS.PENDING }),
      ]);
      eq(c.answered, 1); eq(c.missed, 1); eq(c.pending, 1);
      eq(c.delivered, 2);
      eq(c.rate, 0.5);
    });
  });

  describe('ema - baris data', () => {
    const jam14 = wibTimestamp(HARI, 14, 0);

    t('baris jawaban berisi semua kolom analisis', () => {
      const row = buildEntry({ signal: sinyal(), focus: 4, control: 4, context: 3, coping: 2, ts: jam14 + 90_000 });
      eq(row.focus, 4);
      eq(row.control, 4);
      eq(row.context, 3);
      eq(row.impulse, 2);                 // 6 - control
      eq(row.coping, 2);                  // butir keempat, hanya ada pada fase intervensi
      eq(row.signal_type, 'scheduled');
      eq(row.responded, true);
      eq(row.latency_sec, 90);
      eq(row.tier, 2);
      eq(row.phase, 'intervention');
      eq(row.study_day, 6);
      eq(row.stratum, 1);
      eq(row.mana_awarded, MANA_REWARD);
      eq(row.entry_date, HARI);
      eq(row.hour_wib, 14);
      ok(row.client_id && row.signal_id);
    });

    t('impulse selalu kebalikan kontrol', () => {
      for (let c = 1; c <= 5; c += 1) {
        eq(buildEntry({ signal: sinyal(), focus: 3, control: c, context: 3, coping: 3, ts: jam14 }).impulse, 6 - c);
      }
    });

    t('jawaban di luar 1-5 dijepit, bukan diterima apa adanya', () => {
      const row = buildEntry({ signal: sinyal(), focus: 9, control: 0, context: 3.4, coping: 3, ts: jam14 });
      eq(row.focus, 5);
      eq(row.control, 1);
      eq(row.context, 3);
    });

    t('butir kosong ditolak, bukan disimpan sebagai nol', () => {
      throws(() => buildEntry({ signal: sinyal(), focus: 3, control: null, context: 3, ts: jam14 }));
    });

    t('baris nonrespons berbentuk sama dengan baris terjawab', () => {
      const miss = buildMissedEntry(sinyal(), jam14 + WINDOW_MS + 1);
      const jawab = buildEntry({ signal: sinyal(), focus: 3, control: 3, context: 3, coping: 3, ts: jam14 });
      eq(Object.keys(miss).sort().join(','), Object.keys(jawab).sort().join(','));
      eq(miss.responded, false);
      eq(miss.focus, null);
      eq(miss.impulse, null);
      eq(miss.mana_awarded, 0);
      eq(miss.entry_date, HARI);          // tanggal sinyal, bukan tanggal disapu
    });

    t('menjawab menandai sinyal dan menambah MANA', () => {
      const state = { mana: 0, emaEntries: [], emaSignals: [sinyal()] };
      const row = buildEntry({ signal: sinyal(), focus: 3, control: 3, context: 3, coping: 3, ts: jam14 });
      const r = recordEntry(state, row);
      eq(r.state.emaEntries.length, 1);
      eq(r.state.emaSignals[0].status, STATUS.ANSWERED);
      eq(r.state.mana, 12);
      eq(r.gained, 12);
    });

    t('MANA tidak menyentuh XP', () => {
      const state = { mana: 0, xp: 40, level: 1, emaEntries: [], emaSignals: [sinyal()] };
      const row = buildEntry({ signal: sinyal(), focus: 5, control: 5, context: 5, coping: 5, ts: jam14 });
      eq(recordEntry(state, row).state.xp, 40);
    });

    t('markAnswered tidak mengubah sinyal lain', () => {
      const list = [sinyal({ signalId: 'a' }), sinyal({ signalId: 'b' })];
      const next = markAnswered(list, 'a', jam14);
      eq(next[0].status, STATUS.ANSWERED);
      eq(next[1].status, STATUS.PENDING);
      eq(list[0].status, STATUS.PENDING);      // asli tidak dimutasi
    });
  });

  describe('ema - rerata fokus untuk nudge', () => {
    t('memakai dua entri terakhir yang terjawab', () => {
      eq(recentFocusMean([{ focus: 1, responded: true }, { focus: 4, responded: true }, { focus: 2, responded: true }]), 3);
    });
    t('nonrespons diabaikan, bukan dihitung nol', () => {
      eq(recentFocusMean([{ focus: 4, responded: true }, { focus: null, responded: false }]), 4);
    });
    t('belum ada data mengembalikan null', () => {
      eq(recentFocusMean([]), null);
      eq(recentFocusMean([{ focus: null, responded: false }]), null);
    });
  });
}
