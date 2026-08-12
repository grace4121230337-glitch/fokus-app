/* Uji instrumen: penyekoran, penempatan profil, dan baris data.

   Tes di file ini menjaga hal yang paling mahal kalau salah: skor kuesioner
   tervalidasi dan penempatan kondisi Sprout/Spark. Kesalahan di sini tidak akan
   terlihat di layar mana pun, tetapi merusak seluruh analisis. */

import { describe, t, eq, ok, near } from './harness.js';
import {
  APS_S, IUS_12, SMD, PRETEST_ORDER, CONFIDENCE_MARGIN, ELIGIBILITY,
  scoreApsS, scoreIus12, scoreSmd, scoreAll, classifyProfile, screenEligibility,
  responseRows, missingItems, isComplete, questionText, SMD_PERIOD,
} from '../core/instruments.js';

/** Jawaban seragam untuk semua butir sebuah instrumen. */
const fill = (instrument, value) =>
  Object.fromEntries(instrument.items.map((it) => [it.no, value]));

describe('instrumen: struktur butir sesuai Bab 3', () => {
  t('APS-S berisi 5 butir dengan skala 5 titik', () => {
    eq(APS_S.items.length, 5);
    eq(APS_S.scale.length, 5);
  });

  t('IUS-12 berisi 12 butir: 7 prospective + 5 inhibitory', () => {
    eq(IUS_12.items.length, 12);
    eq(IUS_12.items.filter((i) => i.factor === 'prospective').length, 7);
    eq(IUS_12.items.filter((i) => i.factor === 'inhibitory').length, 5);
  });

  t('SMD berisi 9 butir ya/tidak', () => {
    eq(SMD.items.length, 9);
    eq(SMD.type, 'yesno');
  });

  t('nomor butir unik dan berurutan pada setiap instrumen', () => {
    for (const inst of PRETEST_ORDER) {
      const nos = inst.items.map((i) => i.no);
      eq(new Set(nos).size, nos.length);
      eq(nos.join(','), inst.items.map((_, i) => i + 1).join(','));
    }
  });

  t('tidak ada teks butir yang kosong', () => {
    for (const inst of PRETEST_ORDER) {
      for (const item of inst.items) ok(item.text.trim().length > 10, `butir ${inst.id}-${item.no} terlalu pendek`);
    }
  });

  t('butir SMD ditampilkan dengan periode pengukuran di depan', () => {
    const text = questionText(SMD, SMD.items[0]);
    ok(text.startsWith(SMD_PERIOD), 'periode harus di awal kalimat');
    ok(text.includes('apakah Anda'), 'huruf besar awal butir diturunkan agar kalimatnya mengalir');
  });
});

describe('instrumen: penyekoran', () => {
  t('APS-S semua jawaban 5 menghasilkan skor maksimum 25', () => {
    const s = scoreApsS(fill(APS_S, 5));
    eq(s.total, 25);
    eq(s.mean, 5);
    ok(s.complete);
  });

  t('APS-S semua jawaban 1 menghasilkan skor minimum 5', () => {
    eq(scoreApsS(fill(APS_S, 1)).total, 5);
  });

  t('butir yang belum dijawab tidak dihitung sebagai nol yang sah', () => {
    const s = scoreApsS({ 1: 4, 2: 4 });
    ok(!s.complete, 'harus ditandai belum lengkap');
    eq(missingItems(APS_S, { 1: 4, 2: 4 }).join(','), '3,4,5');
  });

  t('IUS-12 memisahkan kedua faktor dengan benar', () => {
    const answers = fill(IUS_12, 3);
    answers[8] = 5; answers[9] = 5;                 // dua butir inhibitory dinaikkan
    const s = scoreIus12(answers);
    eq(s.total, 12 * 3 + 4);
    eq(s.prospective.total, 21);
    eq(s.inhibitory.total, 5 + 5 + 3 + 3 + 3);
    near(s.inhibitory.mean, 3.8, 0.001);
  });

  t('SMD hanya menghitung jawaban ya', () => {
    const answers = { 1: true, 2: false, 3: true, 4: false, 5: false, 6: false, 7: false, 8: true, 9: false };
    const s = scoreSmd(answers);
    eq(s.total, 3);
    ok(s.complete, '9 butir terjawab, termasuk yang dijawab tidak');
    ok(!s.atOrAboveCutoff);
  });

  t('SMD menerima 1/0 selain true/false', () => {
    eq(scoreSmd({ 1: 1, 2: 0, 3: 1 }).total, 2);
  });

  t('semua butir SMD dijawab tidak tetap dianggap lengkap, bukan kosong', () => {
    const s = scoreSmd(fill(SMD, false));
    eq(s.total, 0);
    ok(isComplete(SMD, fill(SMD, false)));
  });
});

