import {
  describe, t, eq, ok, near, throws,
} from './harness.js';
import {
  ITEMS, SCALE, DOMAINS, answerKey, missingItems, isComplete, scoreSummary, buildRow, SOCIAL_VALIDITY_VERSION,
} from '../core/socialValidity.js';

function jawabPenuh(nilai = 4) {
  const out = {};
  for (const item of ITEMS) out[answerKey(item.no)] = nilai;
  return out;
}

export default function socialValidity() {
  describe('socialValidity - struktur butir', () => {
    t('enam butir, dua tiap domain', () => {
      eq(ITEMS.length, 6);
      for (const domain of Object.values(DOMAINS)) {
        eq(ITEMS.filter((i) => i.domain === domain).length, 2, domain);
      }
    });
    t('skala lima titik', () => { eq(SCALE.length, 5); });
  });

  describe('socialValidity - kelengkapan', () => {
    t('kosong berarti enam butir hilang', () => {
      eq(missingItems({}).length, 6);
      ok(!isComplete({}));
    });
    t('satu butir hilang terdeteksi tepat nomornya', () => {
      const jawaban = jawabPenuh(5);
      delete jawaban[answerKey(3)];
      eq(missingItems(jawaban), [3]);
      ok(!isComplete(jawaban));
    });
    t('lengkap semua terdeteksi selesai', () => {
      ok(isComplete(jawabPenuh(4)));
    });
  });

  describe('socialValidity - skor', () => {
    t('rerata domain dan keseluruhan saat seragam', () => {
      const skor = scoreSummary(jawabPenuh(4));
      eq(skor.significance, 4);
      eq(skor.appropriateness, 4);
      eq(skor.effects, 4);
      eq(skor.overall, 4);
    });
    t('domain null bila salah satu butirnya kosong', () => {
      const jawaban = jawabPenuh(5);
      delete jawaban[answerKey(1)];
      const skor = scoreSummary(jawaban);
      eq(skor.significance, null);
      eq(skor.appropriateness, 5);
      eq(skor.overall, null);
    });
    t('rerata campuran dibulatkan dua desimal', () => {
      const jawaban = jawabPenuh(4);
      jawaban[answerKey(1)] = 5;
      const skor = scoreSummary(jawaban);
      near(skor.significance, 4.5, 1e-9);
    });
  });

  describe('socialValidity - baris kirim', () => {
    t('menolak baris tidak lengkap', () => {
      throws(() => buildRow({ answers: {}, ts: Date.now(), clientId: 'x' }));
    });
    t('baris lengkap berisi enam item dan versi', () => {
      const row = buildRow({
        answers: jawabPenuh(5),
        note: '  Sangat membantu.  ',
        ts: Date.parse('2026-08-11T00:00:00Z'),
        appVersion: '0.6.0',
        clientId: 'sv-test',
      });
      eq(row.client_id, 'sv-test');
      eq(row.version, SOCIAL_VALIDITY_VERSION);
      eq(row.item_1, 5);
      eq(row.item_6, 5);
      eq(row.overall_mean, 5);
      eq(row.note, 'Sangat membantu.');
      eq(row.app_version, '0.6.0');
      ok(row.submitted_at.startsWith('2026-08-11'));
    });
    t('catatan kosong tersimpan sebagai null', () => {
      const row = buildRow({
        answers: jawabPenuh(3), note: '   ', ts: Date.now(), clientId: 'sv-2',
      });
      eq(row.note, null);
    });
  });
}
