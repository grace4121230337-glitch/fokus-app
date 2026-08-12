/* Layar Kubah Fokus.

   Pembagian tugas yang tidak boleh dilanggar:
   - core/dome.js  MENGHITUNG (klasifikasi, penalti, XP, baris data)
   - berkas ini    MENGGAMBAR (timer, bar HP, modal) dan mengurus API browser
     yang tidak ada di Node: Wake Lock, visibilitychange, pagehide.

   Kalau ada aturan penelitian yang tergoda ditulis di sini, tempatnya salah -
   pindahkan ke core/ supaya bisa diuji tanpa browser. */

import { Store, currentPhase, Sync } from '../../core/store.js';
import { APP_VERSION } from '../../core/config.js';
import { progressSummary } from '../../core/progress.js';
import { logFidelity } from '../../core/supabase.js';
import {
  ALLOWED_MINUTES, DEFAULT_MINUTES, OUTCOME, AWAY_REASONS,
  createSession, sessionTiming, isStale, applyAway, setAwayReason,
  finishSession, recordSession, summarizeMarks, outcomeTitle, outcomeNote,
} from '../../core/dome.js';
import {
  mount, card, button, hpBar, companionImg, esc, toast, choiceModal, fmtClock, progressBar,
} from '../components.js';
import { currentBucket, offeredMinutes, acceptNudge } from '../../core/nudgeRuntime.js';
import { triggerPostSessionEma } from '../../core/emaRuntime.js';
import { log } from '../../core/env.js';
import { go } from '../router.js';

/* --- Sumber daya yang harus dibersihkan saat meninggalkan layar --- */
let drawTimer = null;
let wakeLock = null;
let listenersBound = false;
let ending = false;

function clearDraw() {
  if (drawTimer) { clearInterval(drawTimer); drawTimer = null; }
}

/** Wake Lock: mencegah layar mati saat partisipan menaruh HP dan mulai belajar.
    Tanpa ini, layar padam -> tab tersembunyi -> terhitung sebagai keluar aplikasi,
    dan HP partisipan berkurang karena hal yang bukan salahnya. */
async function acquireWakeLock() {
  if (!Store.get().settings?.wakeLock) return false;
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
      return true;
    }
  } catch {
    /* Browser menolak (mis. tab tidak aktif). Bukan error fatal: sesi tetap jalan. */
  }
  return false;
}

function releaseWakeLock() {
  try { wakeLock?.release?.(); } catch { /* diabaikan */ }
  wakeLock = null;
}

/* --- Bagian 1: layar persiapan (belum ada sesi berjalan) --- */

/* Durasi yang disorot saat layar dibuka.

   Di fase intervensi angkanya datang dari bucket nudge; di baseline selalu 25 menit.
   Yang tetap sama di kedua fase: SEMUA pilihan durasi tetap bisa ditekan. Nudge
   menyarankan, tidak memaksa - kalau aplikasi mengunci durasi, yang diukur bukan lagi
   pengaruh saran melainkan pengaruh paksaan. */
function setupView(state, phase, saran) {
  const p = progressSummary(state);
  const baseline = !phase || phase.phase === 'baseline';
  const pilihan = ALLOWED_MINUTES.map((m) => `
    <button class="btn btn--ghost btn--chip" data-minutes="${m}"
      ${m === saran ? 'aria-pressed="true"' : ''}>${m} menit</button>`).join('');

  mount(`
    <header class="head">
      <div><p class="label">Kubah Fokus</p><h1 class="h1">Siap masuk?</h1></div>
    </header>
    ${card(`
      ${companionImg(p.art, `${p.name} tahap ${p.stage}`, { size: 'lg', enter: true })}
      <p class="dim center">${esc(p.name)} menemanimu di dalam kubah.</p>
    `, { cls: 'card--accent' })}
    ${card(`
      <h2 class="h2">Durasi sesi</h2>
      <div class="chips" id="durasi">${pilihan}</div>
      <p class="dim">Selama sesi berlangsung: biarkan layar ini terbuka. Berpindah ke
      aplikasi lain mengurangi ketahanan kubah - itulah yang diukur penelitian ini.</p>
      ${baseline ? '' : '<p class="dim">Durasi yang disarankan mengikuti kondisimu hari ini.</p>'}
      ${button('Masuk kubah', { id: 'btn-masuk' })}
      <a class="btn btn--ghost btn--block" href="#home">Nanti saja</a>
    `)}
  `, { bg: 'dome', chrome: 'full' });
}

