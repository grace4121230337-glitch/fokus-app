/* Identitas partisipan (Bab 3 3.3).

   Yang diuji di sini bukan sekadar "fungsi hash jalan", melainkan dua janji yang
   ditulis di layar pendaftaran dan di lembar consent:
   1) nomor asli tidak pernah disimpan, dan
   2) satu partisipan tetap dikenali sebagai orang yang sama walau menulis nomornya
      dengan format berbeda saat memasang ulang aplikasi.
   Janji kedua yang paling mudah luput: tanpa normalisasi, "0812..." dan "+62812..."
   menghasilkan hash berbeda dan data satu anak terpecah menjadi dua partisipan.

   Berkas ini memakai tAsync + top-level await karena WebCrypto asinkron. */

import { describe, t, tAsync, eq, ok } from './harness.js';
import { normalizeWa, isValidWa, hashWa, waHint } from '../core/identity.js';

const SALT = 'uji-fokus';

describe('identitas: normalisasi nomor');

t('tiga format lazim menghasilkan satu bentuk kanonik', () => {
  eq(normalizeWa('081234567890'), '6281234567890');
  eq(normalizeWa('+62 812-3456-7890'), '6281234567890');
  eq(normalizeWa('81234567890'), '6281234567890');
});

t('spasi, tanda hubung, dan kurung diabaikan', () => {
  eq(normalizeWa('(0812) 3456 7890'), '6281234567890');
});

t('nomor yang jelas keliru ditolak, bukan dipaksa jadi hash', () => {
  for (const buruk of ['', null, undefined, '   ', 'abcd', '0812', '12345', '9991234567890']) {
    eq(normalizeWa(buruk), null, `harus ditolak: ${String(buruk)}`);
    eq(isValidWa(buruk), false);
  }
});

t('batas panjang: 62 + 9 digit diterima, kepanjangan ditolak', () => {
  ok(isValidWa(`62${'8'.repeat(9)}`));
  eq(normalizeWa(`62${'8'.repeat(14)}`), null);
});

describe('identitas: hash bersalt');

await tAsync('hash berbentuk hex 64 karakter', async () => {
  const h = await hashWa('081234567890', SALT);
  eq(h.length, 64);
  ok(/^[0-9a-f]{64}$/.test(h));
});

await tAsync('format berbeda dari orang yang sama menghasilkan hash yang sama', async () => {
  eq(await hashWa('081234567890', SALT), await hashWa('+62 812 3456 7890', SALT));
});

await tAsync('nomor berbeda menghasilkan hash berbeda', async () => {
  ok(await hashWa('081234567890', SALT) !== await hashWa('081234567891', SALT));
});

await tAsync('salt studi ikut menentukan hash', async () => {
  // Konsekuensinya nyata: hash dari studi ini tidak bisa dicocokkan dengan basis
  // data lain mana pun, sekalipun nomornya sama.
  ok(await hashWa('081234567890', 'salt-satu') !== await hashWa('081234567890', 'salt-dua'));
});

await tAsync('nomor tidak sah menghasilkan null, bukan hash dari string kosong', async () => {
  eq(await hashWa('abcd', SALT), null);
  eq(await hashWa('', SALT), null);
});

await tAsync('hash tidak mengandung potongan nomor aslinya', async () => {
  const h = await hashWa('081234567890', SALT);
  ok(!h.includes('1234567890'));
  ok(!h.includes('7890'));
});

describe('identitas: petunjuk untuk peneliti');

t('hanya empat digit terakhir yang ditampilkan', () => {
  eq(waHint('081234567890'), '...7890');
  eq(waHint('+62 812 3456 7890'), '...7890');
});

t('nomor tidak sah tidak menghasilkan petunjuk', () => {
  eq(waHint('abcd'), null);
  eq(waHint(''), null);
});
