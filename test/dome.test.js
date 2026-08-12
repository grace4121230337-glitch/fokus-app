/* Uji mesin Kubah Fokus.

   Fokus pengujian ada di batas-batas angka yang tertulis di Bab 3. Kalau nanti ada
   yang mengubah 15 detik menjadi 15,1 detik atau mengubah rumus XP, test ini gagal
   dan perubahan itu ketahuan sebelum sampai ke partisipan. */

import { describe, t, eq, ok } from './harness.js';
import {
  AWAY, PENALTY, OUTCOME, STALE_MS, DEFAULT_MINUTES,
  classifyAway, awayPenalty, computeXp, createSession, sessionTiming,
  isStale, applyAway, setAwayReason, summarizeMarks, finishSession, recordSession,
} from '../core/dome.js';

const MENIT = 60_000;

export default function run() {
  describe('dome - klasifikasi keluar aplikasi', () => {
    t('di bawah 3 detik = melirik', () => {
      eq(classifyAway(0), 'glance');
      eq(classifyAway(2_999), 'glance');
    });
    t('3 sampai 15 detik = sebentar', () => {
      eq(classifyAway(3_000), 'mid');      // batas bawah inklusif
      eq(classifyAway(15_000), 'mid');     // batas atas inklusif
    });
    t('di atas 15 detik = pindah aplikasi', () => {
      eq(classifyAway(15_001), 'switch');
      eq(classifyAway(10 * MENIT), 'switch');
    });
    t('nilai aneh tidak membuat crash', () => {
      eq(classifyAway(-5), 'glance');
      eq(classifyAway(null), 'glance');
      eq(classifyAway(undefined), 'glance');
    });
    t('penalti sesuai kontrak', () => {
      eq(awayPenalty('glance'), 5);
      eq(awayPenalty('mid'), 10);
      eq(awayPenalty('switch'), 20);
      eq(awayPenalty('entah'), 0);
    });
  });

  describe('dome - XP', () => {
    t('sesi selesai dengan HP penuh', () => {
      eq(computeXp({ outcome: OUTCOME.COMPLETED, hp: 100, plannedMinutes: 25 }), 55);
    });
    t('sesi selesai dengan HP separuh', () => {
      eq(computeXp({ outcome: OUTCOME.COMPLETED, hp: 50, plannedMinutes: 25 }), 40);
    });
    t('sesi selesai dengan HP 1 tetap dapat bonus kecil', () => {
      eq(computeXp({ outcome: OUTCOME.COMPLETED, hp: 0, plannedMinutes: 10 }), 10);
    });
    t('kubah retak di tengah jalan dapat XP parsial', () => {
      // 25 menit direncanakan, bertahan 12,5 menit -> 25 * 0,5 * 0,25 = 3,125 -> 3
      eq(computeXp({ outcome: OUTCOME.BROKEN, hp: 0, plannedMinutes: 25, elapsedMs: 12.5 * MENIT }), 3);
    });
    t('sesi dibatalkan langsung mendekati nol', () => {
      eq(computeXp({ outcome: OUTCOME.ABORTED, hp: 100, plannedMinutes: 25, elapsedMs: 5_000 }), 0);
    });
    t('kelebihan waktu tidak menambah XP parsial', () => {
      const a = computeXp({ outcome: OUTCOME.ABORTED, plannedMinutes: 20, elapsedMs: 20 * MENIT });
      const b = computeXp({ outcome: OUTCOME.ABORTED, plannedMinutes: 20, elapsedMs: 90 * MENIT });
      eq(a, b);
    });
  });

  describe('dome - siklus sesi', () => {
    t('sesi baru mulai dengan HP 100 dan durasi valid', () => {
      const s = createSession({ plannedMinutes: 25, startedAt: 0 });
      eq(s.hp, 100);
      eq(s.plannedMinutes, 25);
      eq(s.marks.length, 0);
      ok(typeof s.clientId === 'string' && s.clientId.length > 0);
    });
    t('durasi di luar daftar dikembalikan ke baku', () => {
      eq(createSession({ plannedMinutes: 999 }).plannedMinutes, DEFAULT_MINUTES);
      eq(createSession({ plannedMinutes: 'abc' }).plannedMinutes, DEFAULT_MINUTES);
    });

    t('waktu dihitung dari jam dinding, bukan dari jumlah tick', () => {
      const s = createSession({ plannedMinutes: 25, startedAt: 0 });
      const timing = sessionTiming(s, 10 * MENIT);
      eq(timing.elapsedMs, 10 * MENIT);
      eq(timing.remainingMs, 15 * MENIT);
      eq(timing.percent, 40);
      eq(timing.finished, false);
      eq(sessionTiming(s, 25 * MENIT).finished, true);
      eq(sessionTiming(s, 99 * MENIT).remainingMs, 0);   // tidak pernah negatif
    });

    t('penalti mengurangi HP dan mencatat mark', () => {
      let s = createSession({ plannedMinutes: 25, startedAt: 0 });
      const r1 = applyAway(s, { awayMs: 1_000, at: 60_000 });
      eq(r1.session.hp, 95);
      eq(r1.mark.kind, 'glance');
      eq(r1.needsReason, false);        // melirik tidak ditanyai
      eq(r1.broken, false);

      const r2 = applyAway(r1.session, { awayMs: 60_000, at: 120_000 });
      eq(r2.session.hp, 75);
      eq(r2.mark.kind, 'switch');
      eq(r2.needsReason, true);
      eq(r2.session.marks.length, 2);
    });

    t('HP tidak pernah negatif dan kubah retak di nol', () => {
      let s = createSession({ plannedMinutes: 25, startedAt: 0 });
      let broken = false;
      for (let i = 0; i < 6; i += 1) {
        const r = applyAway(s, { awayMs: 60_000, at: (i + 1) * 60_000 });
        s = r.session; broken = r.broken;
      }
      eq(s.hp, 0);
      eq(broken, true);
    });

    t('alasan subjektif tidak mengubah HP', () => {
      const s = createSession({ plannedMinutes: 25, startedAt: 0 });
      const r = applyAway(s, { awayMs: 20_000, at: 30_000 });
      const hpSebelum = r.session.hp;
      const setelah = setAwayReason(r.session, r.mark.id, 'lock');
      eq(setelah.hp, hpSebelum);
      eq(setelah.marks[0].reason, 'lock');
      eq(setelah.marks[0].penalty, PENALTY.switch);
    });

    t('rekap gangguan menghitung tiap jenis', () => {
      const marks = [
        { kind: 'glance', awayMs: 1_000 },
        { kind: 'mid', awayMs: 5_000 },
        { kind: 'mid', awayMs: 6_000 },
        { kind: 'switch', awayMs: 30_000 },
      ];
      const r = summarizeMarks(marks);
      eq(r.glance, 1); eq(r.mid, 2); eq(r.switch, 1); eq(r.total, 4);
      eq(r.awayMsTotal, 42_000);
    });

    t('sesi yang lama ditinggalkan dianggap basi', () => {
      const s = createSession({ plannedMinutes: 25, startedAt: 0 });
      eq(isStale(s, STALE_MS - 1), false);
      eq(isStale(s, STALE_MS + 1), true);
      eq(isStale(null, 99), false);
    });
  });

  describe('dome - baris data penelitian', () => {
    t('finishSession menghasilkan kolom yang dibutuhkan analisis', () => {
      let s = createSession({ plannedMinutes: 25, startedAt: 0, tier: 2, phase: 'intervention', studyDay: 9 });
      s = applyAway(s, { awayMs: 1_000, at: 60_000 }).session;
      s = applyAway(s, { awayMs: 30_000, at: 120_000 }).session;
      const row = finishSession(s, { outcome: OUTCOME.COMPLETED, ts: 25 * MENIT, appVersion: '0.1.0' });

      eq(row.tier, 2);
      eq(row.phase, 'intervention');
      eq(row.study_day, 9);
      eq(row.planned_minutes, 25);
      eq(row.elapsed_sec, 1500);
      eq(row.hp_end, 75);
      eq(row.outcome, 'completed');
      eq(row.away_glance, 1);
      eq(row.away_switch, 1);
      eq(row.away_mid, 0);
      eq(row.xp_awarded, 48);            // 25 + (75/100)*30 = 47,5 -> 48
      eq(row.away_marks.length, 2);
      eq(row.app_version, '0.1.0');
      ok(typeof row.client_id === 'string');
      ok(row.started_at.endsWith('Z') && row.ended_at.endsWith('Z'));
    });

    t('recordSession menambah XP, streak, dan mengosongkan sesi aktif', () => {
      const state = { xp: 0, level: 1, sessions: [], activeSession: { hp: 100 }, streak: 0 };
      const row = { outcome: OUTCOME.COMPLETED, xp_awarded: 55, client_id: 'a' };
      const r = recordSession(state, row, Date.UTC(2026, 0, 5, 5, 0, 0));
      eq(r.state.sessions.length, 1);
      eq(r.state.activeSession, null);
      eq(r.state.xp, 55);
      eq(r.streak, 1);
    });

    t('sesi gagal tidak menyalakan streak', () => {
      const state = { xp: 0, level: 1, sessions: [], activeSession: { hp: 0 }, streak: 0 };
      const row = { outcome: OUTCOME.BROKEN, xp_awarded: 3, client_id: 'b' };
      const r = recordSession(state, row, Date.UTC(2026, 0, 5, 5, 0, 0));
      eq(r.state.xp, 3);
      eq(r.streak, 0);
      eq(r.state.lastSessionDate, undefined);
      eq(r.state.activeSession, null);
    });

    t('data sesi bersifat tambah-saja', () => {
      let state = { xp: 0, level: 1, sessions: [{ client_id: 'lama' }], activeSession: null, streak: 0 };
      state = recordSession(state, { outcome: OUTCOME.ABORTED, xp_awarded: 1, client_id: 'baru' }).state;
      eq(state.sessions.length, 2);
      eq(state.sessions[0].client_id, 'lama');
    });
  });
}
