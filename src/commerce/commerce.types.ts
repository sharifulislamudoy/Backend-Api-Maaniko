import type {
  CartItemType,
  CustomerEventType,
  LeadType,
  OrderStatus,
} from '@prisma/client';

export type CommerceIdentity = {
  guestId: string;
  sessionId?: string;
  customerToken?: string;
};

export type ComboConfigItemInput = {
  productId: string;
  quantity: number;
};

export type CartItemInput = {
  itemType: CartItemType;
  productId?: string;
  variantId?: string;
  comboId?: string;
  quantity: number;
  customConfig?: ComboConfigItemInput[];
};

export type ContactInput = {
  name: string;
  phone: string;
  email?: string;
  marketingConsent?: boolean;
  source?: string;
};

export type CheckoutDraftInput = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  area?: string;
  city?: string;
  note?: string;
  completedField?: string;
};

export type TrackingEventInput = {
  type: CustomerEventType;
  path?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

export type BuyNowItemInput = {
  itemType: CartItemType;
  productId?: string;
  variantId?: string;
  comboId?: string;
  quantity: number;
  customConfig?: ComboConfigItemInput[];
};

export type OrderQuoteInput = {
  mode: 'CART' | 'BUY_NOW';
  item?: BuyNowItemInput;
};

export type CreateOrderInput = OrderQuoteInput & {
  customer: {
    name: string;
    phone: string;
    alternativePhone?: string;
    email?: string;
    address: string;
    area?: string;
    city?: string;
    note?: string;
    deliveryType?: 0 | 1;
    marketingConsent?: boolean;
  };
};

export type LeadInput = {
  type: LeadType;
  name?: string;
  phone?: string;
  email?: string;
  marketingConsent?: boolean;
  productId?: string;
  comboId?: string;
  data?: Record<string, unknown>;
};

export type CareProfileInput = {
  journeySlug?: string;
  interests?: string[];
  budgetMin?: number;
  budgetMax?: number;
};

export type RestoreInput = {
  name: string;
  phone: string;
};

export type AdminOrderStatusInput = {
  status: OrderStatus;
  note?: string;
};

export type QuoteConfigItem = {
  productId: string;
  quantity: number;
  name: string;
  image?: string;
  unitPrice: number;
  lineTotal: number;
};

export type QuoteLine = {
  clientKey: string;
  itemType: CartItemType;
  productId?: string;
  variantId?: string;
  comboId?: string;
  quantity: number;
  name: string;
  sku?: string;
  image?: string;
  unitPrice: number;
  lineTotal: number;
  customConfig?: QuoteConfigItem[];
};

export type OrderQuote = {
  items: QuoteLine[];
  subtotal: number;
  deliveryCharge: number;
  total: number;
};
