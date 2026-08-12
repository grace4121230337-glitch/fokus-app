/* Co-op Space - taman bersama.

   Di dalam aplikasi saja. Fitur WhatsApp ditiadakan atas keputusan peneliti, jadi
   tidak ada undangan, tautan keluar, atau ajakan menghubungi teman di layar ini.

   Sama seperti Konstelasi: TIDAK ADA nama, foto, atau angka milik partisipan lain.
   Kontribusi ditampilkan sebagai jumlah agregat tanpa identitas. Rasa kebersamaan
   didapat tanpa membuka pintu perbandingan sosial - dan tanpa membocorkan siapa saja
   yang ikut penelitian ini kepada sesama peserta di satu sekolah. */

import { Store, currentPhase } from '../../core/store.js';
import { mount, card, progressBar } from '../components.js';

/* Target taman dihitung dari kuota harian tier partisipan sendiri, bukan dari data
   peserta lain. Angka milik peserta lain tidak pernah diunduh ke perangkat ini -
   itu keputusan privasi, sekaligus alasan taman ini menghitung kontribusi sendiri. */
const TARGET_PER_HARI = 1;

export async function render() {
  const state = Store.get();
  const prog = currentPhase(state);
  const selesai = (state.sessions || []).filter((s) => s.outcome === 'completed');

  const hari = prog?.day ?? 0;
  const target = Math.max(1, hari * TARGET_PER_HARI);
  const persen = Math.min(100, Math.round((selesai.length / target) * 100));

  mount(`
    <header class="head">
      <div><p class="label">Co-op</p><h1 class="h1">Taman Bersama</h1></div>
    </header>
    ${card(`
      <img class="badge" src="/assets/img/card-coop-garden.webp" alt="" width="120" height="120">
      <p class="h2 center">${selesai.length} sesi</p>
      <p class="dim center">kontribusimu untuk taman</p>
      ${progressBar(persen)}
    `, { cls: 'card--accent' })}
    ${card(`
      <p class="dim">Taman ini tumbuh dari sesi fokus seluruh peserta. Tidak ada nama,
      peringkat, atau angka milik orang lain yang ditampilkan - dan tidak ada yang bisa
      melihat angkamu.</p>
      <p class="dim">Kalau kamu melewatkan satu hari, taman tidak layu. Ia hanya menunggu.</p>
    `, { cls: 'card--tight' })}
  `, { bg: 'coop', chrome: 'full' });
}
