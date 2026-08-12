-- FOKUS - Checkpoint 7: EMA pasca-sesi, butir coping, pascates, follow-up,
--                      identitas ter-hash, dan checklist fidelitas harian.
--
-- Idempoten: aman dijalankan berulang di SQL Editor Supabase.
-- Seluruhnya TAMBAH-SAJA (add column if not exists). Tidak ada kolom yang dihapus
-- atau diganti nama, sehingga data checkpoint 2-6 yang sudah terkumpul tetap terbaca
-- dan perangkat yang belum sempat memperbarui aplikasi tetap bisa mengirim baris lama.
--
-- Latar: berkas ini menutup jarak antara aplikasi dan Bab 3 Metode Penelitian -
-- bukan proposal. Setiap blok di bawah menyebut pasal Bab 3 yang mendasarinya.

-- ---------------------------------------------------------------------------
-- 1. EMA pasca-sesi (Bab 3 3.4)
--
-- Bab 3 meminta pengukuran yang melekat pada sesi, bukan hanya tiga sinyal acak
-- harian. Dua kolom di bawah yang membuat keduanya bisa dibedakan saat analisis:
-- tanpa signal_type, rerata fokus harian akan tercampur dengan rerata fokus tepat
-- setelah sesi - dua hal yang secara teori memang berbeda.
-- ---------------------------------------------------------------------------
alter table public.ema_signals add column if not exists signal_type text not null default 'scheduled';
alter table public.ema_signals add column if not exists session_id  text;

alter table public.ema_signals drop constraint if exists ema_signals_type_valid;
alter table public.ema_signals add constraint ema_signals_type_valid
  check (signal_type in ('scheduled', 'post_session'));

-- Sinyal terjadwal menempati strata (pagi/siang/malam); sinyal pasca-sesi tidak.
-- Pagar ini mencegah sinyal pasca-sesi ikut terhitung sebagai "jadwal hari ini".
alter table public.ema_signals drop constraint if exists ema_signals_stratum_by_type;
alter table public.ema_signals add constraint ema_signals_stratum_by_type check (
  (signal_type = 'scheduled'    and stratum is not null)
  or (signal_type = 'post_session' and stratum is null)
);

alter table public.ema_entries add column if not exists signal_type text not null default 'scheduled';
alter table public.ema_entries add column if not exists session_id  text;

create index if not exists ema_signals_session_idx on public.ema_signals (session_id);
create index if not exists ema_entries_session_idx on public.ema_entries (session_id);
create index if not exists ema_entries_type_idx    on public.ema_entries (signal_type, phase);

-- ---------------------------------------------------------------------------
-- 2. Butir coping (Bab 3 3.6, Tahap Intervensi)
--
-- "Elemen nudge dengan mekanisme dedupe serta item coping pada EMA turut diaktifkan
-- pada fase ini." Karena itu coping HARUS boleh null: null berarti butirnya memang
-- tidak ditanyakan (fase baseline), berbeda dari 0 yang berarti "diukur, hasilnya nol".
-- Membedakan keduanya menentukan apakah rata-rata coping fase baseline kosong atau
-- tercemar angka palsu.
-- ---------------------------------------------------------------------------
alter table public.ema_entries add column if not exists coping smallint;

alter table public.ema_entries drop constraint if exists ema_entries_coping_range;
alter table public.ema_entries add constraint ema_entries_coping_range
  check (coping is null or coping between 1 and 5);

-- Baris nonrespons: seluruh butir wajib kosong, kini termasuk coping.
-- Tanpa penambahan ini, sinyal yang terlewat masih bisa membawa nilai coping.
alter table public.ema_entries drop constraint if exists ema_entries_missing_is_blank;
alter table public.ema_entries add constraint ema_entries_missing_is_blank check (
  responded = true
  or (focus is null and control is null and context is null and impulse is null and coping is null)
);

-- ---------------------------------------------------------------------------
-- 3. Identitas ter-hash (Bab 3 3.3) dan penghapusannya (Bab 3 3.6, Pascates)
--
-- Nomor WhatsApp TIDAK PERNAH dikirim ke basis data - hanya hash bersalt-nya dan
-- empat digit terakhir sebagai petunjuk pencocokan di lapangan. identity_purged_at
-- adalah bukti terdokumentasi bahwa penghapusan yang dijanjikan saat consent benar
-- terjadi, sehingga tidak bergantung pada ingatan peneliti.
-- ---------------------------------------------------------------------------
alter table public.participants add column if not exists wa_hash            text;
alter table public.participants add column if not exists wa_hint            text;
alter table public.participants add column if not exists identity_purged_at timestamptz;

-- Pagar keras: kolom hash hanya boleh berisi hex SHA-256, tidak mungkin nomor telepon.
-- Bila suatu saat ada kode yang keliru mengirim nomor mentah, basis data menolaknya.
alter table public.participants drop constraint if exists participants_wa_hash_is_hash;
alter table public.participants add constraint participants_wa_hash_is_hash
  check (wa_hash is null or wa_hash ~ '^[0-9a-f]{64}$');

alter table public.participants drop constraint if exists participants_wa_hint_short;
alter table public.participants add constraint participants_wa_hint_short
  check (wa_hint is null or char_length(wa_hint) <= 8);

