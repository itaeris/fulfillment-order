import * as XLSX from "xlsx";
import { Order, Platform, OrderStatus } from "@/types/order";

// Exact column mappings based on actual export files (case-insensitive matching will be used)
const COLUMN_MAPPINGS: Record<Platform, Record<string, string>> = {
  shopee: {
    // Order identification
    "No. Pesanan": "orderNumber",
    "Status Pesanan": "status",
    "Status Pembatalan/ Pengembalian": "cancelStatus",
    "No. Resi": "trackingNumber",
    "Opsi Pengiriman": "shippingOption",
    "Antar ke counter/ pick-up": "deliveryMethod",
    
    // Dates
    "Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)": "mustShipBefore",
    "Waktu Pengiriman Diatur": "shippingScheduled",
    "Waktu Pesanan Dibuat": "orderDate",
    "Waktu Pembayaran Dilakukan": "paidTime",
    "Waktu Pesanan Selesai": "completedTime",
    
    // Order info
    "Tipe Pesanan": "orderType",
    "Metode Pembayaran": "paymentMethod",
    
    // Product info
    "SKU Induk": "parentSku",
    "Nama Produk": "productName",
    "Nomor Referensi SKU": "sku",
    "Nama Variasi": "variation",
    
    // Pricing
    "Harga Awal": "originalPrice",
    "Harga Setelah Diskon": "price",
    "Jumlah": "quantity",
    "Jumlah Produk di Pesan": "quantity",
    "Returned quantity": "returnedQty",
    "Subtotal Pesanan": "subtotal",
    "Total Diskon": "totalDiscount",
    "Diskon Dari Penjual": "sellerDiscount",
    "Diskon Dari Shopee": "platformDiscount",
    "Voucher Ditanggung Penjual": "sellerVoucher",
    "Cashback Koin": "cashbackCoin",
    "Voucher Ditanggung Shopee": "platformVoucher",
    "Paket Diskon": "bundleDiscount",
    "Paket Diskon (Diskon dari Shopee)": "bundleDiscountPlatform",
    "Paket Diskon (Diskon dari Penjual)": "bundleDiscountSeller",
    "Potongan Koin Shopee": "coinDeduction",
    "Diskon Kartu Kredit": "ccDiscount",
    "Total Pembayaran": "totalAmount",
    
    // Shipping
    "Berat Produk": "productWeight",
    "Total Berat": "weight",
    "Ongkos Kirim Dibayar oleh Pembeli": "shippingFee",
    "Estimasi Potongan Biaya Pengiriman": "shippingDiscount",
    "Ongkos Kirim Pengembalian Barang": "returnShippingFee",
    "Perkiraan Ongkos Kirim": "estimatedShipping",
    
    // Customer info
    "Catatan dari Pembeli": "notes",
    "Catatan": "sellerNotes",
    "Username (Pembeli)": "customerName",
    "Nama Penerima": "recipientName",
    "No. Telepon": "phone",
    "Alamat Pengiriman": "shippingAddress",
    "Kota/Kabupaten": "city",
    "Provinsi": "province",
  },
  
  tiktok: {
    // Order identification
    "Order ID": "orderNumber",
    "Order Status": "status",
    "Order Substatus": "subStatus",
    "Cancelation/Return Type": "cancelStatus",
    "Normal or Pre-order": "orderType",
    
    // Product info
    "SKU ID": "skuId",
    "Seller SKU": "sku",
    "Product Name": "productName",
    "Variation": "variation",
    "Quantity": "quantity",
    "Sku Quantity of return": "returnedQty",
    "Product Category": "category",
    
    // Pricing
    "SKU Unit Original Price": "originalPrice",
    "SKU Subtotal Before Discount": "subtotalBefore",
    "SKU Platform Discount": "platformDiscount",
    "SKU Seller Discount": "sellerDiscount",
    "SKU Subtotal After Discount": "price",
    "Order Amount": "totalAmount",
    "Order Refund Amount": "refundAmount",
    "Payment platform discount": "paymentPlatformDiscount",
    "Buyer Service Fee": "buyerServiceFee",
    "Handling Fee": "handlingFee",
    "Shipping Insurance": "shippingInsurance",
    "Item Insurance": "itemInsurance",
    
    // Shipping fees
    "Shipping Fee After Discount": "shippingFee",
    "Original Shipping Fee": "originalShipping",
    "Shipping Fee Seller Discount": "shippingSellerDiscount",
    "Shipping Fee Platform Discount": "shippingPlatformDiscount",
    "Distance Shipping Fee": "distanceShippingFee",
    "Distance Fee": "distanceFee",
    
    // Dates
    "Created Time": "orderDate",
    "Paid Time": "paidTime",
    "RTS Time": "rtsTime",
    "Shipped Time": "shippedTime",
    "Delivered Time": "deliveredTime",
    "Cancelled Time": "cancelledTime",
    
    // Cancellation
    "Cancel By": "cancelBy",
    "Cancel Reason": "cancelReason",
    
    // Fulfillment
    "Fulfillment Type": "fulfillmentType",
    "Warehouse Name": "warehouse",
    "Tracking ID": "trackingNumber",
    "Delivery Option": "shippingOption",
    "Shipping Provider Name": "courier",
    
    // Customer info
    "Buyer Message": "notes",
    "Buyer Username": "customerName",
    "Recipient": "recipientName",
    "Phone #": "phone",
    "Zipcode": "zipcode",
    "Country": "country",
    "Province": "province",
    "Regency and City": "city",
    "Districts": "district",
    "Villages": "village",
    "Detail Address": "shippingAddress",
    "Additional address information": "additionalAddress",
    
    // Other
    "Payment Method": "paymentMethod",
    "Weight(kg)": "weight",
    "Package ID": "packageId",
    "Purchase Channel": "channel",
    "Seller Note": "sellerNotes",
    "Checked Status": "checkedStatus",
    "Checked Marked by": "checkedMarkedBy",
    "Tokopedia Invoice Number": "tokopediaInvoice",
    "Order Channel": "orderChannel",
    "Creator Handle": "creatorHandle",
  },
  
  jubelio: {
    // Order identification
    "salesorder_id": "salesorderId",
    "salesorder_no": "orderNumber",
    "channel_status": "status",
    "sub_status": "subStatus",
    "status": "jubelioStatus",
    "status_details": "statusDetails",
    
    // Dates
    "transaction_date": "orderDate",
    "due_date": "mustShipBefore",
    "due_date_minute": "dueDateMinute",
    "pickup_time_store": "pickupTime",
    
    // Customer
    "contact_id": "contactId",
    "customer_name": "customerName",
    
    // Product & quantity
    "qty": "quantity",
    "total_qty": "totalQty",
    
    // Pricing
    "grand_total": "totalAmount",
    
    // Shipping
    "shipper": "courier",
    "tracking_no": "trackingNumber",
    "tracking_number": "trackingNumber",
    "booking_no": "bookingNo",
    "shipment_type": "shippingOption",
    "total_weight_order": "weight",
    
    // Fulfillment
    "fulfillment_sla": "fulfillmentSla",
    "priority_fulfillment_tag": "priorityTag",
    "picked_in": "pickedIn",
    "wms_status": "wmsStatus",
    "picklist_no": "picklistNo",
    "picklist_id": "picklistId",
    "packlist_id": "packlistId",
    "package_count": "packageCount",
    "packages": "packages",
    
    // Store / Channel info
    "store_id": "storeId",
    "store_name": "storeName",
    "location_id": "locationId",
    "location_name": "locationName",
    "source": "source",
    "source_name": "sourceName",
    "channel_name": "channelName",
    
    // Order details
    "ref_no": "refNo",
    "invoice_no": "invoiceNo",
    "order_type": "orderType",
    "dropshipper": "dropshipper",
    "extra_info": "extraInfo",
    "warehouse_type": "warehouseType",
    "is_po": "isPo",
    "is_cod": "isCod",
    "is_tokopedia_plus": "isTokopediaPlus",
    "logo": "logo",
  },

  tokopedia: {
    // Order identification
    "Nomor Invoice": "orderNumber",
    "Invoice": "orderNumber",
    "No Invoice": "orderNumber",
    "Status Pesanan": "status",
    "Status": "status",
    
    // Product info
    "Nama Produk": "productName",
    "Produk": "productName",
    "SKU": "sku",
    "Jumlah Produk": "quantity",
    "Jumlah": "quantity",
    "Qty": "quantity",
    
    // Pricing
    "Harga Jual": "price",
    "Harga Satuan": "price",
    "Harga": "price",
    "Total Penjualan": "totalAmount",
    "Total Harga Produk": "totalAmount",
    "Total": "totalAmount",
    
    // Customer info
    "Nama Pembeli": "customerName",
    "Pembeli": "customerName",
    "Nama Penerima": "recipientName",
    "Alamat Pengiriman": "shippingAddress",
    "Alamat": "shippingAddress",
    "Kota": "city",
    "Provinsi": "province",
    "No HP": "phone",
    "Nomor HP": "phone",
    
    // Shipping
    "No Resi": "trackingNumber",
    "Nomor Resi": "trackingNumber",
    "Kurir": "courier",
    "Layanan Pengiriman": "shippingOption",
    
    // Dates
    "Tanggal Pembayaran": "paidTime",
    "Tanggal Pesanan Dibuat": "orderDate",
    "Waktu Pesanan Dibuat": "orderDate",
    "Batas Waktu Pengiriman": "mustShipBefore",
    
    // Notes
    "Catatan Pembeli": "notes",
    "Catatan": "notes",
  },
};

