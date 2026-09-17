import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CartItemType,
  InventoryMovementType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { QuoteLine } from '../commerce/commerce.types';
import type { InventoryAdjustmentInput } from './inventory.types';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private number(value: Prisma.Decimal | number | string | null | undefined) {
    return Number(value ?? 0);
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private clean(value: unknown, max = 300) {
    const text = String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    return text ? text.slice(0, max) : undefined;
  }

  private orderComponents(value: Prisma.JsonValue | null) {
    if (!Array.isArray(value))
      return [] as { productId: string; quantity: number }[];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const productId = String(item.productId ?? '').trim();
      const quantity = Number(item.quantity);
      return productId && Number.isInteger(quantity) && quantity > 0
        ? [{ productId, quantity }]
        : [];
    });
  }

  private async changeReservation(
    tx: Prisma.TransactionClient,
    target: { productId?: string; variantId?: string; comboId?: string },
    quantity: number,
    action: 'RESERVE' | 'RELEASE',
    orderId?: string,
  ) {
    if (!quantity) return;
    const increment = action === 'RESERVE' ? quantity : -quantity;
    const movement =
      action === 'RESERVE'
        ? InventoryMovementType.RESERVED
        : InventoryMovementType.RELEASED;

    if (target.variantId) {
      const row = await tx.productVariant.findUnique({
        where: { id: target.variantId },
      });
      if (!row) throw new NotFoundException('Variant পাওয়া যায়নি');
      if (action === 'RESERVE' && row.stock - row.reservedStock < quantity) {
        throw new ConflictException('Variant পর্যাপ্ত স্টকে নেই');
      }
      if (action === 'RELEASE' && row.reservedStock < quantity) {
        throw new ConflictException('Reserved variant stock সঠিক নয়');
      }
      const updated = await tx.productVariant.updateMany({
        where: { id: row.id, reservedStock: row.reservedStock },
        data: { reservedStock: { increment } },
      });
      if (updated.count !== 1)
        throw new ConflictException('Stock পরিবর্তিত হয়েছে, আবার চেষ্টা করুন');
      await tx.inventoryMovement.create({
        data: {
          type: movement,
          productId: row.productId,
          variantId: row.id,
          orderId,
          quantity: action === 'RESERVE' ? -quantity : quantity,
          previousStock: row.stock,
          newStock: row.stock,
          note:
            action === 'RESERVE'
              ? 'Order stock reserved'
              : 'Order reservation released',
        },
      });
      return;
    }

    if (target.productId) {
      const row = await tx.product.findUnique({
        where: { id: target.productId },
      });
      if (!row) throw new NotFoundException('Product পাওয়া যায়নি');
      if (action === 'RESERVE' && row.stock - row.reservedStock < quantity) {
        throw new ConflictException(`"${row.name}" পর্যাপ্ত স্টকে নেই`);
      }
      if (action === 'RELEASE' && row.reservedStock < quantity) {
        throw new ConflictException(`"${row.name}" reserved stock সঠিক নয়`);
      }
      const updated = await tx.product.updateMany({
        where: { id: row.id, reservedStock: row.reservedStock },
        data: { reservedStock: { increment } },
      });
      if (updated.count !== 1)
        throw new ConflictException('Stock পরিবর্তিত হয়েছে, আবার চেষ্টা করুন');
      await tx.inventoryMovement.create({
        data: {
          type: movement,
          productId: row.id,
          orderId,
          quantity: action === 'RESERVE' ? -quantity : quantity,
          previousStock: row.stock,
          newStock: row.stock,
          note:
            action === 'RESERVE'
              ? 'Order stock reserved'
              : 'Order reservation released',
        },
      });
    }

    if (target.comboId) {
      const row = await tx.combo.findUnique({ where: { id: target.comboId } });
      if (!row) throw new NotFoundException('Solution Box পাওয়া যায়নি');
      if (action === 'RESERVE' && row.stock - row.reservedStock < quantity) {
        throw new ConflictException(`"${row.name}" পর্যাপ্ত স্টকে নেই`);
      }
      if (action === 'RELEASE' && row.reservedStock < quantity) {
        throw new ConflictException(`"${row.name}" reserved stock সঠিক নয়`);
      }
      await tx.combo.update({
        where: { id: row.id },
        data: { reservedStock: { increment } },
      });
    }
  }

  async reserveQuote(tx: Prisma.TransactionClient, lines: QuoteLine[]) {
    for (const line of lines) {
      if (line.itemType === CartItemType.PRODUCT) {
        await this.changeReservation(
          tx,
          { productId: line.productId, variantId: line.variantId },
          line.quantity,
          'RESERVE',
        );
        continue;
      }
      if (line.comboId) {
        await this.changeReservation(
          tx,
          { comboId: line.comboId },
          line.quantity,
          'RESERVE',
        );
      }
      for (const component of line.customConfig ?? []) {
        await this.changeReservation(
          tx,
          { productId: component.productId },
          component.quantity * line.quantity,
          'RESERVE',
        );
      }
    }
  }

  async releaseOrder(tx: Prisma.TransactionClient, order: any) {
    for (const item of order.items) {
      if (item.itemType === CartItemType.PRODUCT) {
        await this.changeReservation(
          tx,
          { productId: item.productId, variantId: item.variantId },
          item.quantity,
          'RELEASE',
          order.id,
        );
        continue;
      }
      if (item.comboId) {
        await this.changeReservation(
          tx,
          { comboId: item.comboId },
          item.quantity,
          'RELEASE',
          order.id,
        );
      }
      for (const component of this.orderComponents(item.customConfig)) {
        await this.changeReservation(
          tx,
          { productId: component.productId },
          component.quantity * item.quantity,
          'RELEASE',
          order.id,
        );
      }
    }
  }

  private async sellTarget(
    tx: Prisma.TransactionClient,
    target: { productId?: string; variantId?: string; comboId?: string },
    quantity: number,
    orderId: string,
  ) {
    if (target.variantId) {
      const row = await tx.productVariant.findUnique({
        where: { id: target.variantId },
      });
      if (!row || row.stock < quantity || row.reservedStock < quantity) {
        throw new ConflictException('Variant stock finalise করা যাচ্ছে না');
      }
      await tx.productVariant.update({
        where: { id: row.id },
        data: {
          stock: { decrement: quantity },
          reservedStock: { decrement: quantity },
          soldStock: { increment: quantity },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.SOLD,
          productId: row.productId,
          variantId: row.id,
          orderId,
          quantity: -quantity,
          previousStock: row.stock,
          newStock: row.stock - quantity,
          unitCost: row.purchaseCost,
          note: 'Delivered order',
        },
      });
      return;
    }
    if (target.productId) {
      const row = await tx.product.findUnique({
        where: { id: target.productId },
      });
      if (!row || row.stock < quantity || row.reservedStock < quantity) {
        throw new ConflictException('Product stock finalise করা যাচ্ছে না');
      }
      await tx.product.update({
        where: { id: row.id },
        data: {
          stock: { decrement: quantity },
          reservedStock: { decrement: quantity },
          soldStock: { increment: quantity },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.SOLD,
          productId: row.id,
          orderId,
          quantity: -quantity,
          previousStock: row.stock,
          newStock: row.stock - quantity,
          unitCost: row.purchaseCost,
          note: 'Delivered order',
        },
      });
    }
    if (target.comboId) {
      await tx.combo.update({
        where: { id: target.comboId },
        data: {
          stock: { decrement: quantity },
          reservedStock: { decrement: quantity },
          soldStock: { increment: quantity },
        },
      });
    }
  }

  async deliverOrder(tx: Prisma.TransactionClient, order: any) {
    for (const item of order.items) {
      if (item.itemType === CartItemType.PRODUCT) {
        await this.sellTarget(
          tx,
          { productId: item.productId, variantId: item.variantId },
          item.quantity,
          order.id,
        );
        continue;
      }
      if (item.comboId)
        await this.sellTarget(
          tx,
          { comboId: item.comboId },
          item.quantity,
          order.id,
        );
      for (const component of this.orderComponents(item.customConfig)) {
        await this.sellTarget(
          tx,
          { productId: component.productId },
          component.quantity * item.quantity,
          order.id,
        );
      }
    }
  }

  private async returnTarget(
    tx: Prisma.TransactionClient,
    target: { productId?: string; variantId?: string; comboId?: string },
    quantity: number,
    orderId: string,
  ) {
    if (target.variantId) {
      const row = await tx.productVariant.findUnique({
        where: { id: target.variantId },
      });
      if (!row) return;
      await tx.productVariant.update({
        where: { id: row.id },
        data: {
          stock: { increment: quantity },
          soldStock: { decrement: Math.min(quantity, row.soldStock) },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.RETURNED,
          productId: row.productId,
          variantId: row.id,
          orderId,
          quantity,
          previousStock: row.stock,
          newStock: row.stock + quantity,
          note: 'Returned order restocked',
        },
      });
      return;
    }
    if (target.productId) {
      const row = await tx.product.findUnique({
        where: { id: target.productId },
      });
      if (!row) return;
      await tx.product.update({
        where: { id: row.id },
        data: {
          stock: { increment: quantity },
          soldStock: { decrement: Math.min(quantity, row.soldStock) },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.RETURNED,
          productId: row.id,
          orderId,
          quantity,
          previousStock: row.stock,
          newStock: row.stock + quantity,
          note: 'Returned order restocked',
        },
      });
    }
    if (target.comboId) {
      const combo = await tx.combo.findUnique({
        where: { id: target.comboId },
      });
      if (combo)
        await tx.combo.update({
          where: { id: combo.id },
          data: {
            stock: { increment: quantity },
            soldStock: { decrement: Math.min(quantity, combo.soldStock) },
          },
        });
    }
  }

  async returnOrder(tx: Prisma.TransactionClient, order: any) {
    for (const item of order.items) {
      if (item.itemType === CartItemType.PRODUCT) {
        await this.returnTarget(
          tx,
          { productId: item.productId, variantId: item.variantId },
          item.quantity,
          order.id,
        );
        continue;
      }
      if (item.comboId)
        await this.returnTarget(
          tx,
          { comboId: item.comboId },
          item.quantity,
          order.id,
        );
      for (const component of this.orderComponents(item.customConfig)) {
        await this.returnTarget(
          tx,
          { productId: component.productId },
          component.quantity * item.quantity,
          order.id,
        );
      }
    }
  }

  async list(search?: string) {
    const term = this.clean(search, 100);
    const products = await this.prisma.product.findMany({
      where: term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { sku: { contains: term, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { updatedAt: 'desc' },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variants: {
          include: {
            values: { include: { value: { include: { attribute: true } } } },
          },
        },
      },
    });
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      image: product.images[0]?.url ?? null,
      category: product.category.name,
      status: product.status,
      stock: product.stock,
      reservedStock: product.reservedStock,
      availableStock: Math.max(0, product.stock - product.reservedStock),
      soldStock: product.soldStock,
      purchaseCost: this.number(product.purchaseCost),
      packagingCost: this.number(product.packagingCost),
      sellingPrice: this.number(product.price),
      mrp: product.compareAtPrice ? this.number(product.compareAtPrice) : null,
      stockValue: this.money(product.stock * this.number(product.purchaseCost)),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        label: variant.values
          .map((entry) => `${entry.value.attribute.name}: ${entry.value.value}`)
          .join(', '),
        stock: variant.stock,
        reservedStock: variant.reservedStock,
        availableStock: Math.max(0, variant.stock - variant.reservedStock),
        soldStock: variant.soldStock,
        purchaseCost: this.number(variant.purchaseCost),
        packagingCost: this.number(variant.packagingCost),
        sellingPrice: variant.price
          ? this.number(variant.price)
          : this.number(product.price),
        mrp: variant.compareAtPrice
          ? this.number(variant.compareAtPrice)
          : null,
      })),
    }));
  }

  async adjust(input: InventoryAdjustmentInput) {
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 0)
      throw new BadRequestException('সঠিক quantity দিন');
    const isVariant = input.targetType === 'VARIANT';
    if (isVariant && !input.variantId)
      throw new BadRequestException('variantId প্রয়োজন');

    return this.prisma.$transaction(async (tx) => {
      const supplierName = this.clean(input.supplierName, 160);
      const supplier = supplierName
        ? await tx.supplier.upsert({
            where: { name: supplierName },
            update: { phone: this.clean(input.supplierPhone, 40) },
            create: {
              name: supplierName,
              phone: this.clean(input.supplierPhone, 40),
            },
          })
        : null;

      const row = isVariant
        ? await tx.productVariant.findUnique({
            where: { id: input.variantId! },
          })
        : await tx.product.findUnique({ where: { id: input.productId } });
      if (!row)
        throw new NotFoundException(
          isVariant ? 'Variant পাওয়া যায়নি' : 'Product পাওয়া যায়নি',
        );
      const previousStock = row.stock;
      const nextStock =
        input.mode === 'SET'
          ? quantity
          : input.mode === 'ADD'
            ? previousStock + quantity
            : previousStock - quantity;
      const reservedStock = row.reservedStock;
      if (nextStock < reservedStock || nextStock < 0)
        throw new ConflictException(
          `কমপক্ষে ${reservedStock} stock রাখতে হবে; এগুলো order-এর জন্য reserved`,
        );

      const oldCost = this.number(row.purchaseCost);
      const incomingCost =
        input.purchaseCost === undefined
          ? undefined
          : Math.max(0, Number(input.purchaseCost));
      const weightedCost =
        input.mode === 'ADD' && quantity > 0 && incomingCost !== undefined
          ? this.money(
              (previousStock * oldCost + quantity * incomingCost) /
                (previousStock + quantity || 1),
            )
          : incomingCost;
      const commonData: any = {
        stock: nextStock,
        ...(weightedCost !== undefined ? { purchaseCost: weightedCost } : {}),
        ...(input.packagingCost !== undefined
          ? { packagingCost: Math.max(0, Number(input.packagingCost)) }
          : {}),
        ...(input.sellingPrice !== undefined
          ? { price: Math.max(0, Number(input.sellingPrice)) }
          : {}),
        ...(input.mrp !== undefined
          ? {
              compareAtPrice:
                input.mrp === null ? null : Math.max(0, Number(input.mrp)),
            }
          : {}),
      };
      const updated = isVariant
        ? await tx.productVariant.update({
            where: { id: input.variantId! },
            data: commonData,
          })
        : await tx.product.update({
            where: { id: input.productId },
            data: commonData,
          });

      const signedQuantity = nextStock - previousStock;
      await tx.inventoryMovement.create({
        data: {
          type:
            input.movementType ??
            (input.mode === 'ADD'
              ? InventoryMovementType.PURCHASE
              : input.mode === 'REMOVE'
                ? InventoryMovementType.MANUAL_OUT
                : InventoryMovementType.ADJUSTMENT),
          productId: input.productId,
          variantId: isVariant ? input.variantId : null,
          supplierId: supplier?.id,
          quantity: signedQuantity,
          unitCost: incomingCost,
          previousStock,
          newStock: nextStock,
          note: this.clean(input.note),
        },
      });
      return updated;
    });
  }

  async productHistory(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: true,
        inventoryMovements: {
          include: { supplier: true, variant: true },
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
        orderItems: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                customerName: true,
                phone: true,
                status: true,
                createdAt: true,
                deliveredAt: true,
              },
            },
            variant: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
      },
    });
    if (!product) throw new NotFoundException('Product পাওয়া যায়নি');
    return {
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        reservedStock: product.reservedStock,
        availableStock: Math.max(0, product.stock - product.reservedStock),
        soldStock: product.soldStock,
        purchaseCost: this.number(product.purchaseCost),
        sellingPrice: this.number(product.price),
      },
      analytics: {
        totalOrderedQuantity: product.orderItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        deliveredQuantity: product.orderItems
          .filter((item) => item.order.status === OrderStatus.DELIVERED)
          .reduce((sum, item) => sum + item.quantity, 0),
        uniqueCustomers: new Set(
          product.orderItems.map((item) => item.order.phone),
        ).size,
        totalStockAdded: product.inventoryMovements
          .filter(
            (item) =>
              item.quantity > 0 &&
              item.type !== InventoryMovementType.RELEASED &&
              item.type !== InventoryMovementType.RETURNED,
          )
          .reduce((sum, item) => sum + item.quantity, 0),
      },
      customers: product.orderItems.map((item) => ({
        id: item.id,
        orderId: item.order.id,
        orderNumber: item.order.orderNumber,
        customerName: item.order.customerName,
        phone: item.order.phone,
        status: item.order.status,
        quantity: item.quantity,
        unitPrice: this.number(item.unitPrice),
        variantSku: item.variant?.sku ?? null,
        orderedAt: item.order.createdAt,
        deliveredAt: item.order.deliveredAt,
      })),
      movements: product.inventoryMovements.map((item) => ({
        id: item.id,
        type: item.type,
        quantity: item.quantity,
        previousStock: item.previousStock,
        newStock: item.newStock,
        unitCost: item.unitCost ? this.number(item.unitCost) : null,
        supplier: item.supplier?.name ?? null,
        variantSku: item.variant?.sku ?? null,
        note: item.note,
        createdAt: item.createdAt,
      })),
    };
  }

  suppliers() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }
}
