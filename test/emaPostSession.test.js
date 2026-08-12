/* EMA pasca-sesi dan butir coping (Bab 3 3.4 dan 3.6).

   Dua hal yang dulu hilang dari aplikasi diuji di sini:
   1) pengukuran yang melekat pada sesi, bukan hanya tiga sinyal acak harian;
   2) butir coping yang HANYA aktif pada fase intervensi.

   Butir kedua adalah pemisah fase. Kalau coping ikut ditanyakan saat baseline,
   partisipan sudah diajak memikirkan strategi mengatasi dorongan menunda sebelum
   perlakuan dimulai - itu intervensi terselubung, dan garis dasarnya tercemar. */

import { describe, t, eq, ok, throws } from './harness.js';
import {
  SIGNAL_TYPE, POST_SESSION_WINDOW_MS, WINDOW_MS, COPING_ITEM, EMA_ITEMS, STATUS,
  itemsForPhase, windowMsFor, buildPostSessionSignal, hasScheduleFor,
  findDueSignal, dailyCompliance, buildEntry, buildMissedEntry,
} from '../core/ema.js';
import { PHASE, wibDate } from '../core/tier.js';

const TS = Date.parse('2026-08-12T14:00:00+07:00');
const HARI = wibDate(TS);

const pascaSesi = (extra = {}) => buildPostSessionSignal({
  sessionId: 'sesi-1', tier: 2, phase: PHASE.INTERVENTION, studyDay: 6, ts: TS, ...extra,
});
const terjadwal = (extra = {}) => ({
  signalId: `${HARI}-1-abcd1234`,
  type: SIGNAL_TYPE.SCHEDULED,
  stratum: 1,
  scheduledAt: new Date(TS).toISOString(),
  studyDay: 6,
  tier: 2,
  phase: PHASE.INTERVENTION,
  status: STATUS.PENDING,
  ...extra,
});

describe('EMA pasca-sesi: bentuk sinyal', () => {
  t('sinyal menandai dirinya sebagai pasca-sesi dan membawa id sesinya', () => {
    const s = pascaSesi();
    eq(s.type, SIGNAL_TYPE.POST_SESSION);
    eq(s.sessionId, 'sesi-1');
    eq(s.status, STATUS.PENDING);
    // Tanpa session_id, jawaban EMA tidak bisa dipasangkan dengan sesi yang memicunya,
    // dan seluruh gunanya sebagai pengukuran melekat-sesi hilang.
    ok(s.signalId.includes('-ps-'));
  });

  t('tidak menempati strata mana pun', () => {
    // Strata milik jadwal acak harian. Bila sinyal pasca-sesi ikut mengaku strata 1,
    // hitungan "satu sinyal per strata" jadi kacau.
    eq(pascaSesi().stratum, null);
  });

  t('konteks studi ikut dibawa untuk analisis per fase', () => {
    const s = pascaSesi();
    eq(s.tier, 2);
    eq(s.phase, PHASE.INTERVENTION);
    eq(s.studyDay, 6);
  });

  t('sesi tanpa konteks tetap menghasilkan sinyal yang sah', () => {
    const s = buildPostSessionSignal({ ts: TS });
    eq(s.sessionId, null);
    eq(s.type, SIGNAL_TYPE.POST_SESSION);
  });
});

describe('EMA pasca-sesi: jendela menjawab', () => {
  t('jendelanya 15 menit, jauh lebih pendek daripada sinyal harian', () => {
    eq(POST_SESSION_WINDOW_MS, 15 * 60_000);
    eq(windowMsFor(pascaSesi()), POST_SESSION_WINDOW_MS);
    ok(POST_SESSION_WINDOW_MS < WINDOW_MS);
  });

  t('sinyal terjadwal tetap 60 menit', () => {
    eq(windowMsFor(terjadwal()), WINDOW_MS);
  });

  t('sinyal lama tanpa kolom type dianggap terjadwal, bukan kedaluwarsa cepat', () => {
    // Data yang tersimpan sebelum pembaruan ini tidak punya kolom type. Menganggapnya
    // pasca-sesi akan memangkas jendelanya dari 60 menit menjadi 15.
    eq(windowMsFor({ scheduledAt: new Date(TS).toISOString() }), WINDOW_MS);
  });

  t('batas: masih bisa dijawab pada menit ke-15, tidak pada menit ke-16', () => {
    const s = [pascaSesi()];
    ok(findDueSignal(s, TS + POST_SESSION_WINDOW_MS));
    eq(findDueSignal(s, TS + POST_SESSION_WINDOW_MS + 1), null);
  });
});

