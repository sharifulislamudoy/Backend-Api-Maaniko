import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CartStatus,
  CatalogStatus,
  LeadType,
  OrderStatus,
  Prisma,
  ReferralStatus,
  ReminderStatus,
  ReminderType,
  RewardTransactionType,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  ApplyReferralInput,
  EngagementIdentity,
  ReorderPreferenceInput,
  RewardAdjustmentInput,
} from './engagement.types';

@Injectable()
export class EngagementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngagementService.name);
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    const interval = Math.max(
      60_000,
      Number(process.env.ENGAGEMENT_INTERVAL_MS ?? 10 * 60_000),
    );
    this.timer = setInterval(() => {
      void this.processLifecycle().catch((error: unknown) =>
        this.logger.error(
          error instanceof Error
            ? error.message
            : 'Lifecycle processing failed',
        ),
      );
    }, interval);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private clean(value: unknown, max = 180) {
    return typeof value === 'string'
      ? value.trim().replace(/\s+/g, ' ').slice(0, max)
      : '';
  }

  private async customerId(identity: EngagementIdentity) {
    const rawToken = this.clean(identity.customerToken, 500);
    if (rawToken) {
      const access = await this.prisma.customerAccessToken.findUnique({
        where: { tokenHash: this.hash(rawToken) },
        select: { customerId: true },
      });
      if (access) return access.customerId;
    }
    const guestId = this.clean(identity.guestId);
    if (!guestId) return null;
    const device = await this.prisma.deviceIdentity.findUnique({
      where: { guestId },
      select: { customerId: true },
    });
    return device?.customerId ?? null;
  }

  private async requireCustomer(identity: EngagementIdentity) {
    const customerId = await this.customerId(identity);
    if (!customerId) {
      throw new UnauthorizedException(
        'প্রথমে নাম ও ফোন নম্বর দিয়ে profile যুক্ত করুন',
      );
    }
    return customerId;
  }

  private referralCode() {
    return `MAA${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private async ensureReferralCode(customerId: string) {
    const customer = await this.prisma.customerProfile.findUnique({
      where: { id: customerId },
      select: { referralCode: true },
    });
    if (!customer) throw new NotFoundException('Customer পাওয়া যায়নি');
    if (customer.referralCode) return customer.referralCode;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = this.referralCode();
      try {
        await this.prisma.customerProfile.update({
          where: { id: customerId },
          data: { referralCode: code },
        });
        return code;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
      }
    }
    throw new BadRequestException('Referral code তৈরি করা যায়নি');
  }

  async dashboard(identity: EngagementIdentity) {
    const customerId = await this.requireCustomer(identity);
    await this.processLifecycle();
    const referralCode = await this.ensureReferralCode(customerId);

    const customer = await this.prisma.customerProfile.findUnique({
      where: { id: customerId },
      include: {
        rewardTransactions: { orderBy: { createdAt: 'desc' }, take: 50 },
        referralsMade: {
          orderBy: { createdAt: 'desc' },
          include: {
            referredCustomer: { select: { name: true, createdAt: true } },
          },
        },
        lifecycleReminders: {
          where: {
            type: ReminderType.REORDER,
            status: { in: [ReminderStatus.PENDING, ReminderStatus.SENT] },
          },
          orderBy: { dueAt: 'asc' },
          include: {
            product: {
              select: {
                name: true,
                slug: true,
                images: { orderBy: { sortOrder: 'asc' }, take: 1 },
              },
            },
            orderItem: { select: { nameSnapshot: true, imageSnapshot: true } },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer পাওয়া যায়নি');

    const recommendations = await this.prisma.product.findMany({
      where: {
        status: CatalogStatus.ACTIVE,
        stock: { gt: 0 },
        ...(customer.journeySlug
          ? { journeys: { some: { journey: { slug: customer.journeySlug } } } }
          : {}),
        ...(customer.budgetMax ? { price: { lte: customer.budgetMax } } : {}),
      },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    });

    const pointValue = Math.max(
      0.01,
      Number(process.env.REWARD_POINT_VALUE_BDT ?? 1),
    );
    return {
      wallet: {
        points: customer.rewardBalance,
        value: customer.rewardBalance * pointValue,
        pointValue,
        earnEveryBdt: Math.max(
          1,
          Number(process.env.REWARD_EARN_EVERY_BDT ?? 100),
        ),
        earnPoints: Math.max(1, Number(process.env.REWARD_EARN_POINTS ?? 1)),
      },
      referral: {
        code: referralCode,
        completed: customer.referralsMade.filter(
          (item) => item.status === ReferralStatus.REWARDED,
        ).length,
        pending: customer.referralsMade.filter(
          (item) => item.status === ReferralStatus.PENDING,
        ).length,
        rewardPoints: Math.max(
          1,
          Number(process.env.REFERRAL_REWARD_POINTS ?? 100),
        ),
        items: customer.referralsMade.map((item) => ({
          id: item.id,
          name: item.referredCustomer.name,
          status: item.status,
          joinedAt: item.referredCustomer.createdAt,
        })),
      },
      transactions: customer.rewardTransactions,
      reminders: customer.lifecycleReminders.map((item) => ({
        id: item.id,
        status: item.status,
        dueAt: item.dueAt,
        name:
          item.product?.name ?? item.orderItem?.nameSnapshot ?? 'পুনরায় অর্ডার',
        image:
          item.product?.images[0]?.url ?? item.orderItem?.imageSnapshot ?? null,
        href: item.product ? `/products/${item.product.slug}` : '/orders',
      })),
      careProfile: {
        journeySlug: customer.journeySlug,
        interests: customer.interests,
        budgetMin: customer.budgetMin,
        budgetMax: customer.budgetMax,
        babyBirthDate: customer.babyBirthDate,
        expectedDeliveryDate: customer.expectedDeliveryDate,
        babyGender: customer.babyGender,
        feedingPreference: customer.feedingPreference,
        reorderRemindersEnabled: customer.reorderRemindersEnabled,
      },
      recommendations: recommendations.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: Number(product.price),
        image: product.images[0]?.url ?? null,
      })),
    };
  }

  async applyReferral(identity: EngagementIdentity, input: ApplyReferralInput) {
    const customerId = await this.requireCustomer(identity);
    const code = this.clean(input.code, 40).toUpperCase();
    if (!code) throw new BadRequestException('Referral code দিন');

    const [customer, referrer, deliveredOrders] = await Promise.all([
      this.prisma.customerProfile.findUnique({ where: { id: customerId } }),
      this.prisma.customerProfile.findUnique({ where: { referralCode: code } }),
      this.prisma.order.count({
        where: { customerId, status: OrderStatus.DELIVERED },
      }),
    ]);
    if (!customer) throw new NotFoundException('Customer পাওয়া যায়নি');
    if (!referrer) throw new NotFoundException('Referral code সঠিক নয়');
    if (referrer.id === customerId)
      throw new BadRequestException('নিজের code ব্যবহার করা যাবে না');
    if (customer.referredById)
      throw new BadRequestException('Referral code আগে ব্যবহার করা হয়েছে');
    if (deliveredOrders > 0)
      throw new BadRequestException(
        'প্রথম delivery-এর আগেই referral code ব্যবহার করতে হয়',
      );

    await this.prisma.$transaction([
      this.prisma.customerProfile.update({
        where: { id: customerId },
        data: { referredById: referrer.id },
      }),
      this.prisma.referral.create({
        data: { referrerId: referrer.id, referredCustomerId: customerId },
      }),
    ]);
    return { applied: true, referrerName: referrer.name };
  }

  async updateReorderPreference(
    identity: EngagementIdentity,
    input: ReorderPreferenceInput,
  ) {
    const customerId = await this.requireCustomer(identity);
    const reminder = await this.prisma.lifecycleReminder.findFirst({
      where: {
        id: this.clean(input.reminderId),
        customerId,
        type: ReminderType.REORDER,
      },
    });
    if (!reminder) throw new NotFoundException('Reminder পাওয়া যায়নি');
    const dueAt = input.dueAt ? new Date(input.dueAt) : reminder.dueAt;
    if (Number.isNaN(dueAt.getTime()))
      throw new BadRequestException('Reminder date সঠিক নয়');
    return this.prisma.lifecycleReminder.update({
      where: { id: reminder.id },
      data: {
        status: input.enabled
          ? ReminderStatus.PENDING
          : ReminderStatus.CANCELLED,
        dueAt,
        sentAt: input.enabled ? null : reminder.sentAt,
      },
    });
  }

  private async createReward(input: {
    customerId: string;
    orderId?: string;
    type: RewardTransactionType;
    points: number;
    description: string;
    dedupeKey: string;
  }) {
    try {
      await this.prisma.$transaction([
        this.prisma.rewardTransaction.create({ data: input }),
        this.prisma.customerProfile.update({
          where: { id: input.customerId },
          data: { rewardBalance: { increment: input.points } },
        }),
      ]);
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return false;
      throw error;
    }
  }

  private async processDeliveredOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.DELIVERED },
      orderBy: { deliveredAt: 'desc' },
      take: 500,
      include: {
        customer: true,
        items: { include: { product: { select: { reorderAfterDays: true } } } },
      },
    });
    const earnEvery = Math.max(
      1,
      Number(process.env.REWARD_EARN_EVERY_BDT ?? 100),
    );
    const earnPoints = Math.max(1, Number(process.env.REWARD_EARN_POINTS ?? 1));
    const referralPoints = Math.max(
      1,
      Number(process.env.REFERRAL_REWARD_POINTS ?? 100),
    );
    const defaultReorderDays = Math.max(
      1,
      Number(process.env.DEFAULT_REORDER_DAYS ?? 30),
    );

    for (const order of orders) {
      const paidProductValue = Math.max(
        0,
        Number(order.subtotal) - Number(order.rewardDiscount),
      );
      const points = Math.floor(paidProductValue / earnEvery) * earnPoints;
      if (points > 0) {
        await this.createReward({
          customerId: order.customerId,
          orderId: order.id,
          type: RewardTransactionType.ORDER_EARN,
          points,
          description: `${order.orderNumber} delivery reward`,
          dedupeKey: `order-earn:${order.id}`,
        });
      }

      if (order.customer.referredById) {
        const referral = await this.prisma.referral.findUnique({
          where: { referredCustomerId: order.customerId },
        });
        if (referral && referral.status !== ReferralStatus.REWARDED) {
          const firstDelivered = await this.prisma.order.findFirst({
            where: {
              customerId: order.customerId,
              status: OrderStatus.DELIVERED,
            },
            orderBy: { deliveredAt: 'asc' },
            select: { id: true },
          });
          if (firstDelivered?.id === order.id) {
            await this.createReward({
              customerId: referral.referrerId,
              orderId: order.id,
              type: RewardTransactionType.REFERRAL_BONUS,
              points: referralPoints,
              description: 'বন্ধুর প্রথম delivery referral bonus',
              dedupeKey: `referral-owner:${referral.id}`,
            });
            await this.createReward({
              customerId: referral.referredCustomerId,
              orderId: order.id,
              type: RewardTransactionType.REFERRAL_BONUS,
              points: referralPoints,
              description: 'Referral welcome bonus',
              dedupeKey: `referral-friend:${referral.id}`,
            });
            await this.prisma.referral.update({
              where: { id: referral.id },
              data: {
                status: ReferralStatus.REWARDED,
                qualifiedOrderId: order.id,
                rewardedAt: new Date(),
              },
            });
          }
        }
      }

      if (order.customer.reorderRemindersEnabled && order.deliveredAt) {
        for (const item of order.items) {
          if (!item.productId) continue;
          const days = item.product?.reorderAfterDays ?? defaultReorderDays;
          const dueAt = new Date(
            order.deliveredAt.getTime() + days * 86_400_000,
          );
          await this.prisma.lifecycleReminder.upsert({
            where: { dedupeKey: `reorder:${item.id}` },
            update: {},
            create: {
              type: ReminderType.REORDER,
              customerId: order.customerId,
              orderItemId: item.id,
              productId: item.productId,
              dueAt,
              dedupeKey: `reorder:${item.id}`,
              metadata: { orderNumber: order.orderNumber },
            },
          });
        }
      }
    }
  }

  private async processReturnedOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: [OrderStatus.RETURNED, OrderStatus.CANCELLED] } },
      take: 500,
      include: { rewardTransactions: true },
    });
    for (const order of orders) {
      const earned = order.rewardTransactions.find(
        (item) => item.type === RewardTransactionType.ORDER_EARN,
      );
      if (earned) {
        const customer = await this.prisma.customerProfile.findUnique({
          where: { id: order.customerId },
          select: { rewardBalance: true },
        });
        const removable = Math.min(
          customer?.rewardBalance ?? 0,
          Math.max(0, earned.points),
        );
        if (removable > 0) {
          await this.createReward({
            customerId: order.customerId,
            orderId: order.id,
            type: RewardTransactionType.ORDER_RETURN,
            points: -removable,
            description: `${order.orderNumber} return reward reversal`,
            dedupeKey: `order-return:${order.id}`,
          });
        }
      }
      const redeemed = Math.max(0, order.rewardPointsUsed);
      if (redeemed > 0) {
        await this.createReward({
          customerId: order.customerId,
          orderId: order.id,
          type: RewardTransactionType.ADMIN_ADJUSTMENT,
          points: redeemed,
          description: `${order.orderNumber} cancelled/returned point refund`,
          dedupeKey: `redeem-refund:${order.id}`,
        });
      }
      await this.prisma.lifecycleReminder.updateMany({
        where: {
          orderItem: { orderId: order.id },
          status: ReminderStatus.PENDING,
        },
        data: { status: ReminderStatus.CANCELLED, completedAt: new Date() },
      });
    }
  }

  private async recoveryUrl(cartId: string) {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        recoveryTokenHash: this.hash(raw),
        recoveryExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    return `/cart/recover/${raw}`;
  }

  private async processAbandonedCarts() {
    const now = new Date();
    const abandonedMinutes = Math.max(
      10,
      Number(process.env.CART_ABANDONED_MINUTES ?? 30),
    );
    await this.prisma.cart.updateMany({
      where: {
        status: CartStatus.ACTIVE,
        lastActivityAt: {
          lte: new Date(now.getTime() - abandonedMinutes * 60_000),
        },
        items: { some: {} },
      },
      data: { status: CartStatus.ABANDONED, abandonedAt: now },
    });

    const carts = await this.prisma.cart.findMany({
      where: {
        status: CartStatus.ABANDONED,
        customerId: { not: null },
        items: { some: {} },
      },
      include: { items: { include: { product: true, combo: true } } },
      take: 300,
    });
    const stages = [
      { key: 'one', minutes: 0, field: 'reminderOneSentAt' as const },
      { key: 'two', minutes: 360, field: 'reminderTwoSentAt' as const },
      { key: 'three', minutes: 1440, field: 'reminderThreeSentAt' as const },
    ];
    for (const cart of carts) {
      if (!cart.customerId || !cart.abandonedAt) continue;
      for (const stage of stages) {
        if (cart[stage.field]) continue;
        if (now.getTime() < cart.abandonedAt.getTime() + stage.minutes * 60_000)
          continue;
        const dedupeKey = `cart:${cart.id}:${stage.key}`;
        const existing = await this.prisma.lifecycleReminder.findUnique({
          where: { dedupeKey },
        });
        if (existing) continue;
        const link = await this.recoveryUrl(cart.id);
        const names = cart.items
          .slice(0, 2)
          .map((item) => item.product?.name ?? item.combo?.name)
          .filter(Boolean)
          .join(', ');
        await this.notifications.sendCustomerMessage({
          customerId: cart.customerId,
          title:
            stage.key === 'three'
              ? 'আপনার কার্টটি এখনো অপেক্ষায়'
              : 'কার্টের পণ্যগুলো ভুলে যাননি তো?',
          body: `${names || 'আপনার পছন্দের পণ্য'}—অর্ডারটি যেখানে রেখেছিলেন সেখান থেকেই শেষ করুন।`,
          link,
          tag: `cart-${cart.id}`,
        });
        await this.prisma.$transaction([
          this.prisma.lifecycleReminder.create({
            data: {
              type: ReminderType.CART_RECOVERY,
              status: ReminderStatus.SENT,
              customerId: cart.customerId,
              cartId: cart.id,
              dueAt: now,
              sentAt: now,
              dedupeKey,
            },
          }),
          this.prisma.cart.update({
            where: { id: cart.id },
            data: { [stage.field]: now },
          }),
        ]);
      }
    }
  }

  private async processProductAlerts(productId?: string) {
    const leads = await this.prisma.customerLead.findMany({
      where: {
        isActive: true,
        customerId: { not: null },
        type: { in: [LeadType.PRICE_DROP, LeadType.BACK_IN_STOCK] },
        ...(productId ? { productId } : {}),
      },
      include: { product: true, variant: true, combo: true },
      take: 500,
    });
    for (const lead of leads) {
      if (!lead.customerId) continue;
      const entity = lead.variant ?? lead.product ?? lead.combo;
      if (!entity) continue;
      const price = Number(
        lead.variant?.price ?? lead.product?.price ?? lead.combo?.price ?? 0,
      );
      const available = entity.stock - entity.reservedStock > 0;
      const shouldNotify =
        (lead.type === LeadType.PRICE_DROP &&
          lead.baselinePrice !== null &&
          price < Number(lead.baselinePrice)) ||
        (lead.type === LeadType.BACK_IN_STOCK && available);
      if (!shouldNotify) continue;
      const isProduct = Boolean(lead.product || lead.variant);
      const link = isProduct
        ? `/products/${lead.product!.slug}`
        : `/solution-box/${lead.combo!.slug}`;
      const entityName = lead.product?.name ?? lead.combo?.name ?? 'পণ্য';
      await this.notifications.sendCustomerMessage({
        customerId: lead.customerId,
        title:
          lead.type === LeadType.PRICE_DROP
            ? 'আপনার পছন্দের পণ্যের দাম কমেছে'
            : 'আপনার পছন্দের পণ্য আবার স্টকে এসেছে',
        body: `${entityName}${lead.type === LeadType.PRICE_DROP ? ` এখন ৳${Math.round(price)}` : ' এখন অর্ডার করা যাবে'}.`,
        link,
        tag: `lead-${lead.id}`,
      });
      await this.prisma.customerLead.update({
        where: { id: lead.id },
        data: { isActive: false, notifiedAt: new Date() },
      });
    }
  }

  async processProductAlertsFor(productId: string) {
    await this.processProductAlerts(productId);
    return { processed: true };
  }

  private async processReorders() {
    const reminders = await this.prisma.lifecycleReminder.findMany({
      where: {
        type: ReminderType.REORDER,
        status: ReminderStatus.PENDING,
        dueAt: { lte: new Date() },
      },
      include: { product: true, orderItem: true },
      take: 300,
    });
    for (const reminder of reminders) {
      const name =
        reminder.product?.name ?? reminder.orderItem?.nameSnapshot ?? 'পণ্য';
      const link = reminder.product
        ? `/products/${reminder.product.slug}`
        : '/orders';
      await this.notifications.sendCustomerMessage({
        customerId: reminder.customerId,
        title: 'আবার প্রয়োজন হওয়ার সময় হয়েছে কি?',
        body: `${name} পুনরায় লাগলে এক ট্যাপে অর্ডার করুন।`,
        link,
        tag: `reorder-${reminder.id}`,
      });
      await this.prisma.lifecycleReminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.SENT, sentAt: new Date() },
      });
    }
  }

  async processLifecycle() {
    if (this.processing) return { skipped: true };
    this.processing = true;
    try {
      await this.processDeliveredOrders();
      await this.processReturnedOrders();
      await this.processAbandonedCarts();
      await this.processProductAlerts();
      await this.processReorders();
      return { processed: true, processedAt: new Date() };
    } finally {
      this.processing = false;
    }
  }

  async adminOverview() {
    await this.processLifecycle();
    const [
      rewardTotals,
      referrals,
      reminders,
      leads,
      recentTransactions,
      recentAlerts,
    ] =
      await Promise.all([
        this.prisma.rewardTransaction.aggregate({
          _sum: { points: true },
          _count: true,
        }),
        this.prisma.referral.groupBy({ by: ['status'], _count: true }),
        this.prisma.lifecycleReminder.groupBy({
          by: ['type', 'status'],
          _count: true,
        }),
        this.prisma.customerLead.groupBy({
          by: ['type', 'isActive'],
          _count: true,
        }),
        this.prisma.rewardTransaction.findMany({
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            order: { select: { orderNumber: true } },
          },
        }),
        this.prisma.customerLead.findMany({
          where: { type: { in: [LeadType.PRICE_DROP, LeadType.BACK_IN_STOCK] } },
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, sku: true } },
            combo: { select: { id: true, name: true, sku: true } },
          },
        }),
      ]);
    return {
      rewardTotals,
      referrals,
      reminders,
      leads,
      recentTransactions,
      recentAlerts,
    };
  }

  async adjustPoints(input: RewardAdjustmentInput) {
    const customerId = this.clean(input.customerId);
    const points = Math.trunc(Number(input.points));
    const reason = this.clean(input.reason, 240);
    if (!customerId || !Number.isFinite(points) || points === 0 || !reason) {
      throw new BadRequestException(
        'Customer, non-zero points এবং reason প্রয়োজন',
      );
    }
    const customer = await this.prisma.customerProfile.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer পাওয়া যায়নি');
    if (customer.rewardBalance + points < 0)
      throw new BadRequestException(
        'Balance-এর চেয়ে বেশি point বাদ দেওয়া যাবে না',
      );
    await this.createReward({
      customerId,
      type: RewardTransactionType.ADMIN_ADJUSTMENT,
      points,
      description: reason,
      dedupeKey: `admin:${customerId}:${Date.now()}:${randomBytes(3).toString('hex')}`,
    });
    return { adjusted: true };
  }
}
