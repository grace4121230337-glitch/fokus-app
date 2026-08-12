/* Pemantauan lintas partisipan - layar PENELITI, bukan partisipan.

   Kenapa layar ini perlu ada, padahal sudah ada ekspor CSV.

   Ekspor menjawab pertanyaan "bagaimana hasilnya" SETELAH studi selesai. Yang tidak
   pernah terjawab selama studi berjalan adalah pertanyaan yang jauh lebih mendesak:
   siapa yang hari ini perlu dihubungi. Dalam desain multiple-baseline, satu partisipan
   yang diam-diam berhenti mengisi selama tiga hari bukan sekadar data yang berkurang -
   deret waktunya bolong tepat di titik yang menentukan, dan tidak ada cara memperbaikinya
   setelah studi ditutup. Kerugian itu hanya bisa dicegah bila ketahuan pada hari yang
   sama, dan itulah tugas layar ini.

   BATASANNYA SENGAJA KETAT:
   - Hanya membaca. Tidak ada tombol yang mengubah data partisipan mana pun.
   - Tidak menampilkan jawaban individual butir EMA. Yang tampil hanya angka kepatuhan
     dan aktivitas. Peneliti tidak perlu membaca isi jawaban untuk tahu siapa yang perlu
     dihubungi, dan partisipan dijanjikan datanya dianalisis sebagai kelompok.
   - Data diambil lewat /api/monitor.js dengan service_role di sisi server. Kunci itu
     TIDAK PERNAH ada di perangkat; peramban hanya mengirim token ekspor.
   - Token disimpan di sessionStorage, bukan localStorage: ia hilang saat tab ditutup,
     sehingga HP yang dipinjamkan tidak menyimpan akses peneliti. */

import { isUnlocked } from '../../core/devmode.js';
import { Store } from '../../core/store.js';
import { monitorCsvRows } from '../../core/monitorUtils.js';
import { toCsv } from '../../core/exportUtils.js';
import { mount, card, button, toast, esc } from '../components.js';
import { go } from '../router.js';

const TOKEN_KEY = 'fokus.monitorToken';
const REFRESH_MS = 30_000;

let timer = null;
let terakhir = null;

function ambilToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function simpanToken(v) {
  try { sessionStorage.setItem(TOKEN_KEY, v); } catch { /* mode privat */ }
}

function hentikanTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

function fmtJam(iso) {
  if (!iso) return '-';
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 16);
}

function badge(flags) {
  if (!flags.length) return '<span class="pill pill--ok">aman</span>';
  return flags.map((f) => `<span class="pill pill--warn">${esc(f)}</span>`).join(' ');
}

function tabel(rows) {
  if (!rows.length) {
    return '<p class="dim">Belum ada partisipan terdaftar di server.</p>';
  }
  return `
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr>
          <th>Kode</th><th>Hari</th><th>Fase</th><th>Terakhir</th>
          <th>Sesi</th><th>EMA</th><th>Catatan</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr class="${r.flags.length ? 'is-warn' : ''}">
              <td><b>${esc(r.code)}</b><br><span class="dim small">${esc(r.school || 'sekolah -')}</span></td>
              <td>${r.day || '-'}${r.totalDays ? `/${r.totalDays}` : ''}</td>
              <td>${esc(r.phaseLabel)}</td>
              <td>${r.lastSeenDays === null ? '-' : (r.lastSeenDays === 0 ? 'hari ini' : `${r.lastSeenDays} hari lalu`)}</td>
              <td>${r.sessionsToday} / ${r.sessionsCompleted}<br><span class="dim small">${r.focusMinutes} mnt</span></td>
              <td>${r.emaRate === null ? '-' : `${r.emaRate}%`}<br><span class="dim small">${r.emaAnswered}/${r.emaDelivered}</span></td>
              <td>${badge(r.flags)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function ringkasan(sum) {
  return card(`
    <div class="grid-3 center">
      <div><p class="h2">${sum.started}/${sum.expected}</p><p class="dim">Mulai</p></div>
      <div><p class="h2">${sum.activeToday}</p><p class="dim">Aktif hari ini</p></div>
      <div><p class="h2">${sum.needsContact}</p><p class="dim">Perlu dihubungi</p></div>
    </div>
    <p class="dim small center">Sesi hari ini ${sum.sessionsToday} - total ${sum.sessionsTotal} -
    rerata kepatuhan EMA ${sum.emaRateMean === null ? '-' : `${sum.emaRateMean}%`}</p>
    <p class="dim small center">${sum.byPhase.map((b) => `${esc(b.label)}: ${b.count}`).join(' - ')}</p>
  `, { cls: 'card--tight' });
}

async function muat(token) {
  const res = await fetch(`/api/monitor?token=${encodeURIComponent(token)}`, {
    headers: { 'x-export-token': token },
  });
  if (res.status === 401) throw new Error('Token ditolak. Periksa EXPORT_TOKEN di Vercel.');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server menjawab ${res.status}.`);
  }
  return res.json();
}

