# FOKUS

Adaptive persuasive web-game berbasis Ecological Momentary Assessment (EMA) untuk
mereduksi prokrastinasi akademik dan distraksi digital pada Generasi Z.

Desain penelitian: **single-case experimental design (SCED), multiple-baseline across
participants**, 4 tier bertingkat, total **14 partisipan**.

---

## Cara menjalankan

Tidak butuh `npm install`. Aplikasi ini HTML + CSS + JavaScript modul murni.

```bash
# 1. Server lokal (WAJIB lewat http, bukan buka file langsung -
#    ES module diblokir CORS pada protokol file://)
python3 -m http.server 4173
# lalu buka http://localhost:4173

# 2. Test logika inti
node test/run.js

# 3. QA visual otomatis (butuh Chromium + ImageMagick)
bash tools/qa-shots.sh
```

### Mode uji (mock)

Membuka layar mana pun tanpa menunggu studi berjalan 13 hari:

```
http://localhost:4173/?mock=1&tier=3&day=9&level=6&profile=spark#home
```

Parameter: `tier` 1-4, `day` hari studi, `level` level companion, `profile`
`sprout|spark`, `stage` `pre|consent|pretest|posttest|followup|done`, `ema`
`due` (sinyal terjadwal menunggu) atau `post` (sinyal pasca-sesi menunggu),
`sv=1` (validitas sosial dianggap sudah terisi).
Mode ini **mati otomatis** di domain produksi (lihat `PRODUCTION_HOSTS` di `core/config.js`).

### Mode peneliti (`#dev`)

Layar diagnostik hanya-baca: posisi fase tiap partisipan, kepatuhan EMA per fase,
ringkasan checklist fidelitas, antrean sinkron, dan ekspor CSV dari perangkat itu.
Tidak ada satu tombol pun yang menulis ke data penelitian.

- Jalan masuk: Pengaturan -> ketuk **tujuh kali** pada baris nama sekolah di bagian bawah.
- PIN awal **104729**. Gantilah sebelum pengambilan data: hitung
  `sha256('fokus-dev:' + PIN_BARU)` lalu tempel hasilnya ke `DEV_PIN_SHA256` di
  `core/config.js`. PIN mentahnya tidak pernah ada di dalam kode.
- Sesi terbuka kedaluwarsa sendiri setelah 30 menit, juga bila aplikasi ditutup -
  supaya HP partisipan tidak tertinggal dalam keadaan terbuka.

---

## Struktur

```
index.html               kerangka aplikasi + SATU navigasi untuk semua layar
manifest.webmanifest     PWA
sw.js                    service worker (aset cache-first, data tidak pernah di-cache)
vercel.json              header cache & keamanan

assets/css/tokens.css    SATU-SATUNYA sumber warna, jarak, radius, font
assets/css/base.css      reset + tata letak
assets/css/components.css semua komponen visual
assets/{img,icon,font,pwa} aset hasil optimasi (1,2 MB dari 55 MB sumber)

core/env.js              lapis lingkungan (agar core/ bisa diuji di Node)
core/config.js           kredensial klien + kunci penyimpanan
core/tier.js             tier, hari studi, fase SCED, tanggal WIB
core/progress.js         XP, level, evolusi companion, streak
core/store.js            state tunggal + persistensi
core/supabase.js         antrean sinkron offline-first
core/mock.js             mode uji

ui/components.js         pustaka komponen (dipakai SEMUA layar)
ui/router.js             gerbang boot + routing
ui/screens/              satu berkas per layar

test/                    test tanpa dependensi (node test/run.js)
tools/qa-shots.sh        gerbang QA visual multi-ukuran
```

---

## Aturan yang tidak boleh dilanggar

1. **Nilai visual hanya dari `tokens.css`.** Tidak ada warna/jarak mentah di file lain.
2. **Komponen dibuat sekali di `ui/components.js`.** Layar memanggil, tidak menulis ulang.
   (Audit desain Stitch menemukan 4 versi navigasi dan 2 versi Kubah - ini pencegahnya.)
3. **State hanya lewat `Store`.** Layar tidak menyimpan datanya sendiri.
4. **Tulis lokal dulu, kirim belakangan.** UI tidak pernah menunggu jaringan.
5. **Nudge tailored dilarang pada fase baseline.** Kalau bocor, desain multiple-baseline
   runtuh dan data tidak bisa dipakai.
6. **`service_role` key tidak pernah masuk repo.** Hanya di Environment Variables Vercel.

---

## Status pembangunan

- [x] **Checkpoint 1** - fondasi: shell, token desain, komponen, router + gerbang boot,
      `core/` (env, config, tier, progress, store, supabase, mock), 60+ test, gerbang QA visual
