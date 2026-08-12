/* Runner test minimal tanpa dependensi (tidak ada npm install, tidak ada jaringan).
   Cukup: node test/run.js */

let pass = 0;
let fail = 0;
const failures = [];
let group = '';

/**
 * Mengelompokkan test. `fn` opsional: bila diberikan, isinya langsung dijalankan.
 *
 * Dulu argumen kedua diabaikan, sehingga suite yang ditulis dengan gaya
 * describe('...', () => { t(...) }) tercetak judulnya saja dan seluruh
 * assertion di dalamnya TIDAK pernah dieksekusi - test yang tampak "lulus"
 * padahal tidak menguji apa pun. Kegagalan senyap seperti itu jauh lebih
 * berbahaya daripada test yang merah.
 */
export function describe(name, fn) {
  group = name;
  console.log(`\n${name}`);
  if (typeof fn === 'function') fn();
}

export function t(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    fail += 1;
    failures.push(`${group} > ${name}: ${err.message}`);
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

/**
 * Versi asinkron dari `t`, WAJIB dipakai (dengan await) untuk test yang memakai
 * WebCrypto atau promise lain.
 *
 * Alasannya sama dengan alasan describe dulu diperbaiki: `t` yang biasa memanggil
 * fn() tanpa menunggu, sehingga fungsi async akan mengembalikan promise, assertion di
 * dalamnya berjalan setelah ringkasan tercetak, dan kegagalannya tidak pernah terhitung.
 * Test yang tampak hijau padahal tidak menguji apa pun lebih berbahaya daripada test merah.
 */
export async function tAsync(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    fail += 1;
    failures.push(`${group} > ${name}: ${err.message}`);
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

/** Pasangan `throws` untuk fungsi async. */
export async function rejects(fn, msg = 'harus menolak') {
  try { await fn(); } catch { return; }
  throw new Error(msg);
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} diharapkan ${e}, dapat ${a}`);
}

export function ok(value, msg = 'harus benar') {
  if (!value) throw new Error(msg);
}

export function near(actual, expected, tol = 1e-6, msg = '') {
  if (Math.abs(actual - expected) > tol) throw new Error(`${msg} diharapkan ~${expected}, dapat ${actual}`);
}

export function throws(fn, msg = 'harus melempar error') {
  try { fn(); } catch { return; }
  throw new Error(msg);
}

export function summary() {
  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  if (fail) {
    console.log('\nRingkasan kegagalan:');
    failures.forEach((f) => console.log(' - ' + f));
  }
  return fail === 0;
}
