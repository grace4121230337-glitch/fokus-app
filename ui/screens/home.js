/* Beranda. Pusat kendali harian partisipan.

   Catatan desain penting: pada fase baseline, kartu ajakan TIDAK boleh mengandung
   nudge adaptif (tanpa saran waktu, tanpa pesan personal). Kalau bocor, fase baseline
   ikut ter-intervensi dan seluruh desain multiple-baseline runtuh. */

import { Store, currentPhase, phaseOf, Sync } from '../../core/store.js';
import { progressSummary } from '../../core/progress.js';
import { currentNudge } from '../../core/nudgeRuntime.js';
import { DEFAULT_MINUTES } from '../../core/nudge.js';
import { phaseLabel } from '../../core/tier.js';
import { mount, card, button, companionImg, progressBar, setProfileTheme, esc } from '../components.js';
import { todayCompliance, upcomingSignal } from '../../core/emaRuntime.js';
import { MANA_REWARD } from '../../core/ema.js';
import { go } from '../router.js';

function companionCard(p) {
  return card(`
    ${companionImg(p.art, `${p.name} tahap ${p.stage}`, { size: 'lg', enter: true })}
    <div class="center">
      <h2 class="h2">${esc(p.name)} - ${esc(p.stageName)}</h2>
      <p class="dim">Level ${p.level} - ${p.intoLevel}/${p.need} XP</p>
    </div>
    ${progressBar(p.percent)}
  `, { cls: 'card--accent' });
}

function studyCard(phase) {
  if (!phase) return '';
  return card(`
    <div class="row">
      <div><p class="label">Perjalanan</p><h2 class="h2">Hari ${phase.day} dari ${phase.total}</h2></div>
      <span class="dim">${esc(phaseLabel(phase.phase))}</span>
    </div>
    ${progressBar(phase.percent)}
  `, { cls: 'card--tight' });
}

/* Kartu sinyal EMA.

   Teksnya SENGAJA sama persis di fase baseline dan intervensi. EMA adalah alat ukur,
   bukan bagian dari perlakuan; kalau kalimatnya ikut berubah saat intervensi mulai,
   kenaikan yang terukur bisa berasal dari kartu ini, bukan dari nudge yang diteliti. */
function emaCard(state) {
  /* Dihitung untuk HARI INI saja, dan sinyal pasca-sesi tidak ikut dihitung.

     Sebelumnya kartu ini memakai angka kumulatif seluruh studi, sehingga di hari ke-10
     partisipan membaca "18 dari 30 terjawab" - angka yang tidak bisa lagi diperbaiki
     hari itu juga dan justru terbaca sebagai rapor kegagalan. Yang seharusnya
     ditunjukkan adalah target harian yang masih bisa dicapai: nol dari tiga di pagi
     hari selalu bisa menjadi tiga dari tiga pada malamnya.

     Sinyal pasca-sesi dikecualikan karena jumlahnya bergantung pada berapa kali
     partisipan berlatih; memasukkannya membuat penyebut berubah-ubah dan angka
     "2 dari 5" tidak berarti apa-apa sebagai ukuran kepatuhan. */
  const c = todayCompliance();
  const next = upcomingSignal();
  const jam = next
    ? new Date(Date.parse(next.scheduledAt) + 7 * 3_600_000).toISOString().slice(11, 16)
    : null;
  return card(`
    <div class="row">
      <div><p class="label">Sinyal hari ini</p><h2 class="h2">${c.answered} dari ${c.total} terjawab</h2></div>
      <span class="dim">${state.mana || 0} MANA</span>
    </div>
    <p class="dim">${jam
      ? `Sinyal berikutnya sekitar pukul ${esc(jam)} WIB. Tiga pertanyaan singkat, +${MANA_REWARD} MANA.`
      : 'Tidak ada sinyal lagi hari ini. Sampai jumpa besok.'}</p>
  `, { cls: 'card--tight' });
}