function renderGate(pesan = '') {
  hentikanTimer();
  mount(`
    <div class="onboard">
      <h1 class="h1">Pemantauan studi</h1>
      ${card(`
        <p class="dim">Masukkan token ekspor (EXPORT_TOKEN) untuk melihat data seluruh
        partisipan. Token disimpan hanya selama tab ini terbuka.</p>
        <label class="field">
          <span class="field__label">Token ekspor</span>
          <input class="input" id="token" type="password" autocomplete="off" spellcheck="false">
        </label>
        ${pesan ? `<p class="note" data-tone="bad">${esc(pesan)}</p>` : ''}
        ${button('Buka pemantauan', { id: 'btn-buka', block: true })}
      `)}
      ${button('Kembali ke mode peneliti', { id: 'btn-dev', variant: 'ghost', block: true })}
    </div>
  `, { bg: 'home', chrome: 'bare' });

  document.getElementById('btn-dev')?.addEventListener('click', () => go('dev'));
  document.getElementById('btn-buka')?.addEventListener('click', async () => {
    const t = document.getElementById('token').value.trim();
    if (!t) { toast('Token belum diisi.'); return; }
    simpanToken(t);
    await render();
  });
}

export async function render() {
  // Pagar yang sama dengan layar #dev: PIN peneliti. Token ekspor saja tidak cukup,
  // karena token bisa saja tertinggal di HP yang dipinjam partisipan.
  if (!isUnlocked(Store.get())) {
    hentikanTimer();
    toast('Buka mode peneliti terlebih dahulu.');
    go('dev');
    return;
  }

  const token = ambilToken();
  if (!token) return renderGate();

  if (!terakhir) {
    mount(`<section class="card"><p class="dim">Mengambil data dari server...</p></section>`,
      { bg: 'home', chrome: 'full' });
  }

  let data;
  try {
    data = await muat(token);
    terakhir = data;
  } catch (err) {
    hentikanTimer();
    if (String(err.message).includes('Token')) return renderGate(err.message);
    // Kegagalan jaringan tidak boleh menghapus tabel yang sudah tampil: peneliti di
    // lapangan sering kehilangan sinyal sebentar, dan layar kosong membuatnya mengira
    // datanya hilang.
    if (!terakhir) {
      mount(`
        <section class="card">
          <h1 class="h1">Gagal mengambil data</h1>
          <p class="dim">${esc(String(err.message))}</p>
          ${button('Coba lagi', { id: 'btn-retry', block: true })}
          ${button('Kembali', { id: 'btn-dev', variant: 'ghost', block: true })}
        </section>`, { bg: 'home', chrome: 'full' });
      document.getElementById('btn-retry')?.addEventListener('click', () => render());
      document.getElementById('btn-dev')?.addEventListener('click', () => go('dev'));
      return;
    }
    data = terakhir;
    toast('Gagal menyegarkan - menampilkan data terakhir.');
  }

  const app = mount(`
    <header class="head">
      <div><p class="label">Mode peneliti</p><h1 class="h1">Pemantauan studi</h1></div>
      <span class="dim small">${esc(fmtJam(data.generatedAt))} WIB</span>
    </header>

    ${ringkasan(data.summary)}

    ${card(`
      <p class="label">Per partisipan</p>
      <p class="dim small">Urut berdasarkan yang paling perlu dihubungi. "Sesi" =
      hari ini / total tuntas. "Terakhir" dihitung dari tanggal data, bukan waktu kiriman.</p>
      ${tabel(data.rows)}
    `)}

    ${card(`
      <p class="dim small">Menyegarkan otomatis tiap ${REFRESH_MS / 1000} detik.
      Data diambil lewat server; kunci service_role tidak pernah ada di perangkat ini.</p>
      ${button('Segarkan sekarang', { id: 'btn-refresh', variant: 'ghost' })}
      ${button('Unduh CSV pemantauan', { id: 'btn-csv', variant: 'ghost' })}
    `)}

    ${button('Kembali ke mode peneliti', { id: 'btn-dev', variant: 'ghost', block: true })}
  `, { bg: 'home', chrome: 'full' });

  app.querySelector('#btn-dev')?.addEventListener('click', () => { hentikanTimer(); go('dev'); });
  app.querySelector('#btn-refresh')?.addEventListener('click', () => render());
  app.querySelector('#btn-csv')?.addEventListener('click', () => {
    // Urutan kolom mengikuti MONITOR_COLUMNS karena monitorCsvRows sudah menyusun
    // kuncinya dalam urutan itu; toCsv memakai urutan kunci baris pertama.
    const csv = toCsv(monitorCsvRows(data.rows));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fokus-pemantauan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  });

  hentikanTimer();
  timer = setInterval(() => {
    // Berhenti menyegarkan begitu peneliti pindah layar: interval yang terus hidup
    // akan menembak /api/monitor selamanya dan membakar kuota fungsi Vercel.
    if (!location.hash.startsWith('#monitor')) { hentikanTimer(); return; }
    void render();
  }, REFRESH_MS);
}