// Status mappings for Shopee
const SHOPEE_STATUS_MAPPINGS: Record<string, OrderStatus> = {
  // Pending payment
  "belum bayar": "pending",
  "menunggu pembayaran": "pending",
  
  // Need to ship / Processing
  "perlu dikirim": "processing",
  "siap kirim": "processing",
  "sedang diproses": "processing",
  "menunggu pickup": "processing",
  "menunggu pengambilan": "processing",
  "pickup": "processing",
  
  // Shipped / In transit
  "sedang dikirim": "shipped",
  "dikirim": "shipped",
  "dalam pengiriman": "shipped",
  "paket telah dikirim": "shipped",
  
  // Delivered / Completed
  "selesai": "delivered",
  "pesanan selesai": "delivered",
  "telah diterima": "delivered",
  "diterima": "delivered",
  "completed": "delivered",
  
  // Cancelled
  "dibatalkan": "cancelled",
  "batal": "cancelled",
  "cancelled": "cancelled",
  
  // Returned
  "pengembalian": "returned",
  "pengajuan pengembalian": "returned",
  "dikembalikan": "returned",
  "retur": "returned",
  "refund": "returned",
};

// Status mappings for TikTok
const TIKTOK_STATUS_MAPPINGS: Record<string, OrderStatus> = {
  // Pending / Unpaid
  "unpaid": "pending",
  "belum bayar": "pending",
  
  // Perlu dikirim / Need to ship / Processing
  "perlu dikirim": "processing",
  "awaiting shipment": "processing",
  "awaiting collection": "processing",
  "menunggu pengambilan": "processing",
  "ready to ship": "processing",
  "siap dikirim": "processing",
  "to ship": "processing",
  "dalam proses": "processing",
  "in process": "processing",
  "processing": "processing",
  
  // Dikirim / Shipped
  "dikirim": "shipped",
  "shipped": "shipped",
  "partially shipping": "shipped",
  "in transit": "shipped",
  "sedang dikirim": "shipped",
  "on delivery": "shipped",
  "out for delivery": "shipped",
  
  // Selesai / Completed / Delivered
  "selesai": "delivered",
  "delivered": "delivered",
  "completed": "delivered",
  "telah diterima": "delivered",
  
  // Dibatalkan / Cancelled
  "dibatalkan": "cancelled",
  "cancelled": "cancelled",
  "cancellation in process": "cancelled",
  "canceled": "cancelled",
  
  // Pengantaran gagal / Delivery failed - treat as shipped (needs redelivery)
  "pengantaran gagal": "shipped",
  "delivery failed": "shipped",
  "failed delivery": "shipped",
  
  // Returned
  "returned": "returned",
  "return in process": "returned",
  "dikembalikan": "returned",
  "retur": "returned",
};

