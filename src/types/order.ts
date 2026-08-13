export type Platform = "shopee" | "tiktok" | "tokopedia" | "jubelio";

export type OrderStatus = 
  | "pending" 
  | "processing" 
  | "shipped" 
  | "delivered" 
  | "cancelled" 
  | "returned";

export interface Order {
  id: string;
  orderNumber: string;
  platform: Platform;
  customerName: string;
  recipientName?: string;
  productName: string;
  variation?: string;
  sku?: string;
  quantity: number;
  originalPrice?: number;
  price: number;
  totalAmount: number;
  status: OrderStatus;
  orderDate: Date;
  paidTime?: Date;
  shippedTime?: Date;
  mustShipBefore?: Date;
  shippingAddress?: string;
  city?: string;
  province?: string;
  trackingNumber?: string;
  shippingOption?: string;
  courier?: string;
  phone?: string;
  notes?: string;
  weight?: number;
  channelName?: string;
  storeName?: string;
  refNo?: string;
  pickupTime?: Date;
}

export interface OrderSummary {
  totalOrders: number;
  totalRevenue: number;
  totalItems: number;
  byPlatform: {
    shopee: { orders: number; revenue: number };
    tiktok: { orders: number; revenue: number };
    tokopedia: { orders: number; revenue: number };
    jubelio: { orders: number; revenue: number };
  };
  byStatus: Record<OrderStatus, number>;
}

export interface DailyStats {
  date: string;
  shopee: number;
  tiktok: number;
  tokopedia: number;
  jubelio: number;
  total: number;
}

export interface UploadedFile {
  name: string;
  platform: Platform;
  uploadedAt: Date;
  orderCount: number;
}
