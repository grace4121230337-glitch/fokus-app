/* Ambang kepatuhan minimum (Bab 3 3.6, Penanganan Data Hilang).

   Aturan yang paling penting diuji di sini justru aturan negatifnya: fase yang belum
   punya satu pun sinyal terkirim TIDAK boleh dinyatakan lulus. Bila rate dihitung 0/0 = 1
   atau 0, partisipan yang aplikasinya tidak pernah berjalan akan terlihat "patuh" -
   kesalahan yang baru ketahuan saat analisis dan tidak bisa diperbaiki lagi. */

import { describe, t, eq, ok } from './harness.js';
import {
  EMA_MIN_RATE, MIN_DATA_POINTS, THRESHOLD_NOTE, phaseCompliance, complianceReport,
} from '../core/compliance.js';
import { PHASE } from '../core/tier.js';

const sig = (phase, status) => ({ phase, status });
const ses = (phase) => ({ phase });

/** n sinyal terjawab + m terlewat pada satu fase. */
function sinyal(phase, terjawab, terlewat, menunggu = 0) {
  return [
    ...Array.from({ length: terjawab }, () => sig(phase, 'answered')),
    ...Array.from({ length: terlewat }, () => sig(phase, 'missed')),
    ...Array.from({ length: menunggu }, () => sig(phase, 'pending')),
  ];
}

describe('kepatuhan: kontrak angka', () => {
  t('ambang tertulis sebagai satu sumber, bukan angka tersebar', () => {
    eq(EMA_MIN_RATE, 0.6);
    eq(MIN_DATA_POINTS, 3);
    ok(THRESHOLD_NOTE.includes('60%'));
    ok(THRESHOLD_NOTE.includes('3'));
  });
});

describe('kepatuhan: satu fase', () => {
  t('hitungan dasar benar dan sinyal menunggu tidak masuk penyebut', () => {
    const c = phaseCompliance(sinyal(PHASE.BASELINE, 6, 4, 5), Array(3).fill(ses(PHASE.BASELINE)), PHASE.BASELINE);
    eq(c.delivered, 10);
    eq(c.answered, 6);
    eq(c.missed, 4);
    eq(c.rate, 0.6);
    eq(c.dataPoints, 3);
  });

  t('fase tanpa sinyal belum bisa dinilai - rate null dan tidak lulus', () => {
    const c = phaseCompliance([], [], PHASE.BASELINE);
    eq(c.rate, null);
    eq(c.complete, false);
    eq(c.meetsEma, false);
  });

  t('batas: tepat 60% dengan 3 sesi lulus, 59% tidak', () => {
    const pas = phaseCompliance(sinyal(PHASE.BASELINE, 6, 4), Array(3).fill(ses(PHASE.BASELINE)), PHASE.BASELINE);
    eq(pas.complete, true);
    const kurang = phaseCompliance(sinyal(PHASE.BASELINE, 5, 5), Array(3).fill(ses(PHASE.BASELINE)), PHASE.BASELINE);
    eq(kurang.meetsEma, false);
    eq(kurang.complete, false);
  });

  t('batas: EMA cukup tapi titik data kurang tetap tidak lulus', () => {
    const c = phaseCompliance(sinyal(PHASE.BASELINE, 10, 0), Array(2).fill(ses(PHASE.BASELINE)), PHASE.BASELINE);
    eq(c.meetsEma, true);
    eq(c.meetsPoints, false);
    eq(c.complete, false);
  });

  t('data fase lain tidak ikut terhitung', () => {
    const campur = [...sinyal(PHASE.BASELINE, 1, 0), ...sinyal(PHASE.INTERVENTION, 9, 0)];
    const sesi = [ses(PHASE.BASELINE), ...Array(5).fill(ses(PHASE.INTERVENTION))];
    const c = phaseCompliance(campur, sesi, PHASE.BASELINE);
    eq(c.delivered, 1);
    eq(c.dataPoints, 1);
  });
});

describe('kepatuhan: laporan partisipan', () => {
  const stateLengkap = {
    emaSignals: [...sinyal(PHASE.BASELINE, 8, 2), ...sinyal(PHASE.INTERVENTION, 8, 2)],
    sessions: [...Array(4).fill(ses(PHASE.BASELINE)), ...Array(4).fill(ses(PHASE.INTERVENTION))],
  };

  t('hanya baseline dan intervensi yang dinilai', () => {
    const r = complianceReport(stateLengkap);
    eq(r.phases.length, 2);
    eq(r.phases.map((p) => p.phase).join(','), `${PHASE.BASELINE},${PHASE.INTERVENTION}`);
  });

  t('partisipan yang memenuhi dua fase tidak ditandai', () => {
    const r = complianceReport(stateLengkap);
    eq(r.allComplete, true);
    eq(r.flagged.length, 0);
  });

  t('fase yang kurang ditandai, dan penandaan bukan berarti dibuang', () => {
    const r = complianceReport({
      emaSignals: [...sinyal(PHASE.BASELINE, 2, 8), ...sinyal(PHASE.INTERVENTION, 8, 2)],
      sessions: [...Array(4).fill(ses(PHASE.BASELINE)), ...Array(4).fill(ses(PHASE.INTERVENTION))],
    });
    eq(r.flagged.join(','), PHASE.BASELINE);
    eq(r.allComplete, false);
    // Datanya tetap utuh di state - laporan hanya menandai.
    eq(r.phases[0].delivered, 10);
  });

  t('state kosong tidak melempar galat', () => {
    const r = complianceReport({});
    eq(r.allComplete, false);
    eq(r.phases.length, 2);
  });
});
