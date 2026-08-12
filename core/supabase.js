/* Lapis sinkronisasi offline-first.

   Prinsip: UI TIDAK PERNAH menunggu jaringan. Setiap data ditulis ke localStorage
   lebih dulu, lalu dimasukkan antrean untuk dikirim ke Supabase. Kalau HP partisipan
   sedang tanpa sinyal (sering terjadi di sekolah), data tetap aman dan terkirim nanti.

   Setiap baris membawa client_id unik. Kolom itu UNIQUE di Supabase, jadi pengiriman
   ulang menghasilkan error 23505 yang kita perlakukan sebagai SUKSES, bukan kegagalan.
   Inilah yang mencegah data ganda saat jaringan putus di tengah pengiriman.

   --- Perubahan 0.8.0: kegagalan tidak boleh lagi senyap ---

   Versi sebelumnya menelan seluruh kesalahan server. Kalau skema di Supabase belum
   dijalankan atau login anonim belum diaktifkan, yang terlihat di aplikasi hanyalah
   angka "antrean sinkron: 3" yang tidak pernah berkurang - tanpa satu pun petunjuk
   penyebabnya, baik di layar maupun di konsol. Peneliti hanya bisa menebak.

   Tiga hal diperbaiki di sini, dan ketiganya penting:

   1. SEBAB TERSIMPAN. Percobaan kirim terakhir dicatat (kode error, pesan, dan
      terjemahan dalam bahasa manusia) lalu ditampilkan di layar peneliti.
   2. BARIS GAGAL TIDAK DIBUANG. Dulu baris dihapus setelah 5 percobaan. Itu benar
      bila satu baris memang cacat, tetapi salah total bila penyebabnya konfigurasi
      server - yang hilang bukan satu baris melainkan seluruh data hari itu. Sekarang
      baris pindah ke "kotak gagal" dan bisa dikirim ulang setelah server dibetulkan.
   3. TIDAK MEMBAKAR PERCOBAAN SAAT LOGIN GAGAL. Bila login anonim gagal, seluruh
      penulisan pasti ditolak RLS. Dulu antrean tetap dicoba dan jatah 5 percobaan
      habis percuma; sekarang flush berhenti lebih awal dan mencatat sebabnya. */

import { SUPABASE_URL, SUPABASE_ANON_KEY, KEYS } from './config.js';
import { isBrowser, storage, isOnline, uuid, log } from './env.js';

let client = null;
let clientTried = false;
let flushing = false;
let dryRun = false;

/** Mematikan seluruh pengiriman data. Dinyalakan oleh mode uji di ui/router.js. */
export function setDryRun(on) {
  dryRun = Boolean(on);
}
let authPromise = null;

