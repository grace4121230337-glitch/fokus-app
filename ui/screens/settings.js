/* Pengaturan.

   Tautan #settings sudah ada di pojok kanan atas Beranda sejak checkpoint awal, tetapi
   layarnya tidak pernah dibuat - menekannya membuat router jatuh kembali ke Beranda
   tanpa penjelasan. Bagi partisipan itu terbaca sebagai aplikasi yang rusak, dan
   kepercayaan pada aplikasi ikut menentukan kepatuhan mengisi data.

   Isinya sengaja sedikit. Setiap pengaturan yang mengubah PERLAKUAN adalah variabel
   perancu baru; yang boleh diatur partisipan hanyalah hal yang tidak mengubah isi
   intervensi - suara, wake lock, dan izin notifikasi. */

import { Store } from '../../core/store.js';
import { APP_VERSION, STUDY } from '../../core/config.js';
import { Sync } from '../../core/supabase.js';
import { phaseLabel } from '../../core/tier.js';
import { phaseOf } from '../../core/store.js';
import { mount, card, button, toast, esc } from '../components.js';
import { go } from '../router.js';

function toggleRow(id, label, note, on) {
  return `
    <label class="row row--toggle" for="${id}">
      <span><b>${esc(label)}</b><br><span class="dim small">${esc(note)}</span></span>
      <input type="checkbox" id="${id}" ${on ? 'checked' : ''}>
    </label>`;
}

function izinNotifikasi() {
  if (typeof Notification === 'undefined') return 'tidak tersedia';
  return Notification.permission;                  // 'granted' | 'denied' | 'default'
}

export function render() {
  const s = Store.get();
  const p = s.participant;
  const izin = izinNotifikasi();

  mount(`
    <header class="head">
      <div><p class="label">Pengaturan</p><h1 class="h1">Aplikasi</h1></div>
    </header>

    ${card(`
      <p class="label">Partisipan</p>
      <h2 class="h2">${esc(p?.code || 'Belum terdaftar')}</h2>
      <p class="dim small">Fase saat ini: ${esc(phaseLabel(phaseOf(s)))}.
      Kode ini yang menandai datamu - bukan nama, bukan nomor HP.</p>
    `)}

    ${card(`
      <p class="label">Selama sesi Kubah</p>
      ${toggleRow('set-sound', 'Suara', 'Nada singkat saat sesi selesai.', s.settings?.sound !== false)}
      ${toggleRow('set-wake', 'Layar tetap menyala', 'Mencegah layar mati di tengah sesi.', s.settings?.wakeLock !== false)}
      <p class="dim small">Keduanya tidak memengaruhi penilaian sesi maupun XP.</p>
    `)}

    ${card(`
      <p class="label">Notifikasi sinyal</p>
      <p class="dim">Sinyal EMA muncul pada waktu acak dan hanya berlaku selama jendela
      waktunya. Dengan izin notifikasi, aplikasi bisa mengingatkanmu saat sinyal muncul
      sementara aplikasi sedang tidak terlihat.</p>
      <p class="dim small">Status izin sekarang: <b id="izin">${esc(izin)}</b>.</p>
      ${izin === 'default' ? button('Izinkan notifikasi', { id: 'btn-izin', variant: 'ghost' }) : ''}
      ${izin === 'denied' ? `<p class="dim small">Izin ditolak dari pengaturan peramban.
        Kamu tetap bisa menjawab sinyal dengan membuka aplikasi ini seperti biasa.</p>` : ''}
    `)}

    ${card(`
      <p class="label">Data kamu</p>
      <p class="dim small">Tersimpan di perangkat ini lebih dulu, lalu dikirim ketika ada
      internet. Antrean saat ini: ${Sync.pending()} baris.</p>
      <p class="dim small">Nomor WhatsApp tidak pernah disimpan dalam bentuk aslinya, dan
      dihapus seluruhnya setelah kuesioner akhir.</p>
    `)}

    ${card(`
      <p class="dim small center">FOKUS versi ${esc(APP_VERSION)}</p>
      <!-- Baris ini adalah jalan masuk mode peneliti: tujuh ketukan. Teksnya sengaja
           terlihat seperti keterangan biasa, dan sejak 0.8.0 tidak lagi menyebut satu
           sekolah tertentu karena partisipan berasal dari beberapa sekolah. Yang wajib
           dipertahankan hanyalah id="tap-versi" - itulah pengait ketukannya. -->
      <p class="dim small center" id="tap-versi" style="cursor:default">${esc(STUDY.fullName)}</p>
      ${Store.get().participant?.school ? `<p class="dim small center">${esc(Store.get().participant.school)}</p>` : ''}
    `)}

    ${button('Kembali', { id: 'btn-back', variant: 'ghost' })}
  `, { bg: 'home', chrome: 'full' });

  document.getElementById('set-sound')?.addEventListener('change', (e) => {
    Store.patch({ settings: { ...Store.get().settings, sound: e.target.checked } });
  });
  document.getElementById('set-wake')?.addEventListener('change', (e) => {
    Store.patch({ settings: { ...Store.get().settings, wakeLock: e.target.checked } });
  });

  document.getElementById('btn-izin')?.addEventListener('click', async () => {
    try {
      const hasil = await Notification.requestPermission();
      document.getElementById('izin').textContent = hasil;
      toast(hasil === 'granted' ? 'Notifikasi diaktifkan.' : 'Notifikasi tidak diaktifkan.');
    } catch {
      toast('Peramban ini tidak mendukung notifikasi.');
    }
  });

  /* Jalan masuk mode peneliti: tujuh ketukan pada baris nama sekolah.

     Bukan tombol biasa, karena satu-satunya orang yang perlu masuk ke sana adalah
     orang yang sudah tahu caranya. Bukan pula rahasia yang dijaga - yang menjaga
     adalah PIN di layar berikutnya. Ini hanya mencegah partisipan tersasar ke layar
     penuh angka mentah yang bisa memengaruhi cara mereka berperilaku. */
  let ketukan = 0;
  document.getElementById('tap-versi')?.addEventListener('click', () => {
    ketukan += 1;
    if (ketukan >= 7) go('dev');
  });

  document.getElementById('btn-back').addEventListener('click', () => go('home'));
}
