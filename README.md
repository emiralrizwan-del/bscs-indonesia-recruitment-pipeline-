# BSM Recruitment Pipeline Dashboard

Dashboard live untuk memantau pipeline rekrutmen BSM Cruise Services Indonesia. Data ditarik langsung dari 10 sheet Smartsheet melalui Vercel serverless API — token Smartsheet tidak pernah menyentuh browser.

## Isi Dashboard (6 tab)

1. **Overview** — KPI Registered / On Process / Pool / Exited, chart 6 tahap rekrutmen, pool per department, ringkasan bulan berjalan
2. **Funnel & Conversion** — funnel 6 tahap (Online Registration → Newly Registered → Screening → Ready to Assess → Assessed → Hotel Gap Pool) dengan conversion rate antar tahap
3. **Recruitment Pool** — tabel Assessed + Hotel Gap Pool dengan filter Source, Department, EAF, Visa (berdasarkan exp date), dan search
4. **Candidate Breakdown** — semua kandidat aktif dengan filter grup pipeline + department + search
5. **Registration Trend** — tren pendaftaran 24 bulan terakhir dari DATE APPLY (termasuk kandidat yang sudah exit, dihitung ke bulan mereka mendaftar)
6. **Pipeline Exits** — No Longer Available & Unsuccessful (2025 + 2026)

## Sumber Data (10 sheet, ID sudah tertanam di `api/pipeline.js`)

| Sheet | ID |
|---|---|
| Recruitment - Online Registration | 329611896377220 |
| Recruitment - Newly Registered | 2269489626304388 |
| Recruitment - Screening | 5491450611453828 |
| Recruitment - Ready to Assess | 3241937867853700 |
| Recruitment - Assessed | 7817907694161796 |
| HOTEL GAP POOL | 4234298248875908 |
| Recruitment - No Longer Available 2025 | 8423787105046404 |
| Recruitment - No Longer Available 2026 | 24014020890500 |
| Recruitment - Unsuccessful 2025 | 6566252218634116 |
| Recruitment - Unsuccessful 2026 | 523715642085252 |

Kolom dipetakan otomatis berdasarkan judul (bukan ID) saat runtime, dengan toleransi alias (contoh: "SUGESTED POSITION" typo lama tetap terbaca). Jika satu sheet gagal dimuat, dashboard tetap tampil dengan notifikasi kecil — tidak pernah error total.

## Cara Deploy (GitHub → Vercel)

1. Extract zip ini, lalu push ke repository GitHub **private** baru
2. Buka [vercel.com](https://vercel.com) → **Add New Project** → import repo tersebut
3. Sebelum deploy, buka **Settings → Environment Variables**, tambahkan dua variabel (environment: **Production**):
   - `SMARTSHEET_TOKEN` → buat di Smartsheet: Account → Apps & Integrations → API Access → **Generate new access token**
   - `TEAM_PASSWORD` → password bersama tim (gunakan password kuat, contoh pola: `BsmPipeline2026!`)
4. Klik **Deploy** — Vercel otomatis mendeteksi folder `api/` sebagai serverless functions dan `public/` sebagai static site
5. Bagikan URL + password ke tim

## Ganti Password Tim

Cukup ubah nilai `TEAM_PASSWORD` di Vercel → Settings → Environment Variables → **Redeploy**. Semua sesi lama otomatis tidak berlaku, tanpa perlu ubah kode.

## Validasi Pasca-Deploy (wajib)

1. Login dengan password tim → pastikan semua 6 tab terisi angka
2. Cocokkan 2–3 kandidat di tab Pool dengan data asli di Smartsheet (PIN, department, EAF, exp date visa)
3. Cek total funnel: jumlah per stage harus sama dengan jumlah baris di masing-masing sheet
4. Tes Export CSV di tab Pool — buka hasilnya di Excel
5. Tes ganti `TEAM_PASSWORD` → redeploy → pastikan password lama ditolak

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Login selalu gagal | `TEAM_PASSWORD` belum di-set untuk Production | Set env var, redeploy |
| Data kosong semua | `SMARTSHEET_TOKEN` salah/expired | Generate token baru, update env var, redeploy |
| Banner kuning "Some sheets could not be loaded" | Satu/lebih sheet gagal (izin token, sheet dipindah/dihapus) | Pastikan token punya akses ke semua 10 sheet |
| Kolom tertentu kosong ("—") | Judul kolom berubah di Smartsheet | Tambahkan alias baru di `ALIASES` dalam `api/pipeline.js` |
| Angka tidak update | Cache CDN 60 detik | Tunggu 1 menit atau klik Refresh |

## Arsitektur

```
bsm-pipeline-dashboard/
├── public/index.html    ← frontend (login gate + 6 tab, logo BSM embedded)
├── api/login.js         ← validasi TEAM_PASSWORD → token SHA-256
├── api/pipeline.js      ← fetch 10 sheet paralel (Promise.allSettled), pagination 500 baris,
│                          runtime column mapping + alias, cache CDN 60 detik
├── package.json         ← ESM
└── README.md
```

Keamanan: `SMARTSHEET_TOKEN` hanya hidup di server (env var Vercel). Browser hanya berkomunikasi dengan `/api/*` menggunakan token turunan password tim via header `x-auth-token`.
