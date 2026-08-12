/* Titik masuk test. Jalankan: node test/run.js
   Keluar dengan kode 1 bila ada yang gagal, supaya bisa dipakai sebagai gerbang rilis. */

import { summary } from './harness.js';
import tier from './tier.test.js';
import progress from './progress.test.js';
import store from './store.test.js';
import dome from './dome.test.js';
import ema from './ema.test.js';
import nudge from './nudge.test.js';
import socialValidity from './socialValidity.test.js';
import exportUtils from './exportUtils.test.js';

console.log('FOKUS - test inti (tier, progress, store, kubah, EMA, EMA pasca-sesi, nudge, kepatuhan, struk fokus, pemantauan, tahap studi, fidelitas, identitas, mode peneliti, validitas sosial, ekspor, instrumen, kode partisipan)');

tier();
progress();
store();
dome();
ema();
nudge();
socialValidity();
exportUtils();

/* Dua berkas berikut menjalankan dirinya sendiri saat diimpor. Impor dinamis
   dipakai agar urutan keluarannya tetap di bawah tiga suite di atas. */
await import('./instruments.test.js');
await import('./participant.test.js');
await import('./emaPostSession.test.js');
await import('./compliance.test.js');
await import('./insight.test.js');
await import('./monitorUtils.test.js');
await import('./studyStage.test.js');
await import('./fidelity.test.js');

/* Dua suite berikut memakai WebCrypto. Keduanya memakai top-level await di dalamnya,
   jadi impor dinamis ini baru selesai setelah seluruh assertion-nya benar-benar dijalankan. */
await import('./identity.test.js');
await import('./devmode.test.js');

process.exit(summary() ? 0 : 1);
