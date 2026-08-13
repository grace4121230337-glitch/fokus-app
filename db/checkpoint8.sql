-- FOKUS - Checkpoint 8: partisipan lintas sekolah + penanda baris uji sinkronisasi.
--
-- Idempoten dan TAMBAH-SAJA: aman dijalankan berulang, tidak menghapus atau mengganti
-- nama kolom mana pun, sehingga data checkpoint 2-7 tetap utuh dan perangkat yang
-- belum memperbarui aplikasi tetap bisa mengirim baris lama.
--
-- Jalankan SETELAH checkpoint2.sql sampai checkpoint7.sql, di SQL Editor Supabase.

-- ---------------------------------------------------------------------------
-- 1. Asal sekolah partisipan
--
-- Sampai versi 0.7.0 nama satu sekolah tertulis langsung di layar aplikasi dan tidak
-- ada kolomnya di basis data - asumsinya seluruh partisipan berasal dari sekolah yang
-- sama. Begitu partisipan datang dari lebih dari satu sekolah, asumsi itu bukan hanya
-- salah di layar: tanpa kolom ini, analisis tidak bisa memeriksa apakah perbedaan
-- antarpartisipan sebenarnya perbedaan antarsekolah (jam masuk, kebijakan HP, jadwal
-- ujian). Untuk desain multiple-baseline dengan 14 partisipan, sekolah adalah variabel
-- konteks yang paling mungkin menjelaskan pola yang tidak terduga.
--
-- Nullable dengan sengaja: partisipan yang sudah mendaftar sebelum pembaruan ini tidak
-- boleh gagal mengirim data hanya karena kolom baru. Isian ini juga opsional di aplikasi.
-- ---------------------------------------------------------------------------
alter table public.participants add column if not exists school text;

-- Dipakai layar pemantauan untuk mengelompokkan partisipan per sekolah.
create index if not exists participants_school_idx on public.participants (school);

-- ---------------------------------------------------------------------------
-- 2. Baris uji sinkronisasi
--
-- Layar diagnostik peneliti punya tombol "Uji tulis" yang menulis SATU baris ke
-- fidelity_log dengan event = 'sync_self_test'. Itu satu-satunya cara membuktikan izin
-- INSERT benar-benar berfungsi: pemeriksaan hanya-baca bisa lolos sepenuhnya sementara
-- setiap penulisan tetap ditolak RLS, dan justru kombinasi itulah yang membuat data
-- "tidak masuk" tanpa pesan kesalahan apa pun.
--
-- Konsekuensinya baris uji ikut tersimpan di tabel penelitian. Indeks di bawah membuat
-- baris itu mudah ditemukan dan dibuang sebelum analisis:
--
--   select count(*) from public.fidelity_log where event = 'sync_self_test';
--   delete from public.fidelity_log where event = 'sync_self_test';
--
-- Baris uji tidak mengisi satu pun kolom fidelitas (fidelity_ok, expected_nudge, ...),
-- jadi ia tidak akan terbaca sebagai hari fidelitas walaupun lupa dihapus.
-- ---------------------------------------------------------------------------
create index if not exists fidelity_log_selftest_idx
  on public.fidelity_log (event) where event = 'sync_self_test';

-- ---------------------------------------------------------------------------
-- 3. Kolom baru untuk EMA pasca-sesi (0.8.0)
--
-- Versi 0.8.0 menambahkan EMA pasca-sesi. Sinyal ini punya tipe khusus dan
-- terikat pada sesi tertentu.
-- ---------------------------------------------------------------------------
alter table public.ema_signals add column if not exists signal_type text default 'scheduled';
alter table public.ema_signals add column if not exists session_id uuid references public.sessions(id) on delete cascade;

alter table public.ema_entries add column if not exists signal_type text default 'scheduled';
alter table public.ema_entries add column if not exists session_id uuid references public.sessions(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 4. Indeks pemantauan harian
--
-- /api/monitor.js membaca seluruh baris lalu meringkasnya per partisipan setiap 30
-- detik. Dengan 14 partisipan selama 14 hari jumlah barisnya kecil, tetapi indeks ini
-- membuat kueri tetap murah bila studi diperluas ke lebih banyak sekolah.
-- ---------------------------------------------------------------------------
create index if not exists sessions_date_idx    on public.sessions (session_date);
create index if not exists ema_signals_sched_idx on public.ema_signals (scheduled_at);

-- ---------------------------------------------------------------------------
-- CATATAN PENTING - penyebab tersering "data tidak masuk ke Supabase":
--
--   Authentication -> Providers -> Anonymous sign-ins -> Enable
--
-- Tanpa itu auth.uid() selalu null, seluruh kebijakan RLS di checkpoint2.sql menolak
-- penulisan, dan aplikasi hanya menampilkan antrean sinkron yang tidak pernah berkurang.
-- Sejak versi 0.8.0 aplikasi menyimpan sebab kegagalan dan menampilkannya di layar
-- mode peneliti, serta TIDAK LAGI membuang baris yang gagal terkirim.
-- ---------------------------------------------------------------------------
