# Panduan peneliti/pengembang - FOKUS

Untuk peneliti (Dina Syallomitha Simamora, Ester Evangelista Nababan) dan siapa pun
yang menjalankan/memelihara aplikasi ini. Acuan seluruh angka dan prosedur adalah
`Bab_3_Metode_Penelitian.md`; bila dokumen lain berbeda, Bab 3 yang berlaku.

---

## 1. Menjalankan di komputer sendiri

Tidak ada `npm install` - murni HTML/CSS/JavaScript modul, tanpa bundler.

```bash
# server lokal (WAJIB lewat http, bukan buka file:// langsung -
# ES module diblokir CORS pada protokol file://)
python3 -m http.server 4173
# atau: npm run dev
# lalu buka http://localhost:4173

node test/run.js          # test logika inti - harus 100% lulus sebelum dibagikan
bash tools/qa-shots.sh    # QA visual otomatis (butuh Chromium + ImageMagick)
npm run check             # keduanya sekaligus
```

Node minimum v18. Tidak ada langkah build - berkas di repo inilah yang dideploy apa
adanya.

### Mode uji (mock)

Membuka layar mana pun tanpa menunggu studi berjalan sungguhan:

```
http://localhost:4173/?mock=1&tier=3&day=9&level=6&profile=spark&stage=posttest#home
```

| Parameter | Nilai | Arti |
| --- | --- | --- |
| `tier` | 1-4 | tier partisipan simulasi |
| `day` | angka | hari studi yang disimulasikan |
| `level` | angka | level companion |
| `profile` | `sprout` \| `spark` | profil yang disimulasikan |
| `stage` | `pre\|consent\|pretest\|ready\|posttest\|followup\|done` | tahap studi |
| `ema` | `due` \| `post` | ada sinyal EMA terjadwal / pasca-sesi menunggu |
| `sv` | `1` | validitas sosial dianggap sudah terisi |

**Mode ini mati otomatis di domain produksi** - dicek lewat `PRODUCTION_HOSTS` di
`core/config.js`. Selalu verifikasi ini sebelum studi berjalan (lihat checklist §5).

---

## 1.5 Mengaktifkan SDK Supabase (WAJIB, sering terlewat)

`vendor/supabase.umd.js` di repo ini adalah **placeholder**, bukan SDK sungguhan -
ini sengaja, supaya aplikasi tidak bergantung ke CDN pihak ketiga saat sedang
dipakai partisipan di sekolah (lihat komentar `Rejected spec elements` di
`CHANGELOG.md`: memuat SDK langsung dari jsDelivr saat runtime pernah diusulkan
dan ditolak karena berisiko kalau internet sekolah bermasalah persis saat itu).

Tapi placeholder itu harus DIGANTI sekali di komputer Anda sebelum dipakai:

```bash
curl -o vendor/supabase.umd.js \
  https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js
```

Lalu commit hasil unduhan itu ke repo (bukan lagi placeholder). Tanpa langkah ini,
aplikasi tampak berjalan normal - tidak ada error yang menghentikan apa pun - tapi
`window.supabase` tidak pernah ada, sehingga SELURUH data hanya tersimpan di
localStorage tiap HP dan tidak pernah terkirim ke Supabase. Gejalanya persis: konsol
menampilkan `SDK Supabase tidak tersedia - aplikasi berjalan mode lokal.` dan
'antrean sinkron' di layar `#dev` terus bertambah tanpa pernah berkurang.

**Verifikasi setelah mengganti**: buka aplikasi dengan `?debug=1` di URL, buka
konsol browser (F12) - pesan itu harus hilang, dan mengetik `window.supabase` di
konsol harus menghasilkan objek, bukan `undefined`.

## 2. Menyiapkan Supabase

1. Buat proyek Supabase baru (atau pakai yang sudah ada di `core/config.js` /
   environment variable `SUPABASE_URL`).
2. Jalankan berkas `db/checkpoint*.sql` **berurutan** di SQL Editor, dari
   `checkpoint2.sql` sampai yang terbaru (`checkpoint7.sql`). Semuanya idempoten -
   aman dijalankan ulang, tidak menghapus data yang sudah ada.