// Status mappings for Jubelio
const JUBELIO_STATUS_MAPPINGS: Record<string, OrderStatus> = {
  // Pending
  "waiting payment": "pending",
  "menunggu pembayaran": "pending",
  "pending": "pending",
  "unpaid": "pending",

  // Processing / Ready to ship
  "ready to ship": "processing",
  "ready to process": "processing",
  "waiting for pickup": "processing",
  "waiting pickup": "processing",
  "processing": "processing",
  "open": "processing",
  "confirm": "processing",
  "confirmed": "processing",
  "to ship": "processing",
  "ready to pack": "processing",
  "packing": "processing",
  "packed": "processing",

  // Shipped
  "shipped": "shipped",
  "in transit": "shipped",
  "on delivery": "shipped",
  "delivering": "shipped",
  "in delivery": "shipped",

  // Delivered / Completed
  "delivered": "delivered",
  "completed": "delivered",
  "done": "delivered",
  "settled": "delivered",

  // Cancelled
  "cancelled": "cancelled",
  "canceled": "cancelled",
  "void": "cancelled",

  // Returned
  "returned": "returned",
  "return": "returned",
  "refunded": "returned",
};

// Status mappings for Tokopedia
const TOKOPEDIA_STATUS_MAPPINGS: Record<string, OrderStatus> = {
  "menunggu pembayaran": "pending",
  "pesanan baru": "processing",
  "siap dikirim": "processing",
  "dalam pengiriman": "shipped",
  "dikirim": "shipped",
  "tiba di tujuan": "delivered",
  "selesai": "delivered",
  "pesanan selesai": "delivered",
  "dibatalkan": "cancelled",
  "batal": "cancelled",
  "dikembalikan": "returned",
};

