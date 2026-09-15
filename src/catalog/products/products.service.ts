import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductBulletKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProductInput } from '../catalog.types';
import {
  requiredText,
  imageData,
  optionalText,
  required,
  toNumber,
} from '../catalog.helpers';

const productInclude = {
  category: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  includedItems: { orderBy: { sortOrder: 'asc' as const } },
  bullets: { orderBy: { sortOrder: 'asc' as const } },
  journeys: { include: { journey: true } },
  attributes: {
    orderBy: { sortOrder: 'asc' as const },
    include: { values: { orderBy: { sortOrder: 'asc' as const } } },
  },
  variants: {
    include: {
      values: { include: { value: { include: { attribute: true } } } },
    },
  },
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(product: any) {
    const bullets = (kind: ProductBulletKind) =>
      product.bullets
        .filter((item: any) => item.kind === kind)
        .map((item: any) => item.text);
    return {
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      href: `/products/${product.slug}`,
      name: product.name,
      description: product.description,
      category: product.category.name,
      categorySlug: product.category.slug,
      badge: product.badge ? product.badge : undefined,
      images: product.images.map((image: any) => image.url),
      imageRecords: product.images.map((image: any) => ({
        ...image,
        alt: image.alt,
      })),
      price: toNumber(product.price),
      compareAtPrice: toNumber(product.compareAtPrice),
      stock: product.stock,
      rating: toNumber(product.rating),
      reviewCount: product.reviewCount,
      status: product.status,
      featured: product.featured,
      productType: 'single',
      journeys: product.journeys.map((item: any) => ({
        slug: item.journey.slug,
        name: item.journey.name,
      })),
      details: {
        includedItems: product.includedItems.map((item: any) => ({
          id: item.id,
          name: item.name,
          image: item.image ?? undefined,
        })),
        whyEssential: bullets(ProductBulletKind.WHY_ESSENTIAL),
        preferredFor: bullets(ProductBulletKind.PREFERRED_FOR),
      },
      attributes: product.attributes.map((attribute: any) => ({
        id: attribute.id,
        name: attribute.name,
        values: attribute.values.map((value: any) => ({
          id: value.id,
          value: value.value,
          colorHex: value.colorHex,
        })),
      })),
      variants: product.variants.map((variant: any) => ({
        id: variant.id,
        sku: variant.sku,
        price: toNumber(variant.price),
        compareAtPrice: toNumber(variant.compareAtPrice),
        stock: variant.stock,
        imageUrl: variant.imageUrl,
        isActive: variant.isActive,
        valueIds: variant.values.map((item: any) => item.valueId),
        selections: variant.values.map((item: any) => ({
          attribute: item.value.attribute.name,
          value: item.value.value,
        })),
      })),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  async findAll(includeInactive = false) {
    const products = await this.prisma.product.findMany({
      where: includeInactive ? undefined : { status: 'ACTIVE' },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
    });
    return products.map((product) => this.serialize(product));
  }

  async findOne(slugOrId: string, includeInactive = false) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
        ...(includeInactive ? {} : { status: 'ACTIVE' as const }),
      },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('পণ্যটি পাওয়া যায়নি');
    return this.serialize(product);
  }

  private async relationalData(input: ProductInput) {
    const categoryName = requiredText(input.category?.name, 'category.name');
    const category = await this.prisma.category.upsert({
      where: { slug: required(input.category?.slug, 'category.slug') },
      update: { name: categoryName },
      create: {
        slug: input.category.slug,
        name: categoryName,
      },
    });
    const journeys = await Promise.all(
      (input.journeySlugs ?? []).map((slug) =>
        this.prisma.journey.upsert({
          where: { slug },
          update: {},
          create: { slug, name: slug },
        }),
      ),
    );
    return { category, journeys };
  }

  private nested(input: ProductInput, journeyIds: string[]) {
    const details = input.details ?? {};
    return {
      images: { create: imageData(input.images) },
      includedItems: {
        create: (details.includedItems ?? []).map((item, sortOrder) => {
          const name = requiredText(item.name, 'details.includedItems.name');
          return {
            name: name,
            image: item.image,
            sortOrder,
          };
        }),
      },
      bullets: {
        create: [
          ...(details.whyEssential ?? []).map((item, sortOrder) => ({
            kind: ProductBulletKind.WHY_ESSENTIAL,
            text: requiredText(item, 'details.whyEssential'),
            sortOrder,
          })),
          ...(details.preferredFor ?? []).map((item, sortOrder) => ({
            kind: ProductBulletKind.PREFERRED_FOR,
            text: requiredText(item, 'details.preferredFor'),
            sortOrder,
          })),
        ],
      },
      journeys: { create: journeyIds.map((journeyId) => ({ journeyId })) },
      attributes: {
        create: (input.attributes ?? []).map((attribute, sortOrder) => {
          const name = requiredText(attribute.name, 'attributes.name');
          return {
            name: name,
            sortOrder,
            values: {
              create: attribute.values.map((value, valueOrder) => {
                const option = requiredText(value.value, 'attributes.values.value');
                return {
                  value: option,
                  colorHex: value.colorHex,
                  sortOrder: valueOrder,
                };
              }),
            },
          };
        }),
      },
    };
  }

  private scalar(input: ProductInput, categoryId: string) {
    const name = requiredText(input.name, 'name');
    const description = requiredText(input.description, 'description');
    const badge = optionalText(input.badge);
    return {
      slug: required(input.slug, 'slug'),
      sku: required(input.sku, 'sku'),
      name: name,
      description: description,
      badge: badge,
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      stock: input.stock,
      rating: input.rating,
      reviewCount: input.reviewCount ?? 0,
      status: input.status ?? 'ACTIVE',
      featured: input.featured ?? false,
      categoryId,
    };
  }

  private async createVariants(
    client: any,
    productId: string,
    input: ProductInput,
  ) {
    if (!input.variants?.length) return;
    const attributes = await client.productAttribute.findMany({
      where: { productId },
      include: { values: true },
    });
    for (const variant of input.variants) {
      const valueIds = variant.selections.map((selection) => {
        const attribute = attributes.find(
          (item: any) =>
            item.name.toLowerCase() === selection.attribute.toLowerCase(),
        );
        const value = attribute?.values.find(
          (item: any) =>
            item.value.toLowerCase() === selection.value.toLowerCase(),
        );
        if (!value) {
          throw new Error(
            `ভ্যারিয়েন্টের ভ্যালু পাওয়া যায়নি: ${selection.attribute} = ${selection.value}`,
          );
        }
        return value.id;
      });
      await client.productVariant.create({
        data: {
          ...(variant.id ? { id: variant.id } : {}),
          productId,
          sku: variant.sku,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          stock: variant.stock,
          imageUrl: variant.imageUrl,
          isActive: variant.isActive ?? true,
          values: { create: valueIds.map((valueId) => ({ valueId })) },
        },
      });
    }
  }

  async create(input: ProductInput) {
    const { category, journeys } = await this.relationalData(input);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          ...this.scalar(input, category.id),
          ...this.nested(
            input,
            journeys.map((journey) => journey.id),
          ),
        },
      });
      await this.createVariants(tx, product.id, input);
      const created = await tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: productInclude,
      });
      return this.serialize(created);
    });
  }

  async update(id: string, input: ProductInput) {
    await this.findOne(id, true);
    const { category, journeys } = await this.relationalData(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.productAttribute.deleteMany({ where: { productId: id } });
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.productIncludedItem.deleteMany({ where: { productId: id } });
      await tx.productBullet.deleteMany({ where: { productId: id } });
      await tx.productJourney.deleteMany({ where: { productId: id } });
      await tx.product.update({
        where: { id },
        data: {
          ...this.scalar(input, category.id),
          ...this.nested(
            input,
            journeys.map((journey) => journey.id),
          ),
        },
      });
      await this.createVariants(tx, id, input);
      const product = await tx.product.findUniqueOrThrow({
        where: { id },
        include: productInclude,
      });
      return this.serialize(product);
    });
  }

  async remove(id: string) {
    await this.findOne(id, true);
    await this.prisma.product.delete({ where: { id } });
    return { success: true };
  }
}