/* --- Bagian 2: sesi berjalan --- */

function sessionView(state, session) {
  const p = progressSummary(state);
  const { remainingMs, percent } = sessionTiming(session);
  return mount(`
    <div class="dome">
      ${companionImg(p.art, `${p.name}`, { size: 'lg' })}
      <div class="timer" id="timer" role="timer" aria-live="off">${fmtClock(remainingMs)}</div>
      <p class="dim small" id="sisa-label">${session.plannedMinutes} menit - biarkan layar tetap terbuka</p>
      <div class="dome__hp">
        <div class="row"><span class="label">Ketahanan kubah</span>
          <span class="dim" id="hp-angka">${session.hp}</span></div>
        <div id="hp-slot">${hpBar(session.hp)}</div>
      </div>
      ${progressBar(percent, { cls: 'progress--thin' })}
      <button class="btn btn--ghost btn--block" id="btn-akhiri">Akhiri sesi</button>
    </div>
  `, { bg: 'dome', chrome: 'bare' });
}

/* --- Bagian 3: ringkasan setelah sesi ditutup --- */

function summaryView(row, result) {
  const marks = { glance: row.away_glance, mid: row.away_mid, switch: row.away_switch };
  const adaGangguan = marks.glance + marks.mid + marks.switch > 0;
  mount(`
    <header class="head"><h1 class="h1">${esc(outcomeTitle(row.outcome))}</h1></header>
    ${card(`
      <div class="grid-3 center">
        <div><p class="h2">+${row.xp_awarded}</p><p class="dim">XP</p></div>
        <div><p class="h2">${row.hp_end}</p><p class="dim">HP akhir</p></div>
        <div><p class="h2">${Math.round(row.elapsed_sec / 60)}</p><p class="dim">Menit fokus</p></div>
      </div>
      <p class="dim">${esc(outcomeNote(row.outcome))}</p>
      ${result.leveledUp ? `<p class="center">Naik ke level ${result.level}.</p>` : ''}
      ${result.evolved ? '<p class="center">Companion-mu berevolusi ke tahap berikutnya.</p>' : ''}
    `, { cls: 'card--accent' })}
    ${adaGangguan ? card(`
      <h2 class="h2">Catatan gangguan</h2>
      <div class="grid-3 center">
        <div><p class="h2">${marks.glance}</p><p class="dim">Melirik</p></div>
        <div><p class="h2">${marks.mid}</p><p class="dim">Sebentar</p></div>
        <div><p class="h2">${marks.switch}</p><p class="dim">Pindah aplikasi</p></div>
      </div>
      <p class="dim">Catatan ini apa adanya, bukan penilaian. Justru pola inilah yang
      dianalisis peneliti.</p>
    `, { cls: 'card--tight' }) : ''}
    ${button('Kembali ke Beranda', { id: 'btn-selesai' })}
  `, { bg: 'home', chrome: 'full' });

  document.getElementById('btn-selesai')?.addEventListener('click', () => go('home'));
}

/* --- Siklus hidup sesi --- */

function saveSession(session) {
  Store.update((s) => ({ ...s, activeSession: session }));
}

/** Menutup sesi: satu jalan keluar untuk semua hasil, supaya tidak ada cabang
    yang lupa melepas Wake Lock atau lupa menulis baris data. */
