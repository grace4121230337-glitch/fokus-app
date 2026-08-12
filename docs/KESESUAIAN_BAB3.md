# Kesesuaian aplikasi dengan Bab 3 Metode Penelitian

Dokumen ini memetakan tiap ketentuan Bab 3 ke tempatnya di dalam kode, dan mencatat
secara jujur apa yang BELUM sesuai. Acuan tunggalnya adalah `Bab_3_Metode_Penelitian.md`,
bukan proposal - bila keduanya berbeda, Bab 3 yang dipakai.

Status per 0.7.0 (checkpoint 7).

---

## 1. Desain dan partisipan (3.1)

| Ketentuan Bab 3 | Tempat di kode | Status |
| --- | --- | --- |
| SCED multiple-baseline across participants, 14 siswa | `core/tier.js` `N_TOTAL` | sesuai |
| Kuota tier 4-4-3-3 | `core/tier.js` `TIER_SOURCE`, diuji di `test/participant.test.js` | sesuai |
| Baseline bertingkat 5-6-7-8 hari | `TIER_SOURCE[n].baseline` | sesuai |
| Intervensi 7-6-5-5 hari (3.6) | `TIER_SOURCE[n].intervention` | sesuai |
| Total per tier 12-12-12-13 hari | dihitung `tierConfig()`, diuji di `test/tier.test.js` | sesuai |
| Kode partisipan T1-01 dst. | `core/participant.js` | sesuai |

> Catatan: dokumen rancangan yang dikirim belakangan menyebut total 12-12-13-13.
> Angka itu TIDAK dipakai karena bertentangan dengan 3.1 + 3.6.

## 2. Penyaringan dan penempatan profil (3.2, 3.6)

| Ketentuan | Tempat di kode | Status |
| --- | --- | --- |
| Penyaringan memakai APS-S dan/atau IUS-12 | `core/instruments.js` `screenEligibility()` | sesuai |
| Sprout / Spark ditentukan APS-S vs IUS-12 | `classifyProfile()`, `basis: 'APS-S vs IUS-12'` | **diperbaiki di 0.7.0** |
| Aplikasi tidak menolak siswa di layar | `screenEligibility()` hanya menandai | sesuai |

Sebelum 0.7.0 profil dihitung dari IUS-12 vs SMD. Itu keliru: SMD mengukur kecanduan
media sosial, konstruk yang berbeda dari orientasi menghindar/mencari stimulasi
(Ferrari, 1992). Akibatnya sebagian Sprout dilabeli Spark dan menerima nada nudge yang
salah selama seluruh fase intervensi. Diuji di `test/instruments.test.js`, termasuk satu
tes yang memastikan skor SMD tidak lagi memengaruhi penempatan.

## 3. Identitas dan privasi (3.3, 3.6)

| Ketentuan | Tempat di kode | Status |
| --- | --- | --- |
| Nomor WhatsApp di-hash bersalt | `core/identity.js` `hashWa()`, salt di `core/config.js` | **baru di 0.7.0** |
| Nomor asli tidak disimpan | nomor hanya variabel lokal di `ui/screens/register.js` | sesuai |
| Nomor dihapus setelah pascates | `core/studyStage.js` `purgeIdentityPatch()` | **baru di 0.7.0** |
| Bukti penghapusan tercatat | kolom `participants.identity_purged_at` | **baru di 0.7.0** |

Pagar tambahan di basis data: `participants.wa_hash` hanya menerima hex 64 karakter,
sehingga nomor mentah ditolak oleh Postgres bila suatu saat ada kode yang keliru.

## 4. Instrumen (3.4)

| Ketentuan | Tempat di kode | Status |
| --- | --- | --- |
| APS-S 5 butir, IUS-12 12 butir, SMD 9 butir ya/tidak | `core/instruments.js` | sesuai |
| Butir mentah disimpan per butir (untuk hitung ulang alpha) | tabel `pretest_responses` | sesuai |
| EMA harian, tiga sinyal acak berstrata | `core/ema.js` `STRATA` | sesuai |
| **EMA setelah sesi** | `buildPostSessionSignal()` + pemicu di `ui/screens/dome.js` | **baru di 0.7.0** |
| Butir coping pada fase intervensi (3.6) | `COPING_ITEM`, `itemsForPhase()` | **baru di 0.7.0** |
| Konstruk EMA: focus / control / context | `EMA_ITEMS` | sesuai |

Jendela menjawab sinyal pasca-sesi 15 menit (sinyal harian tetap 60 menit), karena
pengukuran yang melekat pada sesi kehilangan maknanya bila dijawab satu jam kemudian.

## 5. Prosedur dan tahap studi (3.6)

