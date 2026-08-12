/* Mode peneliti - layar diagnostik yang HANYA MEMBACA.

   Kebutuhannya nyata: selama pengambilan data, satu-satunya cara memastikan aplikasi
   di HP partisipan benar-benar berjalan sesuai protokol adalah melihat angkanya
   langsung. Tanpa layar ini, peneliti hanya bisa menebak - apakah jadwal EMA hari ini
   sudah dibuat? apakah nudge benar-benar tidak muncul selama baseline? apakah antrean
   sinkron menumpuk karena sekolah tidak ada internet?

   TIGA ATURAN yang membuat layar ini aman ada di aplikasi penelitian:

   1. Tidak ada satu tombol pun yang MENULIS ke data penelitian. Tidak ada "reset",
      tidak ada "tandai selesai", tidak ada "loncat ke fase berikutnya". Alat
      diagnostik yang bisa mengubah data adalah ancaman bagi integritas data, bukan
      bantuan - dan godaan untuk "memperbaiki" satu angka di lapangan itu nyata.
   2. Dikunci PIN (core/devmode.js) dan tidak ada di navigasi mana pun.
   3. Tidak dapat dijangkau partisipan secara wajar: jalan masuknya tujuh ketukan
      pada satu baris teks di Pengaturan.

   Ekspor CSV di sini mengambil dari state PERANGKAT INI saja - berguna saat perangkat
   partisipan belum pernah tersambung internet. Ekspor lengkap seluruh partisipan tetap
   lewat /api/export.js dengan service_role di sisi server. */

import { Store } from '../../core/store.js';
import { APP_VERSION } from '../../core/config.js';
import { Sync } from '../../core/supabase.js';
import { checkPin, isUnlocked, unlockPatch, lockPatch } from '../../core/devmode.js';
import { studyProgress, phaseLabel, wibDate, TIERS } from '../../core/tier.js';
import { complianceReport, THRESHOLD_NOTE } from '../../core/compliance.js';
import { currentStage, daysUntilFollowup } from '../../core/studyStage.js';
import { dailyCompliance, SIGNAL_TYPE, STATUS } from '../../core/ema.js';
import { nudgeAcceptance } from '../../core/nudgeRuntime.js';
import { activeProfile } from '../../core/progress.js';
import { toCsv } from '../../core/exportUtils.js';
import { mount, card, button, toast, esc } from '../components.js';
import { go } from '../router.js';

/* --- Gerbang PIN --- */

export async function render() {
  if (!isUnlocked(Store.get())) return renderGate();
  return renderPanel();
}

function renderGate() {
  mount(`
    <div class="onboard">
      <h1 class="h1">Mode peneliti</h1>
      ${card(`
        <p class="dim">Layar ini untuk peneliti. Isinya angka mentah yang tidak perlu
        dilihat partisipan - dan sebaiknya memang tidak, karena melihat skor sendiri
        bisa mengubah cara seseorang berperilaku selama studi.</p>
        <label class="field">
          <span class="field__label">PIN</span>
          <input class="input" id="pin" type="password" inputmode="numeric"
            autocomplete="off" placeholder="******">
        </label>
        <p id="pin-info" class="note" hidden></p>
        ${button('Buka', { id: 'btn-open' })}
        ${button('Kembali', { id: 'btn-back', variant: 'ghost' })}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });

  const input = document.getElementById('pin');
  const info = document.getElementById('pin-info');

  async function coba() {
    const ok = await checkPin(input.value);
    if (!ok) {
      info.hidden = false;
      info.dataset.tone = 'bad';
      info.textContent = 'PIN salah.';
      input.value = '';
      input.focus();
      return;
    }
    Store.patch(unlockPatch());
    renderPanel();
  }

  document.getElementById('btn-open').addEventListener('click', coba);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') coba(); });
  document.getElementById('btn-back').addEventListener('click', () => go('home'));
  input.focus();
}

/* --- Panel --- */

