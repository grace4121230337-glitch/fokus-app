/* Ekspor data penelitian untuk peneliti - satu-satunya tempat service_role key dipakai.
   Berjalan di server Vercel (bukan di perangkat partisipan), dan HANYA menjawab
   permintaan yang membawa token yang cocok dengan EXPORT_TOKEN.

   Sengaja memanggil REST Supabase langsung lewat fetch, bukan lewat @supabase/supabase-js -
   aplikasi ini tidak punya proses build/npm install, jadi menambah dependensi di sini
   berarti menambah satu titik kegagalan instalasi yang tidak perlu untuk satu endpoint. */

import { DATASETS, DATASET_NAMES, toCsv, tauURows } from '../core/exportUtils.js';

const PAGE_SIZE = 1000;

async function fetchAllRows({ url, serviceKey, table, select }) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.asc&limit=${PAGE_SIZE}&offset=${offset}`;
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

function sendPayload(res, rows, format, filenameBase) {
  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.json"`);
    res.status(200).json({ rows, count: rows.length });
    return;
  }
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
  res.status(200).send(csv);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Hanya GET yang didukung.' });
    return;
  }

  // Header lebih aman untuk curl/skrip; query ?token= disediakan sebagai jalan
  // pintas kalau tautan dibuka langsung di browser (tanpa cara mudah set header).
  const token = req.headers['x-export-token'] || req.query.token;
  if (!token || !process.env.EXPORT_TOKEN || token !== process.env.EXPORT_TOKEN) {
    res.status(401).json({ error: 'Token ekspor tidak valid atau tidak ada. Sertakan header x-export-token atau ?token=.' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Server belum dikonfigurasi: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY hilang.' });
    return;
  }

  const dataset = String(req.query.dataset || 'sessions');
  const format = String(req.query.format || 'csv');

  try {
    if (dataset === 'tauu') {
      const measure = String(req.query.measure || 'hp_end');
      const sessionRows = await fetchAllRows({
        url: SUPABASE_URL,
        serviceKey: SUPABASE_SERVICE_ROLE_KEY,
        table: DATASETS.sessions.table,
        select: DATASETS.sessions.select,
      });
      const rows = tauURows(sessionRows, { measure });
      sendPayload(res, rows, format, `fokus-tauu-${measure}`);
      return;
    }

    if (!DATASET_NAMES.includes(dataset)) {
      res.status(400).json({ error: `Dataset tidak dikenal: ${dataset}. Pilihan: ${DATASET_NAMES.join(', ')}, tauu.` });
      return;
    }

    const { table, select } = DATASETS[dataset];
    const rows = await fetchAllRows({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_ROLE_KEY, table, select });
    sendPayload(res, rows, format, `fokus-${dataset}`);
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) });
  }
}
