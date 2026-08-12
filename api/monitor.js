/* Pemantauan lintas partisipan - sisi server.

   Layar #monitor tidak boleh mengambil data 14 partisipan langsung dari peramban,
   karena RLS memang sengaja hanya mengizinkan tiap perangkat melihat barisnya sendiri.
   Membuka kunci itu di sisi klien akan berarti memberi setiap HP partisipan kemampuan
   membaca data teman-temannya - persis yang dijanjikan tidak terjadi pada lembar
   persetujuan.

   Karena itu agregasi dilakukan di sini, di server Vercel, dengan service_role, dan
   yang dikirim balik ke peramban HANYA angka ringkas. Tidak satu pun jawaban butir
   EMA, refleksi, atau nomor WhatsApp ikut keluar dari endpoint ini - lihat daftar
   SELECT di bawah, yang sengaja menyebut kolom satu per satu alih-alih memakai `*`.

   Gaya penulisannya mengikuti api/export.js: fetch biasa, tanpa dependensi npm,
   karena proyek ini tidak punya proses build. */

import { monitorRows, studyRollup } from '../core/monitorUtils.js';

const PAGE_SIZE = 1000;

/* Kolom yang boleh keluar. Daftar ini adalah pagar privasi, bukan sekadar optimasi:
   menambah kolom di sini berarti mengubah apa yang bisa dilihat peneliti tentang
   individu, jadi setiap penambahan harus disengaja. */
const SOURCES = {
  participants: 'id,code,tier,started_on,posttest_on,followup_on,school',
  sessions: 'participant_id,session_date,outcome,elapsed_sec,hp_end,study_day,phase',
  emaSignals: 'participant_id,scheduled_at,status,signal_type',
  emaEntries: 'participant_id,entry_date',
  fidelity: 'participant_id,entry_date,fidelity_ok',
  nudge: 'participant_id,event,entry_date',
};

const TABLES = {
  participants: 'participants',
  sessions: 'sessions',
  emaSignals: 'ema_signals',
  emaEntries: 'ema_entries',
  fidelity: 'fidelity_log',
  nudge: 'nudge_log',
};

async function fetchAll({ url, serviceKey, table, select }) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(endpoint, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Supabase menjawab ${res.status} untuk tabel ${table}: ${detail}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/** Tanggal WIB hari ini di sisi server. Server Vercel berjalan UTC, jadi tanpa
    penggeseran ini "hari ini" akan berganti pukul 07.00 WIB - tepat saat partisipan
    mulai berangkat sekolah, sehingga sesi pagi terbaca sebagai sesi kemarin. */
function wibToday(nowMs = Date.now()) {
  return new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Hanya GET yang didukung.' });
    return;
  }

  const token = req.headers['x-export-token'] || req.query.token;
  if (!token || !process.env.EXPORT_TOKEN || token !== process.env.EXPORT_TOKEN) {
    res.status(401).json({ error: 'Token pemantauan tidak valid. Sertakan header x-export-token atau ?token=.' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Server belum dikonfigurasi: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY hilang.' });
    return;
  }

  try {
    const keys = Object.keys(TABLES);
    const hasil = await Promise.all(keys.map((k) => fetchAll({
      url: SUPABASE_URL,
      serviceKey: SUPABASE_SERVICE_ROLE_KEY,
      table: TABLES[k],
      select: SOURCES[k],
    })));
    const data = Object.fromEntries(keys.map((k, i) => [k, hasil[i]]));

    const today = wibToday();
    const rows = monitorRows(data, { today });
    const summary = studyRollup(rows);

    // Tidak di-cache: layar ini dipakai justru untuk melihat keadaan menit ini.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ generatedAt: new Date().toISOString(), today, summary, rows });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
}
