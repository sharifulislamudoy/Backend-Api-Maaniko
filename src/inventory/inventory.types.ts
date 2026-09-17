import type { InventoryMovementType } from '@prisma/client';

export type InventoryTarget = 'PRODUCT' | 'VARIANT';

export type InventoryAdjustmentInput = {
  targetType: InventoryTarget;
  productId: string;
  variantId?: string;
  mode: 'ADD' | 'REMOVE' | 'SET';
  quantity: number;
  movementType?: InventoryMovementType;
  supplierName?: string;
  supplierPhone?: string;
  purchaseCost?: number;
  packagingCost?: number;
  sellingPrice?: number;
  mrp?: number | null;
  note?: string;
};

export type AdminOrderEditInput = {
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    applyPriceToCatalog?: boolean;
  }>;
  deliveryCharge?: number;
  courierCost?: number;
  gatewayFee?: number;
  otherCost?: number;
  note?: string;
};
