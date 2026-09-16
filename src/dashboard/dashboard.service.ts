import { Injectable } from '@nestjs/common';
import { CatalogStatus, OrderStatus, Status } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [
      customers,
      guests,
      products,
      activeProducts,
      combos,
      activeCombos,
      categories,
      orders,
      pendingOrders,
      banners,
      publishedBanners,
      guides,
      publishedGuides,
      contentPages,
      publishedContentPages,
      admins,
      pendingAdmins,
      aiUsage,
    ] = await this.prisma.$transaction([
      this.prisma.customerProfile.count(),

      // যেসব Guest ID এখনো কোনো CustomerProfile-এর সঙ্গে যুক্ত হয়নি।
      this.prisma.deviceIdentity.count({
        where: {
          customerId: null,
        },
      }),

      this.prisma.product.count(),
      this.prisma.product.count({
        where: {
          status: CatalogStatus.ACTIVE,
        },
      }),

      this.prisma.combo.count(),
      this.prisma.combo.count({
        where: {
          status: CatalogStatus.ACTIVE,
        },
      }),

      this.prisma.category.count(),

      this.prisma.order.count(),
      this.prisma.order.count({
        where: {
          status: OrderStatus.PENDING,
        },
      }),

      this.prisma.banner.count(),
      this.prisma.banner.count({
        where: {
          isPublished: true,
        },
      }),

      this.prisma.guide.count(),
      this.prisma.guide.count({
        where: {
          status: CatalogStatus.ACTIVE,
        },
      }),

      this.prisma.contentPage.count(),
      this.prisma.contentPage.count({
        where: {
          isPublished: true,
        },
      }),

      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          status: Status.PENDING,
        },
      }),

      this.prisma.aiChatLog.aggregate({
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
        },
      }),
    ]);

    return {
      customers,
      guests,

      products: {
        total: products,
        active: activeProducts,
      },

      combos: {
        total: combos,
        active: activeCombos,
      },

      categories,

      orders: {
        total: orders,
        pending: pendingOrders,
      },

      banners: {
        total: banners,
        active: publishedBanners,
      },

      guides: {
        total: guides,
        published: publishedGuides,
      },

      contentPages: {
        total: contentPages,
        published: publishedContentPages,
      },

      admins: {
        total: admins,
        pending: pendingAdmins,
      },

      aiCredits: {
        prompt: aiUsage._sum.promptTokens ?? 0,
        completion: aiUsage._sum.completionTokens ?? 0,
        total: aiUsage._sum.totalTokens ?? 0,
      },
    };
  }
}