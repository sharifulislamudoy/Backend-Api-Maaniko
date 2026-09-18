import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DismissReviewPromptInput,
  ReviewIdentity,
  SubmitOrderReviewInput,
} from './reviews.types';

const REVIEW_ELIGIBLE_AFTER_MS = 24 * 60 * 60 * 1000;
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 2;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private clean(value: unknown, max: number) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).trim().replace(/\s+/g, ' ').slice(0, max);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async customerId(identity: ReviewIdentity) {
    const customerToken = this.clean(identity.customerToken, 500);
    if (customerToken) {
      const access = await this.prisma.customerAccessToken.findUnique({
        where: { tokenHash: this.hash(customerToken) },
        select: { customerId: true },
      });
      if (access) return access.customerId;
    }

    const guestId = this.clean(identity.guestId, 180);
    if (!guestId) return null;
    const device = await this.prisma.deviceIdentity.findUnique({
      where: { guestId },
      select: { customerId: true },
    });
    return device?.customerId ?? null;
  }

  private async requireCustomerId(identity: ReviewIdentity) {
    const customerId = await this.customerId(identity);
    if (!customerId) {
      throw new UnauthorizedException('Customer access পাওয়া যায়নি');
    }
    return customerId;
  }

  async pendingPrompt(identity: ReviewIdentity) {
    const customerId = await this.customerId(identity);
    if (!customerId) return { prompt: null };

    const now = new Date();
    const deliveredBefore = new Date(now.getTime() - REVIEW_ELIGIBLE_AFTER_MS);
    const order = await this.prisma.order.findFirst({
      where: {
        customerId,
        status: OrderStatus.DELIVERED,
        deliveredAt: { not: null, lte: deliveredBefore },
        review: null,
        reviewPromptOptOut: false,
        OR: [
          { reviewPromptNextAt: null },
          { reviewPromptNextAt: { lte: now } },
        ],
      },
      orderBy: { deliveredAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        deliveredAt: true,
        items: {
          where: {
            OR: [
              { productId: { not: null } },
              { comboId: { not: null } },
            ],
          },
          select: {
            id: true,
            productId: true,
            comboId: true,
            nameSnapshot: true,
            imageSnapshot: true,
          },
        },
      },
    });

    if (!order) return { prompt: null };
    return {
      prompt: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        deliveredAt: order.deliveredAt,
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          comboId: item.comboId,
          name: item.nameSnapshot,
          image: item.imageSnapshot,
        })),
      },
    };
  }

  async dismiss(identity: ReviewIdentity, input: DismissReviewPromptInput) {
    const customerId = await this.requireCustomerId(identity);
    const orderId = this.clean(input.orderId, 180);
    if (!orderId) throw new BadRequestException('orderId প্রয়োজন');

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: {
        id: true,
        status: true,
        reviewPromptDismissCount: true,
        review: { select: { id: true } },
      },
    });
    if (!order) throw new NotFoundException('অর্ডার পাওয়া যায়নি');
    if (order.review) return { dismissed: true, completed: true };
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('শুধু delivered order review করা যাবে');
    }

    const dismissCount = order.reviewPromptDismissCount + 1;
    const optOut = input.neverAskAgain === true || dismissCount >= MAX_DISMISSALS;
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        reviewPromptDismissCount: dismissCount,
        reviewPromptOptOut: optOut,
        reviewPromptNextAt: optOut
          ? null
          : new Date(Date.now() + REMIND_AFTER_MS),
      },
    });
    return { dismissed: true, completed: optOut };
  }

  async submit(identity: ReviewIdentity, input: SubmitOrderReviewInput) {
    const customerId = await this.requireCustomerId(identity);
    const orderId = this.clean(input.orderId, 180);
    const rating = Number(input.rating);
    const comment = this.clean(input.comment, 1200) || null;
    const selectedOrderItemId =
      this.clean(input.selectedOrderItemId, 180) || null;

    if (!orderId) throw new BadRequestException('orderId প্রয়োজন');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('১ থেকে ৫-এর মধ্যে rating দিন');
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: { items: true, review: true },
    });
    if (!order) throw new NotFoundException('অর্ডার পাওয়া যায়নি');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('শুধু delivered order review করা যাবে');
    }
    if (order.review) {
      throw new ConflictException('এই অর্ডারের review ইতোমধ্যে দেওয়া হয়েছে');
    }

    const selectedItem = selectedOrderItemId
      ? order.items.find((item) => item.id === selectedOrderItemId)
      : null;
    if (selectedOrderItemId && !selectedItem) {
      throw new BadRequestException('নির্বাচিত পণ্যটি এই অর্ডারে নেই');
    }
    if (selectedItem && !selectedItem.productId && !selectedItem.comboId) {
      throw new BadRequestException('এই item-এর জন্য review দেওয়া যাবে না');
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orderReview.create({
        data: {
          orderId: order.id,
          customerId,
          overallRating: rating,
          comment,
          selectedOrderItemId: selectedItem?.id ?? null,
          targetProductId: selectedItem?.productId ?? null,
          targetComboId: selectedItem?.comboId ?? null,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          reviewPromptOptOut: true,
          reviewPromptNextAt: null,
        },
      });

      if (selectedItem?.productId) {
        await this.refreshProductRating(tx, selectedItem.productId);
      }
      if (selectedItem?.comboId) {
        await this.refreshComboRating(tx, selectedItem.comboId);
      }
      return created;
    });

    return {
      submitted: true,
      reviewId: review.id,
      attachedToProduct: Boolean(review.targetProductId),
      attachedToCombo: Boolean(review.targetComboId),
    };
  }

  private async refreshProductRating(
    tx: Prisma.TransactionClient,
    productId: string,
  ) {
    const result = await tx.orderReview.aggregate({
      where: { targetProductId: productId, isVerified: true },
      _avg: { overallRating: true },
      _count: { _all: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: {
        rating: result._avg.overallRating ?? null,
        reviewCount: result._count._all,
      },
    });
  }

  private async refreshComboRating(
    tx: Prisma.TransactionClient,
    comboId: string,
  ) {
    const result = await tx.orderReview.aggregate({
      where: { targetComboId: comboId, isVerified: true },
      _avg: { overallRating: true },
      _count: { _all: true },
    });
    await tx.combo.update({
      where: { id: comboId },
      data: {
        rating: result._avg.overallRating ?? null,
        reviewCount: result._count._all,
      },
    });
  }

  private parseLimit(value?: string) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.min(30, Math.max(1, parsed)) : 12;
  }

  private customerLabel(name: string) {
    const first = this.clean(name, 50).split(' ')[0];
    return first ? `${first} • যাচাইকৃত ক্রেতা` : 'যাচাইকৃত ক্রেতা';
  }

  private serializePublicReview(review: {
    id: string;
    overallRating: number;
    comment: string | null;
    createdAt: Date;
    order: { customerName: string };
  }) {
    return {
      id: review.id,
      rating: review.overallRating,
      comment: review.comment,
      customerName: this.customerLabel(review.order.customerName),
      verified: true,
      createdAt: review.createdAt,
    };
  }

  async forProduct(productIdInput: string, limitInput?: string) {
    const productId = this.clean(productIdInput, 180);
    const reviews = await this.prisma.orderReview.findMany({
      where: { targetProductId: productId, isVerified: true },
      orderBy: { createdAt: 'desc' },
      take: this.parseLimit(limitInput),
      include: { order: { select: { customerName: true } } },
    });
    return { reviews: reviews.map((review) => this.serializePublicReview(review)) };
  }

  async forCombo(comboIdInput: string, limitInput?: string) {
    const comboId = this.clean(comboIdInput, 180);
    const reviews = await this.prisma.orderReview.findMany({
      where: { targetComboId: comboId, isVerified: true },
      orderBy: { createdAt: 'desc' },
      take: this.parseLimit(limitInput),
      include: { order: { select: { customerName: true } } },
    });
    return { reviews: reviews.map((review) => this.serializePublicReview(review)) };
  }
}
