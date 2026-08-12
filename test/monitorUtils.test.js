/* Pemantauan lintas partisipan.

   Yang diuji di sini bukan kecantikan tabelnya, melainkan satu janji: partisipan yang
   berhenti mengirim data harus MUNCUL DI ATAS, hari itu juga. Dalam desain
   multiple-baseline, deret waktu yang bolong tidak bisa ditambal setelah studi ditutup,
   jadi keterlambatan menyadari satu partisipan yang sunyi berarti kehilangan permanen.

   Test "terakhir terlihat dihitung dari tanggal data" menjaga jebakan yang paling halus:
   perangkat yang lama offline mengirim borongan begitu dapat sinyal. Kalau kesegaran
   diukur dari waktu kiriman, partisipan yang sudah tiga hari tidak berlatih akan
   terbaca "aktif hari ini" - persis kebalikan dari yang perlu diketahui peneliti. */

import { describe, t, eq, ok } from './harness.js';
import {
  monitorRows, studyRollup, monitorCsvRows, MONITOR_COLUMNS, SILENT_DAYS,
} from '../core/monitorUtils.js';

const TODAY = '2026-08-13';

const peserta = (id, over = {}) => ({
  id, code: `T2-0${id}`, tier: 2, started_on: '2026-08-05', school: 'SMA A', ...over,
});
const sesi = (pid, date, over = {}) => ({
  participant_id: pid, session_date: date, outcome: 'completed', elapsed_sec: 1500, hp_end: 80, ...over,
});
const sinyal = (pid, iso, status, signal_type = 'scheduled') => ({
  participant_id: pid, scheduled_at: iso, status, signal_type,
});

describe('pemantauan: pengelompokan', () => {
  t('baris anak masuk ke partisipan pemiliknya saja', () => {
    const rows = monitorRows({
      participants: [peserta('1'), peserta('2')],
      sessions: [sesi('1', TODAY), sesi('1', '2026-08-12'), sesi('2', TODAY)],
    }, { today: TODAY });
    const p1 = rows.find((r) => r.code === 'T2-01');
    const p2 = rows.find((r) => r.code === 'T2-02');
    eq(p1.sessionsTotal, 2);
    eq(p2.sessionsTotal, 1);
  });

  t('baris yatim (participant_id tak dikenal) diabaikan, tidak menabrak', () => {
    const rows = monitorRows({
      participants: [peserta('1')],
      sessions: [sesi('99', TODAY)],
    }, { today: TODAY });
    eq(rows[0].sessionsTotal, 0);
  });

  t('sesi hari ini dipisahkan dari total', () => {
    const rows = monitorRows({
      participants: [peserta('1')],
      sessions: [sesi('1', TODAY), sesi('1', '2026-08-10'), sesi('1', '2026-08-09')],
    }, { today: TODAY });
    eq(rows[0].sessionsToday, 1);
    eq(rows[0].sessionsTotal, 3);
    eq(rows[0].focusMinutes, 75);
  });
});

describe('pemantauan: kesegaran data', () => {
  t('terakhir terlihat dihitung dari tanggal data, bukan waktu kiriman', () => {
    const rows = monitorRows({
      participants: [peserta('1')],
      sessions: [sesi('1', '2026-08-10')],
      emaEntries: [{ participant_id: '1', entry_date: '2026-08-11' }],
    }, { today: TODAY });
    eq(rows[0].lastSeen, '2026-08-11');
    eq(rows[0].lastSeenDays, 2);
  });

  t(`sunyi ${SILENT_DAYS} hari atau lebih ditandai`, () => {
    const rows = monitorRows({
      participants: [peserta('1')],
      sessions: [sesi('1', '2026-08-11')],
    }, { today: TODAY });
    ok(rows[0].flags.some((f) => f.startsWith('sunyi')));
  });

  t('aktif hari ini dengan titik data cukup tidak ditandai apa pun', () => {
    const rows = monitorRows({
      participants: [peserta('1')],
      sessions: [sesi('1', TODAY), sesi('1', '2026-08-12'), sesi('1', '2026-08-11')],
      emaSignals: [sinyal('1', `${TODAY}T02:00:00Z`, 'answered')],
    }, { today: TODAY });
    eq(rows[0].flags, []);
    eq(rows[0].lastSeenDays, 0);
  });

  t('partisipan yang belum mulai ditandai berbeda dari yang sunyi', () => {
    const rows = monitorRows({
      participants: [peserta('1', { started_on: null })],
    }, { today: TODAY });
    eq(rows[0].flags, ['belum mulai']);
    eq(rows[0].day, 0);
  });
});

