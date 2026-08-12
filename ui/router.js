/* Router + gerbang boot.

   Urutan gerbang PERSIS mengikuti prosedur Bab 3 3.6, dari awal sampai akhir studi:
   Boot -> partisipan? -> consent? -> pretest? -> sesi Kubah aktif? -> EMA jatuh tempo?
        -> pascates? -> validitas sosial? -> probe follow-up? -> Beranda

   Router-lah yang memutuskan layar, bukan layar yang memanggil layar lain. Dengan
   begitu partisipan tidak mungkin "tersesat" melewati consent, pretest, maupun
   pascates. */

import { Store, hasParticipant, hasConsent, hasPretest, Sync } from '../core/store.js';
import { startAutoFlush, setDryRun } from '../core/supabase.js';
import { setActiveNav, setProfileTheme, mount, toast } from './components.js';
import { mockParams, mockState, mockBanner } from '../core/mock.js';
import { activeProfile } from '../core/progress.js';
import { currentStage, STAGE } from '../core/studyStage.js';
import { bootstrapEma, dueSignal, sweepNow } from '../core/emaRuntime.js';
import { isUnlocked } from '../core/devmode.js';
import { log } from '../core/env.js';

/* Daftar layar. Menambah layar baru cukup menambah satu entri di sini - tidak ada
   bagian lain dari aplikasi yang perlu tahu. */
const SCREENS = {
  home:     () => import('./screens/home.js'),
  dex:      () => import('./screens/dex.js'),
  quest:    () => import('./screens/quest.js'),
  rank:     () => import('./screens/rank.js'),
  coop:     () => import('./screens/coop.js'),
  register: () => import('./screens/register.js'),
  consent:  () => import('./screens/consent.js'),
  pretest:  () => import('./screens/pretest.js'),
  dome:     () => import('./screens/dome.js'),
  ema:      () => import('./screens/ema.js'),
  posttest: () => import('./screens/posttest.js'),
  survey:   () => import('./screens/survey.js'),
  followup: () => import('./screens/followup.js'),
  settings: () => import('./screens/settings.js'),
  receipt:  () => import('./screens/receipt.js'),
  dev:      () => import('./screens/dev.js'),
  monitor:  () => import('./screens/monitor.js'),
  done:     () => import('./screens/done.js'),
};

const TAB_ROUTES = ['home', 'dex', 'quest', 'rank', 'coop'];

/* Layar peneliti sengaja berada DI LUAR seluruh gerbang.

   Alasannya praktis: masalah yang paling perlu diperiksa peneliti justru terjadi pada
   perangkat yang tersangkut di salah satu gerbang - pretest yang tidak mau lanjut,
   sinyal EMA yang tidak muncul. Kalau #dev ikut digerbang, layar diagnosis itu tidak
   bisa dibuka persis pada saat ia paling dibutuhkan.

   Yang menjaga bukan gerbang, melainkan PIN di layar itu sendiri (core/devmode.js).

   #monitor ikut di luar gerbang dengan alasan tambahan: layar itu dibuka di perangkat
   PENELITI, yang biasanya belum pernah mendaftar sebagai partisipan. Kalau digerbang,
   perangkat peneliti akan dilempar ke layar pendaftaran dan satu-satunya jalan masuk
   adalah memakai kode partisipan sungguhan - artinya alat pemantauan justru memaksa
   mengotori data yang dipantaunya. Layar itu tetap meminta PIN peneliti dan token
   ekspor sebelum menampilkan apa pun. */
const UNGATED = new Set(['dev', 'monitor']);

function gateRoute(requested) {
  if (UNGATED.has(requested)) return requested;

  const s = Store.get();
  if (!hasParticipant(s)) return 'register';
  if (!hasConsent(s))     return 'consent';
  if (!hasPretest(s))     return 'pretest';

  // Sesi Kubah yang belum tuntas dan belum kedaluwarsa harus dilanjutkan lebih dulu,
  // supaya satu sesi tidak terpecah menjadi dua baris data.
  if (s.activeSession && !s.activeSession.stale && requested !== 'dome') return 'dome';

  // Sinyal EMA yang sedang jatuh tempo didahulukan di atas layar mana pun kecuali
  // Kubah. Alasannya bukan kesopanan produk melainkan validitas: EMA harus dijawab
  // pada momennya, sedangkan Dex/Misi/Rank bisa dibuka kapan saja.
  if (dueSignal() && requested !== 'ema' && requested !== 'dome') return 'ema';

  /* Rangkaian penutup studi. Urutannya mengikuti Bab 3, bukan selera:
     pascates lebih dulu (APS-S + SMD sebagai pasangan pretest), baru validitas sosial,
     lalu probe follow-up setelah jeda. Membalik dua yang pertama akan membuat penilaian
     partisipan tentang program ikut mewarnai jawaban instrumen hasil. */
  const stage = currentStage(s);
  if (stage === STAGE.POSTTEST && requested !== 'posttest') return 'posttest';
  if (stage === STAGE.SOCIAL   && requested !== 'survey')   return 'survey';
  if (stage === STAGE.FOLLOWUP && requested !== 'followup') return 'followup';

  return SCREENS[requested] ? requested : 'home';
}

let currentRoute = null;
let rendering = false;