- [x] Checkpoint 2 - onboarding: pendaftaran + tier, consent 4 pernyataan, pretest
      (APS-S, IUS-12, SMD) + klasifikasi profil
- [x] Checkpoint 3 - Kubah Fokus: timer jam-dinding, HP, Wake Lock, deteksi 3 tingkat,
      disambiguasi 1 ketuk, ringkasan sesi, tabel `sessions`
- [x] Checkpoint 4 - EMA: penjadwal acak berstrata, jendela 60 menit, nonrespons sebagai data,
      MANA tetap 12, tabel `ema_signals` + `ema_entries`
      (dalam aplikasi saja - fitur WhatsApp ditiadakan atas keputusan peneliti)
- [x] Checkpoint 5 - nudge adaptif (4 bucket, mati total saat baseline), Dex, Misi,
      Rank tanpa papan peringkat, Co-op tanpa nama orang lain, `db/checkpoint5.sql`
- [x] Checkpoint 6 - validitas sosial, ekspor Tau-U, `api/export.js`, daftar periksa rilis

---

## Checkpoint 2 - onboarding (pendaftaran, consent, pratest)

### 1. Jalankan skema database

Buka Supabase > **SQL Editor** > New query, tempel **seluruh isi `db/checkpoint2.sql`**, Run.

Berkas ini **idempotent**: aman dijalankan berulang kali. Kalau sebelumnya Anda pernah
mendapat `ERROR: 42P07: relation "participants" already exists`, itu karena skrip lama
memakai `create table` biasa - versi ini memakai `if not exists`, jadi galat tersebut
tidak akan terulang.

Dua hal yang sering keliru:

- Yang ditempel ke SQL Editor **hanya SQL**. Menempelkan potongan HTML ke sana
  menghasilkan `ERROR: 42601: syntax error at or near "<"`.
- Setelah itu, aktifkan **Authentication > Providers > Anonymous sign-ins**. Tanpa itu
  `ensureAuth()` gagal, dan seluruh baris akan tertahan di antrean sinkronisasi.

Tabel yang dibuat: `participants`, `consents`, `pretest_responses`, `fidelity_log`
(lengkap dengan RLS: tiap perangkat hanya bisa membaca dan menulis barisnya sendiri).
Tabel `sessions`, `ema_signals`, `ema_entries`, dan `social_validity` menyusul pada
checkpoint berikutnya.

### 2. Kode partisipan - cetak sebelum hari pengambilan data

Tier partisipan **tidak dipilih sendiri oleh siswa**, dan juga tidak diacak aplikasi.
Tier ditentukan oleh kodenya, karena pada desain *multiple-baseline* tier menentukan
kapan intervensi dimulai - itu keputusan peneliti, bukan preferensi partisipan.

| Tier | Kode | Baseline | Intervensi | Total |
|------|------|----------|------------|-------|
| 1 | `T1-01` `T1-02` `T1-03` `T1-04` | 5 hari | 7 hari | 12 hari |
| 2 | `T2-01` `T2-02` `T2-03` `T2-04` | 6 hari | 6 hari | 12 hari |
| 3 | `T3-01` `T3-02` `T3-03` | 7 hari | 5 hari | 12 hari |
| 4 | `T4-01` `T4-02` `T4-03` | 8 hari | 5 hari | 13 hari |

Total 14 kode, sesuai jumlah partisipan. Aplikasi menolak kode di luar daftar ini
(misalnya `T3-04`) beserta alasannya, sehingga satu siswa tidak bisa masuk ke tier
yang bukan miliknya.

### 3. Alur onboarding

1. **`#register`** - memasukkan kode. Tidak ada data yang dikirim ke server di layar ini.
2. **`#consent`** - empat pernyataan dicentang terpisah. Pengiriman pertama ke Supabase
   terjadi tepat setelah persetujuan diberikan, tidak sebelumnya.
3. **`#pretest`** - APS-S (5 butir), IUS-12 (12 butir), SMD (9 butir), satu instrumen per
   halaman. Draf jawaban tersimpan, jadi aplikasi yang tertutup di tengah pengisian tidak
   memaksa siswa mengulang dari awal. Butir kosong **tidak** dihitung nol.
4. Hasil pratest menentukan profil pendamping (Sprout / Spark) dan menetapkan **hari ke-1**
   sebagai tanggal (WIB) pratest diselesaikan - supaya hari pertama data tidak habis
   dipakai mengisi kuesioner.

Skor mentah **tidak diperlihatkan** kepada partisipan. Memberi tahu siswa "skor
prokrastinasimu 21 dari 25" berisiko menjadi label yang ia bawa selama program, dan itu
memengaruhi variabel yang sedang diukur.

