/* Uji kode partisipan dan penetapan tier.

   Tier adalah tulang punggung desain multiple-baseline. Satu partisipan yang
   masuk ke tier keliru berarti satu seri data tidak bisa dipakai, dan kesalahan
   itu tidak bisa diperbaiki setelah studi berjalan. Karena itu parsing kode
   diuji sampai ke kasus-kasus pinggirnya. */

import { describe, t, eq, ok } from './harness.js';
import { parseParticipantCode, normalizeCode, codeSummary, rosterCodes } from '../core/participant.js';
import { TIERS, N_TOTAL } from '../core/tier.js';

describe('kode partisipan: bentuk yang diterima', () => {
  t('kode baku T1-01 dikenali beserta tiernya', () => {
    const r = parseParticipantCode('T1-01');
    ok(r.ok);
    eq(r.tier, 1);
    eq(r.index, 1);
  });

  t('huruf kecil dan spasi tetap diterima', () => {
    const r = parseParticipantCode('  t3-02 ');
    ok(r.ok);
    eq(r.code, 'T3-02');
    eq(r.tier, 3);
  });

  t('tanda pisah lain (underscore, en dash, titik) dianggap sama', () => {
    for (const raw of ['T2_03', 'T2\u201303', 'T2.03']) {
      const r = parseParticipantCode(raw);
      ok(r.ok, `${raw} seharusnya diterima`);
      eq(r.code, 'T2-03');
    }
  });

  t('normalizeCode tidak mengubah kode yang sudah benar', () => {
    eq(normalizeCode('T4-03'), 'T4-03');
  });
});

describe('kode partisipan: penolakan yang menjelaskan', () => {
  t('kode kosong ditolak dengan pesan yang jelas', () => {
    const r = parseParticipantCode('   ');
    ok(!r.ok);
    ok(r.error.includes('belum diisi'));
  });

  t('nomor satu digit ditolak agar format seragam', () => {
    ok(!parseParticipantCode('T1-1').ok);
  });

  t('tier di luar 1-4 ditolak', () => {
    ok(!parseParticipantCode('T5-01').ok);
    ok(!parseParticipantCode('T0-01').ok);
  });

  t('nomor melebihi kuota tier ditolak, dan pesannya menyebut batasnya', () => {
    const r = parseParticipantCode('T3-04');            // tier 3 hanya 3 orang
    ok(!r.ok);
    ok(r.error.includes('T3-03'), `pesan harus menyebut batas: ${r.error}`);
  });

  t('nomor 00 ditolak', () => {
    ok(!parseParticipantCode('T1-00').ok);
  });

  t('teks acak tidak pernah lolos sebagai kode', () => {
    for (const raw of ['budi', '01-T1', 'T-101', 'TIER1-01', '']) {
      ok(!parseParticipantCode(raw).ok, `${raw} seharusnya ditolak`);
    }
  });
});

describe('kode partisipan: daftar resmi 14 kode', () => {
  t('jumlah kode persis sama dengan jumlah partisipan', () => {
    eq(rosterCodes().length, N_TOTAL);
  });

  t('semua kode unik', () => {
    const codes = rosterCodes();
    eq(new Set(codes).size, codes.length);
  });

  t('setiap kode pada daftar lolos validasi', () => {
    for (const code of rosterCodes()) ok(parseParticipantCode(code).ok, `${code} gagal divalidasi`);
  });

  t('komposisi per tier mengikuti kuota 4-4-3-3', () => {
    const codes = rosterCodes();
    for (const [tier, cfg] of Object.entries(TIERS)) {
      eq(codes.filter((c) => c.startsWith(`T${tier}-`)).length, cfg.quota);
    }
  });

  t('ringkasan kode menyebut panjang baseline dan intervensi tier tersebut', () => {
    const parsed = parseParticipantCode('T4-01');
    const text = codeSummary(parsed);
    ok(text.includes('8'), 'baseline tier 4 adalah 8 hari');
    ok(text.includes('13'), 'total tier 4 adalah 13 hari');
  });
});
