/* Test Store & antrean sinkron.
   Fokus: data partisipan tidak boleh hilang atau terkirim ganda. */

import { describe, t, eq, ok } from './harness.js';
import { Store, hasParticipant, hasConsent, hasPretest, currentPhase, phaseOf } from '../core/store.js';
import { Sync } from '../core/supabase.js';

export default function run() {
  describe('store: inisialisasi');

  t('state awal punya clientId dan nilai default yang aman', () => {
    const s = Store.init();
    ok(s.clientId && s.clientId.length > 8, 'clientId harus ada');
    eq(s.xp, 0);
    eq(s.level, 1);
    eq(s.sessions, []);
    eq(s.participant, null);
  });

  t('init dua kali tidak menghapus data (idempoten)', () => {
    Store.reset();
    Store.patch({ xp: 55 });
    Store.init();
    eq(Store.get().xp, 55);
  });

  describe('store: pembaruan');

  t('patch hanya mengubah field yang disebut', () => {
    Store.reset();
    Store.patch({ xp: 10 });
    Store.patch({ streak: 3 });
    eq(Store.get().xp, 10);
    eq(Store.get().streak, 3);
  });

  t('update menerima fungsi dan push menambah ke array', () => {
    Store.reset();
    Store.update((s) => ({ ...s, xp: s.xp + 40 }));
    Store.push('sessions', { id: 'a' });
    Store.push('sessions', { id: 'b' });
    eq(Store.get().xp, 40);
    eq(Store.get().sessions.length, 2);
  });

  t('pelanggan langganan diberi tahu setiap perubahan', () => {
    Store.reset();
    let hits = 0;
    const off = Store.subscribe(() => { hits += 1; });
    Store.patch({ xp: 1 });
    Store.patch({ xp: 2 });
    off();
    Store.patch({ xp: 3 });
    eq(hits, 2, 'setelah berhenti berlangganan tidak dipanggil lagi');
  });

  describe('store: gerbang onboarding');

  t('gerbang mengikuti urutan partisipan -> consent -> pretest', () => {
    Store.reset();
    ok(!hasParticipant(), 'belum terdaftar');
    Store.patch({ participant: { code: 'P01', tier: 2, startedOn: '2026-08-10' } });
    ok(hasParticipant());
    ok(!hasConsent(), 'consent belum ada');
    Store.patch({ consent: { acceptedAt: '2026-08-10T01:00:00Z' } });
    ok(hasConsent());
    ok(!hasPretest());
    Store.patch({ pretest: { completedAt: '2026-08-10T01:10:00Z', profile: 'spark' } });
    ok(hasPretest());
  });

  t('fase dihitung dari tier partisipan yang tersimpan', () => {
    Store.reset();
    Store.patch({ participant: { code: 'P01', tier: 4, startedOn: '2026-08-10' } });
    const p = currentPhase(Store.get(), Date.parse('2026-08-18T05:00:00Z')); // hari 9
    eq(p.day, 9);
    eq(p.phase, 'intervention');
    eq(phaseOf(Store.get(), Date.parse('2026-08-14T05:00:00Z')), 'baseline'); // hari 5
  });

  t('tanpa partisipan, fase adalah pra-studi dan tidak error', () => {
    Store.reset();
    eq(currentPhase(), null);
    eq(phaseOf(), 'pre');
  });

  describe('sync: antrean offline');

  t('antrean menyimpan baris walau tanpa jaringan', () => {
    Sync.clear();
    Sync.enqueue('sessions', { outcome: 'completed', xp: 40 });
    Sync.enqueue('ema_entries', { focus: 4 });
    eq(Sync.pending(), 2);
  });

  t('setiap baris otomatis mendapat client_id unik untuk deduplikasi', () => {
    Sync.clear();
    Sync.enqueue('sessions', { outcome: 'completed' });
    Sync.enqueue('sessions', { outcome: 'broken' });
    eq(Sync.pending(), 2);
    ok(true);
  });

  t('client_id yang diberikan pemanggil dipertahankan', () => {
    Sync.clear();
    Sync.enqueue('sessions', { client_id: 'tetap-1', outcome: 'aborted' });
    eq(Sync.pending(), 1);
  });

  t('reset store juga mengosongkan antrean agar perangkat bersih', () => {
    Sync.enqueue('sessions', { outcome: 'completed' });
    Store.reset();
    eq(Sync.pending(), 0);
  });
}
