# Catatan perubahan - FOKUS

Satu baris per perubahan yang berdampak pada data penelitian atau pengalaman partisipan.
Angka yang tertulis di sini harus sama dengan angka di Bab 3.

## 0.6.0 - Checkpoint 6: validitas sosial, ekspor Tau-U, `api/export.js`

- `core/socialValidity.js` - enam pernyataan (skala 1-5) mengikuti tiga jenis
  penilaian Wolf (1978): signifikansi tujuan, kewajaran prosedur, kepentingan hasil,
  plus satu catatan terbuka opsional yang tidak diskor. Satu baris ringkas per
  partisipan (bukan per butir seperti pretest) karena instrumen ini mengukur
  penerimaan, bukan hipotesis utama.
- Layar baru **`#survey`**: router memaksanya begitu `isStudyOver()` benar dan
  `socialValidity` masih kosong, dan tidak bisa dilewati lewat navigasi atau tautan
  langsung. Draf jawaban tersimpan di tiap perubahan, sama seperti pretest.
- Layar baru **`#done`**: terima kasih satu kali setelah validitas sosial terkirim.
  Aplikasi tetap bisa dipakai sesudahnya (fase maintenance) - hanya berhenti mencatat
  data penelitian baru, bukan mengunci aplikasi.
- `db/checkpoint6.sql` - tabel `social_validity`, tambah-saja, RLS insert-only sama
  seperti `sessions`/`nudge_log`.
- **`api/export.js`** - satu-satunya tempat `SUPABASE_SERVICE_ROLE_KEY` dipakai,
  berjalan di server Vercel, dijaga token `x-export-token`. Mengembalikan CSV atau
  JSON untuk tiap tabel penelitian, plus dataset gabungan `tauu`: satu baris per sesi
  dengan kolom tier+phase eksplisit dan fase dipetakan ke kode A (baseline) / B
  (intervensi), siap ditempel ke alat analisis Tau-U tanpa pemetaan ulang. Baris
  pra-studi/maintenance dibuang dari dataset ini supaya tidak mencemari perbandingan
  A/B yang justru diuji Tau-U.
- `core/exportUtils.js` - logika CSV dan pembentukan baris Tau-U dipisah menjadi
  modul murni supaya bisa diuji tanpa jaringan dan tanpa Supabase sungguhan.
- `docs/PANDUAN_UJI_PILOT.md` dan `docs/CHECKLIST_PRA_RILIS.md` - uji pilot 1-3 siswa
  di luar 14 sampel (Bab 3 subbab 3.5) dan daftar periksa sebelum kode partisipan
  sungguhan dibagikan.
- Mode uji: `&sv=1` mensimulasikan `socialValidity` yang sudah terisi, dipakai untuk
  memotret layar `#done` tanpa mengisi formulir. QA visual menambah rute `07-survey`
  dan `08-done`.
- `test/socialValidity.test.js` dan `test/exportUtils.test.js` - 22 test baru; total
  kini 210 lulus, 0 gagal.

## 0.5.0 - Checkpoint 5: nudge adaptif, Dex, Misi, Rank, Co-op

- **Nudge hanya hidup di fase intervensi.** `buildNudge()` mengembalikan `null` saat
  pra-studi, baseline, dan pascastudi. Keputusan itu ada di satu tempat saja
  (`core/nudge.js`), bukan di layar - inilah yang membuat perbandingan baseline vs
  intervensi tetap sah. `db/checkpoint5.sql` menambah pagar kedua: baris `nudge_log`
  dengan `phase <> 'intervention'` ditolak basis data.
- Empat bucket, urutan tetap: `done` > `streakRisk` (hanya mulai pukul 16.00 WIB) >
  `lowEnergy` (rata-rata fokus 2 EMA terakhir < 2,5) > `normal`.
  Durasi yang disarankan 25 / 15 / 10 / 25 menit.
- **Belum ada data EMA tidak dianggap energi rendah.** Tanpa aturan ini, partisipan yang
  baru mulai selalu ditawari sesi 10 menit hanya karena datanya kosong.
- Saran durasi hanya menyorot pilihan, tidak mengunci. Semua durasi tetap bisa ditekan.
- Rotasi anti-habituasi: kalimat yang sama dihindari selama 3 nudge terakhir; tiap bucket
  punya 3 kalimat per profil. Nada Sprout dan Spark berbeda, besar permintaannya sama.
- `nudge_log` mencatat dua peristiwa terpisah, `shown` dan `accepted`, bukan satu baris
  yang diperbarui - antrean sinkron bersifat tambah-saja sehingga pembaruan tidak akan
  pernah sampai. Tanpa baris `shown`, nudge yang diabaikan tak berjejak dan intervensi
  akan selalu tampak lebih efektif daripada kenyataannya. `accepted` dicatat saat sesi
  benar-benar dimulai, bukan saat tombol ditekan.
- **Perbaikan penting: mode uji tidak lagi mengirim data.** Sebelumnya `?mock=1` dan
  `tools/qa-shots.sh` menjalankan alur sungguhan, sehingga sesi, sinyal EMA, dan nudge
  palsu ikut masuk antrean menuju Supabase dan bercampur dengan data partisipan asli.
  `Sync.setDryRun(true)` kini dinyalakan sebelum state palsu dimuat.
