# Panduan uji pilot - FOKUS

Rujukan: Bab 3 subbab 3.5. Uji pilot dilakukan pada **1-3 siswa di luar 14 sampel
penelitian** (bukan Tier 1-4), sebelum kode partisipan sungguhan dibagikan. Tujuannya
menemukan masalah teknis dan keterbacaan SEBELUM data penelitian mulai terkumpul -
bukan untuk menguji efektivitas program.

## Yang diuji

### A. Teknis
- [ ] Kode partisipan pilot menampilkan tier yang benar (pakai kode di luar daftar 14
      kode asli, atau cukup memakai mode mock `?mock=1` untuk pilot yang murni teknis).
- [ ] Consent, pretest (26 butir), dan penempatan profil Sprout/Spark berjalan tanpa
      error di HP Android DAN iOS (Safari berperilaku beda untuk Wake Lock dan PWA).
- [ ] Sesi Kubah Fokus: Wake Lock aktif, layar tidak mati sendiri, HP berkurang wajar
      saat sengaja berpindah aplikasi (uji ketiga tingkat: lirik <3 detik, sebentar
      3-15 detik, pindah >15 detik).
- [ ] Sinyal EMA muncul dalam jendela yang ditentukan, dan tercatat `missed` kalau
      dibiarkan sampai jendelanya lewat.
- [ ] Aplikasi tetap bisa dipakai offline (matikan Wi-Fi/data seluler saat sesi
      berjalan), dan data terkirim otomatis begitu online kembali.
- [ ] Tidak ada crash saat berpindah tab lama lalu kembali (`visibilitychange`).
- [ ] PWA bisa dipasang ke layar utama dan dibuka seperti aplikasi biasa.
- [ ] Validitas sosial (`#survey`) muncul begitu hari studi terlewati, dan tidak bisa
      dilewati lewat navigasi atau tautan langsung.

### B. Keterbacaan dan pengalaman
- [ ] Bahasa di tiap layar dipahami tanpa penjelasan tambahan dari peneliti.
- [ ] Siswa pilot tidak bingung soal apa yang harus dilakukan setelah membuka aplikasi
      pertama kali (alur register -> consent -> pretest -> beranda).
- [ ] Ukuran teks dan tombol nyaman disentuh di HP siswa pilot (bukan hanya di HP
      peneliti).
- [ ] Kalimat nudge dan sinyal EMA tidak terasa menghakimi atau memalukan.

## Yang TIDAK diuji lewat pilot
- Efektivitas intervensi (itu pertanyaan penelitian utama, dijawab lewat 14 sampel).
- Analisis Tau-U (baru relevan setelah data 14 partisipan lengkap).

## Setelah uji pilot

1. Catat semua temuan (bug, kalimat membingungkan, masalah HP tertentu) di satu
   dokumen terpisah, disertai tanggal dan perangkat yang dipakai.
2. Perbaiki, lalu perbarui `CHANGELOG.md` sebelum kode partisipan sungguhan dibagikan -
   partisipan sungguhan harus mulai dari kode yang sudah diperbaiki, bukan kode yang
   sedang dites.
3. **Hapus data uji pilot dari Supabase** sebelum hari pertama pengambilan data
   sungguhan, supaya tidak tercampur saat ekspor lewat `/api/export.js`. Data pilot
   bukan bagian dari 14 sampel dan tidak boleh ikut dianalisis.
4. Jalankan `node test/run.js` dan `bash tools/qa-shots.sh` sekali lagi setelah
   perbaikan - keduanya harus lulus sebelum kode dibagikan.
