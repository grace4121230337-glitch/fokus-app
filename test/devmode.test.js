/* Mode peneliti.

   Layar diagnostik memuat angka yang tidak boleh dilihat partisipan - melihat skor
   sendiri di tengah studi dapat mengubah perilaku yang sedang diukur (reaktivitas).
   Karena itu kuncinya diuji seperti kunci: PIN salah harus gagal, dan sesi terbuka
   harus kedaluwarsa sendiri walau peneliti lupa menguncinya kembali di HP partisipan. */

import { describe, t, tAsync, eq, ok } from './harness.js';
import { hashPin, checkPin, isUnlocked, unlockPatch, lockPatch } from '../core/devmode.js';
import { DEV_UNLOCK_MS, DEV_PIN_SHA256 } from '../core/config.js';

const T0 = Date.parse('2026-08-12T10:00:00+07:00');

describe('mode peneliti: PIN');

await tAsync('hash PIN berbentuk hex 64 karakter dan cocok dengan yang tertanam', async () => {
  const h = await hashPin('104729');
  ok(/^[0-9a-f]{64}$/.test(h));
  eq(h, DEV_PIN_SHA256);
});

await tAsync('PIN benar membuka, PIN salah tidak', async () => {
  eq(await checkPin('104729'), true);
  eq(await checkPin('104728'), false);
  eq(await checkPin('000000'), false);
});

await tAsync('PIN kosong selalu ditolak', async () => {
  for (const buruk of ['', null, undefined, 0]) eq(await checkPin(buruk), false);
});

await tAsync('spasi di ujung dimaafkan, isi PIN tidak', async () => {
  eq(await checkPin(' 104729 '), true);
  eq(await checkPin('10 47 29'), false);
});

t('PIN asli tidak tersimpan di kode, hanya hash-nya', () => {
  // Kalau suatu saat seseorang menaruh PIN mentah di config, test ini gagal.
  ok(!DEV_PIN_SHA256.includes('104729'));
  eq(DEV_PIN_SHA256.length, 64);
});

describe('mode peneliti: masa berlaku sesi');

t('tanpa catatan buka, mode terkunci', () => {
  eq(isUnlocked({}, T0), false);
  eq(isUnlocked({ devUnlockedAt: null }, T0), false);
});

t('baru dibuka berarti terbuka', () => {
  eq(isUnlocked(unlockPatch(T0), T0), true);
});

t('batas: satu milidetik sebelum habis masih terbuka, tepat di batas sudah tertutup', () => {
  const s = unlockPatch(T0);
  eq(isUnlocked(s, T0 + DEV_UNLOCK_MS - 1), true);
  eq(isUnlocked(s, T0 + DEV_UNLOCK_MS), false);
  eq(isUnlocked(s, T0 + DEV_UNLOCK_MS + 60_000), false);
});

t('mengunci kembali langsung berlaku', () => {
  eq(isUnlocked({ ...unlockPatch(T0), ...lockPatch() }, T0 + 1000), false);
});

t('stempel waktu rusak dianggap terkunci, bukan terbuka selamanya', () => {
  eq(isUnlocked({ devUnlockedAt: 'bukan-tanggal' }, T0), false);
});
