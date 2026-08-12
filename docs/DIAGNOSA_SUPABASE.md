# Kenapa Supabase Masih Kosong - Panduan Diagnosa

Dokumen ini untuk satu keluhan spesifik: **SDK sudah termuat, aplikasi tidak menampilkan
error, tetapi tabel di Supabase tetap kosong.**

Urutkan dari atas. Sembilan dari sepuluh kasus berhenti di langkah 1.

---

## Ringkasan penyebab, diurutkan dari yang paling sering

| # | Penyebab | Gejala khas | Perbaikan |
|---|---|---|---|
| 1 | **Login anonim belum diaktifkan** | Antrean naik terus, tabel kosong, tidak ada error di layar | Authentication -> Providers -> Anonymous sign-ins -> Enable |
| 2 | Skema belum dijalankan / masih skema lama | Pesan `PGRST204` atau "column ... does not exist" | Jalankan `db/checkpoint2.sql` lalu `checkpoint7.sql` lalu `checkpoint8.sql` |
| 3 | RLS menolak | Pesan `42501` atau "new row violates row-level security" | Pastikan langkah 1 beres; policy memang mensyaratkan `auth.uid()` |
| 4 | Aplikasi dibuka dengan `?mock=1` | Status sinkron menampilkan "Mode uji AKTIF" | Buka URL tanpa `?mock=1` |
| 5 | Baris induk belum sampai | Pesan `23503` (foreign key) | Kirim ulang; baris `participants` harus lebih dulu |
| 6 | Anon key salah / diputar | Pesan `Invalid API key` | Perbarui `SUPABASE_ANON_KEY` di `core/config.js` |

---

## Langkah 1 - Aktifkan login anonim (paling sering)

Seluruh kebijakan RLS di `db/checkpoint2.sql` ditulis `to authenticated` dengan syarat
`user_id = auth.uid()`. Aplikasi memperoleh `auth.uid()` lewat **anonymous sign-in**.

Bila provider itu tidak aktif:

- `signInAnonymously()` gagal,
- klien tetap berjalan sebagai peran `anon`,
- `auth.uid()` bernilai `null`,
- **setiap** insert ditolak RLS - senyap, karena kegagalannya hanya terlihat di konsol.

Perbaikan: **Authentication -> Providers -> Anonymous sign-ins -> Enable -> Save.**
Setelah itu buka aplikasi, masuk mode peneliti, tekan **Kirim ulang** pada kartu
Sinkronisasi. Baris yang tertahan akan terkirim; tidak ada data yang hilang.

---

## Langkah 2 - Pastikan skema benar

Di SQL Editor, jalankan berurutan (hanya sekali per proyek):

1. `db/checkpoint2.sql` - tabel inti, RLS, index
2. `db/checkpoint7.sql` - kolom pascates, follow-up, fidelitas harian
3. `db/checkpoint8.sql` - kolom `school`, index pemantauan (aman diulang)

Periksa cepat:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by 1;

select column_name from information_schema.columns
where table_name = 'participants' order by 1;
```

Harus ada sembilan tabel dan kolom `school` di `participants`.

---

## Langkah 3 - Pakai alat diagnosa di dalam aplikasi (0.8.0)

Buka **Pengaturan -> ketuk tujuh kali baris nama studi -> masukkan PIN -> kartu
"Sinkronisasi"**. Isinya:

- **Status terakhir** - sebab kegagalan terakhir dalam bahasa manusia, plus pesan mentah
  dari server (`PGRST204`, `42501`, dan seterusnya).
- **Antrean** - baris yang menunggu kirim.
- **Kotak gagal** - baris yang menyerah setelah 5 percobaan. **Baris ini tidak dibuang.**
- **Diagnosa koneksi** - empat pemeriksaan hanya-baca: SDK termuat, jaringan sampai ke
  proyek, login anonim berhasil, baca tabel `participants` diizinkan.
- **Uji tulis 1 baris** - menulis satu baris nyata ke `fidelity_log` dengan
  `event = 'sync_self_test'`. Ini pembuktian paling jujur bahwa jalur tulis hidup.
- **Kirim ulang** - mengembalikan isi kotak gagal ke antrean setelah penyebabnya dibetulkan.

Bersihkan baris uji sebelum analisis:

```sql
delete from fidelity_log where event = 'sync_self_test';
```

---

## Langkah 4 - Bila masih kosong

Buka aplikasi dengan `?debug=1`, lalu di konsol peramban:

```js
await window.supabase.auth.signInAnonymously()   // harus mengembalikan user, bukan error
```

- Error `Anonymous sign-ins are disabled` -> kembali ke langkah 1.
- Error jaringan/CORS -> URL proyek salah, atau proyek sedang dijeda (paused).
- Berhasil tapi insert tetap ditolak -> policy di proyek berbeda dari `checkpoint2.sql`;
  jalankan ulang berkas itu.

---

## Catatan kejujuran: cacat pada versi sebelum 0.8.0

Sampai 0.7.0, `Sync.flush()` **membuang** baris yang gagal terkirim lima kali dan hanya
mencatatnya ke konsol. Fungsi itu juga tetap melanjutkan pengiriman meski login anonim
gagal, sehingga seluruh percobaan pasti ditolak RLS lalu habis jatahnya.

Artinya, bila Anda sempat melihat "antrean sinkron: 3" lalu angkanya menjadi 0 tanpa
satu baris pun muncul di Supabase - **baris itu hilang, bukan terkirim.** Data yang
hilang tidak bisa dipulihkan dari server; yang masih ada hanya salinan lokal di HP
masing-masing (Mode peneliti -> Ekspor perangkat ini -> JSON seluruh state).

Sejak 0.8.0:

- baris yang gagal masuk **kotak gagal**, tidak pernah dihapus,
- `flush()` berhenti sebelum mengirim apa pun bila login anonim gagal,
- sebab kegagalan terakhir disimpan dan ditampilkan di layar, tidak hanya di konsol.

Sebelum studi sungguhan dimulai, lakukan sekali: aktifkan login anonim, jalankan
**Uji tulis**, dan pastikan barisnya benar-benar terlihat di Table Editor.
