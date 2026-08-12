/* Kode partisipan dan penetapan tier.

   KEPUTUSAN DESAIN (Anda meminta saya memakai kebijaksanaan sendiri):
   tier TIDAK dipilih dari dropdown dan TIDAK ditentukan otomatis oleh aplikasi,
   melainkan DIBACA dari kode partisipan yang sudah Anda tetapkan sebelum studi
   berjalan, misalnya T3-02 = tier 3, partisipan ke-2.

   Alasannya tiga:
   1. Multiple-baseline berdiri di atas urutan mulai yang ditentukan LEBIH DULU.
      Kalau aplikasi mengisi kuota sendiri, urutan tier jadi bergantung pada siapa
      yang kebetulan membuka aplikasi lebih dahulu - itu merusak logika desain.
   2. Dropdown pilihan tier bisa salah klik, dan satu partisipan di tier keliru
      berarti satu seri data tidak bisa dipakai. Kode adalah satu sumber kebenaran
      yang juga tertulis di daftar partisipan Anda, jadi kesalahan mudah terlihat.
   3. Kuota tetap terjaga tanpa jaringan. Aplikasi tidak perlu bertanya ke server
      "tier mana yang masih kosong", jadi pendaftaran tetap jalan walau sekolah
      sedang tanpa sinyal.

   Konsekuensinya: Anda perlu menyiapkan 14 kode (rosterCodes() di bawah membuatnya)
   dan membagikannya satu per satu ke partisipan. */

import { TIERS } from './tier.js';

export const CODE_PATTERN = /^T([1-4])-(\d{2})$/;
export const CODE_EXAMPLE = 'T1-01';

/** Merapikan input: huruf kecil, spasi, dan tanda pisah lain ikut diterima. */
export function normalizeCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[\u2013\u2014_.]/g, '-')   // en dash, em dash, underscore, titik
    .replace(/^T-?/, 'T');
}

/**
 * Memvalidasi kode partisipan dan menurunkan tier darinya.
 * @returns {{ok: true, code: string, tier: number, index: number, config: object}
 *          | {ok: false, error: string}}
 */
export function parseParticipantCode(input) {
  const code = normalizeCode(input);
  if (!code) return { ok: false, error: 'Kode partisipan belum diisi.' };

  const match = CODE_PATTERN.exec(code);
  if (!match) {
    return { ok: false, error: `Format kode belum sesuai. Contoh yang benar: ${CODE_EXAMPLE}.` };
  }

  const tier = Number(match[1]);
  const index = Number(match[2]);
  const config = TIERS[tier];
  if (!config) return { ok: false, error: 'Tier pada kode hanya boleh 1 sampai 4.' };

  if (index < 1 || index > config.quota) {
    const last = String(config.quota).padStart(2, '0');
    return { ok: false, error: `Tier ${tier} berisi ${config.quota} partisipan, jadi nomor maksimal T${tier}-${last}.` };
  }

  return { ok: true, code, tier, index, config };
}

/** Ringkasan yang ditampilkan ke partisipan setelah kode dikenali. */
export function codeSummary(parsed) {
  const { tier, config } = parsed;
  return `Tier ${tier} - pemantauan ${config.baseline} hari, lalu pendampingan ${config.intervention} hari (total ${config.total} hari).`;
}

/** Daftar 14 kode resmi. Dipakai peneliti untuk menyiapkan lembar pembagian kode. */
export function rosterCodes() {
  const codes = [];
  for (const [tier, cfg] of Object.entries(TIERS)) {
    for (let i = 1; i <= cfg.quota; i += 1) {
      codes.push(`T${tier}-${String(i).padStart(2, '0')}`);
    }
  }
  return codes;
}
