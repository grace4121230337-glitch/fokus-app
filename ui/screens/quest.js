/* Misi Harian.

   Misi DITURUNKAN dari data yang sudah ada (sesi dan sinyal EMA hari ini), bukan
   disimpan sebagai daftar tersendiri. Kalau status misi disimpan terpisah, akan ada
   dua versi kebenaran tentang "apakah hari ini sudah berlatih" - dan versi yang salah
   itulah yang biasanya dipakai algoritma nudge.

   Tidak ada hadiah MANA di layar ini. MANA hanya dari sinyal EMA, supaya kepatuhan
   pengukuran tidak bisa dikejar lewat jalan lain. */

import { Store, currentPhase } from '../../core/store.js';
import { mount, card, button, esc } from '../components.js';
import { go } from '../router.js';

function baris(m) {
  return `<div class="row quest__item">
    <span>${m.done ? '<b>&#10003;</b>' : '<span class="dim">&#9675;</span>'} ${esc(m.text)}</span>
    <small class="dim">${m.done ? 'Selesai' : m.hint}</small>
  </div>`;
}

export async function render() {
  const state = Store.get();
  const prog = currentPhase(state);
  const hari = prog?.day ?? null;

  const sesiHariIni = (state.sessions || []).filter((s) => s.study_day === hari);
  const emaHariIni = (state.emaEntries || []).filter((e) => e.study_day === hari && e.responded);
  const selesai = sesiHariIni.filter((s) => s.outcome === 'completed');

  const misi = [
    {
      text: 'Selesaikan satu sesi fokus',
      done: selesai.length > 0,
      hint: sesiHariIni.length ? 'Sudah dicoba' : 'Belum',
    },
    {
      text: 'Jawab ketiga sinyal hari ini',
      done: emaHariIni.length >= 3,
      hint: `${emaHariIni.length} dari 3`,
    },
    {
      // Bukan "jangan pernah menyentuh HP": target yang mustahil membuat orang berhenti
      // mencoba. HP 60 masih menyisakan ruang untuk beberapa kali melirik.
      text: 'Jaga ketahanan di atas 60 dalam satu sesi',
      done: sesiHariIni.some((s) => Number(s.hp_end) > 60),
      hint: 'Belum',
    },
  ];

  const tuntas = misi.filter((m) => m.done).length;

  mount(`
    <header class="head">
      <div><p class="label">Misi</p><h1 class="h1">Hari ini</h1></div>
      <span class="dim">${tuntas}/3</span>
    </header>
    ${card(misi.map(baris).join(''))}
    ${tuntas === 3
      ? card('<p class="center">Ketiganya tuntas. Tidak ada yang perlu dikejar lagi hari ini.</p>',
        { cls: 'card--accent' })
      : card(`
        <p class="dim">Misi berganti sendiri setiap hari mengikuti tanggal WIB. Tidak ada
        misi yang menumpuk dan tidak ada yang hangus.</p>
        ${button('Masuk Kubah Fokus', { id: 'btn-kubah' })}
      `, { cls: 'card--tight' })}
  `, { bg: 'home', chrome: 'full' });

  document.getElementById('btn-kubah')?.addEventListener('click', () => go('dome'));
}
