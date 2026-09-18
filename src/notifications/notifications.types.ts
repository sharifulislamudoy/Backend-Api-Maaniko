import { OrderStatus } from '@prisma/client';

export type PushIdentity = {
  guestId: string;
  customerToken?: string;
};

export type RegisterPushDeviceInput = {
  token: string;
  allowOffers?: boolean;
  platform?: string;
  userAgent?: string;
};

export type SendOfferInput = {
  title: string;
  body: string;
  link?: string;
  imageUrl?: string;
};

export type CreatePushCampaignInput = SendOfferInput & {
  sourceKey?: string;
};

export type OrderStatusPushInput = {
  customerId: string;
  orderNumber: string;
  status: OrderStatus;
  trackingToken?: string | null;
};
