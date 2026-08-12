/* Fase Maintenance / Follow-up (Bab 3 3.6).

   Bab 3 meminta probe susulan setelah pascates untuk menguji DURABILITAS efek -
   apakah perubahan bertahan setelah pendampingan berhenti. Tahap ini sebelumnya
   tidak ada sama sekali di aplikasi: begitu hari terakhir studi lewat, seluruh
   penjadwalan berhenti dan tidak pernah ada yang menanyai partisipan lagi.

   Pertanyaan yang dijawab tahap ini berbeda dari pascates. Pascates bertanya
   "apakah ada perubahan setelah program?"; follow-up bertanya "apakah perubahannya
   masih ada ketika programnya sudah tidak menemani?". Tanpa yang kedua, klaim
   keberhasilan hanya berlaku selama aplikasi masih dipakai.

   Probe ini memakai APS-S saja - lihat alasannya pada FOLLOWUP_ORDER di
   core/instruments.js. */

import { Store, today } from '../../core/store.js';
import { Sync, logFidelity } from '../../core/supabase.js';
import {
  FOLLOWUP_ORDER, questionText, missingItems, scoreApsS, responseRows,
} from '../../core/instruments.js';
import { daysUntilFollowup } from '../../core/studyStage.js';
import { mount, card, button, likert, toast } from '../components.js';
import { go } from '../router.js';

const INSTRUMENT = FOLLOWUP_ORDER[0];

function draft() {
  return Store.get().followupDraft || { answers: {} };
}

export function render() {
  const s = Store.get();
  if (s.followup?.completedAt) return renderDone();

  // Layar bisa saja dibuka lewat URL sebelum waktunya. Jangan tampilkan kuesioner
  // yang datanya akan salah tanggal - probe yang diisi terlalu cepat tidak mengukur
  // durabilitas apa pun.
  const sisa = daysUntilFollowup(s);
  if (sisa && sisa > 0) return renderBelumWaktunya(sisa);

  return renderForm();
}

function renderBelumWaktunya(sisa) {
  mount(`
    <div class="onboard center">
      ${card(`
        <h1 class="h1">Sampai jumpa sebentar lagi</h1>
        <p class="dim">Ada satu kuesioner singkat terakhir, tetapi belum sekarang.
        Sekitar <b>${sisa} hari lagi</b> aplikasi ini akan memintamu mengisinya.</p>
        <p class="dim small">Jeda itu memang disengaja: kami ingin tahu bagaimana keadaanmu
        setelah beberapa waktu tanpa pendampingan, bukan tepat setelah program selesai.</p>
        ${button('Kembali ke Beranda', { id: 'back' })}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });
  document.getElementById('back').addEventListener('click', () => go('home'));
}

function renderForm() {
  const answers = draft().answers[INSTRUMENT.id] || {};

  const body = INSTRUMENT.items.map((item, i) => likert(
    `${INSTRUMENT.id}__${item.no}`, questionText(INSTRUMENT, item), INSTRUMENT.scale,
    { value: answers[item.no], index: i, total: INSTRUMENT.items.length, item: item.no },
  )).join('');

  mount(`
    <div class="onboard">
      <p class="dim small">Kuesioner susulan</p>
      <h1 class="h1">${INSTRUMENT.screenTitle}</h1>
      ${card(`
        <p class="dim">Sudah beberapa waktu sejak program selesai. Bagaimana keadaanmu
        <b>sekarang</b>, tanpa pendampingan aplikasi?</p>
        <p class="dim small">Lima butir saja. Jawab apa adanya - termasuk kalau kebiasaan
        lamamu kembali. Itu justru informasi yang paling berguna bagi penelitian ini,
        dan tidak akan merugikanmu sedikit pun.</p>
      `, { cls: 'card--tight' })}

      ${card(`<form id="form" novalidate>${body}</form>`)}

      ${card(`
        <p class="dim small" id="remaining"></p>
        ${button('Kirim', { id: 'finish' })}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });

  const form = document.getElementById('form');
  const remaining = document.getElementById('remaining');
  const currentAnswers = () => draft().answers[INSTRUMENT.id] || {};

  function paint() {
    for (const opt of form.querySelectorAll('.likert__opt')) {
      opt.classList.toggle('likert__opt--on', Boolean(opt.querySelector('input')?.checked));
    }
    const left = missingItems(INSTRUMENT, currentAnswers()).length;
    remaining.textContent = left === 0
      ? 'Semua butir sudah terisi.'
      : `Masih ada ${left} butir yang belum terisi.`;
  }

  form.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="radio"]');
    if (!input) return;
    const itemNo = Number(input.name.split('__')[1]);
    const all = draft().answers;
    Store.patch({
      followupDraft: {
        answers: {
          ...all,
          [INSTRUMENT.id]: { ...(all[INSTRUMENT.id] || {}), [itemNo]: Number(input.value) },
        },
      },
    });
    form.querySelector(`.likert[data-item="${itemNo}"]`)?.classList.remove('likert--missing');
    paint();
  });

  document.getElementById('finish').addEventListener('click', () => {
    const missing = missingItems(INSTRUMENT, currentAnswers());
    if (missing.length) {
      for (const no of missing) {
        form.querySelector(`.likert[data-item="${no}"]`)?.classList.add('likert--missing');
      }
      toast(`Masih ada ${missing.length} butir yang belum terisi.`);
      form.querySelector('.likert--missing')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    simpan();
    renderDone();
  });

  paint();
}

function simpan() {
  const s = Store.get();
  if (s.followup?.completedAt) return;
  const p = s.participant;
  const answers = draft().answers;
  const scores = scoreApsS(answers[INSTRUMENT.id] || {});

  Store.patch({
    followup: {
      completedAt: new Date().toISOString(),
      completedOn: today(),
      answers,
      scores,
    },
    followupDraft: null,
  });
  Store.flush();

  for (const row of responseRows({ participantId: p.id, answers, occasion: 'followup' })) {
    Sync.enqueue('pretest_responses', row);
  }

  Sync.enqueue('participants', {
    id: p.id,
    code: p.code,
    followup_aps_total: scores.total,
    followup_on: today(),
    client_id: `participant:${p.id}:followup`,
  });

  logFidelity(p.id, 'followup_completed', { aps_total: scores.total });
}

function renderDone() {
  mount(`
    <div class="onboard center">
      ${card(`
        <h1 class="h1">Selesai sepenuhnya</h1>
        <p class="dim">Ini bagian terakhir. Terima kasih sudah bertahan sampai sini -
        termasuk untuk hari-hari yang tidak berjalan mulus.</p>
        <p class="dim small">Kamu boleh terus memakai aplikasi ini kalau merasa terbantu.
        Datanya tidak lagi dipakai untuk penelitian.</p>
        ${button('Tutup', { id: 'done' })}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });
  document.getElementById('done').addEventListener('click', () => go('done'));
}