/** Klien Supabase, atau null bila SDK tidak tersedia (offline / berkas vendor kosong). */
export function getClient() {
  if (clientTried) return client;
  clientTried = true;
  if (!isBrowser) return null;
  const sdk = window.supabase;
  if (!sdk || typeof sdk.createClient !== 'function') {
    log('SDK Supabase tidak tersedia - aplikasi berjalan mode lokal.');
    setStatus({
      reason: 'sdk',
      message: 'Berkas /vendor/supabase.umd.js belum berisi SDK yang sebenarnya.',
      hint: HINTS.sdk,
    });
    return null;
  }
  client = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/* --- Terjemahan kesalahan ---

   Bagian ini bernilai jauh lebih besar daripada panjangnya. Kode seperti "PGRST204"
   tidak berarti apa-apa di lapangan; kalimat "skema di Supabase belum diperbarui,
   jalankan db/checkpoint*.sql" langsung menunjuk tindakan berikutnya. */
const HINTS = {
  sdk: 'Unduh @supabase/supabase-js versi UMD lalu timpa berkas /vendor/supabase.umd.js, deploy ulang.',
  auth: 'Aktifkan Authentication > Providers > Anonymous sign-ins di Supabase. Tanpa itu auth.uid() selalu kosong dan RLS menolak semua penulisan.',
  rls: 'Kebijakan RLS menolak. Jalankan ulang db/checkpoint2.sql (bagian policy) dan pastikan login anonim aktif.',
  schema: 'Kolom atau tabel belum ada. Jalankan db/checkpoint2.sql sampai db/checkpoint8.sql berurutan di SQL Editor Supabase.',
  fk: 'Baris induk belum sampai (participants). Biasanya sembuh sendiri setelah antrean terkirim berurutan; coba Kirim ulang.',
  check: 'Nilai melanggar pagar basis data (constraint). Catat baris ini dan laporkan - jangan diubah manual di server.',
  key: 'Anon key ditolak. Periksa SUPABASE_ANON_KEY di core/config.js apakah masih cocok dengan proyek.',
  network: 'Permintaan tidak sampai ke Supabase. Penyebab tersering: perangkat offline, atau Deployment Protection Vercel menghalangi domain ini.',
  unknown: 'Sebab belum dikenali. Salin pesan mentah di bawah saat melaporkan.',
};

/**
 * Memetakan error Supabase ke sebab + saran tindakan.
 * Dipisah sebagai fungsi murni supaya bisa diuji tanpa jaringan.
 */
export function explainError(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? error ?? '');
  const status = Number(error?.status ?? 0);
  const lower = message.toLowerCase();

  if (code === '23505') return { reason: 'duplicate', hint: 'Baris sudah ada di server - dianggap berhasil.' };
  if (code === '42501' || lower.includes('row-level security')) return { reason: 'rls', hint: HINTS.rls };
  if (code === 'PGRST204' || code === 'PGRST205' || code === '42P01' || code === '42703'
    || lower.includes('could not find') || lower.includes('does not exist')) {
    return { reason: 'schema', hint: HINTS.schema };
  }
  if (code === '23503') return { reason: 'fk', hint: HINTS.fk };
  if (code === '23514') return { reason: 'check', hint: HINTS.check };
  if (status === 401 || code === 'PGRST301' || lower.includes('jwt') || lower.includes('api key')) {
    return { reason: 'key', hint: HINTS.key };
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
    return { reason: 'network', hint: HINTS.network };
  }
  if (lower.includes('anonymous') && lower.includes('disabled')) return { reason: 'auth', hint: HINTS.auth };
  return { reason: 'unknown', hint: HINTS.unknown };
}

/* --- Status pengiriman (dibaca layar peneliti) --- */