3. Aktifkan **Authentication > Providers > Anonymous sign-ins** - aplikasi tidak
   memakai akun email/password, setiap perangkat masuk sebagai sesi anonim.
4. Pastikan Row Level Security (RLS) menyala di semua tabel penelitian
   (`participants`, `consents`, `pretest_responses`, `sessions`, `ema_signals`,
   `ema_entries`, `nudge_log`, `social_validity`, `fidelity_log`). Kebijakannya
   sengaja **insert-only** untuk peran `anon`/`authenticated`: perangkat partisipan
   bisa mengirim baris baru, tapi tidak bisa membaca, mengubah, atau menghapus baris
   siapa pun - termasuk baris miliknya sendiri.
5. Simpan kunci `service_role` HANYA sebagai environment variable server
   (`SUPABASE_SERVICE_ROLE_KEY`). Kunci ini dipakai satu-satunya tempat di
   `api/export.js`, dan TIDAK BOLEH pernah muncul di `core/config.js` atau berkas
   lain yang terkirim ke perangkat partisipan. Kalau pernah tertulis di tempat yang
   salah (chat, dokumen, kode klien), **putar ulang (rotate)** dari
   Supabase > Settings > API sebelum lanjut.

---

## 3. Men-deploy ke Vercel

1. Hubungkan repo ke proyek Vercel. Tidak ada framework preset - `vercel.json`
   sudah mengatur header cache dan keamanan dasar (`X-Content-Type-Options`,
   `Referrer-Policy`, `Permissions-Policy`).
2. Isi Environment Variables di Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `EXPORT_TOKEN` (token bebas Anda tentukan, dipakai header `x-export-token` saat
   memanggil `/api/export.js`). `SUPABASE_ANON_KEY` sudah ada di kode klien
   (`core/config.js`), bukan di environment variable server.
3. Daftarkan domain produksi di `PRODUCTION_HOSTS` (`core/config.js`) - kalau
   lupa, siapa pun bisa memakai `?mock=1` di domain sungguhan untuk melihat/menimpa
   tampilan yang dilihat partisipan.
4. Setelah deploy, buka domain produksi TANPA `?mock=1` dan pastikan mode mock
   benar-benar tidak aktif.
5. Naikkan `VERSION` di `sw.js` setiap kali merilis pembaruan berarti (harus sama
   dengan `APP_VERSION` di `core/config.js`) - ini yang membuat pembaruan sampai ke
   HP partisipan tanpa mereka harus menghapus cache manual.

---

## 4. Membagikan kode partisipan

Tier ditentukan oleh kode, bukan dipilih siswa atau diacak aplikasi - pada desain
*multiple-baseline*, tier menentukan kapan intervensi dimulai bagi tiap partisipan.

| Tier | Kode | Baseline | Intervensi | Total |
| --- | --- | --- | --- | --- |
| 1 | `T1-01` .. `T1-04` | 5 hari | 7 hari | 12 hari |
| 2 | `T2-01` .. `T2-04` | 6 hari | 6 hari | 12 hari |
| 3 | `T3-01` .. `T3-03` | 7 hari | 5 hari | 12 hari |
| 4 | `T4-01` .. `T4-03` | 8 hari | 5 hari | 13 hari |

14 kode total. Aplikasi menolak kode di luar daftar ini (mis. `T3-04`) beserta
alasannya. Bagikan satu kode ke satu siswa - jangan sampai satu kode dipakai dua
orang, karena akan mencampur dua rangkaian data dalam satu grafik SCED.

Sebelum membagikan kode sungguhan: selesaikan uji pilot (§`PANDUAN_UJI_PILOT.md`,
1-3 siswa DI LUAR 14 sampel) dan hapus data pilot dari Supabase, lalu tuntaskan
seluruh `docs/CHECKLIST_PRA_RILIS.md`.

---

## 5. Mode peneliti di dalam aplikasi (`#dev`)