function statsCard(p, pending, mana) {
  return card(`
    <div class="grid-3 center">
      <div><p class="h2">${p.streak}</p><p class="dim">Hari berturut</p></div>
      <div><p class="h2">${p.xp}</p><p class="dim">Total XP</p></div>
      <div><p class="h2">${mana}</p><p class="dim">MANA</p></div>
    </div>
    ${pending ? `<p class="dim center">${pending} catatan menunggu dikirim - aman di perangkat.</p>` : ''}
  `, { cls: 'card--tight' });
}

/* Jalan masuk ke Struk Fokus.

   Sengaja ditaruh DI BAWAH kartu ajakan sesi, bukan di atasnya. Yang paling berguna
   dibuka partisipan saat membuka aplikasi adalah sesi berikutnya, bukan rekap kemarin;
   menaruh rekap di puncak halaman mengubah aplikasi latihan menjadi papan skor.

   Kalimatnya juga netral dan sama di semua fase - lihat catatan di core/insight.js. */
function receiptCard() {
  return card(`
    <div class="row">
      <div><p class="label">Struk Fokus</p><h2 class="h2">Lihat hasil latihanmu</h2></div>
    </div>
    <p class="dim">Rekap 7 hari terakhir dalam bentuk struk yang bisa kamu unduh dan simpan.</p>
    ${button('Buka struk', { id: 'btn-struk', variant: 'ghost' })}
  `, { cls: 'card--tight' });
}

/* Kartu ajakan mulai sesi.

   Ini satu-satunya kartu di Beranda yang isinya boleh berbeda antarfase - dan
   keputusan itu BUKAN milik layar ini. core/nudge.js yang menentukan: ia mengembalikan
   null di luar fase intervensi, lalu kartu netral di bawah yang tampil. Jangan pernah
   menambahkan cabang "kalau baseline tapi ..." di sini; begitu ada dua tempat yang
   memutuskan siapa dapat nudge, salah satunya pasti akan bocor. */
function actionCard(nudge) {
  if (!nudge) {
    // Netral, identik untuk semua partisipan, tanpa personalisasi apa pun.
    return card(`
      <h2 class="h2">Masuk Kubah Fokus</h2>
      <p class="dim">Sesi ${DEFAULT_MINUTES} menit. Letakkan HP menghadap ke bawah dan
      biarkan layar ini terbuka.</p>
      ${button('Mulai sesi', { id: 'btn-start' })}
    `);
  }
  return card(`
    <p class="label">Untukmu hari ini</p>
    <h2 class="h2">${esc(nudge.text)}</h2>
    <p class="dim">Saran hari ini ${nudge.minutes} menit. Kamu tetap bebas memilih durasi lain.</p>
    ${button(`Mulai sesi ${nudge.minutes} menit`, { id: 'btn-start' })}
  `, { cls: 'card--accent' });
}

export async function render() {
  const state = Store.get();
  const phase = currentPhase(state);
  const p = progressSummary(state);
  setProfileTheme(p.profile);

  // Dipanggil sekali per render: di sinilah peristiwa 'nudge ditampilkan' tercatat.
  const nudge = currentNudge();

  const app = mount(`
    <header class="head">
      <div>
        <p class="label">${esc(phase ? phaseLabel(phase.phase) : 'Persiapan')}</p>
        <h1 class="h1">Selamat datang</h1>
      </div>
      <a href="#settings" aria-label="Pengaturan">
        <img src="/assets/icon/ui-setting.svg" alt="" width="28" height="28"></a>
    </header>
    ${companionCard(p)}
    ${actionCard(nudge)}
    ${studyCard(phase)}
    ${emaCard(state)}
    ${statsCard(p, Sync.pending(), state.mana || 0)}
    ${receiptCard()}
    <p class="dim center">Fase saat ini: ${esc(phaseOf(state))} - dicatat untuk analisis.</p>
  `, { bg: 'home', chrome: 'full' });

  app.querySelector('#btn-start')?.addEventListener('click', () => go('dome'));
  app.querySelector('#btn-struk')?.addEventListener('click', () => go('receipt'));
}
