/* Mode mock: membuka layar apa pun tanpa menunggu 13 hari berjalan.
   Contoh: ?mock=1&tier=3&day=9&level=6&profile=spark

   Mode ini WAJIB mati di domain produksi. Kalau tidak, satu tautan salah kirim ke
   partisipan bisa menimpa data asli mereka - dan data SCED tidak bisa diulang. */

import { PRODUCTION_HOSTS } from './config.js';
import { isBrowser } from './env.js';
import { TIERS, wibDate, addDays, computePhase } from './tier.js';
import { levelFromXp, xpToNext, PROFILES } from './progress.js';

export function mockParams() {
  if (!isBrowser) return null;
  if (PRODUCTION_HOSTS.includes(location.hostname)) return null;   // pagar produksi
  const q = new URLSearchParams(location.search);
  if (!q.has('mock')) return null;
  return {
    tier: Number(q.get('tier') || 1),
    day: Number(q.get('day') || 1),
    level: Number(q.get('level') || 1),
    profile: q.get('profile') === 'spark' ? PROFILES.SPARK : PROFILES.SPROUT,
    screen: q.get('screen') || null,
    streak: Number(q.get('streak') || 3),
    // pre | consent | pretest | ready | posttest | followup | done
    stage: q.get('stage') || null,
    // due -> sinyal terjadwal menunggu; post -> sinyal pasca-sesi menunggu
    ema: q.get('ema') || null,
    sv: q.get('sv') === '1',            // 1 -> socialValidity dianggap sudah terisi
  };
}

/** XP minimum agar mencapai level tertentu - supaya evolusi bisa diuji cepat. */
function xpForLevel(level) {
  let xp = 0;
  for (let l = 1; l < Math.max(1, level); l += 1) xp += xpToNext(l);
  return xp;
}

/** Membentuk state palsu yang konsisten dengan aturan tier/fase sungguhan. */
export function mockState(base, p) {
  const tier = TIERS[p.tier] ? p.tier : 1;
  const startedOn = addDays(wibDate(), -(Math.max(1, p.day) - 1));
  const xp = xpForLevel(p.level);
  const state = {
    ...base,
    participant: { id: 'mock-participant', code: `MOCK-T${tier}`, tier, startedOn, userId: 'mock-user' },
    consent: { acceptedAt: new Date().toISOString(), statements: { s1: true, s2: true, s3: true, s4: true } },
    pretest: {
      completedAt: new Date().toISOString(),
      profile: p.profile,
      confidence: 'high',
      // Bentuk skor mengikuti scoreAll() sungguhan, bukan bentuk singkat buatan -
      // layar peneliti dan analisis membaca jalur yang sama dengan data asli.
      scores: {
        aps: { instrument: 'APS-S', total: p.profile === PROFILES.SPARK ? 21 : 15, mean: p.profile === PROFILES.SPARK ? 4.2 : 3.0 },
        ius: { instrument: 'IUS-12', total: p.profile === PROFILES.SPROUT ? 48 : 30, mean: p.profile === PROFILES.SPROUT ? 4.0 : 2.5 },
        smd: { instrument: 'SMD', total: 4, max: 9, atOrAboveCutoff: false },
      },
    },
    xp,
    level: levelFromXp(xp),
    streak: p.streak,
    lastSessionDate: wibDate(),
    mana: 24,
    // Ketiga butir EMA berskala 1-5, termasuk context. Sebelumnya context di sini
    // berisi teks lokasi - bentuk itu tidak cocok dengan instrumen yang dipakai.
    emaEntries: [
      { focus: 3, control: 4, context: 4, impulse: 2, responded: true },
      { focus: 2, control: 2, context: 3, impulse: 4, responded: true },
    ],
  };

  // Sinyal buatan yang jatuh tempo 5 menit lalu: memungkinkan layar EMA dipotret
  // dan diuji tanpa menunggu jadwal acak yang sebenarnya.
  if (p.ema === 'due' || p.ema === 'post') {
    const pascaSesi = p.ema === 'post';
    // Sinyal pasca-sesi berjendela 15 menit, jadi mundurnya cukup 2 menit saja -
    // 5 menit masih masuk, tetapi menyisakan waktu terlalu sedikit untuk memotret layar.
    const at = new Date(Date.now() - (pascaSesi ? 2 : 5) * 60_000).toISOString();
    state.emaSignals = [{
      signalId: pascaSesi ? `${wibDate()}-ps-mockpost` : `${wibDate()}-1-mockdue`,
      type: pascaSesi ? 'post_session' : 'scheduled',
      stratum: pascaSesi ? null : 1,
      sessionId: pascaSesi ? 'mock-session' : null,
      scheduledAt: at,
      studyDay: Math.max(1, p.day),
      tier,
      phase: computePhase(tier, Math.max(1, p.day)),
      status: 'pending',
    }];
  }
  // socialValidity terisi palsu supaya layar #done bisa dipotret tanpa mengisi
  // formulir validitas sosial sungguhan.
  if (p.sv) {
    state.socialValidity = {
      completedAt: new Date().toISOString(),
      answers: {},
      note: '',
      scores: {
        significance: 5, appropriateness: 5, effects: 4, overall: 4.67,
      },
    };
  }
  // Mundurkan tahap onboarding bila diminta, untuk menguji gerbang boot.
  if (p.stage === 'pre')     { state.participant = null; state.consent = null; state.pretest = null; }
  if (p.stage === 'consent') { state.consent = null; state.pretest = null; }
  if (p.stage === 'pretest') { state.pretest = null; }

  /* Tahap penutup studi.

     Ketiganya butuh hari studi yang sudah melewati akhir tier, jadi startedOn digeser
     mundur - bukan sekadar menandai layarnya. Dengan begitu yang diuji adalah gerbang
     router yang sesungguhnya, bukan jalan pintas yang hanya ada di mode uji. */
  const cfg = TIERS[tier];
  if (p.stage === 'posttest' || p.stage === 'followup' || p.stage === 'done') {
    const hari = p.stage === 'posttest' ? cfg.total + 1 : cfg.total + 8;
    state.participant = { ...state.participant, startedOn: addDays(wibDate(), -(hari - 1)) };
    state.emaSignals = [];        // studi sudah lewat: tidak ada sinyal menunggu
  }
  if (p.stage === 'followup' || p.stage === 'done') {
    state.posttest = {
      completedAt: new Date().toISOString(),
      completedOn: wibDate(),
      answers: {},
      scores: state.pretest?.scores || {},
      reflection: 'Catatan refleksi contoh (mode uji).',
    };
    state.socialValidity = state.socialValidity || {
      completedAt: new Date().toISOString(),
      answers: {},
      note: '',
      scores: { significance: 5, appropriateness: 5, effects: 4, overall: 4.67 },
    };
  }
  if (p.stage === 'done') {
    state.followup = {
      completedAt: new Date().toISOString(),
      completedOn: wibDate(),
      answers: {},
      scores: { instrument: 'APS-S', total: 13, mean: 2.6 },
    };
  }
  return state;
}

/** Menandai di UI bahwa ini bukan data sungguhan. */
export function mockBanner() {
  if (!isBrowser) return;
  const el = document.createElement('div');
  el.textContent = 'MODE UJI - data tidak dikirim';
  el.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99;text-align:center;font-size:11px;' +
    'font-weight:700;letter-spacing:.08em;padding:3px;background:#ffd479;color:#101415';
  document.body.appendChild(el);
}
