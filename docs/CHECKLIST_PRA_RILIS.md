# Daftar periksa pra-rilis - FOKUS

Selesaikan seluruh daftar ini SEBELUM kode partisipan (`T1-01` ... `T4-03`) dibagikan
ke 14 siswa sampel. Setiap baris yang belum dicentang adalah risiko data hilang atau
tidak sahih yang tidak bisa diperbaiki setelah studi berjalan.

## Kode dan gerbang
- [ ] `node test/run.js` lulus 100% (lihat angka di `CHANGELOG.md` versi terbaru).
- [ ] `bash tools/qa-shots.sh` lulus tanpa tangkapan kosong/gagal.
- [ ] Uji pilot (`docs/PANDUAN_UJI_PILOT.md`) selesai dan temuannya sudah diperbaiki.
- [ ] Data uji pilot sudah dihapus dari Supabase.

## Berkas SDK (paling sering terlewat)
- [ ] `vendor/supabase.umd.js` sudah DIGANTI dari placeholder dengan SDK Supabase
      sungguhan (lihat komentar di dalam berkas itu untuk URL unduhan). Kalau ini
      terlewat, aplikasi tampak berjalan normal tapi TIDAK ADA data yang pernah
      sampai ke Supabase - hanya tersimpan di localStorage tiap HP. Verifikasi:
      buka `?debug=1`, konsol browser TIDAK boleh menampilkan 'SDK Supabase tidak
      tersedia', dan `window.supabase` di konsol harus berupa objek, bukan `undefined`.

## Supabase
- [ ] `db/checkpoint2.sql` sampai `db/checkpoint6.sql` sudah dijalankan berurutan di
      SQL Editor proyek Supabase yang SAMA dengan yang dipakai `core/config.js`.
- [ ] **Authentication > Providers > Anonymous sign-ins** aktif.
- [ ] Kunci `service_role` (dipakai `/api/export.js`) TIDAK pernah dipakai di
      `core/config.js` atau file mana pun yang terkirim ke perangkat partisipan.
      Kalau kunci ini pernah tertulis di tempat yang salah (chat, dokumen, kode klien),
      **putar ulang (rotate)** dari Supabase > Settings > API sebelum lanjut.
- [ ] Tabel `participants`, `consents`, `pretest_responses`, `fidelity_log`,
      `sessions`, `ema_signals`, `ema_entries`, `nudge_log`, `social_validity`
      semuanya ada dan RLS-nya menyala (`enable row level security`).

## Vercel
- [ ] Environment Variables terisi: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `EXPORT_TOKEN`. (`SUPABASE_ANON_KEY` ada di kode klien, bukan di sini.)
- [ ] Domain produksi terdaftar di `PRODUCTION_HOSTS` (`core/config.js`) - kalau tidak,
      mode mock (`?mock=1`) bisa dipakai orang lain untuk melihat/menimpa tampilan di
      domain sungguhan.
- [ ] Buka domain produksi tanpa `?mock=1` dan pastikan mode mock benar-benar mati.
- [ ] Coba `/api/export.js` sekali dari domain produksi dengan token yang benar
      (harus berhasil) dan dengan token salah/kosong (harus ditolak 401).

## Materi non-kode
- [ ] Redaksi consent sudah disetujui pembimbing, termasuk pernyataan izin
      orang tua/wali.
- [ ] Ambang kelayakan skrining dan periode SMD sudah dikonfirmasi sesuai Bab 3 final.
- [ ] 14 kode partisipan (`T1-01` ... `T4-03`) sudah dicetak/disiapkan untuk dibagikan,
      beserta tier masing-masing (lihat tabel di `README.md`).
- [ ] Peneliti tahu cara menjalankan `bash tools/qa-shots.sh` sendiri kalau perlu
      memeriksa ulang tampilan setelah pembaruan kode.

## Setelah studi selesai
- [ ] Semua 14 partisipan sudah melewati layar `#survey` (validitas sosial) - cek
      lewat `dataset=socialValidity` di `/api/export.js`, jumlah baris harus 14.
- [ ] Ekspor `dataset=tauu` untuk ukuran yang dipakai Bab 4, verifikasi jumlah baris
      per partisipan masuk akal (kira-kira sama dengan jumlah hari studi tier-nya).
- [ ] Backup CSV/JSON hasil ekspor disimpan di luar Supabase (mis. Google Drive)
      sebelum proyek Supabase free-tier di-pause karena tidak aktif 7 hari.

---

## Tambahan 0.8.0 (wajib sebelum studi berjalan)

- [ ] **Authentication -> Providers -> Anonymous sign-ins -> Enable.** Tanpa ini seluruh
      penulisan ditolak RLS dan tabel akan tetap kosong walau aplikasi terlihat normal.
- [ ] Jalankan `db/checkpoint8.sql` (setelah checkpoint2 dan checkpoint7).
- [ ] Set `EXPORT_TOKEN` di Vercel - dipakai `/api/export` dan `/api/monitor`.
- [ ] Buka `#dev` -> **Diagnosa koneksi**: keempat langkah harus [OK].
- [ ] Tekan **Uji tulis 1 baris**, pastikan barisnya terlihat di Table Editor, lalu hapus:
      `delete from fidelity_log where event = 'sync_self_test';`
- [ ] Buka `#monitor` dengan token, pastikan tabel tampil dan CSV terunduh.
- [ ] Buka Struk Fokus, unduh gambarnya di satu HP Android dan satu iPhone.
- [ ] Opsional: letakkan `html2canvas.min.js` asli di `/vendor/` bila ingin memakai
      pustaka itu; tanpa berkas tersebut aplikasi memakai penggambar kanvas bawaan.
- [ ] Nonaktifkan Vercel Deployment Protection untuk domain produksi.
- [ ] Putar (rotate) service_role key bila pernah tersalin ke chat atau dokumen.
