/* Gerbang mode peneliti.

   Kenapa PIN dan bukan sekadar URL rahasia: URL bocor lewat riwayat browser, tangkapan
   layar, dan tombol "bagikan". Kenapa hanya PIN dan bukan login penuh: layar ini tidak
   memegang data siapa pun selain yang sudah ada di perangkat itu sendiri, jadi login
   server hanya menambah titik gagal tanpa menambah perlindungan nyata.

   Semua di sini murni kecuali pemanggilan WebCrypto, yang tersedia di Node maupun browser. */

import { DEV_PIN_SHA256, DEV_UNLOCK_MS } from './config.js';
import { now } from './env.js';

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto tidak tersedia');
  const data = new TextEncoder().encode(`fokus-dev:${String(pin ?? '').trim()}`);
  return toHex(await subtle.digest('SHA-256', data));
}

/** Perbandingan waktu-tetap. Berlebihan untuk PIN 6 digit, tapi murah dan benar. */
function sameHash(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export async function checkPin(pin) {
  if (!pin) return false;
  return sameHash(await hashPin(pin), DEV_PIN_SHA256);
}

/** Apakah sesi mode peneliti masih berlaku. Murni - waktu disuntikkan. */
export function isUnlocked(state = {}, ts = now()) {
  const at = state.devUnlockedAt ? Date.parse(state.devUnlockedAt) : 0;
  if (!at) return false;
  return ts - at < DEV_UNLOCK_MS;
}

export function unlockPatch(ts = now()) {
  return { devUnlockedAt: new Date(ts).toISOString() };
}

export const lockPatch = () => ({ devUnlockedAt: null });
