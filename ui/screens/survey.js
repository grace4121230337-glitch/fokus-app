/* Layar validitas sosial (Wolf, 1978) - satu-satunya gerbang antara studi berjalan
   dan status "selesai". Router memaksa layar ini begitu isStudyOver() benar dan
   socialValidity masih kosong; tidak ada jalan lain untuk melewatinya.

   Sama seperti pretest: jawaban ditulis ke draf pada tiap perubahan supaya HP yang
   mati di tengah pengisian tidak memaksa partisipan mengulang dari awal. */

import { Store } from '../../core/store.js';
import { Sync, logFidelity } from '../../core/supabase.js';
import { APP_VERSION } from '../../core/config.js';
import { now } from '../../core/env.js';
import {
  ITEMS, SCALE, answerKey, missingItems, buildRow,
} from '../../core/socialValidity.js';
import {
  mount, card, button, likert, toast, esc,
} from '../components.js';
import { go } from '../router.js';

function draft() {
  return Store.get().surveyDraft || { answers: {}, note: '' };
}

function saveDraft(next) {
  Store.patch({ surveyDraft: { ...draft(), ...next } });
}

export function render() {
  const d = draft();

  const body = ITEMS.map((item, i) => likert(
    answerKey(item.no),
    item.text,
    SCALE,
    { value: d.answers[answerKey(item.no)], index: i, total: ITEMS.length, item: item.no },
  )).join('');

  mount(`
    <div class="onboard">
      <p class="dim small">Studi sudah selesai untukmu - satu langkah terakhir</p>
      <h1 class="h1">Pendapatmu tentang FOKUS</h1>
      <p class="dim">Jawabanmu di sini tidak mengubah apa pun yang sudah berjalan. Kami ingin tahu
      apakah program ini terasa berguna dan wajar dari sudut pandangmu sendiri, bukan hanya dari angka.</p>

      ${card(`<form id="form" novalidate>${body}</form>`)}

      ${card(`
        <label class="field">
          <span class="field__label">Catatan tambahan (opsional)</span>
          <textarea class="input" id="note" rows="4"
            placeholder="Apa yang paling membantu? Apa yang sebaiknya diperbaiki?">${esc(d.note)}</textarea>
        </label>
      `, { cls: 'card--tight' })}

      ${card(`
        <p class="dim small" id="remaining"></p>
        ${button('Kirim jawaban', { id: 'submit' })}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });

  const form = document.getElementById('form');
  const noteEl = document.getElementById('note');
  const remaining = document.getElementById('remaining');

  function currentAnswers() {
    return draft().answers;
  }

  function paint() {
    const left = missingItems(currentAnswers()).length;
    remaining.textContent = left === 0
      ? 'Semua pernyataan sudah dijawab.'
      : `Masih ada ${left} pernyataan yang belum dijawab.`;
  }

  form.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="radio"]');
    if (!input) return;
    const itemNo = Number(input.name.split('_')[1]);
    saveDraft({ answers: { ...draft().answers, [answerKey(itemNo)]: Number(input.value) } });
    form.querySelector(`[data-item="${itemNo}"]`)?.classList.remove('likert--missing');
    paint();
  });

  noteEl.addEventListener('input', () => saveDraft({ note: noteEl.value }));

  document.getElementById('submit').addEventListener('click', () => {
    const answers = currentAnswers();
    const missing = missingItems(answers);
    if (missing.length) {
      for (const no of missing) {
        form.querySelector(`[data-item="${no}"]`)?.classList.add('likert--missing');
      }
      toast(`Masih ada ${missing.length} pernyataan yang belum dijawab.`);
      form.querySelector('.likert--missing')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const p = Store.get().participant;
    const row = buildRow({
      answers,
      note: noteEl.value,
      ts: now(),
      appVersion: APP_VERSION,
      clientId: `social_validity:${p?.id || 'unknown'}`,
    });

    Store.patch({
      socialValidity: {
        completedAt: row.submitted_at,
        answers,
        note: row.note,
        scores: {
          significance: row.significance_mean,
          appropriateness: row.appropriateness_mean,
          effects: row.effects_mean,
          overall: row.overall_mean,
        },
      },
      surveyDraft: null,
    });

    Sync.enqueue('social_validity', { ...row, participant_id: p?.id ?? null }, { conflict: 'client_id' });
    logFidelity(p?.id ?? null, 'social_validity_completed', { overall: row.overall_mean });

    go('done');
  });

  paint();
}
