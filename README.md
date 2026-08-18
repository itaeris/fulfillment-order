# Order Dashboard - Aeris Beaute Fulfillment

Dashboard webapp untuk mengelola dan menganalisis data order dari marketplace **Shopee**, **TikTok Shop / Tokopedia**, dan **Jubelio**. Data Shopee & Jubelio diimport dari Excel; order TikTok & Tokopedia ditarik langsung dari **TikTok Shop Open API**. Penyimpanan di **Supabase** (PostgreSQL).

**Live**: [fulfillment-order.vercel.app](https://fulfillment-order.vercel.app)

## Fitur

### Navigasi
- **Dashboard**: Kartu ringkasan + grafik (tren, platform, status)
- **Pesanan**: Tabel order dengan filter, pencarian, dan pagination
- **Komparasi**: Bandingkan Jubelio dengan Shopee / TikTok
- **Settings**: Import Excel, sync TikTok, export, reset data, profil, password, kelola user

### Sumber Data
- **Shopee & Jubelio**: Import Excel/CSV (drag & drop), auto-detect platform dari nama file dan header
- **TikTok & Tokopedia**: Sync API — tarik order siap dikirim (`AWAITING_SHIPMENT` + `AWAITING_COLLECTION`) tanpa export Excel
- Channel TikTok vs Tokopedia dibaca dari `commerce_platform` (`TIKTOK_SHOP` / `TOKOPEDIA`)

### Dashboard
- Total order, pendapatan, item terjual, dan rata-rata order
- Breakdown per platform (Shopee, TikTok & Tokopedia, Jubelio)
- Grafik tren pendapatan, distribusi platform, distribusi status

### Pesanan
- Filter platform: Semua | Shopee | TikTok & Tokopedia | Jubelio
- Sub-filter TikTok & Tokopedia: Semua | TikTok Shop by Tokopedia | Tokopedia
- Filter status: Belum Bayar, Perlu Dikirim, Dikirim, Selesai, Batal/Retur
- Sub-filter pengiriman: Instant / Reguler
- Sub-filter pickup: Sebelum Pickup, Sesudah Pickup, Siap Dikirim
- Sorting, pencarian (no. pesanan, customer, SKU, resi), indikator batas kirim, pagination
- Export CSV (Settings)

### Komparasi
- Cocokkan Jubelio vs marketplace via order number, ref number, atau tracking number
- Filter Platform Only: Semua | TikTok & Tokopedia | Shopee, plus sub-filter TTS vs Tokopedia
- Tombol Sync TikTok di halaman yang sama

### Autentikasi & Keamanan
- Login: email/username + password, atau Google OAuth
- Google OAuth hanya untuk domain `@aerisbeaute.com` dan `@fromthisisland.com`
- User harus didaftarkan admin sebelum bisa login (termasuk Google)
- **Admin**: akses penuh
- **Warehouse**: akses penuh, data keuangan disembunyikan
- Reset password via email atau Settings

### TikTok Shop API
- Hubungkan toko sekali di Settings → **Hubungkan TikTok** (OAuth seller, bukan tempel token)
- Izin aplikasi ke toko bisa **Unlimited**; access token API tetap habis ~4 jam
- App memperbarui access token otomatis lewat `refresh_token`
- Redirect URL di aplikasi TikTok: `{origin}/api/tiktok/callback`

### Lainnya
- PWA (install di desktop/mobile)
- Skeleton loader
- Responsive, tema warm brown/cream

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL + Auth)
- **Charts**: Recharts
- **Excel Parser**: xlsx (SheetJS)
- **Icons**: Lucide React
- **Date Utils**: date-fns
- **Hosting**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase project ([supabase.com](https://supabase.com))
- Aplikasi TikTok Shop di [Partner Center](https://partner.tiktokshop.com/) (untuk sync API)

### Installation

```bash
npm install
```

### Environment Variables

Buat file `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# TikTok Shop Open API
# sign & timestamp dihitung otomatis per-request (jangan disimpan)
#
# Di Vercel, access_token TIDAK di-update lewat Environment Variables
# (env statis, ganti env = redeploy). Token hasil refresh disimpan di
# tabel Supabase `tiktok_tokens` dan dipakai otomatis di production.
TIKTOK_APP_KEY=
TIKTOK_APP_SECRET=
TIKTOK_SHOP_CIPHER=
TIKTOK_SERVICE_ID=            # opsional, dari "Copy authorization link"
TIKTOK_BASE_URL=https://open-api.tiktokglobalshop.com
TIKTOK_API_VERSION=202309
```

Di Partner Center, Redirect URL boleh:

```
https://fulfillment-order.vercel.app/
https://fulfillment-order.vercel.app/api/tiktok/callback
```

Keduanya ditangani (callback ke `/` diteruskan ke `/api/tiktok/callback`). Lokal: `http://localhost:3000/` atau `http://localhost:3000/api/tiktok/callback`.

Di **Vercel Environment Variables** hanya simpan kredensial statis: `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_SHOP_CIPHER`, `TIKTOK_SERVICE_ID`. Access token yang berganti tiap 4 jam **tidak** ditulis ulang ke env Vercel (itu butuh redeploy). Setelah **Hubungkan TikTok** / sync, token baru disimpan di Supabase `tiktok_tokens` dan dipakai di production.

### Database Setup

Jalankan `supabase/migration.sql` di **Supabase Dashboard > SQL Editor** (tabel orders, files, profiles, tiktok_tokens, trigger auth).

### Run

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

### Build & Deploy

```bash
npm run build
npm start
```

Untuk Vercel: push ke GitHub, import di Vercel, set environment variables di Settings.

## Cara Penggunaan

### Import & Sync

| Platform | Sumber | Cara |
|----------|--------|------|
| Shopee | Seller Centre > Pesanan > Export | Settings → upload Excel/CSV |
| Jubelio | Jubelio > Sales Order > Export | Settings → upload Excel/XLSX |
| TikTok & Tokopedia | TikTok Shop API (To Ship) | Settings → Hubungkan TikTok (sekali) → Sync dari TikTok |

Sync TikTok mengganti seluruh snapshot order TikTok/Tokopedia dengan order siap dikirim terbaru.

### Google OAuth Setup

1. Buat OAuth Client ID di [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Set Authorized redirect URI: `https://<supabase-project>.supabase.co/auth/v1/callback`
3. Enable Google provider di Supabase Dashboard > Authentication > Providers
4. Paste Client ID dan Client Secret

### User Management

- Admin membuat user di **Settings > Kelola User > Tambah User**
- User yang belum didaftarkan tidak bisa login (termasuk Google)
- Admin bisa mengubah role dan menghapus user

## Struktur Project

```
src/
├── app/
│   ├── api/
│   │   ├── auth/create-user/    # Create user (admin, server-side)
│   │   ├── orders/              # CRUD order
│   │   ├── files/               # Riwayat file upload
│   │   └── tiktok/
│   │       ├── authorize/       # Mulai OAuth seller
│   │       ├── callback/        # Tukar auth code → token
│   │       ├── token/           # Status + jaga token tetap fresh
│   │       └── sync/            # Tarik order siap dikirim
│   ├── auth/callback/           # Google OAuth callback
│   ├── login/
│   ├── reset-password/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                 # Dashboard / Pesanan / Komparasi / Settings
├── components/
│   ├── Charts.tsx
│   ├── ComparisonView.tsx
│   ├── FileUpload.tsx           # Import Shopee & Jubelio
│   ├── OrderTable.tsx
│   ├── SettingsView.tsx
│   ├── Sidebar.tsx
│   ├── Skeleton.tsx
│   ├── SummaryCards.tsx
│   └── ServiceWorkerRegistrar.tsx
├── contexts/
│   └── AuthContext.tsx
├── lib/
│   ├── db.ts
│   ├── excel-parser.ts
│   ├── supabase.ts
│   ├── supabase-admin.ts
│   ├── tiktok-api.ts            # Client API + mapping order
│   ├── tiktok-auth.ts           # OAuth, refresh token, penyimpanan token
│   └── utils.ts
└── types/
    └── order.ts
public/
├── manifest.json
├── sw.js
└── icons/
supabase/
├── migration.sql
└── seed-admin.sql
```

## Format Kolom Excel yang Didukung

| Field | Shopee | TikTok Shop (legacy export) | Jubelio |
|-------|--------|-----------------------------|---------|
| No. Pesanan | No. Pesanan | Order ID | salesorder_no |
| Status | Status Pesanan | Order Status | channel_status |
| Customer | Username (Pembeli) | Buyer Username | customer_name |
| Produk | Nama Produk | Product Name | - |
| SKU | Nomor Referensi SKU | Seller SKU | - |
| Qty | Jumlah | Quantity | qty / total_qty |
| Total | Total Pembayaran | Order Amount | grand_total |
| Tanggal | Waktu Pesanan Dibuat | Created Time | transaction_date |
| Batas Kirim | Pesanan Harus Dikirimkan Sebelum | - | due_date |
| No. Resi | No. Resi | Tracking ID | tracking_no |
| Kurir | Opsi Pengiriman | Shipping Provider Name | shipper |
| Ref No | - | - | ref_no |
| Pickup Time | - | RTS Time | pickup_time_store |

## License

MIT