function normalizeStatus(rawStatus: string, platform: Platform): OrderStatus {
  const normalized = rawStatus?.toString().trim().toLowerCase() || "";
  
  let mappings: Record<string, OrderStatus>;
  switch (platform) {
    case "shopee":
      mappings = SHOPEE_STATUS_MAPPINGS;
      break;
    case "tiktok":
      mappings = TIKTOK_STATUS_MAPPINGS;
      break;
    case "tokopedia":
      mappings = TOKOPEDIA_STATUS_MAPPINGS;
      break;
    case "jubelio":
      mappings = JUBELIO_STATUS_MAPPINGS;
      break;
    default:
      mappings = {};
  }
  
  // Direct match (case-insensitive)
  if (mappings[normalized]) {
    return mappings[normalized];
  }
  
  // Generic fallback
  if (normalized.includes("pending") || normalized.includes("tunggu") || normalized.includes("bayar") || normalized.includes("unpaid")) {
    return "pending";
  }
  if (normalized.includes("ship") || normalized.includes("kirim") || normalized.includes("transit")) {
    return "shipped";
  }
  if (normalized.includes("process") || normalized.includes("proses") || normalized.includes("ready") || normalized.includes("awaiting")) {
    return "processing";
  }
  if (normalized.includes("deliver") || normalized.includes("selesai") || normalized.includes("complete") || normalized.includes("tiba")) {
    return "delivered";
  }
  if (normalized.includes("cancel") || normalized.includes("batal")) {
    return "cancelled";
  }
  if (normalized.includes("return") || normalized.includes("kembali") || normalized.includes("refund")) {
    return "returned";
  }
  
  return "processing"; // Default to processing for "to ship" orders
}

function parseDate(value: unknown): Date {
  if (!value) return new Date();
  
  if (value instanceof Date) return value;
  
  if (typeof value === "number") {
    // Excel serial date
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + value * 86400000);
  }
  
  const strValue = String(value).trim();
  
  // Handle various date formats
  // DD-MM-YYYY HH:mm or DD/MM/YYYY HH:mm
  const dmyMatch = strValue.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmyMatch) {
    const [, day, month, year, hour = "0", min = "0", sec = "0"] = dmyMatch;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );
  }
  
  // YYYY-MM-DD HH:mm:ss
  const isoMatch = strValue.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const [, year, month, day, hour = "0", min = "0", sec = "0"] = isoMatch;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );
  }
  
  // Fallback to Date.parse
  const parsed = new Date(strValue);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  
  const strValue = String(value)
    .replace(/[Rp.\s]/g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  
  const num = parseFloat(strValue);
  return isNaN(num) ? 0 : num;
}

