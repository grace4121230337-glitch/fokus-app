/* Struk Fokus - pengujian pagar penelitian, bukan sekadar pengujian aritmetika.

   Dua test terpenting di berkas ini adalah dua yang menjaga desain multiple-baseline:

   - "bentuk struk identik di semua fase": kalau suatu saat seseorang menambahkan baris
     yang hanya muncul saat intervensi ("NUDGE DITERIMA", misalnya), struk berubah
     menjadi bagian dari perlakuan dan kenaikan yang terukur tidak lagi bisa
     diatribusikan ke nudge yang diteliti. Test ini akan merah lebih dulu.
   - "kalimat penutup tidak bergantung pada performa": pujian yang hanya muncul saat
     angka bagus adalah umpan balik kontingen - perlakuan, bukan pelaporan.

   Sisanya menjaga hal-hal yang mudah salah dan mahal: rentang tanggal yang mundur
   melewati hari pertama studi, dan penyebut kepatuhan yang tercampur sinyal pasca-sesi. */

import { describe, t, eq, ok } from './harness.js';
import {
  SCOPE, periodRange, summarize, receiptData, receiptNo, dotLeader, receiptText,
} from '../core/insight.js';

const TS = Date.parse('2026-08-13T05:00:00Z');       // 2026-08-13 12:00 WIB

function sesi(date, extra = {}) {
  return {
    session_date: date,
    outcome: 'completed',
    elapsed_sec: 1500,
    hp_end: 80,
    xp_awarded: 30,
    ...extra,
  };
}

function sinyal(dateIso, status, type = 'scheduled') {
  return { scheduledAt: dateIso, status, type };
}

function state(over = {}) {
  return {
    participant: { code: 'T2-03', tier: 2, startedOn: '2026-08-05', id: 'p1' },
    xp: 420,
    streak: 4,
    mana: 60,
    sessions: [],
    emaSignals: [],
    emaEntries: [],
    ...over,
  };
}

describe('struk: rentang periode', () => {
  t('7 hari terakhir mencakup hari ini dan enam hari sebelumnya', () => {
    const r = periodRange(state({ participant: { code: 'X', tier: 2, startedOn: '2026-07-01' } }), SCOPE.WEEK, TS);
    eq(r, { start: '2026-08-07', end: '2026-08-13' });
  });

  t('tidak mundur melewati hari pertama studi', () => {
    // Studi baru berjalan 3 hari: "7 hari terakhir" tidak boleh memunculkan 4 hari
    // kosong yang terbaca sebagai kemunduran.
    const r = periodRange(state({ participant: { code: 'X', tier: 2, startedOn: '2026-08-11' } }), SCOPE.WEEK, TS);
    eq(r, { start: '2026-08-11', end: '2026-08-13' });
  });

  t('cakupan seluruhnya dimulai dari hari pertama studi', () => {
    const r = periodRange(state(), SCOPE.ALL, TS);
    eq(r, { start: '2026-08-05', end: '2026-08-13' });
  });
});

describe('struk: ringkasan angka', () => {
  t('hanya menghitung sesi di dalam rentang', () => {
    const s = state({
      sessions: [sesi('2026-08-13'), sesi('2026-08-12'), sesi('2026-08-01')],
    });
    const m = summarize(s, SCOPE.WEEK, TS);
    eq(m.sessionsStarted, 2);
    eq(m.focusMinutes, 50);
    eq(m.activeDays, 2);
  });

  t('hari aktif dihitung per tanggal, bukan per sesi', () => {
    const s = state({ sessions: [sesi('2026-08-13'), sesi('2026-08-13'), sesi('2026-08-13')] });
    const m = summarize(s, SCOPE.WEEK, TS);
    eq(m.sessionsStarted, 3);
    eq(m.activeDays, 1);
  });

  t('sesi gagal tetap dihitung sebagai dimulai, tidak sebagai tuntas', () => {
    const s = state({ sessions: [sesi('2026-08-13'), sesi('2026-08-12', { outcome: 'aborted', hp_end: 0 })] });
    const m = summarize(s, SCOPE.WEEK, TS);
    eq(m.sessionsStarted, 2);
    eq(m.sessionsCompleted, 1);
    eq(m.hpMean, 80);            // sesi gagal tidak menyeret rata-rata ketahanan
  });

  t('kepatuhan EMA hanya dari sinyal terjadwal, sinyal menunggu bukan penyebut', () => {
    const s = state({
      emaSignals: [
        sinyal('2026-08-13T02:00:00Z', 'answered'),
        sinyal('2026-08-13T06:00:00Z', 'missed'),
        sinyal('2026-08-13T10:00:00Z', 'pending'),
        sinyal('2026-08-13T03:00:00Z', 'answered', 'post_session'),
      ],
    });
    const m = summarize(s, SCOPE.WEEK, TS);
    eq(m.emaDelivered, 2);
    eq(m.emaAnswered, 1);
    eq(m.emaRate, 50);
  });

  t('belum ada sinyal terkirim berarti belum bisa dinilai, bukan nol persen', () => {
    eq(summarize(state(), SCOPE.WEEK, TS).emaRate, null);
  });
});

