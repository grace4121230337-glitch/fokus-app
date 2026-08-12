-- FOKUS - Checkpoint 4: jadwal & jawaban EMA
-- Idempoten: aman dijalankan berulang di SQL Editor Supabase.
--
-- Dua tabel, dua pertanyaan yang berbeda:
--   ema_signals  menjawab "sinyal apa saja yang DIKIRIM ke partisipan ini?"
--   ema_entries  menjawab "apa yang terjadi pada tiap sinyal itu?"
-- Pemisahan ini yang membuat tingkat kepatuhan bisa dihitung. Kalau hanya ada tabel
-- jawaban, penyebutnya hilang: sinyal yang tidak dijawab tidak meninggalkan jejak
-- apa pun, dan kepatuhan 40% akan terlihat sama bersihnya dengan kepatuhan 100%.

-- ---------------------------------------------------------------------------
-- Jadwal sinyal (dibuat di perangkat, dikirim sekali saat dibuat)
-- ---------------------------------------------------------------------------
create table if not exists public.ema_signals (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants(id) on delete cascade,
  signal_id      text not null unique,          -- 'YYYY-MM-DD-<strata>-<acak>'
  scheduled_at   timestamptz not null,
  stratum        smallint,                      -- 0 pagi, 1 siang, 2 malam
  study_day      smallint,
  tier           smallint,
  phase          text,
  status         text default 'pending' check (status in ('pending','answered','missed')),
  created_at     timestamptz not null default now()
);

create index if not exists ema_signals_participant_idx on public.ema_signals (participant_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- Jawaban EMA - termasuk nonrespons
-- ---------------------------------------------------------------------------
-- Kolom-kolom di bawah dibuat nullable dengan sengaja: baris nonrespons memakai
-- bentuk yang sama persis dengan baris terjawab, hanya dengan responded = false.
-- Dengan begitu analisis cukup membaca satu tabel.
create table if not exists public.ema_entries (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants(id) on delete cascade,
  client_id      text not null unique,          -- idempotensi sinkronisasi
  signal_id      text,                          -- kaitan ke ema_signals

  tier           smallint,
  phase          text,
  study_day      smallint,
  entry_date     date,
  hour_wib       smallint,
  stratum        smallint,

  focus          smallint check (focus   between 1 and 5),
  control        smallint check (control between 1 and 5),
  context        smallint check (context between 1 and 5),
  -- impulse dihitung di klien sebagai 6 - control dan disimpan apa adanya.
  -- Sengaja BUKAN kolom generated: kalau rumusnya berubah di tengah studi,
  -- kolom generated akan menulis ulang data lama dan merusak jejak riwayat.
  impulse        smallint check (impulse between 1 and 5),

  responded      boolean not null default true,
  latency_sec    integer,
  mana_awarded   smallint not null default 0,
  scheduled_at   timestamptz,
  answered_at    timestamptz,
  app_version    text,
  created_at     timestamptz not null default now()
);

create index if not exists ema_entries_participant_idx on public.ema_entries (participant_id, entry_date);
create index if not exists ema_entries_phase_idx       on public.ema_entries (phase, study_day);

-- Konsistensi baris nonrespons: kalau responded = false, butir wajib kosong.
-- Ini pagar terakhir bila suatu saat ada kode yang keliru mengirim jawaban
-- untuk sinyal yang sebenarnya terlewat.
alter table public.ema_entries drop constraint if exists ema_entries_missing_is_blank;
alter table public.ema_entries add constraint ema_entries_missing_is_blank check (
  responded = true
  or (focus is null and control is null and context is null and impulse is null)
);

-- ---------------------------------------------------------------------------
-- RLS: perangkat hanya menyisipkan, tidak membaca dan tidak mengubah
-- ---------------------------------------------------------------------------
alter table public.ema_signals enable row level security;
alter table public.ema_entries enable row level security;

drop policy if exists ema_signals_insert on public.ema_signals;
create policy ema_signals_insert on public.ema_signals
  for insert to anon, authenticated with check (true);

drop policy if exists ema_entries_insert on public.ema_entries;
create policy ema_entries_insert on public.ema_entries
  for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Tampilan bantu untuk peneliti: kepatuhan EMA per partisipan per fase.
-- Dibaca lewat service_role dari sisi server, bukan dari aplikasi partisipan.
-- ---------------------------------------------------------------------------
create or replace view public.ema_compliance as
select
  participant_id,
  phase,
  study_day,
  count(*)                                              as delivered,
  count(*) filter (where responded)                     as answered,
  count(*) filter (where not responded)                 as missed,
  round(avg(case when responded then focus end)::numeric, 2)   as focus_mean,
  round(avg(case when responded then impulse end)::numeric, 2) as impulse_mean,
  round(avg(latency_sec)::numeric, 0)                   as latency_mean_sec
from public.ema_entries
group by participant_id, phase, study_day;
