/* Layar 2 onboarding: informed consent.

   Empat pernyataan di bawah adalah DRAF yang saya susun agar cocok dengan kolom
   statement_1..4 di Supabase. Redaksi finalnya wajib disetujui guru pembimbing
   Anda sebelum pengambilan data, karena partisipan adalah siswa di bawah umur.
   Pernyataan ke-4 khusus menutup celah itu: izin orang tua/wali.

   Tombol tidak aktif sampai keempat kotak dicentang - persetujuan sebagian bukan
   persetujuan. Pengiriman data ke Supabase juga baru dimulai di layar ini, bukan
   di layar pendaftaran. */

import { Store } from '../../core/store.js';
import { Sync, logFidelity } from '../../core/supabase.js';
import { APP_VERSION } from '../../core/config.js';
import { mount, card, button, checkStatement, toast } from '../components.js';
import { go } from '../router.js';

/** Versi teks consent. Naikkan bila redaksi berubah, agar terlacak di data. */
export const CONSENT_VERSION = '2026-08-draft-1';

export const STATEMENTS = [
  {
    id: 's1',
    text: 'Saya memahami bahwa penelitian ini mempelajari kebiasaan belajar dan penggunaan gawai, '
        + 'dan saya bersedia mengikutinya selama sekitar dua minggu.',
  },
  {
    id: 's2',
    text: 'Saya bersedia mengisi kuesioner awal, laporan singkat tiga kali sehari, dan kuesioner akhir. '
        + 'Saya juga memahami bahwa aplikasi mencatat data penggunaannya sendiri, seperti lamanya sesi fokus '
        + 'dan berapa kali aplikasi saya tinggalkan saat sesi berjalan.',
  },
  {
    id: 's3',
    text: 'Saya memahami bahwa data saya disimpan tanpa nama, hanya dikenali lewat kode partisipan, '
        + 'dipakai semata untuk penelitian ini, dan saya boleh berhenti kapan saja tanpa konsekuensi apa pun '
        + 'serta boleh meminta data saya dihapus.',
  },
  {
    id: 's4',
    text: 'Orang tua atau wali saya telah mengetahui dan mengizinkan keikutsertaan saya dalam penelitian ini.',
  },
];

export function render() {
  const s = Store.get();
  const code = s.participant?.code || '-';

  mount(`
    <div class="onboard">
      <h1 class="h1">Lembar persetujuan</h1>
      <p class="dim">Kode partisipan: <strong>${code}</strong>. Bacalah setiap pernyataan sebelum mencentang.</p>

      ${card(`
        <div id="statements">
          ${STATEMENTS.map((st) => checkStatement(st.id, st.text)).join('')}
        </div>
      `)}

      ${card(`
        <p class="dim small">Keempat pernyataan harus dicentang untuk melanjutkan. Bila ada yang belum kamu
        setujui, sampaikan ke peneliti - kamu tidak wajib ikut.</p>
        ${button('Saya setuju dan ingin melanjutkan', { id: 'accept', attrs: 'disabled' })}
        ${button('Belum sekarang', { id: 'back', variant: 'ghost' })}
      `)}
    </div>
  `, { bg: 'onboarding', chrome: 'bare' });

  const box = document.getElementById('statements');
  const accept = document.getElementById('accept');

  /* CSS sengaja tidak memakai :has() (tidak semua Chromium/Safari lama
     mendukungnya), jadi status tercentang ditandai lewat kelas .check--on. */
  function sync() {
    let all = true;
    for (const st of STATEMENTS) {
      const input = document.getElementById(st.id);
      const on = Boolean(input?.checked);
      input?.closest('.check')?.classList.toggle('check--on', on);
      if (!on) all = false;
    }
    accept.disabled = !all;
  }

  box.addEventListener('change', sync);
  sync();

  document.getElementById('back').addEventListener('click', () => {
    toast('Kamu bisa kembali kapan saja setelah berbicara dengan peneliti.');
    go('register');
  });

  accept.addEventListener('click', () => {
    const statements = Object.fromEntries(
      STATEMENTS.map((st) => [st.id, Boolean(document.getElementById(st.id)?.checked)]),
    );
    if (!Object.values(statements).every(Boolean)) { sync(); return; }

    const acceptedAt = new Date().toISOString();
    const p = Store.get().participant;

    Store.patch({ consent: { acceptedAt, version: CONSENT_VERSION, statements } });

    // Baris partisipan dikirim SEKARANG, bukan saat pendaftaran: sebelum consent,
    // tidak ada satu pun data yang meninggalkan perangkat.
    Sync.enqueue('participants', {
      id: p.id,
      code: p.code,
      tier: p.tier,
      participant_index: p.index,
      app_version: APP_VERSION,
      client_id: `participant:${p.id}`,
    });

    Sync.enqueue('consents', {
      participant_id: p.id,
      statement_1: statements.s1,
      statement_2: statements.s2,
      statement_3: statements.s3,
      statement_4: statements.s4,
      version: CONSENT_VERSION,
      accepted_at: acceptedAt,
      client_id: `consent:${p.id}`,
    });

    logFidelity(p.id, 'consent_accepted', { version: CONSENT_VERSION, tier: p.tier });
    go('pretest');
  });
}
