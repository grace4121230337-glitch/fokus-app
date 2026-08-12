/* Identitas partisipan yang tidak bisa dibaca balik (Bab 3 3.3).

   Bab 3 menjanjikan "hashing bernilai salt pada nomor WhatsApp yang digunakan sebagai
   identitas login aplikasi" serta "penghapusan data mentah setelah periode analisis".
   Terjemahan teknisnya di sini sengaja lebih ketat daripada janji itu:

   1. Nomor asli TIDAK PERNAH masuk ke state, ke localStorage, maupun ke antrean sinkron.
      Ia hidup hanya sebagai variabel lokal beberapa milidetik, lalu diganti hash-nya.
      Jadi tidak ada "penghapusan" yang perlu dipercaya - yang tidak pernah ditulis
      tidak bisa bocor.
   2. Hash memakai SHA-256 dengan salt per-studi. Salt membuat daftar nomor HP satu
      sekolah - atau satu kota - tidak bisa dicocokkan satu per satu ke hash yang
      tersimpan hanya dengan mencoba semua nomor yang mungkin.
   3. Hash tetap bisa dihapus di tahap pascates (purgeIdentity di core/studyStage.js),
      sesuai bunyi prosedur privasi.

   Murni: fungsi digest disuntikkan, jadi bisa diuji di Node tanpa browser. */

const SUBTLE = () => globalThis.crypto?.subtle ?? null;

/**
 * Merapikan nomor Indonesia ke bentuk kanonik 62xxxxxxxxxx.
 * Wajib ada supaya "0812...", "+62 812...", dan "62812..." menghasilkan hash yang SAMA.
 * Tanpa normalisasi, satu partisipan yang menulis nomornya dengan format berbeda saat
 * memasang ulang aplikasi akan terbaca sebagai partisipan lain.
 * @returns {string|null} null bila jelas bukan nomor yang sah.
 */
export function normalizeWa(input) {
  const digits = String(input ?? '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  let n = digits;
  if (n.startsWith('0')) n = `62${n.slice(1)}`;
  else if (n.startsWith('8')) n = `62${n}`;
  else if (!n.startsWith('62')) return null;
  // 62 + 9..13 digit. Lebih longgar dari aturan operator supaya nomor sah tidak ditolak.
  if (n.length < 11 || n.length > 15) return null;
  return n;
}

export function isValidWa(input) {
  return normalizeWa(input) !== null;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash bersalt dari nomor WhatsApp.
 * @param {string} input nomor apa adanya dari partisipan
 * @param {string} salt  salt per-studi (core/config.js)
 * @returns {Promise<string|null>} hex 64 karakter, atau null bila nomor tidak sah
 */
export async function hashWa(input, salt) {
  const nomor = normalizeWa(input);
  if (!nomor) return null;
  const subtle = SUBTLE();
  if (!subtle) throw new Error('WebCrypto tidak tersedia - hash identitas tidak bisa dibuat');
  const data = new TextEncoder().encode(`${salt}:${nomor}`);
  return toHex(await subtle.digest('SHA-256', data));
}

/** Petunjuk aman untuk peneliti: 4 digit terakhir saja, cukup untuk mencocokkan
    partisipan di lapangan tanpa menyimpan nomor utuh. */
export function waHint(input) {
  const nomor = normalizeWa(input);
  return nomor ? `...${nomor.slice(-4)}` : null;
}