function findColumnMapping(
  headers: string[],
  platform: Platform
): Record<string, number> {
  const mapping: Record<string, number> = {};
  const platformMappings = COLUMN_MAPPINGS[platform];
  
  // Create lowercase lookup map
  const lowerMappings: Record<string, string> = {};
  for (const [key, value] of Object.entries(platformMappings)) {
    lowerMappings[key.toLowerCase()] = value;
  }
  
  headers.forEach((header, index) => {
    if (!header) return;
    const normalizedHeader = header.toString().trim();
    const lowerHeader = normalizedHeader.toLowerCase();
    
    // Direct match
    if (platformMappings[normalizedHeader]) {
      const field = platformMappings[normalizedHeader];
      if (mapping[field] === undefined) {
        mapping[field] = index;
      }
      return;
    }
    
    // Case-insensitive match
    if (lowerMappings[lowerHeader]) {
      const field = lowerMappings[lowerHeader];
      if (mapping[field] === undefined) {
        mapping[field] = index;
      }
    }
  });
  
  return mapping;
}

// Auto-detect platform based on column headers
function detectPlatformFromHeaders(headers: string[]): Platform | null {
  const headerStr = headers.join(" ").toLowerCase();
  
  // Jubelio specific columns (check first - most unique headers)
  if (headerStr.includes("salesorder_id") || headerStr.includes("salesorder_no") || (headerStr.includes("channel_status") && headerStr.includes("grand_total"))) {
    return "jubelio";
  }
  
  // TikTok specific columns
  if (headerStr.includes("order id") && (headerStr.includes("buyer username") || headerStr.includes("sku subtotal"))) {
    return "tiktok";
  }
  
  // Shopee specific columns
  if (headerStr.includes("no. pesanan") || headerStr.includes("username (pembeli)")) {
    return "shopee";
  }
  
  // Tokopedia specific columns
  if (headerStr.includes("nomor invoice") || headerStr.includes("nama pembeli")) {
    return "tokopedia";
  }
  
  return null;
}

