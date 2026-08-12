/* Instrumen pengukuran FOKUS.

   PERINGATAN PENTING: teks butir di file ini DIKUTIP PERSIS dari Bab 3 Anda
   (tabel APS-S, IUS-12, dan SMD Scale). Butir instrumen tervalidasi tidak boleh
   diparafrase, dipersingkat, atau "diperhalus" - begitu redaksinya berubah, klaim
   validitas dan reliabilitas dari studi asal tidak lagi berlaku untuk data Anda.
   Kalau ada revisi Bab 3, ubah di sini DAN di Bab 3 pada waktu yang sama.

   Sumber:
   - APS-S  : Rasyid, Wangsya, & Putri (2023), 5 aitem, Likert 1-5, alpha .86
   - IUS-12 : Istiqomah, Helmi, & Widhiarso (2022), 12 aitem, 2 faktor, Likert 1-5, alpha .867
   - SMD    : van den Eijnden, Lemmens, & Valkenburg (2016); adaptasi Indonesia
              Dewi & Lestari (2020), 9 aitem, format ya/tidak, alpha .734 */

/** Label skala APS-S: 1 (tidak setuju) sampai 5 (setuju). */
export const SCALE_APS = [
  'Tidak setuju',
  'Agak tidak setuju',
  'Netral',
  'Agak setuju',
  'Setuju',
];

/** Label skala IUS-12: 1 (sangat tidak sesuai) sampai 5 (sangat sesuai). */
export const SCALE_IUS = [
  'Sangat tidak sesuai',
  'Tidak sesuai',
  'Netral',
  'Sesuai',
  'Sangat sesuai',
];

/* Bab 3 menuliskan pengantar butir SMD sebagai "Selama [periode pengukuran],
   apakah Anda...". Periode aslinya pada van den Eijnden dkk. (2016) adalah satu
   tahun terakhir, jadi itu yang dipakai di sini. Ubah satu konstanta ini bila
   pembimbing meminta periode lain - seluruh layar mengikut otomatis. */
export const SMD_PERIOD = 'Selama 12 bulan terakhir';

/* Judul yang dilihat partisipan sengaja NETRAL. Menampilkan "Skala Prokrastinasi"
   atau "Gangguan Media Sosial" ke siswa berisiko menimbulkan demand characteristics
   dan stigma; nama akademiknya tetap tercatat di data (kolom instrument). */

export const APS_S = {
  id: 'APS-S',
  screenTitle: 'Kebiasaan mengerjakan tugas',
  academicName: 'Academic Procrastination Scale - Short Form',
  type: 'likert',
  scale: SCALE_APS,
  intro: 'Sejauh mana pernyataan berikut menggambarkan dirimu selama sebulan terakhir? Tidak ada jawaban benar atau salah.',
  items: [
    { no: 1, text: 'Saya menunda tugas sekolah hingga detik-detik terakhir.' },
    { no: 2, text: 'Saya tahu bahwa saya harus mengerjakan tugas sekolah, namun saya tidak melakukannya.' },
    { no: 3, text: 'Saya tergoda untuk melakukan kegiatan lain yang lebih menyenangkan ketika seharusnya mengerjakan tugas sekolah.' },
    { no: 4, text: 'Ketika diberi tugas, saya biasanya membiarkan dan tidak mengerjakannya hingga mendekati waktu pengumpulan tugas.' },
    { no: 5, text: 'Saya sering menunda deadline pengerjaan tugas yang penting.' },
  ],
};

