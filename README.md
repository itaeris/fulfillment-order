# Order Dashboard - Aeris Beaute Fulfillment

Dashboard webapp untuk mengelola dan menganalisis data order dari marketplace **Shopee**, **TikTok Shop / Tokopedia**, dan **Jubelio**. Data diimport dari file Excel dan disimpan di **Supabase** (PostgreSQL).

**Live**: [fulfillment-order.vercel.app](https://fulfillment-order.vercel.app)

## Fitur

### Dashboard & Data
- **Import Excel/CSV**: Upload file export dari Shopee, TikTok Shop / Tokopedia, atau Jubelio (drag & drop atau pilih file)
- **Auto-detect Platform**: Otomatis mendeteksi platform berdasarkan nama file dan header kolom
- **Dashboard Summary**: Total order, pendapatan, item terjual, dan rata-rata order
- **Breakdown per Platform**: Statistik terpisah untuk Shopee, TikTok & Tokopedia, dan Jubelio
- **Visualisasi Data**: Grafik tren pendapatan, distribusi platform (pie chart), distribusi status (bar chart)
- **Komparasi Data**: Bandingkan data Jubelio dengan Shopee/TikTok via order number, ref number, atau tracking number

### Tabel Order
- Filter per platform dan status (Belum Bayar, Perlu Dikirim, Dikirim, Selesai, Batal/Retur)
- Sub-filter pengiriman: Instant / Reguler
- Sub-filter pickup stage: Sebelum Pickup, Sesudah Pickup, Siap Dikirim
- Sorting di semua kolom (A-Z, terbaru-terlama, dll)
- Pencarian berdasarkan no. pesanan, customer, SKU, atau no. resi
- Indikator visual batas waktu pengiriman
- Pagination
- Export CSV

### Autentikasi & Keamanan
- **Login**: Email/username + password, atau Google OAuth
- **Google OAuth**: Hanya domain `@aerisbeaute.com` dan `@fromthisisland.com` yang diizinkan
- **User Approval**: User harus didaftarkan oleh admin sebelum bisa login (termasuk via Google)
- **Role-Based Access**:
  - **Admin**: Akses penuh ke semua fitur
  - **Warehouse**: Akses penuh, tapi data keuangan (pendapatan, total, selisih) disembunyikan
- **Reset Password**: Via email link atau langsung dari Settings

### Settings
- Edit profil (nama, username)
- Ubah password
- Kelola user (admin only): tambah, ubah role, hapus user

### Lainnya
- **PWA**: Bisa di-install sebagai app di desktop/mobile
- **Responsive**: Desktop-first dengan sidebar, responsif di mobile
- **Tema**: Warm brown/cream color palette

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
```

### Database Setup

Jalankan `supabase/migration.sql` di **Supabase Dashboard > SQL Editor** untuk membuat tabel dan trigger.

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

### Import Data

| Platform | Sumber Export | Format |
|----------|-------------|--------|
| Shopee | Seller Centre > Pesanan > Export | Excel/CSV |
| TikTok & Tokopedia | Seller Center > Orders > Export Orders | XLSX |
| Jubelio | Jubelio > Sales Order > Export | Excel/XLSX |

### Google OAuth Setup

1. Buat OAuth Client ID di [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Set Authorized redirect URI: `https://<supabase-project>.supabase.co/auth/v1/callback`
3. Enable Google provider di Supabase Dashboard > Authentication > Providers
4. Paste Client ID dan Client Secret

### User Management

- Admin membuat user baru di **Settings > Kelola User > Tambah User**
- User yang belum didaftarkan tidak bisa login (termasuk via Google OAuth)
- Admin bisa mengubah role dan menghapus user

## Struktur Project

```
src/
├── app/
│   ├── api/
│   │   ├── auth/create-user/  # API create user (admin, server-side)
│   │   ├── orders/            # API CRUD order
│   │   └── files/             # API riwayat file upload
│   ├── auth/callback/         # OAuth callback page
│   ├── login/                 # Login page
│   ├── reset-password/        # Reset password page
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # Main dashboard
├── components/
│   ├── Charts.tsx             # Visualisasi data (Recharts)
│   ├── ComparisonView.tsx     # Komparasi Jubelio vs marketplace
│   ├── FileUpload.tsx         # Drag & drop upload
│   ├── OrderTable.tsx         # Tabel order dengan filter & sorting
│   ├── SettingsView.tsx       # Profil, password, kelola user
│   ├── Sidebar.tsx            # Navigasi sidebar
│   ├── SummaryCards.tsx       # Ringkasan statistik
│   └── ServiceWorkerRegistrar.tsx
├── contexts/
│   └── AuthContext.tsx        # Auth state & functions
├── lib/
│   ├── db.ts                  # Operasi database Supabase
│   ├── excel-parser.ts        # Parser Excel per platform
│   ├── supabase.ts            # Supabase client (lazy init)
│   └── utils.ts               # Utilitas (format, kalkulasi)
└── types/
    └── order.ts               # TypeScript interfaces
public/
├── manifest.json              # PWA manifest
├── sw.js                      # Service worker
└── icons/                     # PWA icons (192x192, 512x512)
supabase/
└── migration.sql              # Schema & trigger SQL
```

## Format Kolom yang Didukung

| Field | Shopee | TikTok Shop | Jubelio |
|-------|--------|-------------|---------|
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
