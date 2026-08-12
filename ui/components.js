/* Pustaka komponen UI. Setiap pola visual dibuat SEKALI di sini.

   Ini pelajaran langsung dari audit desain Stitch: di sana ada empat versi navigasi
   dan dua versi Kubah yang saling berbeda. Dengan semua layar memanggil fungsi yang
   sama dari file ini, ketidakkonsistenan seperti itu tidak mungkin terjadi lagi. */

/* --- Keamanan teks: semua teks dinamis wajib lewat esc() --- */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Menyusun HTML dengan escaping otomatis pada setiap interpolasi. */
export function html(strings, ...values) {
  return strings.reduce((out, str, i) => {
    const v = values[i - 1];
    const safe = Array.isArray(v) ? v.join('') : (v?.__raw ?? esc(v));
    return out + safe + str;
  });
}

/** Menandai HTML yang sudah aman agar tidak di-escape ulang. */
export const raw = (s) => ({ __raw: String(s ?? '') });

/* --- Blok bangunan --- */

export function card(inner, { cls = '', attrs = '' } = {}) {
  return `<section class="card ${cls}" ${attrs}>${inner}</section>`;
}

export function button(label, { variant = 'primary', id = '', attrs = '', block = true, icon = '' } = {}) {
  const cls = `btn btn--${variant}${block ? ' btn--block' : ''}`;
  const idAttr = id ? `id="${esc(id)}"` : '';
  return `<button class="${cls}" ${idAttr} ${attrs}>${icon}${esc(label)}</button>`;
}

export function screenHead(title, subtitle = '') {
  return `<header class="head">
    <div><h1 class="h1">${esc(title)}</h1>${subtitle ? `<p class="dim">${esc(subtitle)}</p>` : ''}</div>
  </header>`;
}

export function progressBar(percent, { cls = '' } = {}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return `<div class="progress ${cls}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
    <div class="progress__fill" style="--val:${p}%"></div></div>`;
}

/** Bar HP sesi Kubah - satu-satunya representasi HP di seluruh aplikasi. */
export function hpBar(hp) {
  const v = Math.max(0, Math.min(100, Math.round(hp)));
  const level = v > 60 ? 'full' : v > 30 ? 'mid' : 'low';
  return `<div class="hp" data-level="${level}" role="progressbar" aria-label="Ketahanan fokus"
    aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100">
    <div class="hp__fill" style="--hp:${v}%"></div></div>`;
}

/** Gambar companion. Ukuran 'lg' untuk sorotan, 'sm' untuk daftar. */
export function companionImg(src, name, { size = 'lg', enter = false, locked = false } = {}) {
  return `<img class="companion companion--${size}${enter ? ' companion--enter' : ''}${locked ? ' companion--locked' : ''}"
    src="${esc(src)}" alt="${esc(name)}" width="256" height="256" loading="eager" decoding="async">`;
}

/** Satu butir Likert. `scale` adalah array label dari rendah ke tinggi. */
export function likert(name, question, scale, { value = null, index = 0, total = 0, item = '' } = {}) {
  const opts = scale.map((label, i) => {
    const val = i + 1;
    const checked = Number(value) === val ? 'checked' : '';
    const on = checked ? ' likert__opt--on' : '';
    return `<label class="likert__opt${on}">
      <input type="radio" name="${esc(name)}" value="${val}" ${checked}>
      <span>${val}</span><small>${esc(label)}</small></label>`;
  }).join('');
  const counter = total ? `<p class="dim small">Butir ${index + 1} dari ${total}</p>` : '';
  return `<fieldset class="likert" data-item="${esc(item)}">${counter}
    <legend>${esc(question)}</legend>${opts}</fieldset>`;
}

/**
 * Butir ya/tidak (dipakai SMD Scale). Sengaja memakai kerangka .likert yang sama
 * supaya bentuk, jarak, dan area sentuhnya identik dengan butir Likert - satu
 * pola visual, bukan dua. Nilai dikirim sebagai "1" (ya) dan "0" (tidak).
 */
export function yesNo(name, question, { value = null, index = 0, total = 0, item = '' } = {}) {
  const choices = [
    { val: '0', label: 'Tidak', on: value === false || value === 0 },
    { val: '1', label: 'Ya', on: value === true || value === 1 },
  ];
  const opts = choices.map((c) => `<label class="likert__opt likert__opt--wide${c.on ? ' likert__opt--on' : ''}">
      <input type="radio" name="${esc(name)}" value="${c.val}" ${c.on ? 'checked' : ''}>
      <span>${esc(c.label)}</span></label>`).join('');
  const counter = total ? `<p class="dim small">Butir ${index + 1} dari ${total}</p>` : '';
  return `<fieldset class="likert" data-item="${esc(item)}">${counter}
    <legend>${esc(question)}</legend>${opts}</fieldset>`;
}

export function checkStatement(id, text, checked = false) {
  return `<label class="check">
    <input type="checkbox" id="${esc(id)}" ${checked ? 'checked' : ''}>
    <span>${esc(text)}</span></label>`;
}

export function emptyState(text, icon = '/assets/icon/ui-info.svg') {
  return `<div class="card center"><img src="${esc(icon)}" alt="" width="32" height="32" style="margin:0 auto">
    <p class="dim">${esc(text)}</p></div>`;
}

/* --- Umpan balik --- */

export function toast(message, ms = 2600) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/**
 * Modal pilihan. Mengembalikan Promise berisi id pilihan.
 * Dipakai antara lain untuk disambiguasi "kenapa layar tadi mati".
 */
export function choiceModal({ title, body = '', options, dismissible = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="modal__box">
      <h2 class="h2">${esc(title)}</h2>
      ${body ? `<p class="dim">${esc(body)}</p>` : ''}
      <div class="modal__actions">
        ${options.map((o) => button(o.label, {
          variant: o.variant || 'ghost', attrs: `data-choice="${esc(o.id)}"`,
        })).join('')}
      </div></div>`;

    const close = (id) => { wrap.remove(); resolve(id); };
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-choice]');
      if (btn) close(btn.dataset.choice);
      else if (dismissible && e.target === wrap) close(null);
    });
    root.appendChild(wrap);
    wrap.querySelector('button')?.focus();
  });
}

/* --- Kerangka layar --- */

/**
 * Merender layar ke #app.
 * @param {string} inner HTML layar
 * @param {{bg?: string, chrome?: 'full'|'bare', title?: string}} opts
 */
export function mount(inner, { bg = 'home', chrome = 'full' } = {}) {
  const app = document.getElementById('app');
  document.body.dataset.bg = bg;
  document.body.dataset.chrome = chrome;
  document.getElementById('nav').hidden = chrome === 'bare';
  app.innerHTML = inner;
  app.scrollTop = 0;
  window.scrollTo(0, 0);
  return app;
}

/** Menyorot tab navigasi yang aktif. */
export function setActiveNav(route) {
  for (const item of document.querySelectorAll('.nav__item')) {
    if (item.dataset.route === route) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
}

/** Mengganti tema warna aksen sesuai profil hasil pretest. */
export function setProfileTheme(profile) {
  document.documentElement.dataset.profile = profile === 'spark' ? 'spark' : 'sprout';
}

export function fmtClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}
