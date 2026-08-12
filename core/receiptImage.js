/* Mengubah Struk Fokus menjadi berkas PNG yang bisa diunduh dan dibagikan.

   PILIHAN TEKNIS YANG PERLU DIJELASKAN.

   Rancangan aslinya memakai html2canvas: satu elemen HTML difoto menjadi kanvas.
   Cara itu nyaman, tetapi untuk aplikasi ini ada dua masalah nyata:

   1. html2canvas berukuran ~200 KB dan harus diambil dari CDN atau ikut dibundel.
      Aplikasi ini tanpa proses build dan harus tetap jalan offline di HP partisipan
      yang sinyalnya buruk - satu berkas eksternal lagi berarti satu titik gagal lagi,
      persis seperti yang sudah terjadi pada /vendor/supabase.umd.js.
   2. html2canvas menggambar ULANG HTML dengan mesin CSS-nya sendiri. Hasilnya sering
      berbeda dari yang dilihat pengguna (font kustom, backdrop-filter, warna gradien),
      dan bedanya baru ketahuan di HP partisipan, bukan saat kita menguji.

   Karena itu di sini ada DUA jalur, dan urutannya disengaja:

   - Bila `window.html2canvas` ADA (peneliti boleh menaruhnya di /vendor/), ia dipakai
     untuk memotret elemen struk apa adanya.
   - Bila tidak ada - keadaan bawaan - struk digambar langsung ke <canvas> dari MODEL
     DATA YANG SAMA yang dipakai tampilan HTML (core/insight.js). Karena sumbernya satu,
     gambar yang diunduh tidak mungkin berisi angka yang berbeda dari yang dilihat
     partisipan di layar, meskipun penataannya digambar ulang.

   Jalur kedua juga yang membuat unduhan tetap bekerja di iOS Safari lama, tempat
   html2canvas paling sering menghasilkan kanvas kosong. */

import { STUDY } from './config.js';

const W = 720;                       // lebar kanvas (setara ~80mm kertas termal @ 3x)
const PAD = 48;
const LINE = 34;
const PAPER = '#f7f6f2';
const INK = '#111111';
const FAINT = '#8b8b8b';

const MONO = '"JetBrains Mono", "Courier New", ui-monospace, monospace';

function setFont(ctx, size, weight = '400') {
  ctx.font = `${weight} ${size}px ${MONO}`;
}

function dashedLine(ctx, y, width) {
  ctx.save();
  ctx.strokeStyle = '#c9c6bf';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(width - PAD, y);
  ctx.stroke();
  ctx.restore();
}