describe('struk: pagar penelitian', () => {
  t('bentuk struk identik di fase baseline dan intervensi', () => {
    /* Perbedaan satu-satunya antara kedua state adalah posisi hari studi, yang
       menentukan fase. Kalau baris struk ikut berubah, struk menjadi perlakuan. */
    const baseline = receiptData(state({
      participant: { code: 'T2-03', tier: 2, startedOn: '2026-08-11', id: 'p1' },
      sessions: [sesi('2026-08-13')],
    }), { ts: TS });
    const intervensi = receiptData(state({
      participant: { code: 'T2-03', tier: 2, startedOn: '2026-08-01', id: 'p1' },
      sessions: [sesi('2026-08-13')],
    }), { ts: TS });

    eq(baseline.lines.map((l) => l.label), intervensi.lines.map((l) => l.label));
    eq(baseline.totals.map((x) => x.key), intervensi.totals.map((x) => x.key));
    eq(baseline.footer, intervensi.footer);
  });

  t('kalimat penutup tidak bergantung pada performa', () => {
    const rajin = receiptData(state({
      sessions: Array.from({ length: 7 }, (_, i) => sesi(`2026-08-${String(7 + i).padStart(2, '0')}`)),
    }), { ts: TS });
    const kosong = receiptData(state(), { ts: TS });
    eq(rajin.footer, kosong.footer);
  });

  t('tidak ada baris yang berisi saran atau perintah', () => {
    const d = receiptData(state({ sessions: [sesi('2026-08-13')] }), { ts: TS });
    const teks = receiptText(d).toLowerCase();
    for (const kata of ['coba ', 'sebaiknya', 'harus', 'tingkatkan', 'kurangi']) {
      ok(!teks.includes(kata), `struk tidak boleh menyarankan: "${kata}"`);
    }
  });

  t('kode partisipan tampil, posisi tier dalam desain tidak', () => {
    const d = receiptData(state({ sessions: [sesi('2026-08-13')] }), { ts: TS });
    const teks = receiptText(d);
    ok(teks.includes('T2-03'));
    ok(!teks.toLowerCase().includes('tier'));
  });
});

describe('struk: penyusunan', () => {
  t('baris ketahanan hilang bila belum ada sesi tuntas', () => {
    const kosong = receiptData(state(), { ts: TS });
    ok(!kosong.lines.some((l) => l.label === 'RATA KETAHANAN'));
    const ada = receiptData(state({ sessions: [sesi('2026-08-13')] }), { ts: TS });
    ok(ada.lines.some((l) => l.label === 'RATA KETAHANAN'));
  });

  t('nomor struk stabil untuk periode yang sama, berbeda antarperiode', () => {
    const a = receiptNo('T2-03', { start: '2026-08-07', end: '2026-08-13' });
    const b = receiptNo('T2-03', { start: '2026-08-07', end: '2026-08-13' });
    const c = receiptNo('T2-03', { start: '2026-08-01', end: '2026-08-13' });
    eq(a, b);
    ok(a !== c);
    ok(/^FKS-\d{4}$/.test(a));
  });

  t('barcode deterministik dan tidak kosong', () => {
    const d1 = receiptData(state(), { ts: TS });
    const d2 = receiptData(state(), { ts: TS });
    ok(d1.barcode.length > 0);
    eq(d1.barcode, d2.barcode);
  });

  t('dotLeader merapatkan label dan nilai pada lebar tetap', () => {
    const baris = dotLeader('SESI', '12', 20);
    eq(baris.length, 20);
    ok(baris.startsWith('SESI'));
    ok(baris.endsWith('12'));
  });

  t('versi teks memuat kode, penutup, dan alamat', () => {
    const d = receiptData(state({ sessions: [sesi('2026-08-13')] }), { ts: TS });
    const teks = receiptText(d);
    ok(teks.includes(d.receiptNo));
    ok(teks.includes(d.footer));
    ok(teks.includes(d.footerNote));
  });
});