- Layar baru: Dex (3 tahap evolusi, terkunci sampai level 1/4/7), Misi (3 misi harian
  yang dihitung dari data nyata), Rank, Co-op.
- **Rank dan Co-op sengaja tanpa papan peringkat dan tanpa nama orang lain.** Yang
  ditampilkan hanya riwayat sendiri dan sumbangan sendiri pada target bersama.
  Perbandingan antarpartisipan akan menambah tekanan sosial sebagai variabel yang tidak
  dikendalikan - dan penelitian ini melibatkan remaja.
- `test/nudge.test.js` - 28 test baru; total 188 lulus, 0 gagal.

## 0.4.0 - Checkpoint 4: EMA

- **Pengingat WhatsApp ditiadakan atas keputusan peneliti.** Sinyal hanya muncul di
  dalam aplikasi. Konsekuensinya: kepatuhan EMA sepenuhnya bergantung pada partisipan
  membuka aplikasi, sehingga pencatatan nonrespons menjadi semakin wajib.
- `core/ema.js` - mesin murni: 3 sinyal/hari, satu per strata (09-12, 13-16, 17-20 WIB),
  jam diacak di dalam strata, jendela jawab 60 menit, `impulse = 6 - control`,
  MANA tetap 12 berapa pun jawabannya.
- `core/emaRuntime.js` - perekat ke Store dan antrean sinkron; dipisah agar seluruh
  aturan penelitian tetap dapat diuji tanpa browser.
- Nonrespons ditulis sebagai baris `ema_entries` dengan `responded = false` dan bentuk
  kolom yang sama persis dengan baris terjawab - bukan dibiarkan kosong.
- Butir kosong tidak lagi bisa tersimpan sebagai jawaban "1". Perbaikan bug: `Number(null)`
  bernilai 0 sehingga butir yang belum diisi terjepit menjadi nilai terendah.
- MANA dipisah dari XP di `Store`. XP dari sesi Kubah, MANA dari kepatuhan EMA;
  digabung berarti kepatuhan kuesioner ikut menaikkan level companion.
- Slot yang jamnya sudah lewat tidak dijadwalkan pada hari pendaftaran, supaya
  partisipan yang mendaftar sore hari tidak langsung punya nonrespons yang bukan salahnya.
- Gerbang router: sinyal yang jatuh tempo didahulukan di atas semua layar kecuali Kubah.
- `db/checkpoint4.sql` - `ema_signals`, `ema_entries` (+ constraint konsistensi
  nonrespons), dan view `ema_compliance` untuk peneliti.
- `test/ema.test.js` - 37 test baru dengan jam & pengacak buatan. Total kini 160 test.
- Mode uji: `?ema=due` menyuntikkan sinyal jatuh tempo; QA visual menambah rute `05-ema`.

## 0.3.0 - Checkpoint 3: Kubah Fokus

- `core/dome.js` - mesin sesi tanpa DOM: klasifikasi tiga tingkat (< 3 detik melirik,
  3-15 detik sebentar, > 15 detik pindah aplikasi), penalti HP 5/10/20, rumus XP,
  deteksi sesi basi (6 jam), dan pembentukan baris data sesi.
- `ui/screens/dome.js` - layar Kubah: pemilihan durasi (10/15/25/45 menit), timer
  jam-dinding dengan gambar ulang 250 ms, bar HP, Wake Lock beserta pengambilan ulang
  saat tab kembali aktif, deteksi `visibilitychange`, disambiguasi satu ketuk, dan
  kartu ringkasan akhir sesi.
- Penalti HP kini dihitung SEBELUM partisipan ditanya alasan keluar aplikasi.
  Alasan yang dipilih tidak pernah mengubah HP - kalau bisa, partisipan akan belajar
  menjawab yang menguntungkan dan variabel dependen jadi tidak sahih.
- Sesi yang ditinggalkan lebih dari 6 jam ditutup sebagai `expired`, bukan dihapus:
  sesi yang ditinggalkan adalah perilaku yang layak dianalisis.
- Streak hanya bertambah untuk sesi `completed`.
- `db/checkpoint3.sql` - tabel `sessions` (tambah-saja, RLS insert-only, `client_id`
  unik untuk deduplikasi setelah offline).
- `test/dome.test.js` - 22 test baru, termasuk uji batas persis di 2.999 / 3.000 /
  15.000 / 15.001 ms. Total kini 123 test.
- `ui/router.js` - rute `dome` diarahkan ke layar sungguhan.
- QA visual menambah rute `04-dome` pada tiga ukuran layar.

## 0.2.0 - Checkpoint 2: onboarding

- Pendaftaran + penetapan tier, consent 4 pernyataan, pretest (APS-S, IUS-12, SMD),
  klasifikasi profil Sprout / Spark, tabel checkpoint 2 di Supabase.

## 0.1.0 - Checkpoint 1: fondasi

- Shell aplikasi, token desain, pustaka komponen, router + gerbang boot, modul `core/`,
  antrean sinkronisasi offline, mode mock, dan gerbang QA visual.
