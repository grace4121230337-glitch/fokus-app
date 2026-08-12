/* Konstelasi - satu bintang per sesi yang diselesaikan.

   KEPUTUSAN ETIS YANG TIDAK BOLEH DIBALIK: tidak ada papan peringkat antarpartisipan.
   Membandingkan 14 siswa satu sekolah secara terbuka (a) menimbulkan tekanan sosial
   yang tidak etis untuk partisipan di bawah 18 tahun, dan (b) menjadi variabel
   pengganggu yang tidak Anda kontrol - siswa yang berlatih lebih giat karena malu
   kalah dari temannya bukan bukti bahwa nudge bekerja.

   "Rank" di sini berarti perbandingan dengan diri sendiri, bukan dengan orang lain. */

import { Store } from '../../core/store.js';
import { mount, card, esc } from '../components.js';

export async function render() {
  const state = Store.get();
  const semua = state.sessions || [];
  const selesai = semua.filter((s) => s.outcome === 'completed');

  const menit = Math.round(selesai.reduce((t, s) => t + (Number(s.elapsed_sec) || 0), 0) / 60);
  const hpRerata = selesai.length
    ? Math.round(selesai.reduce((t, s) => t + (Number(s.hp_end) || 0), 0) / selesai.length)
    : null;

  // Kecerahan bintang mengikuti HP akhir sesinya: sesi yang dijaga penuh bersinar
  // lebih terang daripada sesi yang penuh gangguan. Semuanya tetap terlihat.
  const bintang = selesai.map((s, i) => {
    const hp = Number(s.hp_end) || 0;
    const terang = (0.35 + (hp / 100) * 0.65).toFixed(2);
    return `<span class="star" style="opacity:${terang}" title="Sesi ${i + 1} - ketahanan ${hp}">&#10022;</span>`;
  }).join('');

  mount(`
    <header class="head">
      <div><p class="label">Konstelasi</p><h1 class="h1">Milikmu sendiri</h1></div>
    </header>
    ${card(`
      <img class="badge" src="/assets/img/constellation-badge.webp" alt="" width="120" height="120">
      <p class="h2 center">${selesai.length} bintang</p>
      <p class="dim center">terkumpul dari sesi yang kamu selesaikan</p>
      ${selesai.length ? `<div class="stars">${bintang}</div>` : ''}
    `, { cls: 'card--accent' })}
    ${card(`
      <div class="grid-3 center">
        <div><p class="h2">${semua.length}</p><p class="dim">Sesi dicoba</p></div>
        <div><p class="h2">${menit}</p><p class="dim">Menit fokus</p></div>
        <div><p class="h2">${hpRerata ?? '-'}</p><p class="dim">Ketahanan rerata</p></div>
      </div>
    `, { cls: 'card--tight' })}
    ${card(`<p class="dim">${esc('Tidak ada peringkat antarpeserta di aplikasi ini. '
      + 'Satu-satunya pembanding yang adil untukmu adalah dirimu minggu lalu.')}</p>`,
      { cls: 'card--tight' })}
  `, { bg: 'dex', chrome: 'full' });
}
