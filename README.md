# Order Dashboard - Shopee & TikTok Shop / Tokopedia

Dashboard webapp untuk menampilkan dan menganalisis data order dari marketplace **Shopee** dan **TikTok Shop / Tokopedia** yang diimport dari file Excel. Data disimpan secara persisten menggunakan SQLite, sehingga tetap ada meskipun halaman di-refresh.

## Fitur

- **Import Excel/CSV**: Upload file export dari Shopee atau TikTok Shop / Tokopedia (drag & drop atau pilih file)
- **Auto-detect Platform**: Sistem otomatis mendeteksi platform berdasarkan nama file maupun header kolom di dalam file
- **Penyimpanan Persisten**: Data tersimpan di database SQLite lokal (`data/orders.db`), tidak hilang saat refresh
- **Dashboard Summary**: Ringkasan total order, pendapatan, item terjual, dan rata-rata order
- **Breakdown per Platform**: Statistik terpisah untuk Shopee dan TikTok Shop/Tokopedia (digabung)
- **Visualisasi Data**:
  - Grafik tren pendapatan harian (area chart)
  - Pie chart distribusi pendapatan per platform
  - Bar chart distribusi status pesanan
- **Tabel Order ala Seller Center**:
  - Tab filter per platform (Semua, Shopee, TikTok & Tokopedia)
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

| Field | Shopee | TikTok Shop |
|-------|--------|--------------|
| No. Pesanan | No. Pesanan | Order ID |
| Status | Status Pesanan | Order Status |
| Customer | Username (Pembeli) | Buyer Username |
| Penerima | Nama Penerima | Recipient |
| Produk | Nama Produk | Product Name |
| Variasi | Nama Variasi | Variation |
| SKU | Nomor Referensi SKU | Seller SKU |
| Qty | Jumlah | Quantity |
| Harga | Harga Setelah Diskon | SKU Subtotal After Discount |
| Total | Total Pembayaran | Order Amount |
| Tanggal Order | Waktu Pesanan Dibuat | Created Time |
| Batas Kirim | Pesanan Harus Dikirimkan Sebelum... | - |
| No. Resi | No. Resi | Tracking ID |
| Kurir | Opsi Pengiriman | Shipping Provider Name |
| Alamat | Alamat Pengiriman | Detail Address |
| Telepon | No. Telepon | Phone # |

Jika struktur file sedikit berbeda, sistem akan mencoba mendeteksi platform dari isi header dan mencari kolom ID pesanan secara otomatis sebagai fallback.

## Catatan

- Database SQLite (`data/orders.db`) tidak di-commit ke git (lihat `.gitignore`).
- Untuk memindahkan data ke server lain, cukup salin folder `data/`.

## License

MIT
