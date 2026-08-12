/* Konfigurasi. Satu-satunya tempat kredensial klien.

   PENTING:
   - Anon key MEMANG boleh ada di kode klien; keamanannya dijaga oleh RLS di Supabase.
   - service_role key TIDAK BOLEH pernah masuk ke folder ini. Tempatnya hanya di
     Environment Variables Vercel, dipakai oleh /api/export.js di sisi server.
*/

export const SUPABASE_URL = 'https://amdwajgneqqvcydmpglr.supabase.co';

export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtZHdhamduZXFxdmN5ZG1wZ2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzczOTYsImV4cCI6MjEwMTkxMzM5Nn0.GdavpzWztzDdVrgFcr4wvbT2DY3KBVkX4gkmgwRqVoI';

/** Domain produksi. Dipakai untuk mematikan mode mock di lingkungan nyata. */
export const PRODUCTION_HOSTS = ['fokus-app.vercel.app'];

/** Kunci penyimpanan lokal. Versi dinaikkan bila bentuk state berubah. */
export const KEYS = {
  state: 'fokus.state.v1',
  queue: 'fokus.syncQueue',
  nudgeLog: 'fokus.nudgeLog',
  /* Baris yang gagal terkirim berkali-kali dipindahkan ke sini, TIDAK dibuang.
     Sampai 0.7.0 baris seperti itu dihapus diam-diam setelah 5 percobaan; kalau
     penyebabnya kesalahan konfigurasi server (skema belum dijalankan, RLS menolak),
     yang hilang bukan satu baris rusak melainkan seluruh data hari itu - dan tidak
     ada jejak apa pun bahwa data itu pernah ada. */
  dead: 'fokus.syncDead',
  /** Hasil percobaan kirim terakhir, untuk layar diagnostik peneliti. */
  syncStatus: 'fokus.syncStatus',
};

export const APP_VERSION = '0.8.0';

/* --- Identitas studi ---

   Sebelumnya nama satu sekolah tertulis langsung di dua layar. Begitu partisipan
   datang dari lebih dari satu sekolah, kalimat itu bukan sekadar kurang tepat - ia
   membuat sebagian partisipan membaca aplikasi ini sebagai "bukan untuk saya", dan
   keraguan seperti itu ikut menentukan kepatuhan mengisi data.

   Semua teks yang menyebut penyelenggara studi kini mengambil dari satu tempat ini. */
export const STUDY = {
  appName: 'FOKUS',
  fullName: 'Fasilitas Observasi dan Kontrol Usaha Siswa',
  /** Dipakai pada kalimat sambutan. Tidak menyebut satu sekolah pun. */
  audience: 'pelajar SMA/sederajat',
  organizer: 'tim peneliti FOKUS',
  /** Baris kaki struk. Ganti bila domain berubah. */
  receiptFooter: 'fokus-app.vercel.app',
};

/* Saran isian "asal sekolah" pada pendaftaran. Boleh dikosongkan: bila kosong,
   isian tetap muncul sebagai teks bebas. Daftar ini HANYA saran ketik - partisipan
   dari sekolah mana pun tetap bisa mengisi nama sekolahnya sendiri, dan itulah
   sebabnya isian ini teks bebas, bukan dropdown tertutup. */
export const SCHOOL_SUGGESTIONS = [];

/* --- Mode peneliti (Bab 3 3.5 pilot teknis & 3.7 fidelitas) ---

   Layar #dev tidak ada di navigasi dan tidak bisa ditemukan partisipan secara wajar.
   Ia dikunci PIN, dan HANYA membaca - tidak ada satu tombol pun di sana yang menulis
   ke tabel penelitian. Itu disengaja: alat diagnostik yang bisa mengubah data adalah
   ancaman terhadap integritas data, bukan bantuan.

   PIN default 104729. Ganti dengan menghitung ulang hash-nya:
     node -e "import('crypto').then(c=>console.log(c.createHash('sha256').update('fokus-dev:PIN_BARU').digest('hex')))"
   lalu tempelkan hasilnya ke DEV_PIN_SHA256 di bawah. PIN mentahnya tidak pernah
   disimpan di kode maupun di perangkat. */
export const DEV_PIN_SHA256 =
  '43954c06c9c6655e902da59f88e113eb9008aa93d3c9354043bd0bb3d5829b83';

/** Lama sesi mode peneliti tetap terbuka setelah PIN benar. */
export const DEV_UNLOCK_MS = 30 * 60_000;

/* --- Privasi identitas (Bab 3 3.3) ---

   Bab 3 menyebut nomor WhatsApp di-hash bersalt sebagai identitas login. Yang
   diterapkan di sini: nomor TIDAK PERNAH disimpan dalam bentuk aslinya, baik di
   perangkat maupun di Supabase - hanya hash-nya. Salt di bawah bersifat per-studi
   dan wajib diganti sebelum pengambilan data dimulai; catat nilainya di dokumen
   peneliti, bukan hanya di kode. */
export const WA_SALT = 'fokus-wa-2026';
