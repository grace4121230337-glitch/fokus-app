/* Utilitas ekspor data penelitian - dipakai oleh api/export.js (server, service_role)
   dan diuji langsung di sini tanpa jaringan maupun Supabase sungguhan.

   Kenapa dipisah dari api/export.js: logika pembentukan CSV dan baris siap-Tau-U
   adalah bagian yang paling mudah salah (escaping koma, kolom yang hilang di sebagian
   baris, pemetaan fase ke kode fase A/B) dan paling penting untuk benar - keliru di
   sini berarti analisis Tau-U peneliti memakai data yang salah tanpa ketahuan.
   Menjadikannya modul murni berarti aturan itu bisa diuji lewat `node test/run.js`. */

/** Dataset yang bisa diminta lewat /api/export.js beserta kueri PostgREST-nya. */
export const DATASETS = {
  participants:   { table: 'participants',    select: '*' },
  sessions:       { table: 'sessions',        select: '*,participants(code,tier,profile)' },
  ema:            { table: 'ema_entries',     select: '*,participants(code,tier,profile)' },
  nudge:          { table: 'nudge_log',       select: '*,participants(code,tier,profile)' },
  fidelity:       { table: 'fidelity_log',    select: '*,participants(code,tier,profile)' },
  socialValidity: { table: 'social_validity', select: '*,participants(code,tier,profile)' },
};

export const DATASET_NAMES = Object.keys(DATASETS);

/** Kolom sesi yang boleh dipakai sebagai ukuran bergantung pada analisis Tau-U. */
export const TAUU_MEASURES = [
  'hp_end', 'away_total_sec', 'away_glance', 'away_mid', 'away_switch', 'elapsed_sec', 'xp_awarded',
];

/**
 * Meratakan satu tingkat objek bersarang (hasil embed PostgREST, mis. `participants`)
 * menjadi kolom bertitik-bawah, dan mengubah array yang tersisa (jsonb seperti
 * away_marks, detail) menjadi string JSON supaya tetap muat di satu sel CSV.
 */
export function flattenRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        out[`${key}_${subKey}`] = subValue;
      }
    } else if (Array.isArray(value)) {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * Mengubah baris (setelah diratakan) menjadi CSV. Kolom diambil dari GABUNGAN
 * seluruh baris, bukan hanya baris pertama - baris yang kolomnya lebih sedikit
 * (mis. nonrespons) tidak boleh menggeser kolom baris lain.
 */
export function toCsv(rows) {
  const flat = rows.map(flattenRow);
  const columns = [];
  const seen = new Set();
  for (const row of flat) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) { seen.add(key); columns.push(key); }
    }
  }
  const header = columns.map(csvCell).join(',');
  const body = flat.map((row) => columns.map((c) => csvCell(row[c])).join(','));
  return [header, ...body].join('\n');
}

/**
 * Bentuk baris sesi menjadi bentuk siap Tau-U: satu baris per sesi, dengan kolom
 * tier+phase eksplisit dan satu kolom `value` sesuai ukuran yang diminta.
 *
 * `phase_code` A/B mengikuti konvensi SCED umum (A = baseline, B = intervensi) supaya
 * bisa langsung ditempel ke kalkulator/paket Tau-U mana pun tanpa pemetaan ulang.
 * Baris di luar baseline/intervensi (pra-studi, maintenance) DIBUANG - memaksanya
 * jadi salah satu kode akan mencemari perbandingan yang justru ingin diuji Tau-U.
 */
export function tauURows(sessionRows, { measure = 'hp_end' } = {}) {
  if (!TAUU_MEASURES.includes(measure)) {
    throw new Error(`Ukuran tidak dikenal: ${measure}. Pilihan: ${TAUU_MEASURES.join(', ')}`);
  }
  return sessionRows
    .map((row) => {
      const phase = row.phase;
      const phaseCode = phase === 'baseline' ? 'A' : phase === 'intervention' ? 'B' : null;
      return {
        participant_code: row.participants?.code ?? row.participant_code ?? null,
        tier: row.tier ?? row.participants?.tier ?? null,
        phase,
        phase_code: phaseCode,
        study_day: row.study_day ?? null,
        session_date: row.session_date ?? null,
        measure,
        value: row[measure] ?? null,
      };
    })
    .filter((row) => row.phase_code !== null)
    .sort((a, b) => {
      if (a.participant_code !== b.participant_code) {
        return String(a.participant_code).localeCompare(String(b.participant_code));
      }
      return (a.study_day ?? 0) - (b.study_day ?? 0);
    });
}