function readJson(key, fallback) {
  try { return JSON.parse(storage.getItem(key) || '') ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch (err) { log('gagal menyimpan', key, err); }
}

function setStatus(patch) {
  const prev = readJson(KEYS.syncStatus, {});
  writeJson(KEYS.syncStatus, { ...prev, ...patch, at: new Date().toISOString() });
}

/**
 * Login anonim. Partisipan tidak mengisi email/password sama sekali:
 * identitas dipegang oleh kode partisipan yang diberikan peneliti, sementara
 * auth.uid() hanya dipakai RLS agar tiap partisipan hanya bisa membaca datanya sendiri.
 *
 * Bila gagal, promise TIDAK di-cache - percobaan berikutnya boleh mencoba lagi.
 * Sebelumnya kegagalan ikut tersimpan, jadi satu kegagalan sesaat (misalnya HP baru
 * bangun dari mode pesawat) membuat perangkat itu berhenti mengirim sampai aplikasi
 * ditutup dan dibuka lagi.
 */
export async function ensureAuth() {
  const sb = getClient();
  if (!sb) return null;
  if (authPromise) return authPromise;
  authPromise = (async () => {
    try {
      const { data } = await sb.auth.getSession();
      if (data?.session?.user) return data.session.user;
      const { data: signed, error } = await sb.auth.signInAnonymously();
      if (error) {
        const why = explainError(error);
        log('Login anonim gagal:', error.message);
        setStatus({
          reason: why.reason === 'unknown' ? 'auth' : why.reason,
          message: error.message,
          hint: why.reason === 'unknown' ? HINTS.auth : why.hint,
        });
        return null;
      }
      return signed?.user ?? null;
    } catch (err) {
      const why = explainError(err);
      setStatus({ reason: why.reason, message: String(err?.message || err), hint: why.hint });
      return null;
    }
  })();
  const user = await authPromise;
  if (!user) authPromise = null;             // boleh dicoba ulang pada flush berikutnya
  return user;
}

function readQueue() {
  const q = readJson(KEYS.queue, []);
  return Array.isArray(q) ? q : [];
}
function writeQueue(q) {
  writeJson(KEYS.queue, q);
}
function readDead() {
  const d = readJson(KEYS.dead, []);
  return Array.isArray(d) ? d : [];
}
function writeDead(d) {
  writeJson(KEYS.dead, d);
}

/** Batas percobaan sebelum baris dipindahkan ke kotak gagal (bukan dibuang). */
const MAX_TRIES = 5;

export const Sync = {
  /** Jumlah baris yang belum terkirim - ditampilkan sebagai indikator di Beranda. */
  pending() { return readQueue().length; },

  /** Baris yang menyerah setelah MAX_TRIES percobaan. Tetap tersimpan di perangkat. */
  dead() { return readDead(); },

  /** Ringkasan percobaan kirim terakhir untuk layar diagnostik. */
  status() {
    const s = readJson(KEYS.syncStatus, {});
    return {
      reason: s.reason ?? null,
      message: s.message ?? null,
      hint: s.hint ?? null,
      at: s.at ?? null,
      lastSuccessAt: s.lastSuccessAt ?? null,
      lastSentCount: s.lastSentCount ?? 0,
      pending: readQueue().length,
      dead: readDead().length,
      dryRun,
    };
  },

  /**
   * Menambahkan baris ke antrean. Selalu berhasil (murni operasi lokal).
   * @param {string} table nama tabel Supabase
   * @param {object} row   data baris; client_id ditambahkan bila belum ada
   * @param {{conflict?: string}} opts kolom unik untuk upsert
   */
  enqueue(table, row, opts = {}) {
    /* Mode uji tidak boleh menyentuh basis data penelitian.

       Ini bukan kehati-hatian berlebihan. Mode mock membuat state palsu lalu
       menjalankan alur yang sama persis dengan alur sungguhan - termasuk pencatatan
       sesi, sinyal EMA, dan nudge. Tanpa pagar ini, setiap kali peneliti membuka
       ?mock=1 atau menjalankan tools/qa-shots.sh, baris palsu ikut terkirim dan
       bercampur dengan data partisipan asli. Baris palsu yang sudah bercampur tidak
       bisa dibedakan lagi setelah studi selesai. */
    if (dryRun) {
      log('mode uji: baris TIDAK dikirim', table);
      return readQueue().length;
    }

    const q = readQueue();
    q.push({
      id: uuid(),
      table,
      row: { client_id: row.client_id || uuid(), ...row },
      conflict: opts.conflict || 'client_id',
      tries: 0,
      queuedAt: new Date().toISOString(),
    });
    writeQueue(q);
    log('enqueue', table, q.length);
    void Sync.flush();
    return q.length;
  },

  /** Mengosongkan antrean ke Supabase. Aman dipanggil berkali-kali. */
  async flush() {
    if (flushing) return { sent: 0, skipped: true };
    if (dryRun) return { sent: 0, dryRun: true };

    const sb = getClient();
    if (!sb) return { sent: 0, blocked: 'sdk' };
    if (!isOnline()) return { sent: 0, offline: true };

    const queue = readQueue();
    if (!queue.length) return { sent: 0 };

    flushing = true;
    let sent = 0;
    try {
      const user = await ensureAuth();
      if (!user) {
        // Tanpa sesi, setiap upsert pasti ditolak RLS. Berhenti di sini supaya jatah
        // percobaan tidak habis oleh sebab yang sama sekali di luar antrean.
        return { sent: 0, blocked: 'auth', pending: queue.length };
      }

      const remaining = [];
      const dead = readDead();
      let lastFail = null;

      for (const item of queue) {
        try {
          const { error } = await sb.from(item.table).upsert(item.row, {
            onConflict: item.conflict,
            ignoreDuplicates: true,
          });
          if (!error || error.code === '23505') { sent += 1; continue; }

          const why = explainError(error);
          item.tries += 1;
          item.lastError = error.message;
          item.lastErrorCode = error.code ?? null;
          item.lastReason = why.reason;
          item.lastHint = why.hint;
          item.lastTriedAt = new Date().toISOString();
          lastFail = { table: item.table, ...why, message: error.message, code: error.code ?? null };

          if (item.tries < MAX_TRIES) remaining.push(item);
          else {
            // Pindah ke kotak gagal, TIDAK dihapus. Lihat catatan di kepala berkas.
            dead.push(item);
            log('Baris masuk kotak gagal:', item.table, error.message);
          }
        } catch (err) {
          const why = explainError(err);
          item.tries += 1;
          item.lastError = String(err?.message || err);
          item.lastReason = why.reason;
          item.lastHint = why.hint;
          item.lastTriedAt = new Date().toISOString();
          lastFail = { table: item.table, ...why, message: item.lastError, code: null };
          if (item.tries < MAX_TRIES) remaining.push(item);
          else dead.push(item);
        }
      }

      writeQueue(remaining);
      writeDead(dead);

      if (lastFail) {
        setStatus({
          reason: lastFail.reason,
          message: `${lastFail.table}: ${lastFail.message}`,
          hint: lastFail.hint,
          lastSentCount: sent,
        });
      } else {
        setStatus({
          reason: 'ok', message: null, hint: null,
          lastSuccessAt: new Date().toISOString(), lastSentCount: sent,
        });
      }

      return { sent, pending: remaining.length, dead: dead.length };
    } finally {
      flushing = false;
    }
  },

  /**
   * Mengembalikan isi kotak gagal ke antrean. Dipakai peneliti SETELAH penyebabnya
   * dibetulkan di server. Ini bukan pengubahan data: baris yang sama dikirim ulang
   * dengan client_id yang sama, jadi duplikat tetap mustahil.
   */
  retryDead() {
    const dead = readDead();
    if (!dead.length) return 0;
    const q = readQueue();
    for (const item of dead) q.push({ ...item, tries: 0 });
    writeQueue(q);
    writeDead([]);
    void Sync.flush();
    return dead.length;
  },

  /**
   * Pemeriksaan HANYA-BACA terhadap jalur pengiriman. Tidak menulis satu baris pun
   * ke tabel penelitian, jadi aman dijalankan kapan saja termasuk di tengah studi.
   * Mengembalikan daftar langkah beserta hasilnya untuk ditampilkan apa adanya.
   */
  async diagnose() {
    const steps = [];
    const add = (name, ok, detail = '', hint = '') => steps.push({ name, ok, detail, hint });

    const sdkAda = isBrowser && Boolean(window.supabase?.createClient);
    add('SDK Supabase termuat', sdkAda, sdkAda ? 'window.supabase tersedia' : 'window.supabase kosong', sdkAda ? '' : HINTS.sdk);
    if (!sdkAda) return { steps, ok: false };

    const sb = getClient();
    add('Klien dibuat', Boolean(sb), SUPABASE_URL);
    if (!sb) return { steps, ok: false };

    add('Perangkat daring', isOnline(), isOnline() ? '' : 'navigator.onLine = false');

    let user = null;
    try {
      user = await ensureAuth();
      add('Login anonim', Boolean(user), user ? `uid ${String(user.id).slice(0, 8)}...` : 'tidak ada sesi',
        user ? '' : HINTS.auth);
    } catch (err) {
      add('Login anonim', false, String(err?.message || err), HINTS.auth);
    }

    /* Membaca satu baris dari setiap tabel inti. Hasil kosong BUKAN kegagalan -
       RLS memang hanya mengizinkan partisipan melihat barisnya sendiri. Yang dicari
       di sini adalah error tabel/kolom yang hilang. */
    for (const table of ['participants', 'consents', 'sessions', 'ema_signals', 'ema_entries', 'fidelity_log']) {
      try {
        const { error } = await sb.from(table).select('client_id').limit(1);
        if (error) {
          const why = explainError(error);
          add(`Tabel ${table}`, false, `${error.code ?? ''} ${error.message}`.trim(), why.hint);
        } else {
          add(`Tabel ${table}`, true, 'terbaca');
        }
      } catch (err) {
        const why = explainError(err);
        add(`Tabel ${table}`, false, String(err?.message || err), why.hint);
      }
    }

    const ok = steps.every((s) => s.ok);
    setStatus(ok
      ? { reason: 'ok', message: 'Diagnosa: semua langkah lolos.', hint: null }
      : { reason: 'diagnose', message: 'Diagnosa menemukan langkah yang gagal.', hint: steps.find((s) => !s.ok)?.hint || null });
    return { steps, ok };
  },

  /**
   * Uji tulis sungguhan. SATU-SATUNYA tindakan di aplikasi ini yang menulis ke server
   * atas perintah peneliti, dan disengaja: pemeriksaan hanya-baca di atas tidak bisa
   * membuktikan izin INSERT, padahal justru INSERT yang gagal saat RLS salah.
   *
   * Barisnya masuk ke fidelity_log dengan event 'sync_self_test', sehingga mudah
   * disaring saat analisis:
   *   delete from fidelity_log where event = 'sync_self_test';
   * Tidak ada tabel data penelitian (sessions, ema_*) yang disentuh, dan tidak ada
   * kolom fidelitas yang diisi - baris ini tidak akan terbaca sebagai hari fidelitas.
   *
   * participant_id WAJIB diisi dan harus milik perangkat ini. Kebijakan RLS tabel anak
   * berbunyi `participant_id in (select id from participants where user_id = auth.uid())`,
   * jadi baris dengan participant_id kosong pasti ditolak - uji yang selalu gagal justru
   * akan membuat peneliti mengira servernya rusak padahal uji ini yang salah bentuk.
   */
  async writeProbe({ participantId } = {}) {
    const sb = getClient();
    if (!sb) return { ok: false, message: 'SDK tidak tersedia.', hint: HINTS.sdk };
    if (!participantId) {
      return {
        ok: false,
        message: 'Perangkat ini belum punya baris partisipan.',
        hint: 'Selesaikan pendaftaran dan persetujuan lebih dulu; RLS menolak penulisan tanpa participant_id milik sendiri.',
      };
    }
    const user = await ensureAuth();
    if (!user) return { ok: false, message: 'Login anonim gagal.', hint: HINTS.auth };

    const row = {
      participant_id: participantId,
      event: 'sync_self_test',
      detail: { source: 'layar-dev', at: new Date().toISOString() },
      occurred_at: new Date().toISOString(),
      client_id: `selftest:${uuid()}`,
    };
    const { error } = await sb.from('fidelity_log').insert(row);
    if (!error) {
      setStatus({ reason: 'ok', message: 'Uji tulis berhasil.', hint: null, lastSuccessAt: new Date().toISOString() });
      return { ok: true, message: 'Baris uji berhasil ditulis ke fidelity_log (event: sync_self_test).', hint: '' };
    }
    const why = explainError(error);
    return { ok: false, message: `${error.code ?? ''} ${error.message}`.trim(), hint: why.hint };
  },

  /** Hanya untuk test / reset perangkat. */
  clear() { writeQueue([]); writeDead([]); },
};

/** Dipanggil sekali saat boot dari ui/router.js (bukan di level modul). */
export function startAutoFlush() {
  if (!isBrowser) return;
  void Sync.flush();
  window.addEventListener('online', () => void Sync.flush());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void Sync.flush();
  });
  setInterval(() => void Sync.flush(), 60_000);
}

/** Pencatat fidelitas: bukti objektif bahwa intervensi berjalan sesuai protokol. */
export function logFidelity(participantId, event, detail = {}) {
  Sync.enqueue('fidelity_log', {
    participant_id: participantId ?? null,
    event,
    detail,
    occurred_at: new Date().toISOString(),
  });
}
