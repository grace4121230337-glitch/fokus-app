/* Struk Fokus - layar umpan balik untuk PARTISIPAN.

   Sampai 0.7.0 setiap angka perilaku hanya bisa dilihat peneliti di layar #dev yang
   terkunci PIN. Untuk tujuan penelitian itu benar; untuk tujuan kedua aplikasi ini -
   melatih fokus - itu berarti partisipan berlatih 14 hari tanpa pernah melihat hasil
   latihannya. Layar ini menutup celah tersebut.

   Bentuk struk belanja dipilih bukan sekadar gaya. Struk adalah dokumen yang MELAPORKAN
   apa yang sudah terjadi, bukan yang menilai atau menyuruh. Bentuk itu secara alami
   menahan aplikasi ini dari memberi saran yang dipersonalisasi - dan saran yang
   dipersonalisasi persis merupakan intervensi yang sedang diteliti (core/nudge.js),
   yang hanya boleh menyala pada fase intervensi. Pagar itu ditegakkan di core/insight.js.

   Yang ditampilkan di sini dan yang diunduh sebagai PNG berasal dari SATU model data
   yang sama, jadi gambar hasil unduhan tidak mungkin berisi angka berbeda dari yang
   dibaca partisipan di layar. */

import { Store } from '../../core/store.js';
import { receiptData, SCOPE } from '../../core/insight.js';
import { downloadReceipt } from '../../core/receiptImage.js';
import { mount, card, button, esc, toast } from '../components.js';
import { go } from '../router.js';

let scope = SCOPE.WEEK;

function barisStruk(kiri, kanan, opts = {}) {
  return `<div class="struk__row ${opts.strong ? 'struk__row--strong' : ''}">
    <span class="struk__k">${esc(kiri)}</span>
    <span class="struk__dots" aria-hidden="true"></span>
    <span class="struk__v">${esc(String(kanan))}</span>
  </div>`;
}

function barcodeHtml(bars) {
  return `<div class="struk__barcode" aria-hidden="true">${bars
    .map((b) => `<i style="width:${b.w}px;margin-right:${b.gap}px"></i>`)
    .join('')}</div>`;
}

function strukHtml(d) {
  return `
    <div class="struk" id="struk">
      <div class="struk__paper">
        <div class="struk__head">
          <h2 class="struk__title">${esc(d.title)}</h2>
          <p class="struk__sub">${esc(d.subtitle)}</p>
          <p class="struk__no">NO. ${esc(d.receiptNo)}</p>
        </div>

        <div class="struk__cut"></div>
        <div class="struk__block">
          ${d.meta.map((m) => barisStruk(m.key, m.value)).join('')}
        </div>

        <div class="struk__cut"></div>
        <div class="struk__block">
          <div class="struk__row struk__row--label">
            <span class="struk__k">RINCIAN</span><span class="struk__v">JUMLAH</span>
          </div>
          ${d.lines.map((l) => barisStruk(l.label, l.amount)).join('')}
        </div>

        <div class="struk__cut"></div>
        <div class="struk__block">
          ${d.totals.map((t) => barisStruk(t.key, t.value, { strong: t.strong })).join('')}
        </div>

        <div class="struk__cut"></div>
        <div class="struk__foot">
          <p class="struk__auth">${esc(d.authCode)}</p>
          <p class="struk__thanks">${esc(d.footer)}</p>
          <p class="struk__note">${esc(d.footerNote)}</p>
          ${barcodeHtml(d.barcode)}
        </div>
      </div>
    </div>`;
}

export async function render() {
  const state = Store.get();
  const d = receiptData(state, { scope });

  const kosong = d.metrics.sessionsStarted === 0 && d.metrics.emaDelivered === 0;

  const app = mount(`
    <header class="head">
      <div><p class="label">Struk Fokus</p><h1 class="h1">Hasil latihanmu</h1></div>
      <a href="#home" aria-label="Kembali">
        <img src="/assets/icon/ui-setting.svg" alt="" width="28" height="28" hidden></a>
    </header>

    <div class="seg" role="tablist" aria-label="Pilih periode">
      <button class="seg__btn ${scope === SCOPE.WEEK ? 'is-on' : ''}" data-scope="week"
        role="tab" aria-selected="${scope === SCOPE.WEEK}">7 hari terakhir</button>
      <button class="seg__btn ${scope === SCOPE.ALL ? 'is-on' : ''}" data-scope="all"
        role="tab" aria-selected="${scope === SCOPE.ALL}">Seluruhnya</button>
    </div>

    ${strukHtml(d)}

    ${kosong ? card(`
      <p class="dim">Strukmu masih kosong karena belum ada sesi yang tercatat pada periode
      ini. Mulai satu sesi di Kubah Fokus, lalu buka lagi halaman ini.</p>
    `) : ''}

    ${button('Unduh struk (PNG)', { id: 'btn-unduh', block: true })}

    ${card(`
      <p class="dim small">Struk ini hanya menghitung ulang apa yang sudah kamu lakukan.
      Ia tidak memberi nilai, tidak membandingkanmu dengan siapa pun, dan tidak menyuruhmu
      berlatih lebih banyak. Angka yang kecil bukan berarti gagal - datanya tetap berguna
      untuk penelitian ini apa adanya.</p>
    `)}

    ${button('Kembali ke Beranda', { id: 'btn-back', variant: 'ghost', block: true })}
  `, { bg: 'home', chrome: 'full' });

  app.querySelectorAll('.seg__btn').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope === 'all' ? SCOPE.ALL : SCOPE.WEEK;
    render();
  }));

  app.querySelector('#btn-back')?.addEventListener('click', () => go('home'));

  app.querySelector('#btn-unduh')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const semula = btn.textContent;
    btn.textContent = 'Menyiapkan gambar...';
    try {
      const hasil = await downloadReceipt(d, document.getElementById('struk'));
      if (hasil.ok) toast(hasil.shared ? 'Struk dibagikan.' : 'Struk tersimpan sebagai gambar.');
      else toast('Peramban ini tidak bisa menyimpan gambar. Coba tangkapan layar biasa.');
    } catch (err) {
      console.error('[fokus] unduh struk gagal', err);
      toast('Gagal membuat gambar. Coba tangkapan layar biasa.');
    } finally {
      btn.disabled = false;
      btn.textContent = semula;
    }
  });
}