/** Tepi bergerigi atas/bawah, meniru kertas yang disobek dari mesin. */
function perforate(ctx, y, width, arah) {
  const step = 20;
  ctx.save();
  ctx.fillStyle = '#00000000';
  ctx.globalCompositeOperation = 'destination-out';
  for (let x = 0; x <= width; x += step) {
    ctx.beginPath();
    ctx.arc(x, y, step / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  void arah;
}

function textBetween(ctx, kiri, kanan, y, width) {
  ctx.textAlign = 'left';
  ctx.fillText(kiri, PAD, y);
  ctx.textAlign = 'right';
  ctx.fillText(kanan, width - PAD, y);
  ctx.textAlign = 'left';
}

/**
 * Menggambar struk ke kanvas baru dan mengembalikannya.
 * Tinggi dihitung dari jumlah baris, jadi struk panjang tidak terpotong.
 */
export function paintReceipt(data, { scale = 2 } = {}) {
  const rows = data.meta.length + data.lines.length + data.totals.length;
  const height = 470 + rows * LINE + data.lines.length * 4;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Kertas
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, height);

  // Serat kertas: titik-titik samar. Tanpa ini hasilnya terlihat seperti tangkapan
  // layar biasa, dan seluruh gagasan "struk" hilang.
  ctx.save();
  ctx.fillStyle = '#00000010';
  for (let i = 0; i < 1400; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * height;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();

  let y = 96;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';

  // Judul
  ctx.textAlign = 'center';
  setFont(ctx, 52, '700');
  ctx.fillText(String(data.title).toUpperCase(), W / 2, y);
  y += 42;
  setFont(ctx, 22, '400');
  ctx.fillStyle = FAINT;
  ctx.fillText(data.subtitle, W / 2, y);
  y += 20;
  setFont(ctx, 20, '400');
  ctx.fillText(`NO. ${data.receiptNo}`, W / 2, y + 8);
  y += 44;
  ctx.textAlign = 'left';

  dashedLine(ctx, y, W);
  y += 40;

  // Metadata
  ctx.fillStyle = INK;
  setFont(ctx, 22, '400');
  for (const m of data.meta) {
    textBetween(ctx, m.key, String(m.value), y, W);
    y += LINE;
  }

  y += 8;
  dashedLine(ctx, y, W);
  y += 40;

  // Baris utama
  ctx.fillStyle = FAINT;
  setFont(ctx, 18, '700');
  textBetween(ctx, 'RINCIAN', 'JUMLAH', y, W);
  y += LINE;
  ctx.fillStyle = INK;
  setFont(ctx, 23, '400');
  for (const l of data.lines) {
    textBetween(ctx, l.label, l.amount, y, W);
    y += LINE + 4;
  }

  y += 4;
  dashedLine(ctx, y, W);
  y += 40;

  // Total
  for (const t of data.totals) {
    setFont(ctx, t.strong ? 28 : 22, t.strong ? '700' : '400');
    textBetween(ctx, t.key, String(t.value), y, W);
    y += LINE + (t.strong ? 6 : 0);
  }

  y += 12;
  dashedLine(ctx, y, W);
  y += 40;

  ctx.textAlign = 'center';
  setFont(ctx, 20, '700');
  ctx.fillText(data.authCode, W / 2, y);
  y += 38;
  setFont(ctx, 22, '700');
  ctx.fillText(data.footer, W / 2, y);
  y += 30;
  ctx.fillStyle = FAINT;
  setFont(ctx, 18, '400');
  ctx.fillText(data.footerNote || STUDY.receiptFooter, W / 2, y);
  y += 40;

  // Barcode dekoratif
  ctx.fillStyle = INK;
  const bars = data.barcode || [];
  const totalW = bars.reduce((sum, b) => sum + b.w * 3 + b.gap * 3, 0);
  let x = (W - totalW) / 2;
  for (const b of bars) {
    ctx.fillRect(x, y, b.w * 3, 56);
    x += b.w * 3 + b.gap * 3;
  }
  y += 84;

  perforate(ctx, 0, W, 'atas');
  perforate(ctx, height, W, 'bawah');

  ctx.textAlign = 'left';
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), 'image/png');
    else resolve(null);
  });
}

/**
 * Membuat PNG struk. Memakai html2canvas bila tersedia, selain itu menggambar sendiri.
 * @param {object} data model dari core/insight.js
 * @param {HTMLElement|null} node elemen struk di layar (hanya dipakai jalur html2canvas)
 */
export async function receiptBlob(data, node = null) {
  if (node && typeof window !== 'undefined' && typeof window.html2canvas === 'function') {
    try {
      const canvas = await window.html2canvas(node, {
        backgroundColor: PAPER, scale: 2, useCORS: true, logging: false,
      });
      const blob = await canvasToBlob(canvas);
      if (blob) return { blob, via: 'html2canvas' };
    } catch (err) {
      // Sengaja diam lalu jatuh ke jalur kanvas: bagi partisipan, struk yang tergambar
      // sedikit berbeda jauh lebih baik daripada tombol unduh yang tidak melakukan apa-apa.
      if (typeof console !== 'undefined') console.warn('[fokus] html2canvas gagal, memakai penggambar bawaan', err);
    }
  }
  const canvas = paintReceipt(data);
  const blob = await canvasToBlob(canvas);
  return { blob, via: 'canvas' };
}

export function receiptFilename(data) {
  const kode = (data.meta.find((m) => m.key === 'KODE')?.value || 'fokus').toString().toLowerCase();
  return `struk-fokus-${kode}-${data.receiptNo.toLowerCase()}.png`;
}

/**
 * Mengunduh struk. Di ponsel, Web Share dipakai lebih dulu bila tersedia karena
 * "Simpan Gambar" lewat lembar berbagi jauh lebih mudah ditemukan siswa daripada
 * berkas yang mendarat di folder Unduhan.
 */
export async function downloadReceipt(data, node = null) {
  const { blob, via } = await receiptBlob(data, node);
  if (!blob) return { ok: false, via };

  const filename = receiptFilename(data);
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type: 'image/png' }) : null;

  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Struk Fokus' });
      return { ok: true, via, shared: true };
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: true, via, shared: false, cancelled: true };
      // Lanjut ke unduhan biasa.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { ok: true, via, shared: false };
}
