/* Layar 3 onboarding: pretest tiga instrumen, lalu penempatan Sprout / Spark.

   Dua keputusan yang membuat layar ini tahan situasi nyata:

   1. Jawaban ditulis ke Store sebagai draf pada SETIAP perubahan. Ada 26 butir;
      kalau HP partisipan mati atau tab tertutup di butir ke-20, jawabannya tetap
      ada saat aplikasi dibuka lagi. Tidak ada partisipan yang harus mengisi ulang.
   2. Layar tidak pernah menolak siapa pun. Penanda kelayakan dan penanda
      "low confidence" dicatat untuk peneliti, tetapi partisipan selalu melihat
      hasil yang netral dan tidak menghakimi.

   Yang dilihat partisipan: satu instrumen per halaman, dengan indikator kemajuan. */

import { Store, today } from '../../core/store.js';
import { Sync, logFidelity } from '../../core/supabase.js';
import { TIERS } from '../../core/tier.js';
import {
  PRETEST_ORDER, questionText, missingItems, isComplete,
  scoreAll, classifyProfile, screenEligibility, responseRows,
} from '../../core/instruments.js';
import { companionArt, companionName, stageName } from '../../core/progress.js';
import {
  mount, card, button, likert, yesNo, progressBar,
  companionImg, toast, setProfileTheme,
} from '../components.js';
import { go } from '../router.js';

/** Draf jawaban tersimpan di Store, bukan di variabel layar. */
function draft() {
  return Store.get().pretestDraft || { step: 0, answers: {} };
}

function saveDraft(next) {
  Store.patch({ pretestDraft: { ...draft(), ...next } });
}

export function render() {
  const d = draft();
  if (Store.get().pretest?.completedAt || d.step >= PRETEST_ORDER.length) return renderResult();
  return renderInstrument(PRETEST_ORDER[d.step], d.step);
}

function renderInstrument(instrument, stepIndex) {
  const answers = draft().answers[instrument.id] || {};
  const steps = PRETEST_ORDER.length;

  const body = instrument.items.map((item, i) => {
    const name = `${instrument.id}__${item.no}`;
    const question = questionText(instrument, item);
    const value = answers[item.no];
    const opts = { value, index: i, total: instrument.items.length, item: item.no };
    return instrument.type === 'yesno'
      ? yesNo(name, question, opts)
      : likert(name, question, instrument.scale, opts);
  }).join('');

  mount(`
    <div class="onboard">
      <p class="dim small">Kuesioner awal - bagian ${stepIndex + 1} dari ${steps}</p>
      ${progressBar((stepIndex / steps) * 100)}
      <h1 class="h1">${instrument.screenTitle}</h1>
      <p class="dim">${instrument.intro}</p>

      ${card(`<form id="form" novalidate>${body}</form>`)}

      ${card(`
        <p class="dim small" id="remaining"></p>
        ${button(stepIndex + 1 === steps ? 'Lihat hasil' : 'Lanjut', { id: 'next' })}
        ${stepIndex > 0 ? button('Kembali', { id: 'back', variant: 'ghost' }) : ''}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });

  const form = document.getElementById('form');
  const remaining = document.getElementById('remaining');
  const currentAnswers = () => draft().answers[instrument.id] || {};

  /* Opsi terpilih ditandai lewat kelas, bukan lewat :has() di CSS. */
  function paint() {
    for (const opt of form.querySelectorAll('.likert__opt')) {
      opt.classList.toggle('likert__opt--on', Boolean(opt.querySelector('input')?.checked));
    }
    const left = missingItems(instrument, currentAnswers()).length;
    remaining.textContent = left === 0
      ? 'Semua butir sudah terisi.'
      : `Masih ada ${left} butir yang belum terisi.`;
  }

  form.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="radio"]');
    if (!input) return;
    const itemNo = Number(input.name.split('__')[1]);
    const value = instrument.type === 'yesno' ? input.value === '1' : Number(input.value);

    const all = draft().answers;
    saveDraft({
      answers: { ...all, [instrument.id]: { ...(all[instrument.id] || {}), [itemNo]: value } },
    });
    form.querySelector(`.likert[data-item="${itemNo}"]`)?.classList.remove('likert--missing');
    paint();
  });

  document.getElementById('next').addEventListener('click', () => {
    const missing = missingItems(instrument, currentAnswers());
    if (missing.length) {
      for (const no of missing) {
        form.querySelector(`.likert[data-item="${no}"]`)?.classList.add('likert--missing');
      }
      toast(`Masih ada ${missing.length} butir yang belum terisi.`);
      form.querySelector('.likert--missing')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    saveDraft({ step: draft().step + 1 });
    render();
  });

  document.getElementById('back')?.addEventListener('click', () => {
    saveDraft({ step: Math.max(0, draft().step - 1) });
    render();
  });

  paint();
}