function baris(label, value) {
  return `<div class="row"><span class="dim">${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function unduh(namaBerkas, isi, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([isi], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaBerkas;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Menerjemahkan status sinkronisasi menjadi satu kalimat yang bisa dibaca cepat.
   Kode mentah seperti "rls" atau "PGRST204" tetap ditampilkan di baris pesan di
   bawahnya - yang di sini hanya penanda arah: perlu ditindaklanjuti atau tidak. */
function statusTeks(sync) {
  const peta = {
    ok: 'terkirim normal',
    sdk: 'SDK Supabase tidak termuat',
    auth: 'login anonim gagal',
    rls: 'ditolak kebijakan RLS',
    schema: 'skema server belum sesuai',
    fk: 'baris induk belum sampai',
    check: 'nilai ditolak constraint',
    key: 'anon key ditolak',
    network: 'tidak sampai ke server',
    duplicate: 'duplikat (dianggap berhasil)',
    diagnose: 'ada langkah diagnosa yang gagal',
    unknown: 'gagal, sebab belum dikenali',
  };
  if (!sync.reason) return sync.pending ? 'belum pernah mencoba' : 'tidak ada antrean';
  return peta[sync.reason] || sync.reason;
}

function renderPanel() {
  const s = Store.get();
  const p = s.participant;
  const prog = p?.tier && p?.startedOn ? studyProgress(p.tier, p.startedOn) : null;
  const hariIni = dailyCompliance(s.emaSignals || [], wibDate());
  const kepatuhan = complianceReport(s);
  const nudge = nudgeAcceptance(s);
  const stage = currentStage(s);
  const sisaFollowup = daysUntilFollowup(s);
  const cfg = p?.tier ? TIERS[p.tier] : null;

  const sync = Sync.status();
  const pascaSesi = (s.emaSignals || []).filter((x) => x.type === SIGNAL_TYPE.POST_SESSION);
  const fidelitas = s.fidelityLog || [];
  const fidelitasGagal = fidelitas.filter((r) => r.fidelity_ok === false).length;

  const fase = kepatuhan.phases.map((f) => `
    <div class="row">
      <span class="dim">${esc(phaseLabel(f.phase))}</span>
      <b>${f.answered}/${f.delivered} EMA${f.rate === null ? '' : ` (${Math.round(f.rate * 100)}%)`}
      - ${f.dataPoints} sesi ${f.complete ? 'OK' : 'BELUM'}</b>
    </div>`).join('');

  mount(`
    <header class="head">
      <div><p class="label">Mode peneliti - hanya membaca</p><h1 class="h1">Diagnostik</h1></div>
    </header>

    ${card(`
      <p class="label">Partisipan</p>
      ${baris('Kode', p?.code || '-')}
      ${baris('Tier', p?.tier ?? '-')}
      ${baris('Profil', activeProfile(s) || '-')}
      ${baris('Kepercayaan profil', s.pretest?.confidence || '-')}
      ${baris('Dasar penempatan', 'APS-S vs IUS-12')}
      ${baris('Mulai', p?.startedOn || 'belum')}
      ${baris('Identitas WA', p?.waHash ? `hash ${p.waHash.slice(0, 8)}...` : (p?.identityPurgedAt ? 'sudah dihapus' : 'tidak diisi'))}
    `)}

    ${card(`
      <p class="label">Posisi studi</p>
      ${baris('Hari ke', prog ? `${prog.day} dari ${cfg?.total ?? '-'}` : '-')}
      ${baris('Fase', prog ? phaseLabel(prog.phase) : '-')}
      ${baris('Rencana tier', cfg ? `baseline ${cfg.baseline} + intervensi ${cfg.intervention}` : '-')}
      ${baris('Tahap penutup', stage)}
      ${baris('Pascates', s.posttest?.completedOn || 'belum')}
      ${baris('Validitas sosial', s.socialValidity?.completedAt ? 'sudah' : 'belum')}
      ${baris('Follow-up', s.followup?.completedOn || (sisaFollowup ? `${sisaFollowup} hari lagi` : 'belum'))}
    `)}

    ${card(`
      <p class="label">EMA hari ini (${esc(wibDate())})</p>
      ${baris('Terjadwal', `${hariIni.answered} terjawab / ${hariIni.missed} lewat / ${hariIni.pending} menunggu`)}
      ${baris('Sinyal pasca-sesi', `${pascaSesi.filter((x) => x.status === STATUS.ANSWERED).length} terjawab dari ${pascaSesi.length}`)}
      ${baris('Total baris EMA', (s.emaEntries || []).length)}
    `)}

    ${card(`
      <p class="label">Kepatuhan per fase</p>
      ${fase || '<p class="dim small">Belum ada data.</p>'}
      <p class="dim small">Ambang: ${esc(THRESHOLD_NOTE)}.
      Partisipan di bawah ambang TIDAK dibuang - ditandai untuk dilaporkan terpisah.</p>
    `)}

    ${card(`
      <p class="label">Fidelitas (Bab 3 3.7)</p>
      ${baris('Checklist harian tercatat', fidelitas.length)}
      ${baris('Hari menyimpang', fidelitasGagal)}
      ${baris('Nudge tampil / diterima', `${nudge.shown} / ${nudge.accepted}`)}
      <p class="dim small">"Menyimpang" berarti nudge muncul saat baseline, atau tidak
      muncul saat intervensi. Keduanya sama-sama merusak desain.</p>
    `)}

    ${card(`
      <p class="label">Teknis</p>
      ${baris('Versi aplikasi', APP_VERSION)}
      ${baris('Antrean sinkron', `${Sync.pending()} baris`)}
      ${baris('Sesi tersimpan', (s.sessions || []).length)}
      ${baris('Daring', navigator.onLine ? 'ya' : 'tidak')}
    `)}

    ${/* Kartu diagnosa sinkronisasi.

         Ini jawaban atas kegagalan paling mahal di lapangan: aplikasi terlihat normal,
         partisipan merasa sudah mengisi, tetapi tidak satu baris pun sampai ke Supabase.
         Sebelum 0.8.0 satu-satunya petunjuk adalah angka antrean yang tidak pernah
         berkurang - sebab kegagalannya tidak pernah ditampilkan di mana pun.

         Sekarang sebab terakhir tersimpan dan ditampilkan apa adanya, lengkap dengan
         saran tindakan. "Kotak gagal" berisi baris yang menyerah setelah 5 percobaan;
         baris itu TIDAK lagi dibuang, jadi data tetap bisa diselamatkan setelah
         penyebabnya dibetulkan di server. */''}
    ${card(`
      <p class="label">Sinkronisasi</p>
      ${baris('Status terakhir', statusTeks(sync))}
      ${baris('Berhasil terakhir', sync.lastSuccessAt ? sync.lastSuccessAt.slice(0, 19).replace('T', ' ') : 'belum pernah')}
      ${baris('Antrean', `${sync.pending} baris`)}
      ${baris('Kotak gagal', `${sync.dead} baris`)}
      ${sync.dryRun ? baris('Mode uji', 'AKTIF - tidak ada baris yang dikirim') : ''}
      ${sync.message ? `<p class="dim small"><b>Pesan server:</b> ${esc(sync.message)}</p>` : ''}
      ${sync.hint ? `<p class="note" data-tone="bad">${esc(sync.hint)}</p>` : ''}
      <div id="diag-hasil"></div>
      ${button('Diagnosa koneksi (hanya baca)', { id: 'btn-diag', variant: 'ghost' })}
      ${button('Uji tulis 1 baris', { id: 'btn-probe', variant: 'ghost' })}
      ${sync.dead ? button(`Kirim ulang ${sync.dead} baris gagal`, { id: 'btn-retry', variant: 'ghost' }) : ''}
      <p class="dim small">"Uji tulis" menambahkan satu baris ke fidelity_log dengan
      event <code>sync_self_test</code> - satu-satunya tombol di layar ini yang menulis
      ke server. Hapus sebelum analisis:
      <code>delete from fidelity_log where event = 'sync_self_test';</code></p>
    `)}

    ${card(`
      <p class="label">Pemantauan lintas partisipan</p>
      <p class="dim small">Layar ini hanya melihat perangkat INI. Untuk melihat seluruh
      partisipan secara langsung - siapa yang sunyi beberapa hari, siapa yang kepatuhan
      EMA-nya turun - buka layar pemantauan. Perlu token ekspor.</p>
      ${button('Buka pemantauan studi', { id: 'btn-monitor', variant: 'ghost' })}
    `)}

    ${card(`
      <p class="label">Ekspor perangkat ini</p>
      <p class="dim small">Hanya data di HP ini, untuk cadangan saat perangkat belum pernah
      daring. Ekspor resmi seluruh partisipan tetap lewat /api/export.js.</p>
      ${button('CSV sesi', { id: 'exp-sesi', variant: 'ghost' })}
      ${button('CSV EMA', { id: 'exp-ema', variant: 'ghost' })}
      ${button('CSV fidelitas harian', { id: 'exp-fid', variant: 'ghost' })}
      ${button('JSON seluruh state', { id: 'exp-json', variant: 'ghost' })}
    `)}

    ${button('Kunci lagi', { id: 'btn-lock' })}
    ${button('Kembali ke Beranda', { id: 'btn-back', variant: 'ghost' })}
  `, { bg: 'home', chrome: 'full' });

  document.getElementById('btn-monitor')?.addEventListener('click', () => go('monitor'));

  const hasil = document.getElementById('diag-hasil');

  document.getElementById('btn-diag')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    hasil.innerHTML = '<p class="dim small">Memeriksa...</p>';
    const { steps } = await Sync.diagnose();
    hasil.innerHTML = steps.map((st) => `
      <p class="dim small">${st.ok ? '[OK]' : '[GAGAL]'} ${esc(st.name)}${st.detail ? ` - ${esc(st.detail)}` : ''}
      ${st.ok || !st.hint ? '' : `<br><b>${esc(st.hint)}</b>`}</p>`).join('');
    e.currentTarget.disabled = false;
  });

  document.getElementById('btn-probe')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const r = await Sync.writeProbe({ participantId: p?.id });
    hasil.innerHTML = `<p class="note" data-tone="${r.ok ? 'good' : 'bad'}">${esc(r.message)}${
      r.hint ? `<br>${esc(r.hint)}` : ''}</p>`;
    toast(r.ok ? 'Uji tulis berhasil.' : 'Uji tulis gagal - baca keterangannya.');
    e.currentTarget.disabled = false;
  });

  document.getElementById('btn-retry')?.addEventListener('click', async () => {
    const n = Sync.retryDead();
    toast(`${n} baris dikembalikan ke antrean.`);
    await Sync.flush();
    renderPanel();
  });

  const kode = p?.code || 'lokal';
  const stempel = wibDate();

  document.getElementById('exp-sesi').addEventListener('click', () => {
    const rows = Store.get().sessions || [];
    if (!rows.length) return toast('Belum ada sesi tersimpan.');
    unduh(`fokus-sesi-${kode}-${stempel}.csv`, toCsv(rows));
  });
  document.getElementById('exp-ema').addEventListener('click', () => {
    const rows = Store.get().emaEntries || [];
    if (!rows.length) return toast('Belum ada baris EMA.');
    unduh(`fokus-ema-${kode}-${stempel}.csv`, toCsv(rows));
  });
  document.getElementById('exp-fid').addEventListener('click', () => {
    const rows = Store.get().fidelityLog || [];
    if (!rows.length) return toast('Belum ada checklist harian.');
    unduh(`fokus-fidelitas-${kode}-${stempel}.csv`, toCsv(rows));
  });
  document.getElementById('exp-json').addEventListener('click', () => {
    unduh(`fokus-state-${kode}-${stempel}.json`,
      JSON.stringify(Store.get(), null, 2), 'application/json');
  });

  document.getElementById('btn-lock').addEventListener('click', () => {
    Store.patch(lockPatch());
    toast('Mode peneliti dikunci.');
    go('home');
  });
  document.getElementById('btn-back').addEventListener('click', () => go('home'));
}