create index if not exists participants_wa_hash_idx on public.participants (wa_hash);

-- ---------------------------------------------------------------------------
-- 4. Pascates dan probe follow-up (Bab 3 3.6)
--
-- Butir mentahnya tetap masuk ke pretest_responses lewat kolom `occasion` yang sudah
-- ada sejak checkpoint 3 ('pretest' | 'posttest' | 'followup') - itulah sumber data
-- untuk menghitung ulang Cronbach's Alpha. Kolom ringkas di bawah hanya cermin skor
-- total, supaya perbandingan pra-pasca-follow-up bisa dibaca dalam satu baris.
-- ---------------------------------------------------------------------------
alter table public.participants add column if not exists posttest_aps_total smallint;
alter table public.participants add column if not exists posttest_smd_total smallint;
alter table public.participants add column if not exists posttest_on        date;
alter table public.participants add column if not exists reflection         text;
alter table public.participants add column if not exists followup_aps_total smallint;
alter table public.participants add column if not exists followup_on        date;

-- Rentang skor total instrumen, mengikuti Bab 3 3.4: APS-S 5 butir skala 1-5 (5-25),
-- SMD 9 butir ya/tidak (0-9).
alter table public.participants drop constraint if exists participants_posttest_range;
alter table public.participants add constraint participants_posttest_range check (
  (posttest_aps_total is null or posttest_aps_total between 5 and 25)
  and (posttest_smd_total is null or posttest_smd_total between 0 and 9)
  and (followup_aps_total is null or followup_aps_total between 5 and 25)
);

-- Occasion sudah ada sejak checkpoint 3; pagar nilainya ditegaskan di sini supaya
-- salah ketik seperti 'post-test' tidak diam-diam membentuk kelompok data keempat.
alter table public.pretest_responses drop constraint if exists pretest_responses_occasion_valid;
alter table public.pretest_responses add constraint pretest_responses_occasion_valid
  check (occasion in ('pretest', 'posttest', 'followup'));

create index if not exists pretest_responses_occasion_idx
  on public.pretest_responses (participant_id, occasion);

-- ---------------------------------------------------------------------------
-- 5. Checklist fidelitas harian (Bab 3 3.7)
--
-- "Log checklist harian otomatis". Sebelumnya fidelity_log hanya menampung peristiwa
-- lepas di kolom detail jsonb - berguna untuk menelusuri kejadian, tetapi tidak bisa
-- dijumlahkan menjadi persentase fidelitas untuk dilaporkan.
--
-- Kolom kuncinya adalah pasangan expected_nudge dan nudge_delivered. Keduanya membuat
-- dua penyimpangan berlawanan arah sama-sama terlihat: nudge bocor ke fase baseline,
-- dan nudge gagal muncul di fase intervensi. Keduanya membatalkan klaim kausal desain
-- multiple-baseline, jadi keduanya harus terhitung, bukan hanya yang pertama.
-- ---------------------------------------------------------------------------
alter table public.fidelity_log add column if not exists entry_date         date;
alter table public.fidelity_log add column if not exists study_day          smallint;
alter table public.fidelity_log add column if not exists tier               smallint;
alter table public.fidelity_log add column if not exists phase              text;
alter table public.fidelity_log add column if not exists profile            text;
alter table public.fidelity_log add column if not exists expected_nudge     boolean;
alter table public.fidelity_log add column if not exists nudge_delivered    boolean;
alter table public.fidelity_log add column if not exists nudge_shown        smallint;
alter table public.fidelity_log add column if not exists nudge_accepted     smallint;
alter table public.fidelity_log add column if not exists ema_delivered      smallint;
alter table public.fidelity_log add column if not exists ema_answered       smallint;
alter table public.fidelity_log add column if not exists sessions_started   smallint;
alter table public.fidelity_log add column if not exists sessions_completed smallint;
alter table public.fidelity_log add column if not exists fidelity_ok        boolean;
alter table public.fidelity_log add column if not exists app_version        text;

create index if not exists fidelity_log_daily_idx on public.fidelity_log (participant_id, entry_date);
create index if not exists fidelity_log_flag_idx  on public.fidelity_log (fidelity_ok) where fidelity_ok = false;

-- ---------------------------------------------------------------------------
-- 6. RLS
--
-- Tidak ada policy baru. Seluruh tabel di atas sudah insert-only bagi klien anonim
-- sejak checkpoint sebelumnya, dan penambahan kolom tidak mengubah kebijakan itu.
-- Perangkat partisipan tetap TIDAK bisa membaca, mengubah, atau menghapus baris -
-- termasuk barisnya sendiri. Peneliti membaca lewat service_role di /api/export.js.
--
-- Catatan penting: karena perangkat tidak punya izin update, penghapusan identitas
-- pada saat pascates dijalankan sebagai UPSERT baris participants dengan client_id
-- yang sama (wa_hash dan wa_hint dikirim null), bukan sebagai perintah update.
-- ---------------------------------------------------------------------------

-- Selesai. Verifikasi cepat setelah menjalankan berkas ini:
--   select column_name from information_schema.columns
--   where table_name = 'ema_entries' and column_name in ('coping','signal_type','session_id');
