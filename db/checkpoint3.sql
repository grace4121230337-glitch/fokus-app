-- FOKUS - Checkpoint 3: tabel sesi Kubah Fokus
-- Idempoten: aman dijalankan berulang di SQL Editor Supabase.
--
-- Prinsip yang sama dengan checkpoint 2: data penelitian bersifat TAMBAH-SAJA.
-- Partisipan boleh menulis, tidak boleh mengubah atau menghapus. Sekali satu sesi
-- tercatat, ia tidak bisa "dirapikan" belakangan - itu syarat integritas data SCED.

create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid references public.participants(id) on delete cascade,

  -- client_id dibuat di perangkat. Unik, sehingga sinkronisasi ulang setelah
  -- offline tidak pernah menghasilkan sesi ganda (error 23505 diperlakukan sukses).
  client_id       text not null unique,

  tier            smallint,
  phase           text,
  study_day       smallint,
  session_date    date,

  planned_minutes smallint not null,
  elapsed_sec     integer  not null default 0,
  hp_end          smallint not null default 100,
  outcome         text     not null check (outcome in ('completed','broken','aborted','expired')),
  xp_awarded      integer  not null default 0,

  -- Diisi mulai checkpoint 5. Kolomnya dibuat sekarang supaya sesi fase baseline
  -- punya bentuk baris yang sama persis (nudge_bucket = null) dengan fase intervensi.
  nudge_bucket    text,

  -- Variabel dependen perilaku: cacah gangguan per jenis.
  away_glance     smallint not null default 0,
  away_mid        smallint not null default 0,
  away_switch     smallint not null default 0,
  away_total_sec  integer  not null default 0,
  -- Rincian tiap peristiwa (waktu, durasi, jenis, penalti, alasan) untuk analisis lanjutan.
  away_marks      jsonb    not null default '[]'::jsonb,

  wake_lock       boolean  not null default false,
  app_version     text,
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz not null default now()
);

-- Indeks mengikuti bentuk kueri analisis: per partisipan, urut waktu.
create index if not exists sessions_participant_idx on public.sessions (participant_id, started_at);
create index if not exists sessions_phase_idx       on public.sessions (phase, study_day);

alter table public.sessions enable row level security;

-- Sisipan bebas dari klien anonim (perangkat partisipan memakai anonymous sign-in).
drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions
  for insert to anon, authenticated with check (true);

-- Tidak ada policy select/update/delete: perangkat hanya mengirim, tidak menarik
-- maupun mengubah data. Peneliti membaca lewat service_role (mengabaikan RLS)
-- dari sisi server, bukan dari aplikasi.