function endSession(outcome) {
  if (ending) return;
  ending = true;
  clearDraw();
  releaseWakeLock();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
  listenersBound = false;

  const state = Store.get();
  const session = state.activeSession;
  if (!session) { ending = false; return go('home'); }

  const row = finishSession(session, { outcome, appVersion: APP_VERSION });
  const result = recordSession(state, row);
  Store.update(() => result.state);
  Store.flush();

  Sync.enqueue('sessions', { ...row, participant_id: state.participant?.id ?? null });
  if (outcome === OUTCOME.BROKEN) {
    logFidelity(state.participant?.id, 'dome_broken', { hp_end: row.hp_end, elapsed_sec: row.elapsed_sec });
  }

  /* EMA pasca-sesi (Bab 3 3.4.d).

     Inilah pop-up yang selama ini hilang: sebelumnya sesi berakhir langsung ke layar
     hasil, sehingga satu-satunya EMA yang pernah dijalankan aplikasi adalah tiga sinyal
     acak harian - padahal Bab 3 juga meminta pengukuran yang melekat pada sesi.

     Sinyalnya dibuat SEKARANG, tetapi layarnya tidak dipaksa muncul sekarang: partisipan
     berhak melihat hasil sesinya lebih dulu. Begitu ia menekan "Selesai", gerbang di
     router mendapati ada sinyal yang jatuh tempo dan mengarahkannya ke EMA. Jendelanya
     15 menit, jadi jeda membaca ringkasan tidak menghanguskan apa pun.

     Dibuat untuk SEMUA hasil sesi, bukan hanya yang selesai. Sesi yang putus di tengah
     justru momen yang paling ingin dipahami penelitian ini. */
  const psSignal = triggerPostSessionEma(row);
  if (psSignal) log('sinyal EMA pasca-sesi dibuat', psSignal.signalId);

  summaryView(row, result);
  ending = false;
}

/** Menggambar ulang timer & HP. Tidak menghitung apa pun selain tampilan. */
function draw() {
  const session = Store.get().activeSession;
  if (!session) return;
  const { remainingMs, percent, finished } = sessionTiming(session);

  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = fmtClock(remainingMs);
  const bar = document.querySelector('.progress__fill');
  if (bar) bar.style.setProperty('--val', `${percent}%`);

  if (finished) endSession(OUTCOME.COMPLETED);
}

function paintHp(hp) {
  const slot = document.getElementById('hp-slot');
  if (slot) slot.innerHTML = hpBar(hp);
  const angka = document.getElementById('hp-angka');
  if (angka) angka.textContent = String(hp);
}

/** Disambiguasi satu ketuk. Penalti SUDAH final sebelum modal ini tampil. */
async function askReason(markId) {
  const pilihan = await choiceModal({
    title: 'Tadi kamu ke mana?',
    body: 'Jawabanmu tidak mengubah ketahanan kubah. Ini hanya membantu peneliti memahami konteksnya.',
    options: AWAY_REASONS.map((r) => ({ id: r.id, label: r.label })),
  });
  if (!pilihan) return;
  const s = Store.get();
  if (!s.activeSession) return;
  Store.update((st) => ({ ...st, activeSession: setAwayReason(st.activeSession, markId, pilihan) }));
}

/**
 * Inti deteksi. Saat tab kembali terlihat:
 * 1. hitung lama menghilang dari jam dinding,
 * 2. terapkan penalti (objektif),
 * 3. ambil ulang Wake Lock (browser mencabutnya saat tab tersembunyi),
 * 4. baru bertanya alasan.
 * Urutan ini yang menjaga variabel dependen tetap bersih.
 */
async function onVisibility() {
  const state = Store.get();
  const session = state.activeSession;
  if (!session) return;

  if (document.hidden) {
    Store.update((s) => ({ ...s, activeSession: { ...s.activeSession, hiddenAt: Date.now() } }));
    Store.flush();                    // tab bisa dibunuh OS kapan saja setelah ini
    return;
  }

  const hiddenAt = session.hiddenAt;
  await acquireWakeLock();
  if (!hiddenAt) return;

  const awayMs = Date.now() - hiddenAt;
  const { session: next, mark, broken, needsReason } = applyAway(session, { awayMs });
  saveSession(next);
  paintHp(next.hp);

  if (broken) { endSession(OUTCOME.BROKEN); return; }
  if (needsReason) await askReason(mark.id);
}