describe('instrumen: penempatan Sprout / Spark', () => {
  /* Dasar penempatan adalah APS-S vs IUS-12, BUKAN IUS-12 vs SMD.

     Versi sebelumnya memakai skor SMD (kecanduan media sosial) sebagai penanda
     orientasi stimulasi. Itu keliru dua kali: Bab 3 3.2 dan 3.6 menyebut penyaringan
     dan penempatan memakai APS-S dan IUS-12, dan SMD mengukur konstruk yang berbeda -
     seorang siswa bisa menunda karena cemas (menghindar) sambil tetap jarang membuka
     media sosial. Memakai SMD berarti melabeli sebagian Sprout sebagai Spark, lalu
     memberi mereka nudge yang salah selama seluruh fase intervensi. */
  const place = (iusValue, apsValue) => classifyProfile(scoreAll({
    'APS-S': fill(APS_S, apsValue),
    'IUS-12': fill(IUS_12, iusValue),
    SMD: fill(SMD, false),
  }));

  t('IUS tinggi & APS rendah -> Sprout (orientasi menghindar)', () => {
    const r = place(5, 1);
    eq(r.profile, 'sprout');
    eq(r.confidence, 'high');
  });

  t('IUS rendah & APS tinggi -> Spark (orientasi stimulasi)', () => {
    const r = place(1, 5);
    eq(r.profile, 'spark');
    eq(r.confidence, 'high');
  });

  t('dasar penempatan disebut eksplisit pada hasil', () => {
    eq(place(3, 3).basis, 'APS-S vs IUS-12');
  });

  t('kedua indeks dinormalisasi ke rentang 0-1', () => {
    const r = place(5, 5);
    near(r.avoidance, 1, 0.0001);
    near(r.arousal, 1, 0.0001);
    const b = place(1, 1);
    near(b.avoidance, 0, 0.0001);
    near(b.arousal, 0, 0.0001);
  });

  t('skor SMD tidak ikut menentukan profil', () => {
    // Batas paling tegas: dua partisipan dengan APS-S dan IUS-12 identik harus
    // mendapat profil dan margin yang sama persis, sekalipun SMD-nya berlawanan.
    const smdRendah = classifyProfile(scoreAll({
      'APS-S': fill(APS_S, 4), 'IUS-12': fill(IUS_12, 2), SMD: fill(SMD, false),
    }));
    const smdTinggi = classifyProfile(scoreAll({
      'APS-S': fill(APS_S, 4), 'IUS-12': fill(IUS_12, 2), SMD: fill(SMD, true),
    }));
    eq(smdRendah.profile, smdTinggi.profile);
    eq(smdRendah.margin, smdTinggi.margin);
  });

  t('selisih tipis ditandai low confidence, bukan disembunyikan', () => {
    const r = place(3, 3);            // avoidance 0,5 vs arousal 0,5
    ok(r.margin < CONFIDENCE_MARGIN, `margin ${r.margin} harus di bawah ambang`);
    eq(r.confidence, 'low');
  });

  t('seri sempurna tetap memberi satu profil agar aplikasi tidak macet', () => {
    const r = place(1, 1);            // 0 vs 0
    eq(r.profile, 'sprout');
    eq(r.confidence, 'low');
  });

  t('penempatan selalu salah satu dari dua profil yang punya aset gambar', () => {
    for (const ius of [1, 2, 3, 4, 5]) {
      for (const aps of [1, 2, 3, 4, 5]) {
        ok(['sprout', 'spark'].includes(place(ius, aps).profile));
      }
    }
  });
});

describe('instrumen: kelayakan penyaringan', () => {
  const scoresFor = (apsValue, iusValue) => scoreAll({
    'APS-S': fill(APS_S, apsValue),
    'IUS-12': fill(IUS_12, iusValue),
    SMD: fill(SMD, false),
  });

  t('APS-S di atas ambang sudah cukup untuk layak', () => {
    const r = screenEligibility(scoresFor(4, 1));
    ok(r.eligible);
    ok(r.byAps && !r.byIus);
  });

  t('IUS-12 di atas ambang juga cukup (aturan "dan/atau")', () => {
    const r = screenEligibility(scoresFor(1, 4));
    ok(r.eligible);
    ok(r.byIus && !r.byAps);
  });

  t('skor rendah pada keduanya ditandai tidak layak, tanpa memblokir aplikasi', () => {
    ok(!screenEligibility(scoresFor(1, 1)).eligible);
  });

  t('ambang persis di batas dihitung layak', () => {
    eq(ELIGIBILITY.apsTotalMin, 15);
    ok(screenEligibility(scoresFor(3, 1)).eligible, 'APS-S 5x3 = 15 tepat di ambang');
  });
});

describe('instrumen: baris data untuk Supabase', () => {
  const answers = {
    'APS-S': fill(APS_S, 4),
    'IUS-12': fill(IUS_12, 2),
    SMD: { 1: true, 2: false },
  };

  t('satu baris per butir terjawab, bukan satu baris skor total', () => {
    const rows = responseRows({ participantId: 'p1', answers });
    eq(rows.length, 5 + 12 + 2);
  });

  t('butir yang belum dijawab tidak dikirim', () => {
    const rows = responseRows({ participantId: 'p1', answers });
    eq(rows.filter((r) => r.instrument === 'SMD').length, 2);
  });

  t('jawaban ya/tidak dikirim sebagai 1 dan 0', () => {
    const rows = responseRows({ participantId: 'p1', answers });
    const smd = rows.filter((r) => r.instrument === 'SMD');
    eq(smd.find((r) => r.item_no === 1).response, 1);
    eq(smd.find((r) => r.item_no === 2).response, 0);
  });

  t('client_id deterministik: pengiriman ulang tidak menghasilkan data ganda', () => {
    const a = responseRows({ participantId: 'p1', answers });
    const b = responseRows({ participantId: 'p1', answers });
    eq(a.map((r) => r.client_id).join('|'), b.map((r) => r.client_id).join('|'));
    eq(new Set(a.map((r) => r.client_id)).size, a.length);
  });

  t('occasion membedakan pretest dari pascates pada partisipan yang sama', () => {
    const pre = responseRows({ participantId: 'p1', answers });
    const post = responseRows({ participantId: 'p1', answers, occasion: 'posttest' });
    eq(post[0].occasion, 'posttest');
    ok(pre[0].client_id !== post[0].client_id, 'client_id harus berbeda antar-occasion');
  });
});
