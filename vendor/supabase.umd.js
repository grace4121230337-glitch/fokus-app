/* PLACEHOLDER - BUKAN SDK SUPABASE SUNGGUHAN.
   Selama berkas ini belum diganti, window.supabase tidak pernah ada, core/supabase.js
   getClient() selalu mengembalikan null, dan SELURUH data (partisipan, EMA, sesi, dst)
   hanya tersimpan di localStorage perangkat - tidak pernah sampai ke Supabase. Antrean
   sinkron akan terus bertambah dan tidak pernah berkurang.

   CARA MENGGANTI (wajib sebelum uji pilot maupun studi sungguhan):
   1. Di komputer yang punya akses internet, unduh:
      https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js
      (klik kanan > Simpan sebagai, atau: curl -o vendor/supabase.umd.js <url di atas>)
   2. Timpa berkas ini dengan hasil unduhan tadi (nama tetap supabase.umd.js).
   3. Verifikasi: buka aplikasi dengan ?debug=1 di URL, lihat konsol browser (F12).
      Pesan 'SDK Supabase tidak tersedia' TIDAK BOLEH muncul lagi.
   4. Cek juga di konsol: ketik `window.supabase` lalu Enter - harus muncul objek,
      bukan `undefined`.
*/
