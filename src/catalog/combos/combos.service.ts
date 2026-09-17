import { Injectable, NotFoundException } from '@nestjs/common';
import { ComboListKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  requiredText,
  imageData,
  optionalText,
  required,
  toNumber,
} from '../catalog.helpers';
import type { ComboInput, TextInput } from '../catalog.types';

const comboInclude = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      product: {
        include: {
          category: true,
          images: { orderBy: { sortOrder: 'asc' as const } },
        },
      },
    },
  },
  listItems: { orderBy: { sortOrder: 'asc' as const } },
  usageGuide: { orderBy: { sortOrder: 'asc' as const } },
  reviews: { orderBy: { sortOrder: 'asc' as const } },
  faqs: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class CombosService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(combo: any, admin = false) {
    const list = (kind: ComboListKind) =>
      combo.listItems
        .filter((item: any) => item.kind === kind)
        .map((item: any) => item.text);
    return {
      id: combo.id,
      slug: combo.slug,
      sku: combo.sku,
      href: `/solution-box/${combo.slug}`,
      name: combo.name,
      subtitle: combo.subtitle,
      description: combo.description,
      images: combo.images.map((image: any) => image.url),
      imageRecords: combo.images,
      items: combo.items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
        variant: item.variant || undefined,
        product: {
          id: item.product.id,
          slug: item.product.slug,
          href: `/products/${item.product.slug}`,
          name: item.product.name,
          description: item.product.description,
          category: item.product.category.name,
          images: item.product.images.map((image: any) => image.url),
          price: toNumber(item.product.price),
          compareAtPrice: toNumber(item.product.compareAtPrice),
          stock: item.product.stock,
          rating: toNumber(item.product.rating),
          reviewCount: item.product.reviewCount,
          productType: 'single',
        },
      })),
      price: toNumber(combo.price),
      compareAtPrice: toNumber(combo.compareAtPrice),
      stock: Math.max(0, combo.stock - combo.reservedStock),
      ...(admin
        ? {
            onHandStock: combo.stock,
            reservedStock: combo.reservedStock,
            soldStock: combo.soldStock,
            packagingCost: toNumber(combo.packagingCost),
          }
        : {}),
      rating: toNumber(combo.rating),
      reviewCount: combo.reviewCount,
      status: combo.status,
      journeyStage: combo.journeyStage,
      whyThisBox: list(ComboListKind.WHY_THIS_BOX),
      preferredFor: list(ComboListKind.PREFERRED_FOR),
      selectionReasons: list(ComboListKind.SELECTION_REASON),
      packaging: list(ComboListKind.PACKAGING),
      usageGuide: combo.usageGuide.map((item: any) => ({
        id: item.key,
        title: item.title,
        description: item.description,
      })),
      reviews: combo.reviews.map((item: any) => ({
        id: item.id,
        customerName: item.customerName,
        rating: item.rating,
        review: item.review,
      })),
      faqs: combo.faqs.map((item: any) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
      })),
      createdAt: combo.createdAt,
      updatedAt: combo.updatedAt,
    };
  }

  async findAll(includeInactive = false) {
    const combos = await this.prisma.combo.findMany({
      where: includeInactive ? undefined : { status: 'ACTIVE' },
      include: comboInclude,
      orderBy: { createdAt: 'desc' },
    });
    return combos.map((combo) => this.serialize(combo, includeInactive));
  }

  async findOne(slugOrId: string, includeInactive = false) {
    const combo = await this.prisma.combo.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
        ...(includeInactive ? {} : { status: 'ACTIVE' as const }),
      },
      include: comboInclude,
    });
    if (!combo) throw new NotFoundException('সল্যুশন বক্সটি পাওয়া যায়নি');
    return this.serialize(combo, includeInactive);
  }

  private listItems(kind: ComboListKind, values: TextInput[] = []) {
    return values.map((value, sortOrder) => {
      const text = requiredText(value, 'listItem');
      return {
        kind,
        text: text,
        sortOrder,
      };
    });
  }

  private scalar(input: ComboInput) {
    const name = requiredText(input.name, 'name');
    const subtitle = requiredText(input.subtitle, 'subtitle');
    const description = requiredText(input.description, 'description');
    const journeyStage = requiredText(input.journeyStage, 'journeyStage');
    return {
      slug: required(input.slug, 'slug'),
      sku: required(input.sku, 'sku'),
      name: name,
      subtitle: subtitle,
      description: description,
      journeyStage: journeyStage,
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      stock: input.stock,
      packagingCost: input.packagingCost ?? 0,
      rating: input.rating,
      reviewCount: input.reviewCount ?? 0,
      status: input.status ?? 'ACTIVE',
    };
  }

  private nested(input: ComboInput) {
    return {
      images: {
        create: imageData(input.images).map(({ alt: _alt, ...image }) => image),
      },
      items: {
        create: input.items.map((item, sortOrder) => {
          const variant = optionalText(item.variant);
          return {
            productId: item.productId,
            quantity: item.quantity,
            variant: variant,
            sortOrder,
          };
        }),
      },
      listItems: {
        create: [
          ...this.listItems(ComboListKind.WHY_THIS_BOX, input.whyThisBox),
          ...this.listItems(ComboListKind.PREFERRED_FOR, input.preferredFor),
          ...this.listItems(
            ComboListKind.SELECTION_REASON,
            input.selectionReasons,
          ),
          ...this.listItems(ComboListKind.PACKAGING, input.packaging),
        ],
      },
      usageGuide: {
        create: (input.usageGuide ?? []).map((item, sortOrder) => {
          const title = requiredText(item.title, 'usageGuide.title');
          const description = requiredText(
            item.description,
            'usageGuide.description',
          );
          return {
            key: item.id || `step-${sortOrder + 1}`,
            title: title,
            description: description,
            sortOrder,
          };
        }),
      },
      reviews: {
        create: (input.reviews ?? []).map((item, sortOrder) => {
          const review = requiredText(item.review, 'reviews.review');
          return {
            customerName: item.customerName,
            rating: item.rating,
            review: review,
            sortOrder,
          };
        }),
      },
      faqs: {
        create: (input.faqs ?? []).map((item, sortOrder) => {
          const question = requiredText(item.question, 'faqs.question');
          const answer = requiredText(item.answer, 'faqs.answer');
          return {
            question: question,
            answer: answer,
            sortOrder,
          };
        }),
      },
    };
  }

  async create(input: ComboInput) {
    const combo = await this.prisma.combo.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        ...this.scalar(input),
        ...this.nested(input),
      },
      include: comboInclude,
    });
    return this.serialize(combo, true);
  }

  async update(id: string, input: ComboInput) {
    await this.findOne(id, true);
    return this.prisma.$transaction(async (tx) => {
      await tx.comboImage.deleteMany({ where: { comboId: id } });
      await tx.comboProduct.deleteMany({ where: { comboId: id } });
      await tx.comboListItem.deleteMany({ where: { comboId: id } });
      await tx.comboGuideStep.deleteMany({ where: { comboId: id } });
      await tx.comboReview.deleteMany({ where: { comboId: id } });
      await tx.comboFaq.deleteMany({ where: { comboId: id } });
      const combo = await tx.combo.update({
        where: { id },
        data: { ...this.scalar(input), ...this.nested(input) },
        include: comboInclude,
      });
      return this.serialize(combo, true);
    });
  }

  async remove(id: string) {
    await this.findOne(id, true);
    await this.prisma.combo.delete({ where: { id } });
    return { success: true };
  }
}
