/* Layar sinyal EMA.

   Prinsip utama layar ini: SESINGKAT MUNGKIN. Tiga butir (empat di fase intervensi),
   satu layar, satu ketuk per butir, tanpa animasi transisi antarbutir. Setiap detik
   tambahan di sini menurunkan tingkat respons, dan tingkat respons yang rendah adalah
   ancaman terbesar bagi data EMA - lebih besar daripada kekurangan fitur apa pun.

   DUA JENIS SINYAL ditangani layar yang sama:
   - terjadwal: tiga sinyal acak harian, jendela 60 menit
   - pasca-sesi: muncul segera setelah sesi Kubah ditutup, jendela 15 menit
   Yang berbeda hanya kalimat pengantar dan lama jendelanya; butir dan cara
   menyimpannya identik, supaya kedua jenis sinyal tetap sebanding saat dianalisis.

   Pengingat WhatsApp ditiadakan atas keputusan peneliti, jadi partisipan tahu ada
   sinyal lewat aplikasi yang terbuka atau notifikasi PWA. Karena itu layar ini juga
   TIDAK boleh bisa dilewati diam-diam: router mengarahkan ke sini selama sinyal masih
   berada dalam jendela jawabnya. */

import { Store } from '../../core/store.js';
import { progressSummary } from '../../core/progress.js';
import {
  itemsForPhase, MANA_REWARD, remainingWindowMs, SIGNAL_TYPE,
} from '../../core/ema.js';
import { dueSignal, submitEma } from '../../core/emaRuntime.js';
import { mount, card, button, likert, companionImg, esc, toast, fmtClock } from '../components.js';
import { go } from '../router.js';

let countdown = null;

function clearCountdown() {
  if (countdown) { clearInterval(countdown); countdown = null; }
}

function rewardView(mana, pascaSesi) {
  const p = progressSummary(Store.get());
  mount(`
    <header class="head"><h1 class="h1">Tercatat</h1></header>
    ${card(`
      ${companionImg(p.art, esc(p.name), { size: 'lg', enter: true })}
      <p class="h2 center">+${MANA_REWARD} MANA</p>
      <p class="dim center">Total MANA kamu sekarang ${mana}.</p>
      <p class="dim">Jawaban apa pun bernilai sama. Yang dihitung adalah kamu sempat
      mencatat keadaanmu saat itu juga - bukan seberapa bagus jawabannya.</p>
    `, { cls: 'card--accent' })}
    ${button(pascaSesi ? 'Lihat hasil sesi' : 'Kembali ke Beranda', { id: 'btn-selesai' })}
  `, { bg: 'home', chrome: 'full' });
  document.getElementById('btn-selesai')?.addEventListener('click', () => go('home'));
}

export async function render() {
  clearCountdown();
  const signal = dueSignal();

  // Sinyal bisa kedaluwarsa persis saat layar dibuka. Jangan tampilkan formulir
  // yang jawabannya akan ditolak - itu membuat partisipan merasa usahanya sia-sia.
  if (!signal) {
    mount(`
      <header class="head"><h1 class="h1">Tidak ada sinyal</h1></header>
      ${card(`<p class="dim">Sinyal berikutnya akan muncul di aplikasi pada waktu acak.
        Tidak perlu menunggu - buka saja aplikasi ini seperti biasa.</p>
        ${button('Kembali ke Beranda', { id: 'btn-selesai' })}`)}
    `, { bg: 'home', chrome: 'full' });
    document.getElementById('btn-selesai')?.addEventListener('click', () => go('home'));
    return;
  }

  const pascaSesi = signal.type === SIGNAL_TYPE.POST_SESSION;

  /* Butir mengikuti FASE, bukan preferensi layar. Di fase intervensi ada butir
     coping tambahan, persis seperti yang dijanjikan Bab 3. Sumber aturannya satu:
     itemsForPhase() di core/ema.js. */
  const items = itemsForPhase(signal.phase);

  const butir = items.map((item, i) => likert(
    `ema-${item.key}`, item.question, item.scale,
    { index: i, total: items.length, item: item.key },
  )).join('');

  const judul = pascaSesi ? 'Sesi barusan' : 'Sinyal sekarang';
  const pengantar = pascaSesi
    ? `<p class="dim">Jawab tentang <b>sesi yang baru saja selesai</b>, selagi masih segar
       diingat. Butuh kurang dari 20 detik.</p>`
    : `<p class="dim">Jawab sesuai keadaanmu <b>saat ini juga</b>, bukan secara umum.
       Tidak ada jawaban benar atau salah, dan jawabanmu tidak dinilai siapa pun.</p>`;

  const app = mount(`
    <header class="head">
      <div><p class="label">${judul}</p>
      <h1 class="h1">${items.length === 4 ? 'Empat' : 'Tiga'} pertanyaan singkat</h1></div>
    </header>
    ${card(`
      ${pengantar}
      <p class="dim small">Sisa waktu menjawab <span id="sisa">--:--</span></p>
    `, { cls: 'card--tight' })}
    <form id="form-ema">${butir}
      ${button(`Kirim - +${MANA_REWARD} MANA`, { id: 'btn-kirim', attrs: 'disabled' })}
    </form>
    <p class="dim center small">Tidak sempat menjawab? Tidak apa-apa. Sinyal yang terlewat
    tetap tercatat apa adanya dan tidak mengurangi apa pun.</p>
  `, { bg: 'home', chrome: 'bare' });

  const form = app.querySelector('#form-ema');
  const tombol = app.querySelector('#btn-kirim');

  const jawaban = () => Object.fromEntries(items.map((item) => [
    item.key, Number(form.querySelector(`input[name="ema-${item.key}"]:checked`)?.value) || null,
  ]));

  form.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="radio"]');
    if (input) {
      // Sorot pilihan yang aktif dalam satu butir saja.
      for (const lab of form.querySelectorAll(`input[name="${input.name}"]`)) {
        lab.closest('.likert__opt')?.classList.toggle('likert__opt--on', lab.checked);
      }
    }
    const v = jawaban();
    tombol.disabled = items.some((item) => !v[item.key]);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = jawaban();
    if (items.some((item) => !v[item.key])) return;

    // Sinyal diambil ulang: bisa saja jendelanya habis saat partisipan mengisi.
    const masihBerlaku = dueSignal();
    if (!masihBerlaku) {
      clearCountdown();
      toast('Jendela menjawab sudah lewat. Sinyal ini tercatat sebagai terlewat.');
      go('home');
      return;
    }

    clearCountdown();
    const { mana } = submitEma({
      signal: masihBerlaku,
      focus: v.focus,
      control: v.control,
      context: v.context,
      coping: v.coping ?? null,
    });
    rewardView(mana, pascaSesi);
  });

  const tik = () => {
    const sisa = remainingWindowMs(signal);
    const el = document.getElementById('sisa');
    if (el) el.textContent = fmtClock(sisa);
    if (sisa <= 0) { clearCountdown(); go('home'); }
  };
  tik();
  countdown = setInterval(tik, 1000);
}
