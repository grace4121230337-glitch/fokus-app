/* Dex - tahap pertumbuhan companion.

   Layar ini hanya membaca Store. Tidak ada logika penelitian di sini, dan itu harus
   tetap begitu: begitu sebuah layar mulai menghitung sesuatu sendiri, angka yang sama
   punya dua sumber kebenaran dan cepat atau lambat keduanya berbeda.

   Tahap yang belum terbuka tetap ditampilkan dalam keadaan gelap, bukan disembunyikan.
   Melihat ke mana arah pertumbuhan adalah bagian dari motivasinya. */

import { Store } from '../../core/store.js';
import {
  progressSummary, evolutionStage, stageName, companionName, activeProfile,
} from '../../core/progress.js';
import { mount, card, companionImg, esc } from '../components.js';

const BUKA_DI_LEVEL = { 1: 1, 2: 4, 3: 7 };

export async function render() {
  const state = Store.get();
  const p = progressSummary(state);
  const profile = activeProfile(state);
  const nama = companionName(profile);
  const sekarang = evolutionStage(p.level);

  const kartu = [1, 2, 3].map((tahap) => {
    const terbuka = tahap <= sekarang;
    const seni = `/assets/img/companion-${profile}-${tahap}.webp`;
    const label = stageName(profile, BUKA_DI_LEVEL[tahap] === 1 ? 1 : BUKA_DI_LEVEL[tahap]);
    return card(`
      ${companionImg(seni, `${nama} tahap ${tahap}`, { size: 'md', locked: !terbuka })}
      <p class="center"><b>${esc(label)}</b></p>
      <p class="dim center small">${terbuka
        ? (tahap === sekarang ? 'Tahap saat ini' : 'Sudah dilewati')
        : `Terbuka di level ${BUKA_DI_LEVEL[tahap]}`}</p>
    `, { cls: 'card--tight' });
  }).join('');

  mount(`
    <header class="head">
      <div><p class="label">Dex</p><h1 class="h1">${esc(nama)}</h1></div>
      <span class="dim">Level ${p.level}</span>
    </header>
    <p class="dim">Companion tumbuh dari sesi fokus yang kamu selesaikan - bukan dari
    lamanya kamu membuka aplikasi.</p>
    <div class="dex__grid">${kartu}</div>
    ${card(`
      <p class="label">Cara tumbuh</p>
      <p class="dim">XP didapat dari sesi Kubah Fokus. Sesi yang selesai memberi XP penuh;
      sesi yang berhenti di tengah tetap memberi sebagian, karena mencoba pun berarti.</p>
      <p class="dim">MANA dari sinyal harian dikumpulkan terpisah dan tidak menaikkan level.</p>
    `, { cls: 'card--tight' })}
  `, { bg: 'dex', chrome: 'full' });
}
