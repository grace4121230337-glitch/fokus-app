import {
  describe, t, eq, ok, throws,
} from './harness.js';
import {
  flattenRow, toCsv, tauURows, DATASET_NAMES, DATASETS,
} from '../core/exportUtils.js';

export default function exportUtils() {
  describe('exportUtils - dataset', () => {
    t('daftar dataset mencakup tabel checkpoint 6', () => {
      ok(DATASET_NAMES.includes('socialValidity'));
      ok(DATASET_NAMES.includes('sessions'));
      eq(DATASETS.sessions.table, 'sessions');
    });
  });

  describe('exportUtils - flattenRow', () => {
    t('meratakan objek bersarang satu tingkat dengan prefiks', () => {
      const flat = flattenRow({ id: '1', participants: { code: 'T1-01', tier: 1 } });
      eq(flat.id, '1');
      eq(flat.participants_code, 'T1-01');
      eq(flat.participants_tier, 1);
    });
    t('array (jsonb) diubah menjadi string JSON', () => {
      const flat = flattenRow({ away_marks: [{ type: 'glance' }] });
      eq(flat.away_marks, JSON.stringify([{ type: 'glance' }]));
    });
    t('null tetap null, bukan diratakan', () => {
      const flat = flattenRow({ participants: null, x: 1 });
      eq(flat.participants, null);
      eq(flat.x, 1);
    });
  });

  describe('exportUtils - toCsv', () => {
    t('header gabungan seluruh baris, bukan hanya baris pertama', () => {
      const csv = toCsv([{ a: 1 }, { a: 2, b: 3 }]);
      const [header, r1, r2] = csv.split('\n');
      eq(header, 'a,b');
      eq(r1, '1,');
      eq(r2, '2,3');
    });
    t('nilai berkoma dibungkus tanda kutip', () => {
      const csv = toCsv([{ note: 'halo, dunia' }]);
      eq(csv.split('\n')[1], '"halo, dunia"');
    });
    t('tanda kutip di dalam nilai digandakan', () => {
      const csv = toCsv([{ note: 'dia bilang "oke"' }]);
      eq(csv.split('\n')[1], '"dia bilang ""oke"""');
    });
  });

  describe('exportUtils - tauURows', () => {
    const sesi = [
      {
        participants: { code: 'T1-01' }, tier: 1, phase: 'baseline', study_day: 1, hp_end: 90,
      },
      {
        participants: { code: 'T1-01' }, tier: 1, phase: 'intervention', study_day: 6, hp_end: 70,
      },
      {
        participants: { code: 'T1-01' }, tier: 1, phase: 'pre', study_day: 0, hp_end: 100,
      },
    ];
    t('baris di luar baseline/intervensi dibuang', () => {
      const rows = tauURows(sesi, { measure: 'hp_end' });
      eq(rows.length, 2);
    });
    t('fase dipetakan ke kode A/B', () => {
      const rows = tauURows(sesi, { measure: 'hp_end' });
      eq(rows[0].phase_code, 'A');
      eq(rows[1].phase_code, 'B');
    });
    t('nilai diambil dari kolom ukuran yang diminta', () => {
      const rows = tauURows(sesi, { measure: 'hp_end' });
      eq(rows[0].value, 90);
      eq(rows[1].value, 70);
    });
    t('ukuran tidak dikenal ditolak', () => {
      throws(() => tauURows(sesi, { measure: 'not_a_column' }));
    });
  });
}