/** Tab ditutup di tengah sesi: simpan waktu terakhir supaya deteksi basi akurat. */
function onPageHide() {
  const s = Store.get();
  if (!s.activeSession) return;
  Store.update((st) => ({ ...st, activeSession: { ...st.activeSession, lastTickAt: Date.now() } }));
  Store.flush();
}

function bindListeners() {
  if (listenersBound) return;
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  listenersBound = true;
}

async function runSession() {
  const state = Store.get();
  const session = state.activeSession;
  sessionView(state, session);
  bindListeners();

  const locked = await acquireWakeLock();
  if (locked && !session.wakeLock) saveSession({ ...Store.get().activeSession, wakeLock: true });

  clearDraw();
  drawTimer = setInterval(() => {
    const s = Store.get();
    if (!s.activeSession) return clearDraw();
    // lastTickAt diperbarui agar sesi yang ditinggal >6 jam terdeteksi basi saat boot.
    if (Date.now() - (s.activeSession.lastTickAt || 0) > 5_000) {
      Store.update((st) => ({ ...st, activeSession: { ...st.activeSession, lastTickAt: Date.now() } }));
    }
    draw();
  }, 250);
  draw();

  document.getElementById('btn-akhiri')?.addEventListener('click', async () => {
    const jawab = await choiceModal({
      title: 'Akhiri sesi sekarang?',
      body: 'Sesi yang diakhiri lebih awal tetap dicatat, dengan XP lebih kecil.',
      options: [
        { id: 'lanjut', label: 'Lanjut fokus', variant: 'primary' },
        { id: 'akhiri', label: 'Ya, akhiri' },
      ],
      dismissible: true,
    });
    if (jawab === 'akhiri') endSession(OUTCOME.ABORTED);
  });
}

/* --- Titik masuk layar --- */

export async function render() {
  ending = false;
  const state = Store.get();
  const phase = currentPhase(state);
  const active = state.activeSession;

  // Sesi basi ditutup sebagai data 'expired', bukan dihapus diam-diam:
  // sesi yang ditinggalkan adalah perilaku yang layak dianalisis.
  if (active && (active.stale || isStale(active))) {
    endSession(OUTCOME.EXPIRED);
    toast('Sesi sebelumnya ditutup otomatis karena aplikasi lama tertutup.');
    return;
  }

  if (active) return runSession();

  // Saran durasi dan bucket dibaca SEKALI di sini. Kalau dibaca ulang saat tombol
  // ditekan, sesi bisa tercatat dengan bucket yang berbeda dari yang benar-benar
  // dilihat partisipan - misalnya saat jam melewati pukul 16.00 di tengah layar ini.
  const bucket = currentBucket();
  const saran = offeredMinutes();

  setupView(state, phase, saran);

  let menit = saran || DEFAULT_MINUTES;
  const grup = document.getElementById('durasi');
  grup?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-minutes]');
    if (!b) return;
    menit = Number(b.dataset.minutes);
    grup.querySelectorAll('[data-minutes]').forEach((x) => x.removeAttribute('aria-pressed'));
    b.setAttribute('aria-pressed', 'true');
  });

  document.getElementById('btn-masuk')?.addEventListener('click', () => {
    const s = Store.get();
    const ph = currentPhase(s);
    const sesi = createSession({
      plannedMinutes: menit,
      tier: s.participant?.tier ?? null,
      phase: ph?.phase ?? 'pre',
      studyDay: ph?.day ?? null,
      nudgeBucket: bucket,        // null saat baseline - itu memang pembeda fasenya
    });

    // Dicatat saat sesi BENAR-BENAR dimulai, bukan saat tombol di Beranda ditekan,
    // supaya tingkat penerimaan nudge mengukur perilaku, bukan niat yang batal.
    if (bucket) acceptNudge(bucket);
    Store.update((st) => ({ ...st, activeSession: sesi }));
    Store.flush();
    runSession();
  });
}