| Tahap Bab 3 | Layar / modul | Status |
| --- | --- | --- |
| Persiapan, consent 4 pernyataan | `ui/screens/consent.js` | sesuai |
| Pretes | `ui/screens/pretest.js` | sesuai |
| Baseline: tanpa nudge | `core/nudge.js`, dijaga `test/nudge.test.js` | sesuai |
| Intervensi: nudge + dedupe + butir coping | `core/nudgeRuntime.js`, `core/ema.js` | **coping baru di 0.7.0** |
| **Pascates: APS-S + SMD ulang, sesi refleksi, hapus WA** | `ui/screens/posttest.js` | **baru di 0.7.0** |
| Validitas sosial (3.7) | `ui/screens/survey.js` | sesuai |
| **Follow-up / maintenance: probe durabilitas** | `ui/screens/followup.js`, APS-S saja | **baru di 0.7.0** |
| Penanganan data hilang: ambang kepatuhan minimum | `core/compliance.js` | **baru di 0.7.0** |

Urutan tahap dipaksa oleh `core/studyStage.js` dan gerbang di `ui/router.js`, bukan oleh
tautan navigasi - jadi tidak bisa dilewati dengan mengetik alamat layar secara langsung.
Diuji di `test/studyStage.test.js`.

## 6. Fidelitas perlakuan (3.7)

"Log checklist harian otomatis" diwujudkan `core/fidelity.js` + tabel `fidelity_log`.
Satu baris per partisipan per hari, ditulis untuk hari KEMARIN (hari yang sudah selesai,
sehingga angkanya final). Kolom kuncinya `expected_nudge` vs `nudge_delivered`, sehingga
dua penyimpangan berlawanan arah sama-sama terlihat:

1. nudge bocor ke fase baseline, dan
2. nudge gagal muncul pada fase intervensi.

Keduanya membatalkan klaim kausal multiple-baseline. Persentase fidelitas per partisipan
bisa dilaporkan langsung dari kolom `fidelity_ok`.

## 7. Analisis (3.5)

| Ketentuan | Tempat | Status |
| --- | --- | --- |
| Analisis visual + IOA + Tau-U | dataset `tauu` di `api/export.js` | sesuai |
| Fase dipetakan A (baseline) / B (intervensi) | `core/exportUtils.js` `phase_code` | sesuai |
| Cronbach alpha dihitung ulang pada N=14 | butir mentah di `pretest_responses` | sesuai |

---

## Yang perlu diputuskan pembimbing (angka belum ada di Bab 3)

Tiga angka di bawah dibutuhkan aplikasi tetapi tidak disebutkan Bab 3. Nilai sekarang
adalah usulan; setelah disepakati, tuliskan eksplisit di naskah agar kode dan Bab 3 sama.

| Angka | Nilai sekarang | Letak |
| --- | --- | --- |
| Ambang kepatuhan EMA minimum | 60% sinyal terjawab per fase | `core/compliance.js` `EMA_MIN_RATE` |
| Titik data sesi minimum per fase | 3 | `core/compliance.js` `MIN_DATA_POINTS` |
| Jeda menuju probe follow-up | 7 hari setelah hari terakhir tier | `core/studyStage.js` `FOLLOWUP_DELAY_DAYS` |

Partisipan di bawah ambang **tidak dibuang**. Ia ditandai (`flagged`) dan dilaporkan
terpisah - membuang partisipan pada desain N-kecil menghapus temuan, bukan membersihkannya.

## Yang perlu diperbaiki di naskah, bukan di kode

1. **3.4 menyebut "SMD Scale harian".** SMD adalah instrumen 9 butir ya/tidak dengan
   periode acuan 12 bulan terakhir; menanyakannya tiap hari tidak sah secara psikometri
   dan membebani partisipan. Aplikasi memakai SMD pada pretes dan pascates saja, sedangkan
   pengukuran harian ditangani EMA. Saran: ubah kalimat di 3.4 menjadi SMD pada pretes dan
   pascates, EMA untuk pengukuran harian.
2. **Penalti HP bertingkat** (glance 5 / mid 10 / switch 20) ada di aplikasi tetapi tidak
   disebut Bab 3. Aturan ini memengaruhi variabel dependen `hp_end`, jadi harus tertulis di
   naskah - atau dihapus dari aplikasi. Saran: tambahkan satu paragraf di 3.6.

## Ide dari dokumen rancangan yang TIDAK dipakai

Semuanya ditolak karena bertentangan dengan Bab 3, bukan karena sulit dikerjakan.

| Ide | Alasan ditolak |
| --- | --- |
| Total hari 12-12-13-13 | Bertentangan dengan 3.1 + 3.6 (seharusnya 12-12-12-13) |
| Profil dari IUS-12 vs SMD | 3.2 dan 3.6 menyebut APS-S dan IUS-12 |
| Durasi sesi berbeda per bucket (15 / 10 menit) | Membuat panjang sesi menjadi variabel perancu bagi variabel dependen |
| Partisipan memilih companion sendiri | Profil adalah hasil pengukuran, bukan pilihan |
| Pemilih tier bebas di layar masuk | Tier ditentukan peneliti; pilihan bebas merusak penjadwalan multiple-baseline |
| Supabase lewat CDN jsDelivr | Menambah ketergantungan jaringan pihak ketiga saat pengambilan data di sekolah |
| Pagar mode uji yang lebih longgar | Mode uji harus mati total di domain produksi |
