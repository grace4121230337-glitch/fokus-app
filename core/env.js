/* Lapis lingkungan.
   Tujuan: seluruh modul core/ bisa di-import di Node (untuk test) TANPA browser.
   Karena itu tidak ada satu pun akses window/localStorage di luar file ini. */

export const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined';

const memory = new Map();

/** localStorage di browser, Map di Node. API-nya sengaja dibuat identik. */
export const storage = (() => {
  if (isBrowser) {
    try {
      const probe = '__fokus_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      /* Mode privat Safari melempar error: jatuh ke memori agar aplikasi tidak mati. */
    }
  }
  return {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => void memory.set(k, String(v)),
    removeItem: (k) => void memory.delete(k),
  };
})();

/** UUID v4 dengan cadangan, karena crypto.randomUUID absen di browser lama. */
export function uuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const isOnline = () => (isBrowser && 'onLine' in navigator ? navigator.onLine : true);

/* Jam terpusat. Test bisa membekukannya lewat setClock(); produksi memakai Date.now. */
let clock = () => Date.now();
export const now = () => clock();
export const setClock = (fn) => { clock = typeof fn === 'function' ? fn : () => Date.now(); };
export const resetClock = () => { clock = () => Date.now(); };

export function log(...args) {
  if (isBrowser && new URLSearchParams(location.search).has('debug')) console.log('[fokus]', ...args);
}
