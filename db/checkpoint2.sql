-- FOKUS - migrasi Checkpoint 2 (pendaftaran, consent, pretest)
-- Jalankan di Supabase: SQL Editor -> New query -> tempel semua -> Run.
--
-- Skrip ini AMAN dijalankan berulang kali. Semua perintah memakai
-- "if not exists" / "drop policy if exists", jadi tidak akan muncul lagi error
-- 42P07 "relation already exists" seperti sebelumnya, dan tabel yang sudah
-- berisi data tidak akan terhapus.
--
-- Tujuannya menyelaraskan kolom di proyek Anda dengan data yang benar-benar
-- dikirim aplikasi. Bila nama kolom di proyek Anda berbeda, kolom baru akan
-- ditambahkan dan kolom lama dibiarkan (tidak ada data yang hilang).

create extension if not exists pgcrypto;

/* ---------------------------------------------------------------- participants */
create table if not exists participants (
  id uuid primary key default gen_random_uuid()
);

-- id dibuat oleh aplikasi di perangkat, bukan oleh server. Itu yang membuat
-- pendaftaran tetap bisa berjalan offline: baris anak sudah punya participant_id
-- untuk dirujuk sebelum perangkat pernah menyentuh internet.
alter table participants add column if not exists user_id uuid default auth.uid();
alter table participants add column if not exists code text;
alter table participants add column if not exists tier smallint;
alter table participants add column if not exists participant_index smallint;
alter table participants add column if not exists profile text;
alter table participants add column if not exists profile_confidence text;
alter table participants add column if not exists avoidance_index numeric;
alter table participants add column if not exists arousal_index numeric;
alter table participants add column if not exists aps_total smallint;
alter table participants add column if not exists ius_total smallint;
alter table participants add column if not exists smd_total smallint;
alter table participants add column if not exists eligible boolean;
alter table participants add column if not exists started_on date;
alter table participants add column if not exists app_version text;
alter table participants add column if not exists client_id text;
alter table participants add column if not exists created_at timestamptz default now();

-- Constraint tidak mengenal "if not exists", jadi dibungkus agar tetap aman diulang.
do $$
begin
  alter table participants add constraint participants_tier_range check (tier between 1 and 4) not valid;
exception
  when duplicate_object then null;
end $$;

create unique index if not exists participants_code_key      on participants (code);
create unique index if not exists participants_client_id_key on participants (client_id);

/* -------------------------------------------------------------------- consents */
create table if not exists consents (
  id uuid primary key default gen_random_uuid()
);

alter table consents add column if not exists participant_id uuid references participants (id) on delete cascade;
alter table consents add column if not exists statement_1 boolean;
alter table consents add column if not exists statement_2 boolean;
alter table consents add column if not exists statement_3 boolean;
alter table consents add column if not exists statement_4 boolean;
alter table consents add column if not exists version text;
alter table consents add column if not exists accepted_at timestamptz;
alter table consents add column if not exists client_id text;
alter table consents add column if not exists created_at timestamptz default now();

create unique index if not exists consents_client_id_key on consents (client_id);

/* ----------------------------------------------------------- pretest_responses */
-- Satu baris per BUTIR, bukan per skor total. Data butir mentah wajib ada untuk
-- menghitung ulang Cronbach's Alpha pada sampel sendiri (Bab 3 3.5.e).
create table if not exists pretest_responses (
  id uuid primary key default gen_random_uuid()
);

alter table pretest_responses add column if not exists participant_id uuid references participants (id) on delete cascade;
alter table pretest_responses add column if not exists instrument text;
alter table pretest_responses add column if not exists item_no smallint;
alter table pretest_responses add column if not exists response smallint;
alter table pretest_responses add column if not exists occasion text default 'pretest';
alter table pretest_responses add column if not exists answered_at timestamptz;
alter table pretest_responses add column if not exists client_id text;
alter table pretest_responses add column if not exists created_at timestamptz default now();

create unique index if not exists pretest_responses_client_id_key on pretest_responses (client_id);
create index if not exists pretest_responses_participant_idx on pretest_responses (participant_id, instrument);

/* ------------------------------------------------------------ fidelity_log */
-- Bukti objektif bahwa protokol berjalan sesuai rencana (checklist fidelitas).
create table if not exists fidelity_log (
  id uuid primary key default gen_random_uuid()
);

alter table fidelity_log add column if not exists participant_id uuid references participants (id) on delete set null;
alter table fidelity_log add column if not exists event text;
alter table fidelity_log add column if not exists detail jsonb;
alter table fidelity_log add column if not exists occurred_at timestamptz;
alter table fidelity_log add column if not exists client_id text;
alter table fidelity_log add column if not exists created_at timestamptz default now();

create unique index if not exists fidelity_log_client_id_key on fidelity_log (client_id);

/* ------------------------------------------------------------------------ RLS */
-- Tiap partisipan hanya boleh menyentuh datanya sendiri. Kunci service_role
-- (yang dipakai ekspor data oleh peneliti) melewati semua aturan di bawah ini.
alter table participants       enable row level security;
alter table consents           enable row level security;
alter table pretest_responses  enable row level security;
alter table fidelity_log       enable row level security;

drop policy if exists participants_select_own on participants;
drop policy if exists participants_insert_own on participants;
drop policy if exists participants_update_own on participants;

create policy participants_select_own on participants
  for select to authenticated using (user_id = auth.uid());
create policy participants_insert_own on participants
  for insert to authenticated with check (user_id = auth.uid());
create policy participants_update_own on participants
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pola yang sama untuk semua tabel anak.
do $$
declare
  t text;
begin
  foreach t in array array['consents', 'pretest_responses', 'fidelity_log']
  loop
    execute format('drop policy if exists %I_select_own on %I', t, t);
    execute format('drop policy if exists %I_insert_own on %I', t, t);
    execute format($f$create policy %I_select_own on %I for select to authenticated
      using (participant_id in (select id from participants where user_id = auth.uid()))$f$, t, t);
    execute format($f$create policy %I_insert_own on %I for insert to authenticated
      with check (participant_id in (select id from participants where user_id = auth.uid()))$f$, t, t);
  end loop;
end $$;

-- Login anonim harus aktif: Authentication -> Providers -> Anonymous sign-ins -> Enable.
-- Tanpa itu auth.uid() selalu null dan semua penulisan akan ditolak RLS.
