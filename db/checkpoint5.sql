-- FOKUS - Checkpoint 5: catatan nudge adaptif
-- Idempoten: aman dijalankan berulang di SQL Editor Supabase.
--
-- Kolom sessions.nudge_bucket sudah dibuat di checkpoint3.sql. Tabel di sini
-- menjawab pertanyaan yang TIDAK bisa dijawab kolom itu: nudge apa saja yang
-- ditampilkan tetapi TIDAK diikuti sesi.
--
-- Tanpa tabel ini, nudge yang diabaikan tidak meninggalkan jejak apa pun, dan
-- perhitungan efek intervensi hanya melihat nudge yang berhasil. Itu bias yang
-- arahnya selalu sama: membuat intervensi tampak lebih efektif daripada kenyataannya.

create table if not exists public.nudge_log (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants(id) on delete cascade,
  client_id      text not null unique,          -- '<tanggal>-<bucket>-<event>'

  -- Dua baris per nudge: 'shown' saat tampil, 'accepted' saat sesi benar-benar dimulai.
  -- Sengaja bukan satu baris dengan kolom accepted yang diperbarui: antrean sinkron
  -- bersifat tambah-saja, jadi pembaruan tidak akan pernah sampai ke server.
  event          text not null check (event in ('shown','accepted')),

  nudge_bucket   text check (nudge_bucket in ('done','streakRisk','lowEnergy','normal')),
  nudge_text     text,
  minutes_offered smallint,

  profile        text,
  tier           smallint,
  phase          text,
  study_day      smallint,
  entry_date     date,
  occurred_at    timestamptz,
  app_version    text,
  created_at     timestamptz not null default now()
);

create index if not exists nudge_log_participant_idx on public.nudge_log (participant_id, entry_date);
create index if not exists nudge_log_bucket_idx      on public.nudge_log (nudge_bucket, event);

-- Pagar validitas di sisi basis data.
--
-- Nudge hanya boleh ada di fase intervensi. Kalau suatu saat ada versi aplikasi yang
-- keliru dan mengirim nudge saat baseline, penolakan harus terjadi DI SINI - bukan
-- ketahuan berbulan-bulan kemudian saat data dianalisis, ketika partisipannya sudah
-- tidak bisa diulang. Constraint ini murah; kehilangan satu partisipan tidak.
alter table public.nudge_log drop constraint if exists nudge_log_intervention_only;
alter table public.nudge_log add constraint nudge_log_intervention_only
  check (phase = 'intervention');

alter table public.nudge_log enable row level security;

drop policy if exists nudge_log_insert on public.nudge_log;
create policy nudge_log_insert on public.nudge_log
  for insert to anon, authenticated with check (true);

-- Tingkat penerimaan nudge per bucket. Dibaca peneliti lewat service_role.
--
-- Angka inilah yang menjelaskan hasil yang "tidak masuk akal": bucket dengan efek
-- kecil sering kali bukan bucket dengan kalimat yang buruk, melainkan bucket yang
-- nudge-nya jarang diikuti sama sekali.
create or replace view public.nudge_acceptance as
select
  participant_id,
  nudge_bucket,
  count(*) filter (where event = 'shown')    as shown,
  count(*) filter (where event = 'accepted') as accepted,
  round(
    count(*) filter (where event = 'accepted')::numeric
    / nullif(count(*) filter (where event = 'shown'), 0), 2
  ) as acceptance_rate
from public.nudge_log
group by participant_id, nudge_bucket;
