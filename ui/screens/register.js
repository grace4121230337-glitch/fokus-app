/* Layar 1 onboarding: pendaftaran dengan kode partisipan.

   Catatan etika yang tercermin di kode: layar ini BELUM mengirim apa pun ke
   Supabase. Kode partisipan hanya disimpan di perangkat, dan pengiriman data
   pertama baru terjadi setelah consent disetujui di layar berikutnya. */

import { Store } from '../../core/store.js';
import { uuid } from '../../core/env.js';
import { STUDY, SCHOOL_SUGGESTIONS } from '../../core/config.js';
import { mount, card, button, esc, toast } from '../components.js';
import { parseParticipantCode, codeSummary, CODE_EXAMPLE } from '../../core/participant.js';
import { go } from '../router.js';

export function render() {
  const existing = Store.get().participant?.code || '';
  const existingSchool = Store.get().participant?.school || '';

  mount(`
    <div class="onboard">
      <img src="/assets/img/splash-nebula.webp" alt="" class="onboard__art" width="280" height="180" decoding="async">
      <h1 class="h1">Selamat datang di ${esc(STUDY.appName)}</h1>
      <!-- Sampai 0.7.0 kalimat ini menyebut satu sekolah. Setelah partisipan datang dari
           beberapa sekolah, penyebutan itu membuat sebagian pembaca menyimpulkan aplikasi
           ini bukan untuk mereka - dan keraguan di layar pertama ikut menentukan apakah
           mereka bertahan mengisi data selama 14 hari. -->
      <p class="dim">Aplikasi pendamping belajar untuk penelitian bersama ${esc(STUDY.audience)}.</p>

      ${card(`
        <label class="field">
          <span class="field__label">Kode partisipan</span>
          <input class="input" id="code" value="${esc(existing)}" placeholder="${esc(CODE_EXAMPLE)}"
            autocomplete="off" autocapitalize="characters" spellcheck="false"
            inputmode="text" aria-describedby="code-hint">
        </label>
        <p class="dim" id="code-hint">Kode ini diberikan oleh peneliti. Contoh: ${esc(CODE_EXAMPLE)}.</p>
        <p id="code-info" class="note" hidden></p>

        <!-- Asal sekolah: teks bebas, bukan dropdown.

             Dropdown tertutup memaksa kami menebak daftar sekolah sebelum studi mulai,
             dan partisipan dari sekolah yang tidak ada di daftar akan berhenti di sini.
             Isian ini juga OPSIONAL: ia hanya konteks analisis, bukan syarat ikut serta,
             dan tidak dikirim ke server sebelum persetujuan ditandatangani. -->
        <label class="field">
          <span class="field__label">Asal sekolah <span class="dim">(boleh dikosongkan)</span></span>
          <input class="input" id="school" value="${esc(existingSchool)}" list="school-list"
            placeholder="Nama sekolahmu" autocomplete="off" spellcheck="false" maxlength="80">
        </label>
        ${SCHOOL_SUGGESTIONS.length ? `<datalist id="school-list">${SCHOOL_SUGGESTIONS
          .map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>` : ''}
        <p class="dim small">Dipakai peneliti untuk melihat konteks jadwal sekolah, bukan
        untuk mengenali kamu secara pribadi.</p>

        ${button('Lanjut', { id: 'next' })}
      `)}

      <p class="dim small center">Belum punya kode? Hubungi peneliti terlebih dahulu.<br>
      Jangan memakai kode milik orang lain - satu kode hanya untuk satu partisipan.</p>
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });

  const input = document.getElementById('code');
  const info = document.getElementById('code-info');

  /** Umpan balik langsung: partisipan tahu tier terbaca benar sebelum menekan Lanjut. */
  function review(showEmptyError = false) {
    const value = input.value.trim();
    if (!value) {
      info.hidden = !showEmptyError;
      info.textContent = showEmptyError ? 'Kode partisipan belum diisi.' : '';
      info.dataset.tone = 'bad';
      return null;
    }
    const parsed = parseParticipantCode(value);
    info.hidden = false;
    info.dataset.tone = parsed.ok ? 'good' : 'bad';
    info.textContent = parsed.ok ? codeSummary(parsed) : parsed.error;
    return parsed.ok ? parsed : null;
  }

  input.addEventListener('input', () => review(false));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('next').click(); });

  document.getElementById('next').addEventListener('click', () => {
    const parsed = review(true);
    if (!parsed) { toast('Periksa kembali kode partisipanmu.'); input.focus(); return; }

    const prev = Store.get().participant;
    Store.patch({
      participant: {
        // id dibuat di perangkat supaya baris consent & pretest bisa merujuknya
        // walau belum pernah tersambung internet sama sekali.
        id: prev?.id || uuid(),
        code: parsed.code,
        tier: parsed.tier,
        index: parsed.index,
        school: document.getElementById('school')?.value.trim() || prev?.school || null,
        startedOn: prev?.startedOn || null,   // baru diisi setelah pretest tuntas
        registeredAt: prev?.registeredAt || new Date().toISOString(),
      },
    });
    go('consent');
  });

  if (existing) review(false);
  input.focus();
}