describe('EMA pasca-sesi: tidak mengganggu jadwal harian', () => {
  t('sinyal pasca-sesi tidak membuat aplikasi mengira jadwal hari ini sudah dibuat', () => {
    // Bug halus yang sempat terjadi: satu sesi Kubah pagi hari membuat ketiga sinyal
    // acak hari itu tidak pernah dijadwalkan sama sekali.
    eq(hasScheduleFor([pascaSesi()], HARI), false);
    eq(hasScheduleFor([terjadwal()], HARI), true);
  });

  t('kepatuhan harian hanya menghitung sinyal terjadwal', () => {
    const c = dailyCompliance([terjadwal(), pascaSesi(), pascaSesi()], HARI);
    eq(c.total, 1);
    eq(c.pending, 1);
  });

  t('bila keduanya jatuh tempo, pasca-sesi didahulukan', () => {
    // Jendelanya paling pendek, jadi ia yang paling cepat hangus bila diantre.
    const due = findDueSignal([terjadwal(), pascaSesi()], TS + 60_000);
    eq(due.type, SIGNAL_TYPE.POST_SESSION);
  });
});

describe('EMA: butir coping hanya pada fase intervensi', () => {
  t('baseline tetap tiga butir', () => {
    const items = itemsForPhase(PHASE.BASELINE);
    eq(items.length, 3);
    eq(items.map((i) => i.key).join(','), 'focus,control,context');
  });

  t('intervensi menambah satu butir coping di urutan terakhir', () => {
    const items = itemsForPhase(PHASE.INTERVENTION);
    eq(items.length, EMA_ITEMS.length + 1);
    eq(items[items.length - 1].key, 'coping');
    eq(COPING_ITEM.scale.length, 5);
  });

  t('fase yang tidak dikenal diperlakukan seperti baseline', () => {
    eq(itemsForPhase(undefined).length, 3);
    eq(itemsForPhase('maintenance').length, 3);
  });

  t('baris intervensi wajib punya coping', () => {
    throws(() => buildEntry({ signal: terjadwal(), focus: 3, control: 3, context: 3, ts: TS }));
    const row = buildEntry({ signal: terjadwal(), focus: 3, control: 3, context: 3, coping: 4, ts: TS });
    eq(row.coping, 4);
  });

  t('baris baseline menyimpan coping sebagai null, bukan nol', () => {
    // null berarti "memang tidak ditanyakan"; 0 akan terbaca sebagai skor terendah
    // dan menurunkan rata-rata coping fase baseline yang seharusnya kosong.
    const row = buildEntry({
      signal: terjadwal({ phase: PHASE.BASELINE }), focus: 3, control: 3, context: 3, coping: 5, ts: TS,
    });
    eq(row.coping, null);
  });

  t('baris pasca-sesi membawa jenis sinyal dan id sesi', () => {
    const row = buildEntry({ signal: pascaSesi(), focus: 4, control: 2, context: 3, coping: 3, ts: TS + 30_000 });
    eq(row.signal_type, SIGNAL_TYPE.POST_SESSION);
    eq(row.session_id, 'sesi-1');
    eq(row.latency_sec, 30);
    eq(row.impulse, 4);
  });

  t('baris nonrespons pasca-sesi berbentuk sama dengan baris terjawab', () => {
    const miss = buildMissedEntry(pascaSesi(), TS + POST_SESSION_WINDOW_MS + 1);
    const jawab = buildEntry({ signal: pascaSesi(), focus: 3, control: 3, context: 3, coping: 3, ts: TS });
    eq(Object.keys(miss).sort().join(','), Object.keys(jawab).sort().join(','));
    eq(miss.coping, null);
    eq(miss.responded, false);
    eq(miss.session_id, 'sesi-1');
  });
});
