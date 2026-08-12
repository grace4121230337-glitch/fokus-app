/* Tahap Pascates (Bab 3 3.6).

   Tahap ini sebelumnya TIDAK ADA di aplikasi. POSTTEST_ORDER sudah lama terdefinisi di
   core/instruments.js, tetapi tidak satu layar pun memanggilnya - begitu hari terakhir
   lewat, partisipan langsung dibawa ke kuesioner validitas sosial lalu layar selesai.
   Artinya data pascates, yaitu pasangan pembanding dari pretest, tidak pernah
   terkumpul sama sekali.

   Tiga hal dikerjakan di sini, persis seperti bunyi Bab 3:
   1. APS-S dan SMD diisi ulang (IUS-12 tidak, sebab ia mengukur trait yang tidak
      menjadi sasaran intervensi).
   2. Sesi refleksi singkat - satu pertanyaan terbuka, boleh dilewati.
   3. Data pribadi (nomor WhatsApp) dihapus dari perangkat. */

import { Store, today } from '../../core/store.js';
import { Sync, logFidelity } from '../../core/supabase.js';
import {
  POSTTEST_ORDER, questionText, missingItems, scoreAll, responseRows,
} from '../../core/instruments.js';
import { purgeIdentityPatch } from '../../core/studyStage.js';
import { mount, card, button, likert, yesNo, progressBar, toast, esc } from '../components.js';
import { go } from '../router.js';

function draft() {
  return Store.get().posttestDraft || { step: 0, answers: {}, reflection: '' };
}

function saveDraft(next) {
  Store.patch({ posttestDraft: { ...draft(), ...next } });
}

export function render() {
  if (Store.get().posttest?.completedAt) return renderDone();
  const d = draft();
  if (d.step >= POSTTEST_ORDER.length) return renderReflection();
  return renderInstrument(POSTTEST_ORDER[d.step], d.step);
}

function renderInstrument(instrument, stepIndex) {
  const answers = draft().answers[instrument.id] || {};
  const steps = POSTTEST_ORDER.length + 1;   // +1 untuk refleksi

  const body = instrument.items.map((item, i) => {
    const name = `${instrument.id}__${item.no}`;
    const opts = { value: answers[item.no], index: i, total: instrument.items.length, item: item.no };
    return instrument.type === 'yesno'
      ? yesNo(name, questionText(instrument, item), opts)
      : likert(name, questionText(instrument, item), instrument.scale, opts);
  }).join('');

  mount(`
    <div class="onboard">
      <p class="dim small">Kuesioner akhir - bagian ${stepIndex + 1} dari ${steps}</p>
      ${progressBar((stepIndex / steps) * 100)}
      <h1 class="h1">${instrument.screenTitle}</h1>
      <p class="dim">${instrument.intro}</p>
      ${card(`<p class="dim small">Pertanyaannya sama persis dengan yang kamu isi di awal.
        Itu memang disengaja - hanya dengan pertanyaan yang identik, perubahanmu bisa
        terbaca. Jawab apa adanya, termasuk kalau menurutmu tidak ada yang berubah.</p>`,
        { cls: 'card--tight' })}

      ${card(`<form id="form" novalidate>${body}</form>`)}

      ${card(`
        <p class="dim small" id="remaining"></p>
        ${button('Lanjut', { id: 'next' })}
        ${stepIndex > 0 ? button('Kembali', { id: 'back', variant: 'ghost' }) : ''}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });

  const form = document.getElementById('form');
  const remaining = document.getElementById('remaining');
  const currentAnswers = () => draft().answers[instrument.id] || {};

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

/* Sesi refleksi singkat.

   Boleh dilewati, dan itu bukan kelalaian desain. Bab 3 menyebut refleksi sebagai
   bagian dari prosedur pascates, bukan sebagai variabel dependen - memaksa partisipan
   menulis sesuatu hanya akan menghasilkan kalimat basa-basi yang tidak berguna
   sebagai data kualitatif pendukung. */
function renderReflection() {
  const d = draft();
  const steps = POSTTEST_ORDER.length + 1;

  mount(`
    <div class="onboard">
      <p class="dim small">Kuesioner akhir - bagian ${steps} dari ${steps}</p>
      ${progressBar((POSTTEST_ORDER.length / steps) * 100)}
      <h1 class="h1">Satu pertanyaan terakhir</h1>
      ${card(`
        <p class="dim">Selama beberapa minggu ini, apa yang paling berubah dari caramu
        menghadapi tugas? Boleh sependek satu kalimat, boleh juga dikosongkan.</p>
        <textarea id="refleksi" class="input" rows="5"
          placeholder="Tulis apa adanya...">${esc(d.reflection || '')}</textarea>
        <p class="dim small">Jawaban ini dibaca peneliti sebagai pelengkap angka, dan
        tidak dinilai benar atau salah.</p>
      `)}
      ${card(`
        ${button('Selesai', { id: 'finish' })}
        ${button('Kembali', { id: 'back', variant: 'ghost' })}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });

  const ta = document.getElementById('refleksi');
  ta.addEventListener('input', () => saveDraft({ reflection: ta.value }));

  document.getElementById('back').addEventListener('click', () => {
    saveDraft({ step: POSTTEST_ORDER.length - 1 });
    render();
  });

  document.getElementById('finish').addEventListener('click', () => {
    simpan(ta.value);
    renderDone();
  });
}

function simpan(reflection) {
  const s = Store.get();
  if (s.posttest?.completedAt) return;              // menyimpan sekali saja
  const p = s.participant;
  const answers = draft().answers;
  const scores = scoreAll(answers);

  Store.patch({
    posttest: {
      completedAt: new Date().toISOString(),
      completedOn: today(),
      answers,
      scores,
      reflection: (reflection || '').trim() || null,
    },
    posttestDraft: null,
  });

  for (const row of responseRows({ participantId: p.id, answers, occasion: 'posttest' })) {
    Sync.enqueue('pretest_responses', row);
  }

  Sync.enqueue('participants', {
    id: p.id,
    code: p.code,
    posttest_aps_total: scores.aps.total,
    posttest_smd_total: scores.smd.total,
    posttest_on: today(),
    reflection: (reflection || '').trim() || null,
    client_id: `participant:${p.id}:posttest`,
  });

  /* Penghapusan identitas dijalankan DI SINI, bukan di layar selesai.
     Kalau ditunda sampai akhir rangkaian, partisipan yang berhenti di tengah kuesioner
     validitas sosial akan meninggalkan hash nomornya di perangkat tanpa batas waktu -
     padahal janji pada lembar consent tidak bersyarat pada tuntasnya seluruh rangkaian. */
  Store.patch(purgeIdentityPatch(Store.get().participant));
  Store.flush();

  logFidelity(p.id, 'posttest_completed', {
    aps_total: scores.aps.total,
    smd_total: scores.smd.total,
    has_reflection: Boolean((reflection || '').trim()),
    identity_purged: true,
  });
}

function renderDone() {
  mount(`
    <div class="onboard center">
      ${card(`
        <h1 class="h1">Terima kasih</h1>
        <p class="dim">Kuesioner akhirmu sudah tersimpan.</p>
        <p class="dim small">Sesuai yang tertulis di lembar persetujuan, nomor WhatsApp
        kamu sudah dihapus dari aplikasi ini. Data penelitianmu tetap ada, tetapi kini
        tidak lagi terhubung ke nomor mana pun - hanya ke kode partisipanmu.</p>
        ${button('Lanjut', { id: 'next' })}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });
  document.getElementById('next').addEventListener('click', () => go('survey'));
}
