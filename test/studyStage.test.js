/* Tahap penutup studi (Bab 3 3.6: Pascates, Validitas Sosial, Follow-up).

   Urutannya bukan selera tampilan. Validitas sosial harus diisi SETELAH pascates,
   dan probe follow-up hanya bermakna bila ada jeda nyata sesudah intervensi berhenti -
   probe yang diisi di hari yang sama dengan pascates tidak mengukur durabilitas apa pun. */

import { describe, t, eq, ok } from './harness.js';
import {
  STAGE, FOLLOWUP_DELAY_DAYS, followupDay, currentStage, daysUntilFollowup,
  purgeIdentityPatch, hasPosttest, hasFollowup,
} from '../core/studyStage.js';
import { tierConfig, wibDate, addDays } from '../core/tier.js';

const TS = Date.parse('2026-08-12T10:00:00+07:00');

/** State partisipan tier tertentu yang sedang berada pada hari studi ke-`day`. */
function state(tier, day, extra = {}) {
  return {
    participant: { id: 'p1', tier, startedOn: addDays(wibDate(TS), -(day - 1)) },
    ...extra,
  };
}
const selesai = () => ({ completedAt: new Date(TS).toISOString() });

describe('tahap studi: hari probe follow-up', () => {
  t('probe jatuh 7 hari setelah hari terakhir tier', () => {
    eq(FOLLOWUP_DELAY_DAYS, 7);
    for (const tier of [1, 2, 3, 4]) {
      eq(followupDay(tier), tierConfig(tier).total + 7);
    }
  });

  t('tier dengan intervensi lebih pendek tetap mendapat jeda yang sama', () => {
    // Jeda dihitung dari akhir studi masing-masing tier, bukan dari satu tanggal
    // bersama - kalau tidak, tier 1 diprobe 4 hari lebih cepat daripada tier 4.
    eq(followupDay(1) - tierConfig(1).total, followupDay(4) - tierConfig(4).total);
  });
});

describe('tahap studi: urutan penutup', () => {
  t('selama studi berjalan, tidak ada tahap penutup yang muncul', () => {
    eq(currentStage(state(1, 3), TS), STAGE.RUNNING);
    eq(currentStage(state(1, tierConfig(1).total), TS), STAGE.RUNNING);
  });

  t('sehari setelah studi berakhir, pascates menunggu', () => {
    eq(currentStage(state(1, tierConfig(1).total + 1), TS), STAGE.POSTTEST);
  });

  t('setelah pascates, giliran validitas sosial', () => {
    const s = state(1, tierConfig(1).total + 1, { posttest: selesai() });
    eq(currentStage(s, TS), STAGE.SOCIAL);
  });

  t('validitas sosial saja tidak melewati pascates', () => {
    // Urutan dijaga dari arah sebaliknya juga: mengisi validitas sosial lebih dulu
    // tidak boleh membuat pascates terlewat begitu saja.
    const s = state(1, tierConfig(1).total + 1, { socialValidity: selesai() });
    eq(currentStage(s, TS), STAGE.POSTTEST);
  });

  t('sesudah keduanya, partisipan menunggu sampai hari probe', () => {
    const s = state(1, tierConfig(1).total + 2, { posttest: selesai(), socialValidity: selesai() });
    eq(currentStage(s, TS), STAGE.WAITING);
    ok(daysUntilFollowup(s, TS) > 0);
  });

  t('batas: tepat pada hari probe, follow-up terbuka', () => {
    const s = state(1, followupDay(1), { posttest: selesai(), socialValidity: selesai() });
    eq(currentStage(s, TS), STAGE.FOLLOWUP);
    eq(daysUntilFollowup(s, TS), 0);
  });

  t('follow-up terisi berarti selesai', () => {
    const s = state(1, followupDay(1) + 1, {
      posttest: selesai(), socialValidity: selesai(), followup: selesai(),
    });
    eq(currentStage(s, TS), STAGE.DONE);
    eq(hasFollowup(s), true);
  });

  t('partisipan belum terdaftar tidak dilempar ke tahap mana pun', () => {
    eq(currentStage({}, TS), STAGE.RUNNING);
    eq(currentStage({ participant: { tier: 1 } }, TS), STAGE.RUNNING);
    eq(daysUntilFollowup({}, TS), null);
  });

  t('penanda tahap membaca completedAt, bukan sekadar objek ada', () => {
    eq(hasPosttest({ posttest: {} }), false);
    eq(hasPosttest({ posttest: selesai() }), true);
  });
});

describe('tahap studi: penghapusan identitas', () => {
  const p = { id: 'p1', code: 'T1-01', tier: 1, waHash: 'a'.repeat(64), waHint: '...7890' };

  t('hash dan petunjuk nomor dihapus', () => {
    const patch = purgeIdentityPatch(p);
    eq(patch.participant.waHash, null);
    eq(patch.participant.waHint, null);
    ok(patch.participant.identityPurgedAt);
  });

  t('kode partisipan dan data studi TIDAK ikut terhapus', () => {
    // Yang dihapus hanya jembatan ke identitas nyata. Kode partisipan justru harus
    // bertahan, karena seluruh baris data penelitian merujuk padanya.
    const patch = purgeIdentityPatch(p);
    eq(patch.participant.code, 'T1-01');
    eq(patch.participant.id, 'p1');
    eq(patch.participant.tier, 1);
  });

  t('dijalankan dua kali tetap aman', () => {
    const sekali = purgeIdentityPatch(p).participant;
    const dua = purgeIdentityPatch(sekali).participant;
    eq(dua.waHash, null);
    eq(dua.code, 'T1-01');
  });

  t('tanpa partisipan, tidak ada yang ditulis', () => {
    eq(Object.keys(purgeIdentityPatch(null)).length, 0);
  });
});