export async function render(requested) {
  if (rendering) return;
  rendering = true;
  try {
    const route = gateRoute(requested || (location.hash || '#home').slice(1).split('?')[0] || 'home');
    const loader = SCREENS[route] ?? SCREENS.home;
    const mod = await loader();
    currentRoute = route;
    setActiveNav(TAB_ROUTES.includes(route) ? route : null);
    await mod.render({ route, store: Store });
    log('render', route);
  } catch (err) {
    console.error('[fokus] gagal merender:', err);
    mount(`<section class="card"><h1 class="h1">Terjadi kendala</h1>
      <p class="dim">Data kamu tetap tersimpan. Coba muat ulang halaman ini.</p>
      <button class="btn btn--primary btn--block" onclick="location.reload()">Muat ulang</button></section>`);
  } finally {
    rendering = false;
  }
}

export function go(route) {
  if (location.hash === `#${route}`) render(route);
  else location.hash = `#${route}`;
}

/* --- Pengawas sinyal EMA --- */

/* Sebelumnya sinyal hanya diperiksa sekali saat boot. Konsekuensinya: partisipan yang
   membuka aplikasi pukul 10.00 dan membiarkannya terbuka tidak akan pernah melihat
   sinyal pukul 10.40 - aplikasinya sudah dianggap "selesai boot". Untuk instrumen yang
   seluruh nilainya bergantung pada dijawab tepat waktu, itu kehilangan data yang
   sepenuhnya bisa dicegah.

   Satu menit dipilih karena jendela terpendek yang perlu dijaga adalah 15 menit
   (sinyal pasca-sesi), jadi keterlambatan maksimal satu menit tidak berarti apa-apa,
   sementara pemeriksaan tiap detik hanya menghabiskan baterai. */
const WATCH_MS = 60_000;
let watchTimer = null;

function notifySignal() {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;   // sudah terlihat, tidak perlu diganggu
    new Notification('Sinyal FOKUS', {
      body: 'Ada beberapa pertanyaan singkat untukmu. Jawab sekarang selagi masih dalam waktunya.',
      icon: '/assets/pwa/icon-192.png',
      tag: 'fokus-ema',            // satu notifikasi saja, tidak menumpuk
    });
  } catch (e) {
    log('notifikasi gagal:', e);
  }
}

function watchTick() {
  const s = Store.get();
  if (!hasParticipant(s) || !hasPretest(s)) return;

  sweepNow();                                   // tutup sinyal yang jendelanya lewat

  if (currentRoute === 'dome' || currentRoute === 'ema') return;
  if (!dueSignal()) return;

  notifySignal();
  render('ema');
}

function startWatch() {
  if (watchTimer) return;
  watchTimer = setInterval(watchTick, WATCH_MS);
  // Kembali dari layar lain atau dari layar terkunci: periksa segera, jangan menunggu
  // sampai satu menit berikutnya.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') watchTick();
  });
}

async function boot() {
  Store.init();

  // Mode uji: state palsu, tanpa pengiriman data.
  const mp = mockParams();
  if (mp) {
    // Dinyalakan SEBELUM state palsu masuk, supaya tidak ada satu baris pun sempat
    // terkirim ke basis data penelitian saat layar pertama dirender.
    setDryRun(true);
    Store.update((s) => mockState(s, mp));
    mockBanner();
    log('mode mock aktif', mp);
  }

  const s = Store.get();
  setProfileTheme(activeProfile(s));

  // Mode peneliti selalu terkunci ulang bila masa bukanya sudah lewat, termasuk
  // saat aplikasi dibuka kembali berhari-hari kemudian.
  if (s.devUnlockedAt && !isUnlocked(s)) Store.patch({ devUnlockedAt: null });

  // Sesi Kubah dianggap kedaluwarsa setelah 6 jam: partisipan jelas sudah menutup
  // aplikasi, jadi sesi itu tidak boleh dihitung sebagai data valid.
  if (s.activeSession) {
    const age = Date.now() - (s.activeSession.startedAt || 0);
    if (age > 6 * 3_600_000) {
      Store.update((st) => ({ ...st, activeSession: { ...st.activeSession, stale: true } }));
    }
  }

  // Jadwal EMA hari ini dibuat di sini, sinyal yang jendelanya lewat ditutup menjadi
  // nonrespons, dan checklist fidelitas kemarin ditulis. Dijalankan sebelum render
  // pertama supaya gerbang di atas memakai status sinyal yang sudah mutakhir.
  if (hasParticipant(s) && hasPretest(s)) {
    const ema = bootstrapEma();
    if (ema.scheduled) log('jadwal EMA hari ini dibuat:', ema.scheduled);
    if (ema.missed) log('sinyal EMA terlewat ditutup:', ema.missed);
    if (ema.fidelity) log('checklist fidelitas ditulis:', ema.fidelity.entry_date);
  }

  if (!mp) startAutoFlush();

  window.addEventListener('hashchange', () => render());
  window.addEventListener('beforeunload', () => Store.flush());
  window.addEventListener('online',  () => toast('Kembali daring - data tersimpan dikirim.'));
  window.addEventListener('offline', () => toast('Mode offline. Data tetap tercatat di perangkat.'));

  await render();
  startWatch();

  if (Sync.pending() > 0) log('antrean sinkron:', Sync.pending());

  // Service worker hanya di produksi/preview, tidak saat pengembangan lokal,
  // agar tidak ada cache basi yang membuat kita mengejar bug palsu.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch((e) => log('SW gagal:', e));
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { currentRoute };