export const IUS_12 = {
  id: 'IUS-12',
  screenTitle: 'Cara menghadapi hal yang belum pasti',
  academicName: 'Intolerance of Uncertainty Scale - 12',
  type: 'likert',
  scale: SCALE_IUS,
  intro: 'Sejauh mana pernyataan berikut sesuai dengan dirimu?',
  items: [
    { no: 1,  factor: 'prospective', text: 'Kejadian yang tidak terduga membuat saya sangat kesal.' },
    { no: 2,  factor: 'prospective', text: 'Tidak memiliki semua informasi yang saya butuhkan membuat saya frustrasi.' },
    { no: 3,  factor: 'prospective', text: 'Suatu keharusan bagi saya untuk selalu melihat ke depan demi menghindari hal yang mengejutkan.' },
    { no: 4,  factor: 'prospective', text: 'Satu kejadian kecil dan tidak terduga dapat menghancurkan segalanya, bahkan meskipun sudah saya rencanakan dengan sebaik-baiknya.' },
    { no: 5,  factor: 'prospective', text: 'Saya selalu penasaran terhadap masa depan yang menanti saya.' },
    { no: 6,  factor: 'prospective', text: 'Saya tidak tahan bila mengalami kejadian tidak terduga.' },
    { no: 7,  factor: 'prospective', text: 'Saya harus mampu mengatur semuanya terlebih dahulu.' },
    { no: 8,  factor: 'inhibitory',  text: 'Ketidakpastian membuat saya tidak bisa menjalani kehidupan yang utuh.' },
    { no: 9,  factor: 'inhibitory',  text: 'Ketika akan mengambil tindakan, ketidakpastian membuat saya merasa tidak berdaya.' },
    { no: 10, factor: 'inhibitory',  text: 'Ketika merasa tidak yakin, saya tidak dapat melakukan sesuatu dengan baik.' },
    { no: 11, factor: 'inhibitory',  text: 'Setitik keraguan dapat menghentikan saya untuk mengambil tindakan.' },
    { no: 12, factor: 'inhibitory',  text: 'Saya harus menjauhi semua situasi yang tidak pasti.' },
  ],
};

export const SMD = {
  id: 'SMD',
  screenTitle: 'Kebiasaan bermedia sosial',
  academicName: 'Social Media Disorder Scale (9 aitem)',
  type: 'yesno',
  period: SMD_PERIOD,
  intro: 'Jawab ya atau tidak sesuai pengalamanmu. Jawaban ini hanya dibaca oleh peneliti.',
  items: [
    { no: 1, criterion: 'Preoccupation', text: 'Apakah Anda secara rutin merasa tidak bisa memikirkan hal lain selain saat Anda bisa menggunakan media sosial lagi?' },
    { no: 2, criterion: 'Tolerance',     text: 'Apakah Anda secara rutin merasa tidak puas karena ingin menghabiskan lebih banyak waktu di media sosial?' },
    { no: 3, criterion: 'Withdrawal',    text: 'Apakah Anda sering merasa buruk ketika tidak bisa menggunakan media sosial?' },
    { no: 4, criterion: 'Persistence',   text: 'Apakah Anda pernah mencoba mengurangi waktu bermedia sosial, tetapi gagal?' },
    { no: 5, criterion: 'Displacement',  text: 'Apakah Anda secara rutin mengabaikan aktivitas lain (misalnya hobi, olahraga) karena ingin menggunakan media sosial?' },
    { no: 6, criterion: 'Problem',       text: 'Apakah Anda secara rutin berselisih dengan orang lain karena penggunaan media sosial Anda?' },
    { no: 7, criterion: 'Deception',     text: 'Apakah Anda secara rutin berbohong kepada orang tua atau teman tentang jumlah waktu yang Anda habiskan di media sosial?' },
    { no: 8, criterion: 'Escape',        text: 'Apakah Anda sering menggunakan media sosial untuk melarikan diri dari perasaan negatif?' },
    { no: 9, criterion: 'Conflict',      text: 'Apakah Anda mengalami konflik serius dengan orang tua atau saudara kandung Anda karena penggunaan media sosial Anda?' },
  ],
};

/** Urutan pengisian pretest. Pascates memakai APS-S dan SMD saja (Bab 3 Tahap Pascates). */
export const PRETEST_ORDER = [APS_S, IUS_12, SMD];
export const POSTTEST_ORDER = [APS_S, SMD];

/* Probe follow-up memakai APS-S saja.
   Bab 3 hanya meminta "probe susulan untuk menguji durabilitas efek", dan yang perlu
   diuji durabilitasnya adalah prokrastinasi akademik - variabel yang menjadi sasaran
   intervensi. IUS-12 mengukur trait yang tidak diharapkan berubah dalam hitungan
   minggu, dan mengulang SMD untuk ketiga kalinya menambah beban tanpa menambah
   jawaban atas pertanyaan penelitian. */
export const FOLLOWUP_ORDER = [APS_S];

export const INSTRUMENTS = { 'APS-S': APS_S, 'IUS-12': IUS_12, SMD };