### 4. Yang masih menunggu keputusan Anda

- Redaksi **empat pernyataan consent** masih draf (`CONSENT_VERSION = '2026-08-draft-1'`)
  dan perlu persetujuan pembimbing. Pernyataan ke-4 adalah izin orang tua/wali.
- **Ambang kelayakan** `APS-S >= 15` atau `IUS-12 >= 36` adalah usulan saya; Bab 3 hanya
  menyebut "skor ambang tertentu" tanpa angka. Statusnya **dicatat, tidak memblokir**.
- **Periode SMD** disetel "Selama 12 bulan terakhir" mengikuti instrumen aslinya.
- Bab 3 sub-bab 3.6 menyebut penyaringan dengan APS-S dan/atau IUS-12, sedangkan aplikasi
  juga memakai SMD untuk penempatan profil - perlu disamakan di naskah.

---

## Checkpoint 6 - validitas sosial, ekspor Tau-U

### 1. Jalankan skema database

Tempel **seluruh isi `db/checkpoint6.sql`** di SQL Editor Supabase, Run. Idempotent
seperti skrip sebelumnya. Menambah tabel `social_validity` (satu baris ringkas per
partisipan, bukan per butir - lihat catatan di dalam berkas SQL-nya).

### 2. Alur akhir studi

1. Begitu hari studi partisipan melewati total tier-nya (`isStudyOver()`), router
   memaksa layar **`#survey`** sebelum layar lain mana pun - tidak bisa dilewati lewat
   navigasi atau tautan langsung.
2. Enam pernyataan (skala 1-5) mengikuti tiga jenis penilaian Wolf (1978): signifikansi
   tujuan, kewajaran cara, kepentingan hasil - plus satu catatan terbuka opsional.
   Draf tersimpan di tiap perubahan, sama seperti pretest.
3. Setelah terkirim, gerbang itu tidak muncul lagi (`socialValidity` di Store sudah
   terisi) dan partisipan diarahkan ke **`#done`** - layar terima kasih satu kali.
4. Aplikasi tetap bisa dipakai sesudahnya (fase *maintenance*): tidak ada lagi sesi,
   sinyal harian, atau nudge yang tercatat untuk penelitian.

### 3. Ekspor data peneliti - `/api/export.js`

Satu-satunya tempat `SUPABASE_SERVICE_ROLE_KEY` dipakai, dan hanya berjalan di server
Vercel - kunci ini tidak pernah ada di kode yang dikirim ke perangkat partisipan.

**Environment Variables** (Vercel > Settings > Environment Variables):

| Nama | Isi |
|---|---|
| `SUPABASE_URL` | sama dengan yang dipakai `core/config.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | kunci `service_role` dari Supabase > Settings > API |
| `EXPORT_TOKEN` | kata sandi ekspor buatan Anda sendiri, bebas, cukup panjang dan acak |

**Cara memakai** (ganti `TOKEN` dan domain sesuai proyek Anda):

```bash
# Semua sesi Kubah, format CSV
curl -H "x-export-token: TOKEN" \
  "https://fokus-app.vercel.app/api/export?dataset=sessions" -o sessions.csv

# Siap tempel ke alat analisis Tau-U: satu baris per sesi, kolom tier+phase eksplisit,
# fase dipetakan ke A (baseline) / B (intervensi); baris pra-studi/maintenance dibuang.
curl -H "x-export-token: TOKEN" \
  "https://fokus-app.vercel.app/api/export?dataset=tauu&measure=hp_end" -o tauu-hp.csv

# Format JSON untuk dataset apa pun
curl -H "x-export-token: TOKEN" \
  "https://fokus-app.vercel.app/api/export?dataset=fidelity&format=json"
```

Dataset yang tersedia: `participants`, `sessions`, `ema`, `nudge`, `fidelity`,
`socialValidity`, dan `tauu` (gabungan siap analisis, parameter `measure` salah satu
dari `hp_end`, `away_total_sec`, `away_glance`, `away_mid`, `away_switch`,
`elapsed_sec`, `xp_awarded`).

Kalau membuka tautan itu langsung di browser (tanpa `curl`), tambahkan `&token=TOKEN`
di URL sebagai ganti header - cara ini kurang aman untuk dibagikan tapi cukup untuk
sekali unduh oleh Anda sendiri.

### 4. Sebelum uji pilot dan pengambilan data sungguhan

Baca `docs/CHECKLIST_PRA_RILIS.md` dan `docs/PANDUAN_UJI_PILOT.md` sebelum kode
partisipan dibagikan. Uji pilot (Bab 3 subbab 3.5) memakai 1-3 siswa **di luar** 14
sampel penelitian.
