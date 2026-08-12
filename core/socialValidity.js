/* Validitas sosial (Wolf, 1978) - langkah terakhir sebelum partisipan dianggap tuntas.

   Wolf membedakan tiga jenis penilaian subjektif terhadap sebuah intervensi:
     1) signifikansi sosial dari TUJUANnya - apakah masalah yang disasar memang penting?
     2) kewajaran sosial dari PROSEDURnya - apakah caranya bisa diterima dan tidak
        mengganggu kehidupan sehari-hari partisipan?
     3) kepentingan sosial dari HASILnya - apakah perubahan yang terjadi terasa berarti
        bagi partisipan sendiri, terlepas dari apa kata data kuantitatif?

   Instrumen ini BUKAN alat ukur baku seperti APS-S/IUS-12/SMD di pretest - ia adalah
   cek penerimaan (acceptability) satu kali di akhir studi, dan tidak dipakai untuk
   menguji hipotesis utama. Karena itu jawabannya disimpan sebagai satu baris ringkas
   per partisipan, bukan satu baris per butir seperti pretest_responses.

   Murni: tidak ada Store, tidak ada Sync, tidak ada DOM. Perekatnya langsung di
   ui/screens/survey.js karena datanya kecil dan hanya dikirim sekali. */

export const SOCIAL_VALIDITY_VERSION = '2026-08-cp6';

/** Skala Likert 1-5, sama seperti pretest. */
export const SCALE = ['Sangat tidak setuju', 'Tidak setuju', 'Netral', 'Setuju', 'Sangat setuju'];

export const DOMAINS = {
  SIGNIFICANCE: 'significance',
  APPROPRIATENESS: 'appropriateness',
  EFFECTS: 'effects',
};

/** Label domain untuk peneliti - tidak pernah ditampilkan ke partisipan. */
export const DOMAIN_LABEL = {
  [DOMAINS.SIGNIFICANCE]: 'Signifikansi tujuan',
  [DOMAINS.APPROPRIATENESS]: 'Kewajaran prosedur',
  [DOMAINS.EFFECTS]: 'Kepentingan hasil',
};

/* Dua butir per domain, urutan tetap. Redaksi memakai "aplikasi ini" dan "program ini"
   secara konsisten, bukan menyebut fitur teknis (nudge, EMA, dsb) - partisipan menilai
   pengalamannya, bukan mengaudit arsitektur perangkat lunak. */
export const ITEMS = [
  {
    no: 1,
    domain: DOMAINS.SIGNIFICANCE,
    text: 'Mengurangi kebiasaan menunda tugas dan gangguan digital adalah hal yang penting bagi saya.',
  },
  {
    no: 2,
    domain: DOMAINS.SIGNIFICANCE,
    text: 'Program ini menyasar masalah yang memang saya rasakan sehari-hari.',
  },
  {
    no: 3,
    domain: DOMAINS.APPROPRIATENESS,
    text: 'Cara aplikasi ini bekerja (sesi fokus, pertanyaan singkat harian) terasa wajar dan tidak mengganggu.',
  },
  {
    no: 4,
    domain: DOMAINS.APPROPRIATENESS,
    text: 'Saya merasa nyaman menggunakan aplikasi ini selama program berlangsung.',
  },
  {
    no: 5,
    domain: DOMAINS.EFFECTS,
    text: 'Setelah mengikuti program ini, kebiasaan saya menunda tugas terasa berkurang.',
  },
  {
    no: 6,
    domain: DOMAINS.EFFECTS,
    text: 'Setelah mengikuti program ini, saya merasa lebih bisa mengendalikan penggunaan media sosial saat seharusnya belajar.',
  },
];

export function answerKey(itemNo) {
  return `sv_${itemNo}`;
}

export function missingItems(answers = {}) {
  return ITEMS.filter((item) => {
    const v = answers[answerKey(item.no)];
    return v === null || v === undefined || v === '';
  }).map((item) => item.no);
}

export function isComplete(answers = {}) {
  return missingItems(answers).length === 0;
}

function meanOf(nilai) {
  if (!nilai.length) return null;
  return Math.round((nilai.reduce((a, b) => a + b, 0) / nilai.length) * 100) / 100;
}

function domainMean(answers, domain) {
  const butirDomain = ITEMS.filter((i) => i.domain === domain);
  const nilai = butirDomain
    .map((i) => Number(answers[answerKey(i.no)]))
    .filter((n) => Number.isFinite(n));
  return nilai.length === butirDomain.length ? meanOf(nilai) : null;
}

/** Ringkasan skor per domain + keseluruhan. null bila domain terkait belum lengkap. */
export function scoreSummary(answers = {}) {
  const significance = domainMean(answers, DOMAINS.SIGNIFICANCE);
  const appropriateness = domainMean(answers, DOMAINS.APPROPRIATENESS);
  const effects = domainMean(answers, DOMAINS.EFFECTS);
  const overall = isComplete(answers)
    ? meanOf(ITEMS.map((i) => Number(answers[answerKey(i.no)])))
    : null;
  return { significance, appropriateness, effects, overall };
}

/**
 * Membentuk baris siap kirim ke tabel `social_validity`.
 * Melempar bila jawaban belum lengkap - konsisten dengan pretest: tidak ada
 * jawaban sebagian yang tersimpan sebagai baris "selesai".
 *
 * @param {object} args
 * @param {Record<string, number>} args.answers
 * @param {string} [args.note] - umpan balik terbuka, opsional, tidak diskor.
 * @param {number} args.ts - epoch ms saat dikirim.
 * @param {string} [args.appVersion]
 * @param {string} args.clientId - dibuat di perangkat untuk deduplikasi sinkron.
 */
export function buildRow({ answers = {}, note = '', ts, appVersion = null, clientId }) {
  const kurang = missingItems(answers);
  if (kurang.length) throw new Error(`Butir belum lengkap: ${kurang.join(', ')}`);

  const skor = scoreSummary(answers);
  const row = {
    client_id: clientId,
    version: SOCIAL_VALIDITY_VERSION,
    significance_mean: skor.significance,
    appropriateness_mean: skor.appropriateness,
    effects_mean: skor.effects,
    overall_mean: skor.overall,
    // Catatan terbuka dipotong, bukan ditolak - umpan balik panjang tetap berharga
    // walau dipangkas, sedangkan menolak submit karena catatan kepanjangan hanya
    // akan membuat partisipan menghapus tulisannya sendiri.
    note: note ? (String(note).trim().slice(0, 2000) || null) : null,
    submitted_at: new Date(ts).toISOString(),
    app_version: appVersion,
  };
  ITEMS.forEach((item) => { row[`item_${item.no}`] = Number(answers[answerKey(item.no)]); });
  return row;
}