function renderResult() {
  const s = Store.get();
  const p = s.participant;

  // Menyimpan sekali saja: membuka ulang layar hasil tidak boleh menggeser
  // tanggal mulai studi maupun mengirim ulang baris pretest.
  if (!s.pretest?.completedAt) {
    const answers = draft().answers;
    const scores = scoreAll(answers);
    const placement = classifyProfile(scores);
    const eligibility = screenEligibility(scores);
    // Hari 1 studi = tanggal WIB saat pretest tuntas, sehingga panjang baseline
    // yang dihitung aplikasi persis sama dengan rencana di Bab 3.
    const startedOn = p.startedOn || today();

    Store.patch({
      pretest: {
        completedAt: new Date().toISOString(),
        answers,
        scores,
        profile: placement.profile,
        confidence: placement.confidence,
        avoidance: placement.avoidance,
        arousal: placement.arousal,
        margin: placement.margin,
        eligible: eligibility.eligible,
      },
      participant: { ...p, startedOn },
      pretestDraft: null,
    });

    Sync.enqueue('participants', {
      id: p.id,
      code: p.code,
      tier: p.tier,
      participant_index: p.index,
      profile: placement.profile,
      profile_confidence: placement.confidence,
      avoidance_index: placement.avoidance,
      arousal_index: placement.arousal,
      aps_total: scores.aps.total,
      ius_total: scores.ius.total,
      smd_total: scores.smd.total,
      eligible: eligibility.eligible,
      started_on: startedOn,
      client_id: `participant:${p.id}:pretest`,
    });

    for (const row of responseRows({ participantId: p.id, answers, occasion: 'pretest' })) {
      Sync.enqueue('pretest_responses', row);
    }

    logFidelity(p.id, 'pretest_completed', {
      profile: placement.profile,
      confidence: placement.confidence,
      margin: placement.margin,
      eligible: eligibility.eligible,
    });
  }

  const st = Store.get();
  const profile = st.pretest.profile;
  setProfileTheme(profile);

  const name = companionName(profile);
  const cfg = TIERS[st.participant.tier];

  mount(`
    <div class="onboard center">
      <p class="dim small">Kuesioner awal selesai</p>
      ${card(`
        ${companionImg(companionArt(profile, 1), name, { enter: true })}
        <h1 class="h1">${name} menemanimu</h1>
        <p class="dim">Tahap ${stageName(profile, 1)}. Ia tumbuh setiap kali kamu menyelesaikan sesi fokus.</p>
      `)}
      ${card(`
        <h2 class="h2">Yang terjadi selanjutnya</h2>
        <p class="dim">Beberapa hari pertama aplikasi menemani dan mencatat saja.
        Setelah itu, ${name} mulai menyesuaikan saran sesi dengan kondisimu hari itu.</p>
        <p class="dim small">Kode ${st.participant.code} - hari ke-1 dari ${cfg.total} hari.</p>
        ${button('Mulai hari pertama', { id: 'start' })}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });

  document.getElementById('start').addEventListener('click', () => go('home'));
}