export function parseExcelFile(
  buffer: ArrayBuffer,
  platform: Platform
): Order[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const orders: Order[] = [];
  
  // Process first sheet
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON with headers
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    header: 1,
    raw: false,
    dateNF: "yyyy-mm-dd",
  }) as unknown[][];
  
  if (jsonData.length < 2) {
    console.log("File has less than 2 rows");
    return orders;
  }
  
  // Find header row (first row with multiple non-empty cells that looks like headers)
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, jsonData.length); i++) {
    const row = jsonData[i];
    if (!row) continue;
    
    const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && cell !== "");
    
    // Check if this row looks like a header (has text cells, not just numbers)
    const hasTextCells = row.some(cell => {
      if (!cell) return false;
      const str = String(cell).trim();
      return str.length > 0 && isNaN(Number(str));
    });
    
    if (nonEmptyCells.length > 5 && hasTextCells) {
      // Check if this looks like TikTok/Shopee headers
      const rowStr = row.join(" ").toLowerCase();
      if (rowStr.includes("order") || rowStr.includes("pesanan") || rowStr.includes("product") || rowStr.includes("produk") || rowStr.includes("salesorder")) {
        headerRowIndex = i;
        break;
      }
    }
  }
  
  const headers = (jsonData[headerRowIndex] || []) as string[];
  console.log("Headers found at row", headerRowIndex, ":", headers.slice(0, 10));
  
  // Auto-detect platform from headers if needed
  const detectedPlatform = detectPlatformFromHeaders(headers);
  const finalPlatform = detectedPlatform || platform;
  console.log("Using platform:", finalPlatform, "(detected:", detectedPlatform, ", provided:", platform, ")");
  
  const columnMapping = findColumnMapping(headers, finalPlatform);
  console.log("Column mapping:", columnMapping);
  
  // If no orderNumber column found, try to find any ID-like column
  if (columnMapping.orderNumber === undefined) {
    headers.forEach((header, index) => {
      if (!header) return;
      const lower = header.toString().toLowerCase();
      if ((lower.includes("order") && lower.includes("id")) || lower === "id" || lower.includes("invoice") || lower.includes("pesanan")) {
        if (columnMapping.orderNumber === undefined) {
          columnMapping.orderNumber = index;
          console.log("Found order number column at index", index, ":", header);
        }
      }
    });
  }
  
  // Process data rows
  for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    
    // Skip empty rows
    const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && cell !== "");
    if (nonEmptyCells.length < 3) continue;
    
    const getValue = (field: string): unknown => {
      const colIndex = columnMapping[field];
      return colIndex !== undefined ? row[colIndex] : undefined;
    };
    
    let orderNumber = getValue("orderNumber")?.toString()?.trim() || "";
    // Jubelio: fallback to salesorderId if no salesorder_no
    if (!orderNumber && finalPlatform === "jubelio") {
      orderNumber = getValue("salesorderId")?.toString()?.trim() || "";
    }
    if (!orderNumber) {
      // Try first column as fallback
      const firstCell = row[0]?.toString()?.trim() || "";
      if (!firstCell || firstCell.length < 5) continue;
    }
    
    const finalOrderNumber = orderNumber || row[0]?.toString()?.trim() || "";
    if (!finalOrderNumber) continue;
    
    const quantity = parseNumber(getValue("quantity")) || parseNumber(getValue("totalQty")) || 1;
    const price = parseNumber(getValue("price"));
    const originalPrice = parseNumber(getValue("originalPrice")) || price;
    let totalAmount = parseNumber(getValue("totalAmount"));
    
    // Calculate total if not available
    if (!totalAmount && price) {
      totalAmount = price * quantity;
    }
    
    const order: Order = {
      id: `${finalPlatform}-${finalOrderNumber}-${i}`,
      orderNumber: finalOrderNumber,
      platform: finalPlatform,
      customerName: getValue("customerName")?.toString()?.trim() || getValue("recipientName")?.toString()?.trim() || "Unknown",
      recipientName: getValue("recipientName")?.toString()?.trim(),
      productName: getValue("productName")?.toString()?.trim() || (finalPlatform === "jubelio" ? `Order ${finalOrderNumber}` : "Unknown Product"),
      variation: getValue("variation")?.toString()?.trim(),
      sku: getValue("sku")?.toString()?.trim(),
      quantity,
      originalPrice,
      price,
      totalAmount,
      status: normalizeStatus(getValue("status")?.toString() || "", finalPlatform),
      orderDate: parseDate(getValue("orderDate")),
      paidTime: getValue("paidTime") ? parseDate(getValue("paidTime")) : undefined,
      shippedTime: getValue("shippedTime") ? parseDate(getValue("shippedTime")) : undefined,
      mustShipBefore: getValue("mustShipBefore") ? parseDate(getValue("mustShipBefore")) : undefined,
      shippingAddress: getValue("shippingAddress")?.toString()?.trim(),
      city: getValue("city")?.toString()?.trim(),
      province: getValue("province")?.toString()?.trim(),
      trackingNumber: getValue("trackingNumber")?.toString()?.trim(),
      shippingOption: getValue("shippingOption")?.toString()?.trim(),
      courier: getValue("courier")?.toString()?.trim(),
      phone: getValue("phone")?.toString()?.trim(),
      notes: getValue("notes")?.toString()?.trim(),
      weight: parseNumber(getValue("weight")) || undefined,
      channelName: getValue("channelName")?.toString()?.trim(),
      storeName: getValue("storeName")?.toString()?.trim(),
    };
    
    orders.push(order);
  }
  
  console.log("Parsed", orders.length, "orders");
  return orders;
}

export function detectPlatform(filename: string): Platform {
  const lower = filename.toLowerCase();
  
  // Jubelio patterns
  if (lower.includes("jubelio") || lower.includes("salesorder")) {
    return "jubelio";
  }
  
  // Shopee patterns
  if (lower.includes("shopee") || lower.includes("order.toship") || lower.includes("pesanan_shopee")) {
    return "shopee";
  }
  
  // TikTok patterns
  if (lower.includes("tiktok") || lower.includes("tik tok") || lower.includes("tt_") || lower.includes("untuk dikirim")) {
    return "tiktok";
  }
  
  // Tokopedia patterns
  if (lower.includes("tokopedia") || lower.includes("tokped")) {
    return "tokopedia";
  }
  
  // Fallback: will auto-detect from headers
  return "shopee";
}