Layar diagnostik **hanya-baca** yang bisa dibuka langsung di HP mana pun yang
menjalankan aplikasi - berguna saat berkunjung ke sekolah tanpa membawa laptop.

- **Jalan masuk**: layar Pengaturan -> ketuk **tujuh kali** pada baris nama sekolah
  di bagian bawah.
- **PIN awal: `104729`.** Ganti sebelum pengambilan data sungguhan: hitung
  `sha256('fokus-dev:' + PIN_BARU)` (mis. lewat konsol browser: `await
  crypto.subtle.digest('SHA-256', new TextEncoder().encode('fokus-dev:' + PIN_BARU))`
  lalu ubah ke heksadesimal), tempel hasilnya ke `DEV_PIN_SHA256` di
  `core/config.js`. PIN mentah tidak pernah dituliskan di dalam kode.
- Sesi yang terbuka **otomatis terkunci setelah 30 menit**, dan juga terkunci ulang
  setiap kali aplikasi dibuka dari awal (boot) - supaya HP partisipan tidak
  tertinggal dalam keadaan terbuka.
- Isinya: posisi fase tiap partisipan pada perangkat itu, kepatuhan EMA per fase,
  ringkasan checklist fidelitas, status antrean sinkron ke Supabase, dan tombol
  ekspor CSV/JSON dari perangkat itu saja. **Tidak ada satu tombol pun yang menulis
  ke data penelitian** - kalau Anda perlu mengubah baris data, lakukan lewat
  Supabase langsung dengan `service_role`, bukan lewat aplikasi.

---

## 6. Mengambil data selama studi berjalan

- Pantau kepatuhan lewat layar `#dev` di HP mana pun, atau query langsung ke
  Supabase (`fidelity_log`, kolom `fidelity_ok`).
- `core/compliance.js` menandai (`flagged`) partisipan yang jatuh di bawah ambang
  60% sinyal EMA terjawab ATAU kurang dari 3 titik data sesi pada suatu fase.
  Partisipan yang ditandai **tidak dibuang otomatis** - keputusan menyertakan atau
  mengecualikannya dari analisis tetap ada di tangan peneliti, dilaporkan terpisah.
- `fidelity_log.fidelity_ok` menandai dua penyimpangan fidelitas perlakuan yang
  berlawanan arah: nudge bocor ke fase baseline, dan nudge gagal muncul di fase
  intervensi. Keduanya membatalkan klaim kausal desain multiple-baseline bila
  dibiarkan tanpa catatan.

---

## 7. Mengekspor data setelah studi selesai

`api/export.js` adalah satu-satunya jalan keluar data dari Supabase yang memakai
kunci `service_role`.

```
GET https://<domain-anda>/api/export.js?dataset=<nama>&format=csv
Header: x-export-token: <EXPORT_TOKEN yang Anda tentukan di Vercel>
```

Dataset yang tersedia: `participants`, `sessions`, `ema`, `nudge`, `fidelity`,
`socialValidity`, dan `tauu` (dataset gabungan siap pakai: satu baris per sesi,
fase dipetakan ke kode A (baseline) / B (intervensi), baris pra-studi/maintenance
sudah dibuang supaya tidak mencemari perbandingan A/B yang diuji Tau-U).

Sebelum ekspor akhir:
- Pastikan seluruh 14 partisipan sudah melewati layar `#survey` (validitas sosial) -
  jumlah baris `dataset=socialValidity` harus 14.
- Simpan cadangan CSV/JSON di luar Supabase (mis. Google Drive) sebelum proyek
  Supabase free-tier di-pause karena tidak aktif 7 hari.

---

## 8. Dokumen lain yang perlu dibaca

| Dokumen | Kapan dipakai |
| --- | --- |
| `docs/CHECKLIST_PRA_RILIS.md` | sebelum kode partisipan sungguhan dibagikan |
| `docs/PANDUAN_UJI_PILOT.md` | uji pilot 1-3 siswa di luar sampel |
| `docs/KESESUAIAN_BAB3.md` | pemetaan tiap pasal Bab 3 ke kode, angka yang perlu
  dikonfirmasi pembimbing, dan bagian naskah yang perlu diperbaiki |
