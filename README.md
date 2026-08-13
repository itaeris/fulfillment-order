# Order Dashboard - Shopee & TikTok Shop / Tokopedia & Jubelio

Dashboard webapp untuk menampilkan dan menganalisis data order dari marketplace **Shopee**, **TikTok Shop / Tokopedia**, dan **Jubelio** yang diimport dari file Excel. Data disimpan secara persisten menggunakan SQLite, sehingga tetap ada meskipun halaman di-refresh.

## Fitur

- **Import Excel/CSV**: Upload file export dari Shopee, TikTok Shop / Tokopedia, atau Jubelio (drag & drop atau pilih file)
- **Auto-detect Platform**: Sistem otomatis mendeteksi platform berdasarkan nama file maupun header kolom di dalam file
- **Penyimpanan Persisten**: Data tersimpan di database SQLite lokal (`data/orders.db`), tidak hilang saat refresh
- **Dashboard Summary**: Ringkasan total order, pendapatan, item terjual, dan rata-rata order
- **Breakdown per Platform**: Statistik terpisah untuk Shopee, TikTok Shop/Tokopedia (digabung), dan Jubelio
- **Visualisasi Data**:
  - Grafik tren pendapatan harian (area chart)
  - Pie chart distribusi pendapatan per platform
  - Bar chart distribusi status pesanan
- **Tabel Order ala Seller Center**:
  - Tab filter per platform (Semua, Shopee, TikTok & Tokopedia, Jubelio)
  - Tab filter per status (Semua, Belum Bayar, Perlu Dikirim, Dikirim, Selesai, Batal/Retur)
  - Pencarian berdasarkan no. pesanan, customer, SKU, atau no. resi
  - Sorting berdasarkan tanggal, total, customer, status, atau batas waktu kirim
  - Indikator visual untuk pesanan yang mendekati/melewati batas waktu pengiriman
  - Pagination
- **Export CSV**: Download seluruh data order dalam format CSV

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (better-sqlite3)
- **Charts**: Recharts
- **Excel Parser**: xlsx (SheetJS)
- **Icons**: Lucide React
- **Date Utils**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install dependencies
npm install

# Jalankan development server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser. Database SQLite akan otomatis dibuat di folder `data/orders.db` saat pertama kali dijalankan.

### Build for Production

```bash
npm run build
npm start
```

## Cara Penggunaan

### 1. Import Data dari Shopee

1. Login ke [Shopee Seller Centre](https://seller.shopee.co.id)
2. Buka menu **Pesanan** > pilih tab pesanan yang diinginkan (mis. Perlu Dikirim)
3. Klik **Export** dan pilih format Excel/CSV
4. Di dashboard, pilih platform **Shopee**, lalu upload file hasil export

### 2. Import Data dari TikTok Shop / Tokopedia

1. Login ke [TikTok Shop Seller Center](https://seller-id.tiktok.com)
2. Buka menu **Orders** > **Manage Orders**
3. Klik **Export Orders** dan pilih format XLSX
4. Di dashboard, pilih platform **TikTok & Tokopedia**, lalu upload file hasil export

> Sejak integrasi TikTok Shop dan Tokopedia, keduanya ditampilkan sebagai satu kategori platform di dashboard.

### 3. Import Data dari Jubelio

1. Login ke [Jubelio](https://app.jubelio.com)
2. Buka menu **Sales Order**
3. Klik **Export** dan pilih format Excel/XLSX
4. Di dashboard, pilih platform **Jubelio**, lalu upload file hasil export

> Jubelio adalah platform omnichannel yang mengagregasi order dari berbagai marketplace. Kolom `channel_name` dan `store_name` juga diparsing untuk referensi asal channel.

### Reset Data

Klik tombol **Reset** di header untuk menghapus seluruh data order dan riwayat file yang tersimpan di database.

## Struktur Project

```
src/
├── app/
│   ├── api/
│   │   ├── orders/route.ts  # API untuk GET/POST/DELETE order
│   │   └── files/route.ts   # API untuk GET/POST/DELETE riwayat file upload
│   ├── globals.css          # Global styles & Tailwind
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main dashboard page
├── components/
│   ├── Charts.tsx           # Recharts visualizations
│   ├── FileUpload.tsx       # Drag & drop upload
│   ├── OrderTable.tsx       # Tabel data dengan tab & filter ala seller center
│   └── SummaryCards.tsx     # Ringkasan statistik
├── lib/
│   ├── db.ts                # Setup & operasi database SQLite
│   ├── excel-parser.ts      # Logika parsing Excel/CSV per platform
│   └── utils.ts             # Fungsi utilitas (format, kalkulasi summary, dll)
└── types/
    └── order.ts             # TypeScript interfaces
data/
└── orders.db                # File database SQLite (dibuat otomatis, di-gitignore)
```

## Format Kolom yang Didukung

Parser membaca header kolom asli dari file export marketplace (case-insensitive) dan otomatis memetakannya. Beberapa kolom utama yang dikenali:

| Field | Shopee | TikTok Shop | Jubelio |
|-------|--------|--------------|---------|
| No. Pesanan | No. Pesanan | Order ID | salesorder_no |
| Status | Status Pesanan | Order Status | channel_status |
| Customer | Username (Pembeli) | Buyer Username | customer_name |
| Produk | Nama Produk | Product Name | - (order level) |
| SKU | Nomor Referensi SKU | Seller SKU | - |
| Qty | Jumlah | Quantity | qty / total_qty |
| Total | Total Pembayaran | Order Amount | grand_total |
| Tanggal Order | Waktu Pesanan Dibuat | Created Time | transaction_date |
| Batas Kirim | Pesanan Harus Dikirimkan Sebelum... | - | due_date |
| No. Resi | No. Resi | Tracking ID | tracking_no / tracking_number |
| Kurir | Opsi Pengiriman | Shipping Provider Name | shipper |
| Alamat | Alamat Pengiriman | Detail Address | - |
| Telepon | No. Telepon | Phone # | - |
| Channel | - | - | channel_name |
| Store | - | - | store_name |

Jika struktur file sedikit berbeda, sistem akan mencoba mendeteksi platform dari isi header dan mencari kolom ID pesanan secara otomatis sebagai fallback.

## Catatan

- Database SQLite (`data/orders.db`) tidak di-commit ke git (lihat `.gitignore`).
- Untuk memindahkan data ke server lain, cukup salin folder `data/`.

## License

MIT