/** Kalimat lengkap butir SMD, sudah digabung dengan periode pengukuran. */
export function smdQuestion(item) {
  const body = item.text.charAt(0).toLowerCase() + item.text.slice(1);
  return `${SMD_PERIOD}, ${body}`;
}

/** Pertanyaan siap tampil untuk instrumen apa pun. */
export function questionText(instrument, item) {
  return instrument.type === 'yesno' ? smdQuestion(item) : item.text;
}

/* --- Penyekoran --- */

function answeredCount(instrument, answers = {}) {
  return instrument.items.filter((it) => answers[it.no] !== undefined && answers[it.no] !== null).length;
}

/** Butir yang belum dijawab - dipakai layar untuk menyorot bagian yang tertinggal. */
export function missingItems(instrument, answers = {}) {
  return instrument.items
    .filter((it) => answers[it.no] === undefined || answers[it.no] === null)
    .map((it) => it.no);
}

export function isComplete(instrument, answers = {}) {
  return answeredCount(instrument, answers) === instrument.items.length;
}

/** Skor APS-S. Rentang total 5-25; makin tinggi makin tinggi tendensi prokrastinasi. */
export function scoreApsS(answers = {}) {
  const items = APS_S.items;
  const total = items.reduce((sum, it) => sum + (Number(answers[it.no]) || 0), 0);
  return {
    instrument: 'APS-S',
    complete: isComplete(APS_S, answers),
    total,
    mean: total / items.length,
    min: items.length,
    max: items.length * 5,
  };
}

/** Skor IUS-12 beserta kedua faktornya (prospective 7 aitem, inhibitory 5 aitem). */
export function scoreIus12(answers = {}) {
  const sumOf = (factor) => IUS_12.items
    .filter((it) => !factor || it.factor === factor)
    .reduce((sum, it) => sum + (Number(answers[it.no]) || 0), 0);
  const countOf = (factor) => IUS_12.items.filter((it) => !factor || it.factor === factor).length;

  const total = sumOf(null);
  return {
    instrument: 'IUS-12',
    complete: isComplete(IUS_12, answers),
    total,
    mean: total / countOf(null),
    prospective: { total: sumOf('prospective'), mean: sumOf('prospective') / countOf('prospective') },
    inhibitory:  { total: sumOf('inhibitory'),  mean: sumOf('inhibitory')  / countOf('inhibitory') },
    min: 12,
    max: 60,
  };
}

/** Skor SMD: jumlah jawaban "ya", rentang 0-9. Ambang 5 dari skala asli, deskriptif saja. */
export function scoreSmd(answers = {}) {
  const total = SMD.items.filter((it) => answers[it.no] === true || answers[it.no] === 1).length;
  return {
    instrument: 'SMD',
    complete: isComplete(SMD, answers),
    total,
    max: SMD.items.length,
    atOrAboveCutoff: total >= 5,
  };
}

/** Menyekor ketiga instrumen sekaligus. `answers` dikunci per id instrumen. */
export function scoreAll(answers = {}) {
  return {
    aps: scoreApsS(answers['APS-S'] || {}),
    ius: scoreIus12(answers['IUS-12'] || {}),
    smd: scoreSmd(answers.SMD || {}),
  };
}

/* --- Penempatan kondisi Sprout / Spark --- */

/**
 * Batas selisih untuk menandai hasil "low confidence".
 * Kedua indeks dinormalisasi ke 0-1 lebih dulu, jadi 0,10 di sini setara dengan
 * selisih 0,4 poin pada skala Likert 1-5 aslinya.
 */
export const CONFIDENCE_MARGIN = 0.10;