describe('pemantauan: kepatuhan EMA', () => {
  t('sinyal pasca-sesi dan yang masih menunggu tidak masuk penyebut', () => {
    const rows = monitorRows({
      participants: [peserta('1')],
      emaSignals: [
        sinyal('1', `${TODAY}T02:00:00Z`, 'answered'),
        sinyal('1', `${TODAY}T06:00:00Z`, 'missed'),
        sinyal('1', `${TODAY}T10:00:00Z`, 'pending'),
        sinyal('1', `${TODAY}T03:00:00Z`, 'answered', 'post_session'),
      ],
    }, { today: TODAY });
    eq(rows[0].emaDelivered, 2);
    eq(rows[0].emaAnswered, 1);
    eq(rows[0].emaRate, 50);
    ok(rows[0].flags.includes('EMA di bawah ambang'));
  });

  t('tanpa sinyal terkirim, kepatuhan null dan tidak dituduh di bawah ambang', () => {
    const rows = monitorRows({
      participants: [peserta('1')],
      sessions: [sesi('1', TODAY)],
    }, { today: TODAY });
    eq(rows[0].emaRate, null);
    ok(!rows[0].flags.includes('EMA di bawah ambang'));
  });
});

describe('pemantauan: urutan dan ringkasan', () => {
  t('yang perlu dihubungi naik ke atas', () => {
    const rows = monitorRows({
      participants: [peserta('1'), peserta('2'), peserta('3', { started_on: null })],
      sessions: [sesi('1', TODAY), sesi('1', '2026-08-12'), sesi('1', '2026-08-11'), sesi('2', '2026-08-08')],
    }, { today: TODAY });
    ok(rows[0].flags.length >= rows[1].flags.length);
    eq(rows[rows.length - 1].code, 'T2-01');       // satu-satunya yang bersih
  });

  t('ringkasan studi menghitung yang mulai, aktif, dan perlu dihubungi', () => {
    const rows = monitorRows({
      participants: [peserta('1'), peserta('2'), peserta('3', { started_on: null })],
      sessions: [sesi('1', TODAY), sesi('1', '2026-08-12'), sesi('1', '2026-08-11'), sesi('2', '2026-08-08')],
    }, { today: TODAY });
    const sum = studyRollup(rows, { expectedParticipants: 14 });
    eq(sum.registered, 3);
    eq(sum.started, 2);
    eq(sum.activeToday, 1);
    eq(sum.needsContact, 2);
    eq(sum.sessionsToday, 1);
    ok(!rows.find((r) => r.code === 'T2-01').flags.length);
    eq(sum.expected, 14);
  });

  t('fidelitas menyimpang ikut terhitung dan ditandai', () => {
    const rows = monitorRows({
      participants: [peserta('1')],
      sessions: [sesi('1', TODAY), sesi('1', '2026-08-12'), sesi('1', '2026-08-11')],
      fidelity: [
        { participant_id: '1', entry_date: '2026-08-12', fidelity_ok: false },
        { participant_id: '1', entry_date: '2026-08-11', fidelity_ok: true },
      ],
    }, { today: TODAY });
    eq(rows[0].fidelityBad, 1);
    ok(rows[0].flags.some((f) => f.startsWith('fidelitas')));
  });
});

describe('pemantauan: ekspor CSV', () => {
  t('setiap kolom yang dijanjikan benar-benar ada', () => {
    const rows = monitorRows({
      participants: [peserta('1')],
      sessions: [sesi('1', TODAY)],
    }, { today: TODAY });
    const csv = monitorCsvRows(rows);
    eq(Object.keys(csv[0]), MONITOR_COLUMNS);
  });

  t('bendera digabung menjadi satu sel teks', () => {
    const rows = monitorRows({
      participants: [peserta('1', { started_on: null })],
    }, { today: TODAY });
    eq(monitorCsvRows(rows)[0].flags, 'belum mulai');
  });
});
