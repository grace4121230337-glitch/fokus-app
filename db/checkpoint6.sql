-- FOKUS - Checkpoint 6: validitas sosial (Wolf, 1978)
-- Idempoten: aman dijalankan berulang di SQL Editor Supabase.
--
-- Satu baris per partisipan, dikirim sekali di akhir studi - berbeda dari
-- pretest_responses yang satu baris per butir. Validitas sosial bukan alat ukur
-- baku dan tidak dipakai untuk menguji hipotesis utama, jadi ringkasan skor per
-- domain (bukan tiap butir mentah) sudah cukup untuk pelaporan.

create table if not exists public.social_validity (
  id                    uuid primary key default gen_random_uuid(),
  participant_id        uuid references public.participants(id) on delete cascade,

  -- client_id dibuat di perangkat. Unik, sehingga pengiriman ulang setelah offline
  -- tidak pernah menghasilkan baris ganda (error 23505 diperlakukan sukses).
  client_id             text not null unique,

  version               text,

  item_1                smallint check (item_1 between 1 and 5),
  item_2                smallint check (item_2 between 1 and 5),
  item_3                smallint check (item_3 between 1 and 5),
  item_4                smallint check (item_4 between 1 and 5),
  item_5                smallint check (item_5 between 1 and 5),
  item_6                smallint check (item_6 between 1 and 5),

  significance_mean     numeric,
  appropriateness_mean  numeric,
  effects_mean          numeric,
  overall_mean          numeric,

  -- Umpan balik terbuka, opsional. Tidak diskor, dibaca manual oleh peneliti.
  note                  text,

  submitted_at          timestamptz,
  app_version           text,
  created_at            timestamptz not null default now()
);

create index if not exists social_validity_participant_idx on public.social_validity (participant_id);

alter table public.social_validity enable row level security;

-- Sisipan bebas dari klien anonim, sama seperti sessions/ema_entries/nudge_log.
-- Tidak ada policy select/update/delete: perangkat hanya mengirim sekali.
-- Peneliti membaca lewat service_role dari /api/export.js, bukan dari aplikasi.
drop policy if exists social_validity_insert on public.social_validity;
create policy social_validity_insert on public.social_validity
  for insert to anon, authenticated with check (true);
