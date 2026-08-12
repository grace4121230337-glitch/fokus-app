/* Layar sementara untuk rute yang dibangun pada checkpoint berikutnya.

   Sengaja ada supaya navigasi lima tab TIDAK PERNAH menghasilkan halaman kosong
   atau error saat aplikasi masih setengah jadi. Setiap kali sebuah layar sungguhan
   selesai, cukup ganti entri rutenya di ui/router.js. */

import { mount, card, esc } from '../components.js';

const INFO = {
  dex:      { title: 'Dex Companion',      note: 'Koleksi & tahap evolusi companion.', bg: 'dex' },
  quest:    { title: 'Misi Harian',        note: 'Daftar misi dan hadiah MANA.',       bg: 'home' },
  rank:     { title: 'Konstelasi',         note: 'Peringkat berbasis konsistensi.',    bg: 'dex' },
  coop:     { title: 'Taman Bersama',      note: 'Sesi fokus berdampingan.',           bg: 'home' },
  register: { title: 'Pendaftaran',        note: 'Kode partisipan & penetapan tier oleh peneliti.', bg: 'onboarding' },
  consent:  { title: 'Persetujuan',        note: 'Informed consent 4 pernyataan.',     bg: 'onboarding' },
  pretest:  { title: 'Kuesioner Awal',     note: 'APS-S, IUS-12, dan SMD.',            bg: 'onboarding' },
  dome:     { title: 'Kubah Fokus',        note: 'Sesi fokus dengan ketahanan HP.',    bg: 'dome' },
  ema:      { title: 'Sinyal EMA',         note: 'Tiga pertanyaan singkat.',           bg: 'home' },
  survey:   { title: 'Validitas Sosial',   note: 'Penilaian akhir oleh partisipan.',   bg: 'onboarding' },
  done:     { title: 'Studi Selesai',      note: 'Terima kasih atas partisipasimu.',   bg: 'home' },
};

export async function render({ route }) {
  const info = INFO[route] ?? { title: 'Segera hadir', note: '', bg: 'home' };
  mount(`
    <header class="head"><h1 class="h1">${esc(info.title)}</h1></header>
    ${card(`
      <p class="dim">${esc(info.note)}</p>
      <p class="dim">Layar ini dibangun pada checkpoint berikutnya. Fondasi, data, dan
      navigasinya sudah siap menerimanya.</p>
      <a class="btn btn--ghost btn--block" href="#home">Kembali ke Beranda</a>
    `)}
  `, { bg: info.bg, chrome: 'full' });
}