/**
 * Menempatkan partisipan pada kondisi Sprout (avoidance) atau Spark (arousal).
 *
 * DASAR PENEMPATAN: APS-S dan IUS-12 - persis seperti Bab 3 3.2 dan Tahap Penyaringan
 * pada 3.6, yang menyebut kedua instrumen itulah yang dipakai membagi partisipan ke
 * dua kondisi.
 *
 * Versi sebelumnya memakai IUS-12 lawan SMD, dan itu keliru pada dua tingkat.
 * Pertama, Bab 3 tidak pernah menyebut SMD sebagai dasar penempatan; SMD ada di sana
 * sebagai variabel deskriptif kebiasaan bermedia sosial, bukan alat pemilah kondisi.
 * Kedua, perbandingannya secara metrik tidak sah: IUS-12 rata-rata Likert 1-5,
 * sedangkan SMD hitungan "ya" 0-9 yang biner. Membandingkan keduanya berarti
 * membandingkan dua besaran yang satuannya berbeda, sehingga sebagian partisipan
 * bisa masuk kondisi tertentu semata karena bentuk skalanya, bukan karena orientasinya.
 *
 * Pemetaannya mengikuti tipologi arousal-avoidance Ferrari (1992):
 * - avoidance (Sprout): IUS-12. Menunda karena tak tahan ketidakpastian - tugas
 *   dihindari selagi hasilnya belum jelas.
 * - arousal (Spark): APS-S. Menunda meski sadar harus mengerjakan, khas pola
 *   mengejar tekanan menit terakhir.
 *
 * Keduanya kini berada pada skala Likert 1-5 yang sama, sehingga selisihnya bermakna.
 * Skor mentah kedua indeks tetap disimpan agar penempatan ini bisa diaudit dan, bila
 * pembimbing memilih aturan lain, dianalisis ulang tanpa mengumpulkan data baru.
 */
export function classifyProfile(scores) {
  const avoidance = (scores.ius.mean - 1) / 4;   // IUS-12, 1-5 -> 0-1
  const arousal = (scores.aps.mean - 1) / 4;     // APS-S,  1-5 -> 0-1
  const margin = Math.abs(avoidance - arousal);
  return {
    profile: avoidance >= arousal ? 'sprout' : 'spark',
    avoidance: Number(avoidance.toFixed(4)),
    arousal: Number(arousal.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    basis: 'APS-S vs IUS-12',
    // "low" berarti kedua orientasi hampir seimbang. Aplikasi tetap berjalan normal;
    // penanda ini dipakai peneliti saat menafsirkan hasil per partisipan.
    confidence: margin < CONFIDENCE_MARGIN ? 'low' : 'high',
  };
}

/**
 * Ambang kelayakan penyaringan. Bab 3 menyebut "skor ambang tertentu pada APS-S
 * dan/atau IUS-12" tanpa menyebut angkanya, jadi angka di bawah adalah usulan
 * (rata-rata butir >= 3, yaitu titik tengah skala) yang HARUS dikonfirmasi
 * pembimbing dan dituliskan eksplisit di Bab 3.
 */
export const ELIGIBILITY = { apsTotalMin: 15, iusTotalMin: 36 };

/**
 * Menilai kelayakan TANPA menghalangi siapa pun.
 * Aplikasi sengaja tidak pernah menolak siswa di layar - ditolak mesin setelah
 * mengisi 26 butir tentang kebiasaan buruk sendiri berpotensi merugikan siswa.
 * Keputusan inklusi tetap milik peneliti, memakai penanda ini.
 */
export function screenEligibility(scores) {
  const byAps = scores.aps.total >= ELIGIBILITY.apsTotalMin;
  const byIus = scores.ius.total >= ELIGIBILITY.iusTotalMin;
  return {
    eligible: byAps || byIus,
    byAps,
    byIus,
    rule: 'APS-S >= 15 atau IUS-12 >= 36',
  };
}

/* --- Baris data untuk Supabase --- */

/**
 * Satu baris per butir, bukan satu baris berisi skor total. Data mentah butir
 * diperlukan untuk menghitung ulang Cronbach's Alpha pada sampel sendiri (Bab 3 3.5.e).
 * @param {{participantId: string, answers: object, occasion?: 'pretest'|'posttest'}} args
 */
export function responseRows({ participantId, answers, occasion = 'pretest' }) {
  const at = new Date().toISOString();
  const rows = [];
  for (const [instrumentId, instrument] of Object.entries(INSTRUMENTS)) {
    const given = answers[instrumentId] || {};
    for (const item of instrument.items) {
      const value = given[item.no];
      if (value === undefined || value === null) continue;
      rows.push({
        participant_id: participantId,
        instrument: instrumentId,
        item_no: item.no,
        response: instrument.type === 'yesno' ? (value === true || value === 1 ? 1 : 0) : Number(value),
        occasion,
        answered_at: at,
        // client_id deterministik: kirim ulang berapa kali pun, barisnya tetap satu.
        client_id: `${participantId}:${occasion}:${instrumentId}:${item.no}`,
      });
    }
  }
  return rows;
}
