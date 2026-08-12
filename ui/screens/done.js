/* Layar terima kasih - satu kali muncul tepat setelah validitas sosial terkirim.
   Setelah ini partisipan bebas kembali ke Beranda/Dex/Misi/Rank/Co-op seperti biasa;
   fase 'maintenance' tidak lagi mengumpulkan data sesi/EMA/nudge (lihat core/tier.js),
   tapi companion dan riwayat tetap bisa dilihat. Layar ini TIDAK dipaksa oleh router
   setelah socialValidity terisi - hanya diakses langsung setelah submit atau lewat
   tautan #done. */

import { Store } from '../../core/store.js';
import { companionArt, companionName } from '../../core/progress.js';
import {
  mount, card, button, companionImg, esc,
} from '../components.js';
import { go } from '../router.js';

export function render() {
  const s = Store.get();
  const profile = s.pretest?.profile || 'sprout';
  const name = companionName(profile);

  mount(`
    <div class="onboard center">
      ${card(`
        ${companionImg(companionArt(profile, 3), name, { enter: true })}
        <h1 class="h1">Terima kasih, ${esc(s.participant?.code || '')}</h1>
        <p class="dim">Bagian penelitian sudah selesai. Jawabanmu barusan tersimpan bersama
        seluruh data yang sudah kamu berikan selama program berjalan.</p>
      `)}
      ${card(`
        <h2 class="h2">Aplikasi tetap bisa dipakai</h2>
        <p class="dim">Tidak ada lagi sesi, sinyal harian, atau saran yang tercatat untuk penelitian.
        ${esc(name)} dan riwayatmu tetap ada kalau kamu masih ingin membuka aplikasi ini.</p>
        ${button('Kembali ke Beranda', { id: 'home' })}
      `, { cls: 'card--tight' })}
    </div>
  `, { bg: 'home', chrome: 'bare' });

  document.getElementById('home').addEventListener('click', () => go('home'));
}
