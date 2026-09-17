import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartItemType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinanceService } from '../finance/finance.service';
import { NotificationsService } from '../notifications/notifications.service';

type CreateOrderResponse = {
  status: number;
  message?: string;
  consignment?: {
    consignment_id: number | string;
    tracking_code: string;
    status: string;
  };
};

type DeliveryStatusResponse = {
  status: number;
  delivery_status?: string;
  message?: string;
};

const STATUS_RANK: Record<OrderStatus, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PROCESSING: 2,
  SHIPPED: 3,
  DELIVERED: 4,
  RETURNED: 5,
  CANCELLED: 4,
};

const MANUAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [OrderStatus.RETURNED],
  RETURNED: [],
  CANCELLED: [],
};

@Injectable()
export class SteadfastService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SteadfastService.name);
  private timer?: NodeJS.Timeout;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly inventory: InventoryService,
    private readonly finance: FinanceService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (
      !this.isConfigured() ||
      this.config.get('STEADFAST_AUTO_SYNC') === 'false'
    ) {
      return;
    }

    const configuredInterval = Number(
      this.config.get<string>('STEADFAST_SYNC_INTERVAL_MS') ?? 300000,
    );
    const interval = Number.isFinite(configuredInterval)
      ? Math.max(60000, configuredInterval)
      : 300000;

    this.timer = setInterval(() => {
      void this.syncActiveOrders().catch((error: unknown) => {
        this.logger.error(
          error instanceof Error ? error.message : 'Steadfast sync failed',
        );
      });
    }, interval);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private isConfigured() {
    return Boolean(
      this.config.get<string>('STEADFAST_API_KEY')?.trim() &&
      this.config.get<string>('STEADFAST_SECRET_KEY')?.trim(),
    );
  }

  private headers() {
    const apiKey = this.config.get<string>('STEADFAST_API_KEY')?.trim();
    const secretKey = this.config.get<string>('STEADFAST_SECRET_KEY')?.trim();

    if (!apiKey || !secretKey) {
      throw new ServiceUnavailableException(
        'Steadfast API credentials সেট করা হয়নি',
      );
    }

    return {
      'Api-Key': apiKey,
      'Secret-Key': secretKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private baseUrl() {
    return (
      this.config.get<string>('STEADFAST_BASE_URL')?.trim() ||
      'https://portal.packzy.com/api/v1'
    ).replace(/\/$/, '');
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${this.baseUrl()}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as T & {
        message?: string;
      };

      if (!response.ok) {
        throw new BadGatewayException(
          body.message || `Steadfast HTTP ${response.status}`,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(
        error instanceof Error && error.name === 'AbortError'
          ? 'Steadfast API timeout'
          : 'Steadfast API-তে সংযোগ করা যায়নি',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private address(order: any) {
    const parts = [order.address, order.area, order.city]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);
    const address = [...new Set(parts)].join(', ');
    if (address.length > 250) {
      throw new BadRequestException(
        'Steadfast-এর জন্য সম্পূর্ণ ঠিকানা ২৫০ অক্ষরের মধ্যে হতে হবে',
      );
    }
    return address;
  }

  private itemDescription(order: any) {
    return order.items
      .map((item: any) => `${item.nameSnapshot} x ${item.quantity}`)
      .join(', ')
      .slice(0, 250);
  }

  async dispatchOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('অর্ডার পাওয়া যায়নি');

    if (
      order.steadfastSubmittedAt ||
      order.steadfastConsignmentId ||
      order.steadfastTrackingCode
    ) {
      return this.syncOrder(order.id);
    }
    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException(
        'শুধু CONFIRMED অর্ডার Steadfast-এ পাঠানো যাবে',
      );
    }

    const payload = {
      invoice: order.orderNumber,
      recipient_name: order.customerName.slice(0, 100),
      recipient_phone: order.phone,
      ...(order.alternativePhone
        ? { alternative_phone: order.alternativePhone }
        : {}),
      ...(order.email ? { recipient_email: order.email } : {}),
      recipient_address: this.address(order),
      cod_amount: Number(order.total),
      ...(order.note ? { note: order.note.slice(0, 500) } : {}),
      item_description: this.itemDescription(order),
      total_lot: order.items.reduce((sum, item) => sum + item.quantity, 0),
      delivery_type: order.deliveryType === 1 ? 1 : 0,
    };

    try {
      const result = await this.request<CreateOrderResponse>('/create_order', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (result.status !== 200 || !result.consignment) {
        throw new BadGatewayException(
          result.message || 'Steadfast consignment তৈরি হয়নি',
        );
      }

      const rawStatus = result.consignment.status || 'in_review';
      const updated = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PROCESSING,
          steadfastConsignmentId: String(result.consignment.consignment_id),
          steadfastTrackingCode: result.consignment.tracking_code,
          steadfastStatus: rawStatus,
          steadfastSubmittedAt: new Date(),
          steadfastLastSyncedAt: new Date(),
          steadfastError: null,
          history: {
            create: {
              status: OrderStatus.PROCESSING,
              note: `Steadfast-এ পাঠানো হয়েছে (${rawStatus})`,
            },
          },
        },
        include: {
          items: true,
          history: { orderBy: { createdAt: 'asc' } },
        },
      });
      await this.notifications.sendOrderStatus({
        customerId: updated.customerId,
        orderNumber: updated.orderNumber,
        status: updated.status,
        trackingToken: updated.publicTrackingToken,
      });
      return updated;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Steadfast dispatch failed';
      await this.prisma.order.update({
        where: { id: order.id },
        data: { steadfastError: message, steadfastLastSyncedAt: new Date() },
      });
      throw error;
    }
  }

  private localStatus(rawStatus: string, current: OrderStatus) {
    const mapping: Partial<Record<string, OrderStatus>> = {
      in_review: OrderStatus.PROCESSING,
      pending: OrderStatus.SHIPPED,
      delivered_approval_pending: OrderStatus.SHIPPED,
      partial_delivered_approval_pending: OrderStatus.SHIPPED,
      cancelled_approval_pending: OrderStatus.SHIPPED,
      delivered: OrderStatus.DELIVERED,
      partial_delivered: OrderStatus.DELIVERED,
      cancelled: OrderStatus.CANCELLED,
      hold: OrderStatus.SHIPPED,
    };
    const proposed = mapping[rawStatus] ?? current;

    if (
      proposed !== OrderStatus.CANCELLED &&
      STATUS_RANK[proposed] < STATUS_RANK[current]
    ) {
      return current;
    }
    return proposed;
  }

  private async restoreStock(tx: Prisma.TransactionClient, items: any[]) {
    for (const item of items) {
      if (item.itemType === CartItemType.PRODUCT) {
        if (item.variantId) {
          await tx.productVariant.updateMany({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        } else if (item.productId) {
          await tx.product.updateMany({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
        continue;
      }

      if (item.comboId) {
        await tx.combo.updateMany({
          where: { id: item.comboId },
          data: { stock: { increment: item.quantity } },
        });
      }

      const config = Array.isArray(item.customConfig) ? item.customConfig : [];
      for (const component of config) {
        const productId = String(component?.productId ?? '').trim();
        const quantity = Number(component?.quantity);
        if (!productId || !Number.isInteger(quantity) || quantity < 1) continue;
        await tx.product.updateMany({
          where: { id: productId },
          data: {
            stock: { increment: quantity * item.quantity },
          },
        });
      }
    }
  }

  async manualUpdateOrderStatus(
    orderId: string,
    status: OrderStatus,
    note?: string,
  ) {
    const id = String(orderId ?? '').trim();
    if (!id) throw new BadRequestException('orderId প্রয়োজন');
    if (!Object.values(OrderStatus).includes(status)) {
      throw new BadRequestException('সঠিক order status দিন');
    }

    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('অর্ডার পাওয়া যায়নি');

    if (!MANUAL_TRANSITIONS[order.status].includes(status)) {
      throw new BadRequestException(
        `${order.status} থেকে ${status} status-এ manually যাওয়া যাবে না`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (status === OrderStatus.CANCELLED) {
        await this.inventory.releaseOrder(tx, order);
      }
      if (status === OrderStatus.DELIVERED) {
        await this.inventory.deliverOrder(tx, order);
      }
      if (status === OrderStatus.RETURNED) {
        await this.inventory.returnOrder(tx, order);
        await this.finance.reverseReturnedOrder(tx, order.id);
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status,
          note:
            String(note ?? '')
              .trim()
              .slice(0, 300) || `Admin manually changed status to ${status}`,
        },
      });

      const saved = await tx.order.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === OrderStatus.DELIVERED
            ? { deliveredAt: new Date() }
            : {}),
          ...(status === OrderStatus.RETURNED
            ? { returnedAt: new Date() }
            : {}),
        },
        include: {
          items: true,
          history: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (status === OrderStatus.DELIVERED) {
        await this.finance.recognizeDeliveredOrder(tx, order.id);
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { items: true, history: { orderBy: { createdAt: 'asc' } } },
        });
      }
      return saved;
    });
    await this.notifications.sendOrderStatus({
      customerId: updated.customerId,
      orderNumber: updated.orderNumber,
      status: updated.status,
      trackingToken: updated.publicTrackingToken,
    });
    return updated;
  }

  async syncOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('অর্ডার পাওয়া যায়নি');

    const lookupPath = order.steadfastTrackingCode
      ? `/status_by_trackingcode/${encodeURIComponent(order.steadfastTrackingCode)}`
      : order.steadfastConsignmentId
        ? `/status_by_cid/${encodeURIComponent(order.steadfastConsignmentId)}`
        : `/status_by_invoice/${encodeURIComponent(order.orderNumber)}`;

    try {
      const result = await this.request<DeliveryStatusResponse>(lookupPath);
      if (result.status !== 200 || !result.delivery_status) {
        throw new BadGatewayException(
          result.message || 'Steadfast status পাওয়া যায়নি',
        );
      }

      const rawStatus = result.delivery_status.trim().toLowerCase();
      const nextStatus = this.localStatus(rawStatus, order.status);
      const rawChanged = rawStatus !== order.steadfastStatus;
      const statusChanged = nextStatus !== order.status;

      const updated = await this.prisma.$transaction(async (tx) => {
        const data: Prisma.OrderUpdateInput = {
          steadfastStatus: rawStatus,
          steadfastLastSyncedAt: new Date(),
          steadfastError: null,
        };

        if (nextStatus === OrderStatus.CANCELLED) {
          const claimed = await tx.order.updateMany({
            where: { id: order.id, status: { not: OrderStatus.CANCELLED } },
            data: {
              status: OrderStatus.CANCELLED,
              steadfastStatus: rawStatus,
              steadfastLastSyncedAt: new Date(),
              steadfastError: null,
            },
          });
          if (claimed.count === 1) {
            await this.inventory.releaseOrder(tx, order);
            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                status: OrderStatus.CANCELLED,
                note: 'Steadfast status: cancelled',
              },
            });
          }
        } else {
          if (statusChanged && nextStatus === OrderStatus.DELIVERED) {
            await this.inventory.deliverOrder(tx, order);
            data.deliveredAt = new Date();
          }
          if (statusChanged) data.status = nextStatus;
          if (rawChanged || statusChanged) {
            data.history = {
              create: {
                status: statusChanged ? nextStatus : order.status,
                note: `Steadfast status: ${rawStatus}`,
              },
            };
          }
          await tx.order.update({ where: { id: order.id }, data });
          if (statusChanged && nextStatus === OrderStatus.DELIVERED) {
            await this.finance.recognizeDeliveredOrder(tx, order.id);
          }
        }

        return tx.order.findUnique({
          where: { id: order.id },
          include: {
            items: true,
            history: { orderBy: { createdAt: 'asc' } },
          },
        });
      });
      if (statusChanged && updated) {
        await this.notifications.sendOrderStatus({
          customerId: updated.customerId,
          orderNumber: updated.orderNumber,
          status: updated.status,
          trackingToken: updated.publicTrackingToken,
        });
      }
      return updated;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Steadfast sync failed';
      await this.prisma.order.update({
        where: { id: order.id },
        data: { steadfastError: message, steadfastLastSyncedAt: new Date() },
      });
      throw error;
    }
  }

  async syncActiveOrders() {
    if (this.syncing) return { skipped: true, reason: 'Sync already running' };
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Steadfast API credentials সেট করা হয়নি',
      );
    }

    this.syncing = true;
    try {
      const orders = await this.prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.PROCESSING, OrderStatus.SHIPPED] },
          OR: [
            { steadfastSubmittedAt: { not: null } },
            { steadfastConsignmentId: { not: null } },
            { steadfastTrackingCode: { not: null } },
          ],
        },
        orderBy: { steadfastLastSyncedAt: 'asc' },
        take: 100,
        select: { id: true, orderNumber: true },
      });

      const results = [] as Array<{
        orderNumber: string;
        success: boolean;
        status?: string;
        error?: string;
      }>;
      for (const order of orders) {
        try {
          const updated = await this.syncOrder(order.id);
          results.push({
            orderNumber: order.orderNumber,
            success: true,
            status: updated?.status,
          });
        } catch (error) {
          results.push({
            orderNumber: order.orderNumber,
            success: false,
            error: error instanceof Error ? error.message : 'Sync failed',
          });
        }
      }
      return {
        skipped: false,
        total: results.length,
        succeeded: results.filter((item) => item.success).length,
        failed: results.filter((item) => !item.success).length,
        results,
      };
    } finally {
      this.syncing = false;
    }
  }
}