| `CHANGELOG.md` | riwayat perubahan yang berdampak pada data penelitian |

## 9. Tiga angka yang menunggu keputusan pembimbing

Dibutuhkan aplikasi, tapi belum disebutkan angkanya di Bab 3. Setelah disepakati,
tuliskan eksplisit di naskah supaya kode dan Bab 3 tidak berbeda.

| Angka | Nilai sekarang | Letak di kode |
| --- | --- | --- |
| Ambang kepatuhan EMA minimum | 60% sinyal terjawab per fase | `core/compliance.js` (`EMA_MIN_RATE`) |
| Titik data sesi minimum per fase | 3 | `core/compliance.js` (`MIN_DATA_POINTS`) |
| Jeda menuju probe follow-up | 7 hari setelah hari terakhir tier | `core/studyStage.js` (`FOLLOWUP_DELAY_DAYS`) |

---

## Tambahan versi 0.8.0

### 1. Layar Pemantauan (data langsung, lintas partisipan)

Masuk lewat **Mode peneliti -> Buka pemantauan studi**, atau langsung ke `#monitor`.
Layar ini meminta **token ekspor** (`EXPORT_TOKEN` di Vercel) satu kali per sesi peramban;
token disimpan di sessionStorage, jadi hilang begitu tab ditutup - aman dipakai di HP pinjaman.

Isinya:

- **Ringkasan**: terdaftar, sudah mulai, aktif hari ini, sesi hari ini, perlu dihubungi.
- **Tabel per partisipan**: hari ke-berapa, fase, terakhir terlihat, sesi hari ini/total,
  menit fokus, rata ketahanan, kepatuhan EMA, fidelitas, dan bendera peringatan.
- **Segarkan otomatis** tiap 30 detik, plus tombol **Unduh CSV**.

Bendera yang dipakai (sengaja sedikit, supaya tidak dilatih untuk diabaikan):

| Bendera | Artinya | Tindakan |
|---|---|---|
| belum mulai | terdaftar, pretest belum tuntas | ingatkan mengisi pretest |
| belum ada data | sudah mulai, belum ada satu baris pun | cek pemasangan aplikasi |
| sunyi N hari | tidak ada data N hari | hubungi hari itu juga |
| EMA di bawah ambang | kepatuhan < 60% | hubungi; jangan buang datanya |
| titik data kurang | sesi tuntas < 3 setelah baseline | perlu perhatian analisis |
| fidelitas N hari | nudge menyimpang dari fase | catat sebagai temuan fidelitas |

**Penting untuk deret waktu:** "terakhir terlihat" dihitung dari TANGGAL DATA, bukan waktu
kiriman. HP yang lama offline lalu mengirim borongan tidak akan terbaca "aktif hari ini".

### 2. Kartu Sinkronisasi di Mode peneliti

Menampilkan sebab kegagalan terakhir dalam bahasa manusia, jumlah antrean, dan **kotak
gagal**. Tombolnya: **Diagnosa koneksi** (hanya baca), **Uji tulis 1 baris**, dan **Kirim
ulang**. Rinciannya di `docs/DIAGNOSA_SUPABASE.md`.

### 3. Asal sekolah

Studi tidak lagi terikat satu sekolah. Kolom `school` opsional diisi partisipan saat
pendaftaran dan baru dikirim setelah consent. Bila ingin membatasi pilihan, isi
`SCHOOL_SUGGESTIONS` di `core/config.js` - itu hanya saran ketik, bukan daftar tertutup.

### 4. Struk Fokus (untuk partisipan)

Partisipan bisa mengunduh ringkasan latihannya sendiri sebagai gambar struk.
**Bentuk struk sengaja identik di fase baseline dan intervensi** dan kalimat penutupnya
tidak bergantung pada performa - bila suatu saat diubah menjadi pujian bersyarat, struk
berubah menjadi bagian dari perlakuan dan merusak atribusi efek nudge.
Ada test otomatis yang menjaga hal ini (`test/insight.test.js`).
