/* Service worker: aplikasi harus tetap terbuka walau HP partisipan kehilangan sinyal
   di tengah sesi Kubah. Strategi:
   - Aset (gambar, font, CSS, JS): cache-first. Isinya statis, jadi aman.
   - Navigasi/HTML: network-first dengan cadangan cache, supaya pembaruan aplikasi
     tetap sampai ke partisipan tanpa mereka harus menghapus cache manual.
   - Permintaan ke Supabase: TIDAK PERNAH di-cache. Data penelitian tidak boleh basi. */

const VERSION = 'fokus-v0.8.1';
const PRECACHE = [
  '/', '/index.html', '/manifest.webmanifest',
  '/assets/css/tokens.css', '/assets/css/base.css', '/assets/css/components.css',
  '/assets/font/Quicksand-Regular.woff', '/assets/font/Quicksand-Medium.woff',
  '/assets/font/Quicksand-SemiBold.woff', '/assets/font/Quicksand-Bold.woff',
  '/assets/img/bg-home.webp', '/assets/img/bg-dome.webp',
  '/assets/img/companion-sprout-1.webp', '/assets/img/companion-spark-1.webp',
  '/assets/icon/nav-beranda.svg', '/assets/icon/nav-dex.svg', '/assets/icon/nav-misi.svg',
  '/assets/icon/nav-rank.svg', '/assets/icon/nav-coop.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll gagal total bila satu berkas hilang; tambahkan satu per satu agar
      // instalasi tidak batal hanya karena satu aset belum ada.
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;              // Supabase & CDN lewat jaringan

  const isAsset = url.pathname.startsWith('/assets/');
  const isCode = url.pathname.startsWith('/core/') || url.pathname.startsWith('/ui/');

  if (isAsset || isCode) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      })),
    );
    return;
  }

  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html'))),
  );
});
