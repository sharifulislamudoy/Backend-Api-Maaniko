import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CartItemType,
  CartStatus,
  ConsentType,
  CustomerEventType,
  LeadType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { SteadfastService } from '../steadfast/steadfast.service';
import { StoreSettingsService } from '../store-settings/store-settings.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinanceService } from '../finance/finance.service';
import type { AdminOrderEditInput } from '../inventory/inventory.types';
import type {
  AdminOrderStatusInput,
  CareProfileInput,
  CartItemInput,
  CheckoutDraftInput,
  ComboConfigItemInput,
  CommerceIdentity,
  ContactInput,
  CreateOrderInput,
  LeadInput,
  OrderQuote,
  OrderQuoteInput,
  QuoteConfigItem,
  QuoteLine,
  RestoreInput,
  TrackingEventInput,
} from './commerce.types';

const MAX_CART_QUANTITY = 99;
const MAX_COMBO_ITEM_QUANTITY = 20;
const DEFAULT_FREE_DELIVERY_MINIMUM = 2000;
const DEFAULT_DELIVERY_CHARGE = 120;
const PUBLIC_TRACKING_DAYS = 30;

type CustomerSafe = {
  id: string;
  name: string | null;
  phone: string | null;
  marketingConsent: boolean;
  journeySlug: string | null;
  interests: unknown;
  budgetMin: number | null;
  budgetMax: number | null;
};

type CartViewItem = {
  id: string;
  clientKey: string;
  quantity: number;
  customConfig: Array<{
    productId: string;
    quantity: number;
  }> | null;
  unitPrice: number;
  isCustomized?: boolean;
  product: {
    id: string;
    slug: string;
    href: string;
    name: string;
    description: string;
    category: string;
    images: string[];
    price: number;
    compareAtPrice?: number;
    stock: number;
    productType: 'single' | 'combo';
    sku: string;
    selectedVariant?: {
      id: string;
      sku: string;
      price: number | null;
      compareAtPrice: number | null;
      stock: number;
      imageUrl: string | null;
      isActive: boolean;
      selections: Array<{ attribute: string; value: string }>;
    };
    comboItems?: Array<{
      productId: string;
      slug: string;
      href: string;
      name: string;
      image: string;
      quantity: number;
    }>;
  };
};

type CartView = {
  id: string | null;
  status: CartStatus;
  subtotal: number;
  lastActivityAt: Date | null;
  items: CartViewItem[];
};

@Injectable()
export class CommerceService implements OnModuleInit, OnModuleDestroy {
  private abandonedTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly steadfast: SteadfastService,
    private readonly storeSettings: StoreSettingsService,
    private readonly inventory: InventoryService,
    private readonly finance: FinanceService,
  ) {}

  onModuleInit() {
    // Server processes with a persistent runtime get automatic cleanup.
    // Admin/cart reads also run the same cleanup, so correctness does not
    // depend on this interval existing on serverless runtimes.
    this.abandonedTimer = setInterval(
      () => {
        void this.refreshCartLifecycle().catch(() => undefined);
      },
      10 * 60 * 1000,
    );
    this.abandonedTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.abandonedTimer) clearInterval(this.abandonedTimer);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private issueRawToken() {
    return randomBytes(32).toString('base64url');
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private asNumber(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private cleanText(value: unknown, max = 500) {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.trim().replace(/\s+/g, ' ');
    return cleaned ? cleaned.slice(0, max) : undefined;
  }

  private requiredText(value: unknown, field: string, max = 500) {
    const cleaned = this.cleanText(value, max);
    if (!cleaned) {
      throw new BadRequestException(`${field} প্রয়োজন`);
    }
    return cleaned;
  }

  private normalizeBanglaDigits(value: string) {
    const bangla = '০১২৩৪৫৬৭৮৯';
    return value.replace(/[০-৯]/g, (digit) => String(bangla.indexOf(digit)));
  }

  normalizePhone(value: unknown) {
    let phone = this.normalizeBanglaDigits(String(value ?? '')).replace(
      /\D/g,
      '',
    );

    if (phone.startsWith('00880')) phone = phone.slice(5);
    else if (phone.startsWith('880')) phone = phone.slice(3);

    if (phone.startsWith('1') && phone.length === 10) phone = `0${phone}`;

    if (!/^01[3-9]\d{8}$/.test(phone)) {
      throw new BadRequestException('সঠিক বাংলাদেশি ফোন নম্বর দিন');
    }

    return phone;
  }

  normalizeName(value: unknown) {
    const name = this.requiredText(value, 'নাম', 120);
    const normalized = name
      .normalize('NFKC')
      .toLocaleLowerCase('bn-BD')
      .replace(/\s+/g, ' ')
      .trim();

    if (normalized.length < 2) {
      throw new BadRequestException('সঠিক নাম দিন');
    }
    return { name, normalized };
  }

  private validateIdentity(identity: CommerceIdentity) {
    const guestId = this.cleanText(identity.guestId, 180);
    if (!guestId || guestId.length < 8) {
      throw new BadRequestException('Guest identity পাওয়া যায়নি');
    }

    return {
      guestId,
      sessionId: this.cleanText(identity.sessionId, 180),
      customerToken: this.cleanText(identity.customerToken, 300),
    };
  }

  private sanitizeMetadata(input: unknown): Prisma.InputJsonValue | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return undefined;

    const blocked = new Set([
      'name',
      'phone',
      'email',
      'address',
      'note',
      'password',
      'otp',
      'pin',
      'cvv',
      'card',
      'cardnumber',
      'token',
      'customerToken',
    ]);

    const output: Record<string, Prisma.InputJsonValue> = {};
    for (const [rawKey, rawValue] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const key = rawKey.slice(0, 80);
      if (blocked.has(key.toLowerCase())) continue;

      if (
        typeof rawValue === 'string' ||
        typeof rawValue === 'number' ||
        typeof rawValue === 'boolean'
      ) {
        output[key] =
          typeof rawValue === 'string' ? rawValue.slice(0, 500) : rawValue;
      } else if (Array.isArray(rawValue)) {
        output[key] = rawValue
          .slice(0, 30)
          .filter(
            (item): item is string | number | boolean =>
              typeof item === 'string' ||
              typeof item === 'number' ||
              typeof item === 'boolean',
          )
          .map((item) =>
            typeof item === 'string' ? item.slice(0, 200) : item,
          );
      }
    }

    return Object.keys(output).length ? output : undefined;
  }

  private async customerFromRawToken(rawToken?: string) {
    if (!rawToken) return null;
    const tokenHash = this.hash(rawToken);
    const access = await this.prisma.customerAccessToken.findUnique({
      where: { tokenHash },
      include: { customer: true },
    });
    if (!access) return null;

    const now = new Date();
    await Promise.all([
      this.prisma.customerAccessToken.update({
        where: { id: access.id },
        data: { lastUsedAt: now },
      }),
      this.prisma.customerProfile.update({
        where: { id: access.customerId },
        data: { lastSeenAt: now },
      }),
    ]);

    return access.customer;
  }

  private async customerForIdentity(identityInput: CommerceIdentity) {
    const identity = this.validateIdentity(identityInput);

    const byToken = await this.customerFromRawToken(identity.customerToken);
    if (byToken) return byToken;

    const device = await this.prisma.deviceIdentity.findUnique({
      where: { guestId: identity.guestId },
      include: { customer: true },
    });

    return device?.customer ?? null;
  }

  private async issueCustomerToken(customerId: string) {
    const raw = this.issueRawToken();
    await this.prisma.customerAccessToken.create({
      data: {
        tokenHash: this.hash(raw),
        customerId,
      },
    });
    return raw;
  }

  private safeCustomer(customer: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    marketingConsent: boolean;
    journeySlug: string | null;
    interests: Prisma.JsonValue | null;
    budgetMin: number | null;
    budgetMax: number | null;
  }): CustomerSafe {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      marketingConsent: customer.marketingConsent,
      journeySlug: customer.journeySlug,
      interests: customer.interests,
      budgetMin: customer.budgetMin,
      budgetMax: customer.budgetMax,
    };
  }

  private async touchDevice(guestId: string, customerId?: string | null) {
    const now = new Date();
    return this.prisma.deviceIdentity.upsert({
      where: { guestId },
      update: {
        lastSeenAt: now,
        ...(customerId ? { customerId } : {}),
      },
      create: {
        guestId,
        customerId: customerId ?? undefined,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
  }

  private async mergeGuestAssets(guestId: string, customerId: string) {
    await this.touchDevice(guestId, customerId);

    const [guestCart, customerCart] = await Promise.all([
      this.prisma.cart.findFirst({
        where: {
          guestId,
          status: { in: [CartStatus.ACTIVE, CartStatus.ABANDONED] },
          OR: [{ customerId: null }, { customerId: { not: customerId } }],
        },
        orderBy: { updatedAt: 'desc' },
        include: { items: true },
      }),
      this.prisma.cart.findFirst({
        where: {
          customerId,
          status: { in: [CartStatus.ACTIVE, CartStatus.ABANDONED] },
        },
        orderBy: { updatedAt: 'desc' },
        include: { items: true },
      }),
    ]);

    if (guestCart && customerCart && guestCart.id !== customerCart.id) {
      for (const item of guestCart.items) {
        const existing = customerCart.items.find(
          (candidate) => candidate.clientKey === item.clientKey,
        );

        if (existing) {
          await this.prisma.cartItem.update({
            where: { id: existing.id },
            data: {
              quantity: Math.min(
                MAX_CART_QUANTITY,
                existing.quantity + item.quantity,
              ),
              unitPriceSnapshot: item.unitPriceSnapshot,
              customConfig:
                item.customConfig === null
                  ? Prisma.DbNull
                  : (item.customConfig as Prisma.InputJsonValue),
            },
          });
        } else {
          await this.prisma.cartItem.create({
            data: {
              cartId: customerCart.id,
              clientKey: item.clientKey,
              itemType: item.itemType,
              productId: item.productId,
              variantId: item.variantId,
              comboId: item.comboId,
              quantity: item.quantity,
              unitPriceSnapshot: item.unitPriceSnapshot,
              customConfig:
                item.customConfig === null
                  ? Prisma.DbNull
                  : (item.customConfig as Prisma.InputJsonValue),
            },
          });
        }
      }

      await this.prisma.cart.delete({ where: { id: guestCart.id } });
      await this.prisma.cart.update({
        where: { id: customerCart.id },
        data: {
          status: CartStatus.ACTIVE,
          guestId,
          recoveredAt:
            customerCart.status === CartStatus.ABANDONED
              ? new Date()
              : customerCart.recoveredAt,
          lastActivityAt: new Date(),
        },
      });
    } else if (guestCart && !customerCart) {
      await this.prisma.cart.update({
        where: { id: guestCart.id },
        data: {
          customerId,
          guestId,
          status: CartStatus.ACTIVE,
          recoveredAt:
            guestCart.status === CartStatus.ABANDONED
              ? new Date()
              : guestCart.recoveredAt,
          lastActivityAt: new Date(),
        },
      });
    } else if (customerCart) {
      await this.prisma.cart.update({
        where: { id: customerCart.id },
        data: {
          guestId,
          status: CartStatus.ACTIVE,
          recoveredAt:
            customerCart.status === CartStatus.ABANDONED
              ? new Date()
              : customerCart.recoveredAt,
          lastActivityAt: new Date(),
        },
      });
    }

    const guestWishlist = await this.prisma.wishlist.findUnique({
      where: { ownerKey: `guest:${guestId}` },
      include: { items: true },
    });
    const customerWishlist = await this.prisma.wishlist.findUnique({
      where: { ownerKey: `customer:${customerId}` },
      include: { items: true },
    });

    if (guestWishlist && customerWishlist) {
      for (const item of guestWishlist.items) {
        await this.prisma.wishlistItem.upsert({
          where: {
            wishlistId_clientKey: {
              wishlistId: customerWishlist.id,
              clientKey: item.clientKey,
            },
          },
          update: {},
          create: {
            wishlistId: customerWishlist.id,
            clientKey: item.clientKey,
            itemType: item.itemType,
            productId: item.productId,
            comboId: item.comboId,
          },
        });
      }
      await this.prisma.wishlist.delete({ where: { id: guestWishlist.id } });
    } else if (guestWishlist && !customerWishlist) {
      await this.prisma.wishlist.update({
        where: { id: guestWishlist.id },
        data: {
          ownerKey: `customer:${customerId}`,
          customerId,
          guestId,
        },
      });
    }

    await Promise.all([
      this.prisma.trackingSession.updateMany({
        where: { guestId, customerId: null },
        data: { customerId },
      }),
      this.prisma.customerEvent.updateMany({
        where: { guestId, customerId: null },
        data: { customerId },
      }),
      this.prisma.customerLead.updateMany({
        where: { guestId, customerId: null },
        data: { customerId },
      }),
      this.prisma.cart.updateMany({
        where: { guestId, customerId: null },
        data: { customerId },
      }),
    ]);
  }

  async captureContact(identityInput: CommerceIdentity, input: ContactInput) {
    const identity = this.validateIdentity(identityInput);
    const { name, normalized } = this.normalizeName(input.name);
    const phone = this.normalizePhone(input.phone);
    const email = this.cleanText(input.email, 160)?.toLowerCase();
    const current = await this.customerForIdentity(identity);

    let customer = current;
    if (customer) {
      const collision = await this.prisma.customerProfile.findFirst({
        where: {
          normalizedName: normalized,
          normalizedPhone: phone,
          id: { not: customer.id },
        },
      });
      if (collision) {
        throw new ConflictException(
          'এই নাম ও ফোন নম্বর অন্য একটি customer profile-এর সঙ্গে যুক্ত',
        );
      }

      customer = await this.prisma.customerProfile.update({
        where: { id: customer.id },
        data: {
          name,
          normalizedName: normalized,
          phone,
          normalizedPhone: phone,
          ...(email ? { email } : {}),
          ...(typeof input.marketingConsent === 'boolean'
            ? { marketingConsent: input.marketingConsent }
            : {}),
          lastSeenAt: new Date(),
        },
      });
    } else {
      customer = await this.prisma.customerProfile.findFirst({
        where: {
          normalizedName: normalized,
          normalizedPhone: phone,
        },
      });

      if (!customer) {
        customer = await this.prisma.customerProfile.create({
          data: {
            name,
            normalizedName: normalized,
            phone,
            normalizedPhone: phone,
            email,
            marketingConsent: Boolean(input.marketingConsent),
          },
        });
      } else {
        customer = await this.prisma.customerProfile.update({
          where: { id: customer.id },
          data: {
            name,
            phone,
            ...(email ? { email } : {}),
            ...(typeof input.marketingConsent === 'boolean'
              ? { marketingConsent: input.marketingConsent }
              : {}),
            lastSeenAt: new Date(),
          },
        });
      }
    }

    if (typeof input.marketingConsent === 'boolean') {
      await this.prisma.consentLog.create({
        data: {
          customerId: customer.id,
          type: ConsentType.WHATSAPP_MARKETING,
          granted: input.marketingConsent,
          source: this.cleanText(input.source, 120),
        },
      });
    }

    await this.mergeGuestAssets(identity.guestId, customer.id);

    let token: string | undefined;
    if (identity.customerToken) {
      const tokenOwner = await this.customerFromRawToken(
        identity.customerToken,
      );
      if (tokenOwner?.id === customer.id) token = identity.customerToken;
    }
    if (!token) token = await this.issueCustomerToken(customer.id);

    await this.track(
      { ...identity, customerToken: token },
      {
        type: CustomerEventType.PROFILE_IDENTIFIED,
        metadata: { source: input.source ?? 'contact' },
      },
    );

    return {
      customer: this.safeCustomer(customer),
      customerToken: token,
    };
  }

  async restoreProfile(identityInput: CommerceIdentity, input: RestoreInput) {
    const identity = this.validateIdentity(identityInput);
    const { normalized } = this.normalizeName(input.name);
    const phone = this.normalizePhone(input.phone);

    const customer = await this.prisma.customerProfile.findFirst({
      where: {
        normalizedName: normalized,
        normalizedPhone: phone,
      },
    });

    if (!customer) {
      // Deliberately generic: do not reveal whether the phone exists.
      throw new UnauthorizedException(
        'নাম ও ফোন নম্বর মিলছে না। তথ্য ঠিকভাবে লিখে আবার চেষ্টা করুন।',
      );
    }

    await this.mergeGuestAssets(identity.guestId, customer.id);

    let token: string | undefined;
    if (identity.customerToken) {
      const tokenOwner = await this.customerFromRawToken(
        identity.customerToken,
      );
      if (tokenOwner?.id === customer.id) token = identity.customerToken;
    }
    if (!token) token = await this.issueCustomerToken(customer.id);

    await this.track(
      { ...identity, customerToken: token },
      {
        type: CustomerEventType.PROFILE_RESTORED,
        metadata: { source: 'new_device_restore' },
      },
    );

    return {
      customer: this.safeCustomer(customer),
      customerToken: token,
    };
  }

  async track(identityInput: CommerceIdentity, input: TrackingEventInput) {
    const identity = this.validateIdentity(identityInput);
    const customer = await this.customerForIdentity(identity);
    await this.touchDevice(identity.guestId, customer?.id);

    if (identity.sessionId) {
      await this.prisma.trackingSession.upsert({
        where: { sessionId: identity.sessionId },
        update: {
          lastActivityAt: new Date(),
          ...(customer ? { customerId: customer.id } : {}),
        },
        create: {
          sessionId: identity.sessionId,
          guestId: identity.guestId,
          customerId: customer?.id,
          referrer: this.cleanText(input.referrer, 500),
          utmSource: this.cleanText(input.utmSource, 120),
          utmMedium: this.cleanText(input.utmMedium, 120),
          utmCampaign: this.cleanText(input.utmCampaign, 160),
        },
      });
    }

    return this.prisma.customerEvent.create({
      data: {
        guestId: identity.guestId,
        sessionId: identity.sessionId,
        customerId: customer?.id,
        type: input.type,
        path: this.cleanText(input.path, 500),
        entityType: this.cleanText(input.entityType, 60),
        entityId: this.cleanText(input.entityId, 180),
        metadata: this.sanitizeMetadata(input.metadata) ?? Prisma.JsonNull,
      },
    });
  }

  async refreshCartLifecycle() {
    const now = new Date();
    const abandonedMinutes = Math.max(
      10,
      Number(process.env.CART_ABANDONED_MINUTES ?? 30),
    );
    const expireDays = Math.max(1, Number(process.env.CART_EXPIRE_DAYS ?? 30));
    const abandonedCutoff = new Date(now.getTime() - abandonedMinutes * 60_000);
    const expiredCutoff = new Date(
      now.getTime() - expireDays * 24 * 60 * 60_000,
    );

    await this.prisma.cart.updateMany({
      where: {
        status: CartStatus.ACTIVE,
        lastActivityAt: { lte: abandonedCutoff },
        items: { some: {} },
      },
      data: {
        status: CartStatus.ABANDONED,
        abandonedAt: now,
      },
    });

    await this.prisma.cart.updateMany({
      where: {
        status: CartStatus.ABANDONED,
        abandonedAt: { lte: expiredCutoff },
      },
      data: {
        status: CartStatus.EXPIRED,
        expiresAt: now,
      },
    });
  }

  private async activeCart(identityInput: CommerceIdentity, create = true) {
    const identity = this.validateIdentity(identityInput);
    const customer = await this.customerForIdentity(identity);

    const ownerWhere = customer
      ? { customerId: customer.id }
      : { guestId: identity.guestId, customerId: null };

    let cart = await this.prisma.cart.findFirst({
      where: {
        ...ownerWhere,
        status: { in: [CartStatus.ACTIVE, CartStatus.ABANDONED] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (cart?.status === CartStatus.ABANDONED) {
      cart = await this.prisma.cart.update({
        where: { id: cart.id },
        data: {
          status: CartStatus.ACTIVE,
          recoveredAt: new Date(),
          guestId: identity.guestId,
          lastActivityAt: new Date(),
        },
      });
    }

    if (!cart && create) {
      cart = await this.prisma.cart.create({
        data: {
          guestId: identity.guestId,
          customerId: customer?.id,
          status: CartStatus.ACTIVE,
          lastActivityAt: new Date(),
        },
      });
    }

    return { cart, customer, identity };
  }

  private parseComboConfig(
    value: Prisma.JsonValue | null,
  ): ComboConfigItemInput[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const result: ComboConfigItemInput[] = [];
    for (const raw of value) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const productId = this.cleanText(
        (raw as Record<string, unknown>).productId,
        180,
      );
      const quantity = Number((raw as Record<string, unknown>).quantity);
      if (productId && Number.isInteger(quantity) && quantity >= 0) {
        result.push({ productId, quantity });
      }
    }
    return result.length ? result : undefined;
  }

  private async quoteProduct(
    productId: string,
    quantity: number,
    variantId?: string,
    clientKey = productId,
  ): Promise<QuoteLine> {
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_CART_QUANTITY
    ) {
      throw new BadRequestException('পণ্যের quantity সঠিক নয়');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'ACTIVE' },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variants: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!product) throw new NotFoundException('পণ্যটি পাওয়া যায়নি');

    let price = this.asNumber(product.price);
    let stock = product.stock - product.reservedStock;
    let purchaseCost = this.asNumber(product.purchaseCost);
    let packagingCost = this.asNumber(product.packagingCost);
    let sku = product.sku;
    let name = product.name;
    let image = product.images[0]?.url;

    if (product.variants.length > 0 && !variantId) {
      throw new BadRequestException('রং/সাইজ নির্বাচন করুন');
    }

    if (variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: {
          id: variantId,
          productId,
          isActive: true,
        },
        include: {
          values: {
            include: { value: { include: { attribute: true } } },
          },
        },
      });
      if (!variant) throw new BadRequestException('ভ্যারিয়েন্টটি পাওয়া যায়নি');
      price = variant.price ? this.asNumber(variant.price) : price;
      stock = variant.stock - variant.reservedStock;
      purchaseCost = this.asNumber(variant.purchaseCost);
      packagingCost = this.asNumber(variant.packagingCost);
      sku = variant.sku;
      image = variant.imageUrl ?? image;
      const optionLabel = variant.values
        .map((item) => `${item.value.attribute.name}: ${item.value.value}`)
        .join(', ');
      if (optionLabel) name = `${product.name} — ${optionLabel}`;
    }

    if (stock < quantity) {
      throw new ConflictException(`"${product.name}" পর্যাপ্ত স্টকে নেই`);
    }

    return {
      clientKey,
      itemType: CartItemType.PRODUCT,
      productId,
      variantId,
      quantity,
      name,
      sku,
      image,
      unitPrice: this.money(price),
      lineTotal: this.money(price * quantity),
      purchaseCost: this.money(purchaseCost),
      packagingCost: this.money(packagingCost),
    };
  }

  async quoteCombo(
    comboId: string,
    customConfig?: ComboConfigItemInput[],
    boxQuantity = 1,
    clientKey = comboId,
  ) {
    if (
      !Number.isInteger(boxQuantity) ||
      boxQuantity < 1 ||
      boxQuantity > MAX_CART_QUANTITY
    ) {
      throw new BadRequestException('Solution Box quantity সঠিক নয়');
    }

    const combo = await this.prisma.combo.findFirst({
      where: { id: comboId, status: 'ACTIVE' },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: 'asc' }, take: 1 },
              },
            },
          },
        },
      },
    });

    if (!combo) throw new NotFoundException('Solution Box পাওয়া যায়নি');
    if (combo.stock - combo.reservedStock < boxQuantity) {
      throw new ConflictException('Solution Box পর্যাপ্ত স্টকে নেই');
    }

    const allowed = new Map(combo.items.map((item) => [item.productId, item]));
    const requested = new Map<string, number>();

    if (customConfig) {
      for (const input of customConfig) {
        if (!allowed.has(input.productId)) {
          throw new BadRequestException(
            'Solution Box-এর বাইরের product যোগ করা যাবে না',
          );
        }
        if (
          !Number.isInteger(input.quantity) ||
          input.quantity < 0 ||
          input.quantity > MAX_COMBO_ITEM_QUANTITY
        ) {
          throw new BadRequestException('Box item quantity সঠিক নয়');
        }
        requested.set(input.productId, input.quantity);
      }
    }

    const canonical = combo.items
      .map((item) => ({
        relation: item,
        quantity: customConfig
          ? (requested.get(item.productId) ?? 0)
          : item.quantity,
      }))
      .filter((item) => item.quantity > 0);

    if (!canonical.length) {
      throw new BadRequestException('Solution Box সম্পূর্ণ খালি রাখা যাবে না');
    }

    for (const { relation, quantity } of canonical) {
      if (relation.product.status !== 'ACTIVE') {
        throw new ConflictException(
          `"${relation.product.name}" এখন অর্ডারের জন্য available নয়`,
        );
      }
      if (
        relation.product.stock - relation.product.reservedStock <
        quantity * boxQuantity
      ) {
        throw new ConflictException(
          `"${relation.product.name}" পর্যাপ্ত স্টকে নেই`,
        );
      }
    }

    const originalRetail = combo.items.reduce(
      (sum, item) => sum + this.asNumber(item.product.price) * item.quantity,
      0,
    );
    if (originalRetail <= 0) {
      throw new ConflictException(
        'Solution Box-এর pricing configuration সঠিক নয়',
      );
    }

    const discountFactor = this.asNumber(combo.price) / originalRetail;
    const customRetail = canonical.reduce(
      (sum, item) =>
        sum + this.asNumber(item.relation.product.price) * item.quantity,
      0,
    );

    const unitPrice = this.money(customRetail * discountFactor);
    const purchaseCost = this.money(
      canonical.reduce(
        (sum, item) =>
          sum +
          this.asNumber(item.relation.product.purchaseCost) * item.quantity,
        0,
      ),
    );
    const packagingCost = this.money(
      this.asNumber(combo.packagingCost) +
        canonical.reduce(
          (sum, item) =>
            sum +
            this.asNumber(item.relation.product.packagingCost) * item.quantity,
          0,
        ),
    );
    const config: QuoteConfigItem[] = canonical.map(
      ({ relation, quantity }) => {
        const productPrice = this.asNumber(relation.product.price);
        return {
          productId: relation.productId,
          quantity,
          name: relation.product.name,
          image: relation.product.images[0]?.url,
          unitPrice: this.money(productPrice),
          lineTotal: this.money(productPrice * quantity),
        };
      },
    );

    const defaultConfig = combo.items
      .map((item) => `${item.productId}:${item.quantity}`)
      .sort()
      .join('|');
    const selectedConfig = canonical
      .map((item) => `${item.relation.productId}:${item.quantity}`)
      .sort()
      .join('|');

    return {
      combo,
      line: {
        clientKey,
        itemType: CartItemType.COMBO,
        comboId,
        quantity: boxQuantity,
        name: combo.name,
        sku: combo.sku,
        image: combo.images[0]?.url,
        unitPrice,
        lineTotal: this.money(unitPrice * boxQuantity),
        purchaseCost,
        packagingCost,
        customConfig: config,
      } satisfies QuoteLine,
      retailTotal: this.money(customRetail),
      originalBoxRetailTotal: this.money(originalRetail),
      discountPercent: this.money((1 - discountFactor) * 100),
      isCustomized: defaultConfig !== selectedConfig,
      canonicalConfig: config.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    };
  }

  async quoteCustomCombo(
    customConfig: ComboConfigItemInput[],
    boxQuantity = 1,
    clientKey = 'custom-solution-box',
  ) {
    if (
      !Number.isInteger(boxQuantity) ||
      boxQuantity < 1 ||
      boxQuantity > MAX_CART_QUANTITY
    ) {
      throw new BadRequestException('Custom Solution Box quantity সঠিক নয়');
    }

    const requested = new Map<string, number>();
    for (const input of customConfig ?? []) {
      if (
        !input.productId ||
        !Number.isInteger(input.quantity) ||
        input.quantity < 1 ||
        input.quantity > MAX_COMBO_ITEM_QUANTITY
      ) {
        throw new BadRequestException('Custom Box item quantity সঠিক নয়');
      }
      requested.set(input.productId, input.quantity);
    }

    if (!requested.size) {
      throw new BadRequestException(
        'Custom Solution Box-এ অন্তত একটি product যোগ করুন',
      );
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...requested.keys()] }, status: 'ACTIVE' },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    });
    if (products.length !== requested.size) {
      throw new BadRequestException(
        'নির্বাচিত এক বা একাধিক product এখন available নয়',
      );
    }

    const config: QuoteConfigItem[] = products
      .map((product) => {
        const quantity = requested.get(product.id)!;
        if (product.stock - product.reservedStock < quantity * boxQuantity) {
          throw new ConflictException(`"${product.name}" পর্যাপ্ত স্টকে নেই`);
        }
        const unitPrice = this.asNumber(product.price);
        return {
          productId: product.id,
          quantity,
          name: product.name,
          image: product.images[0]?.url,
          unitPrice: this.money(unitPrice),
          lineTotal: this.money(unitPrice * quantity),
        };
      })
      .sort((a, b) => a.productId.localeCompare(b.productId));

    const retailTotal = this.money(
      config.reduce((sum, item) => sum + item.lineTotal, 0),
    );
    const setting = await this.storeSettings.getCustomCombo();
    const discountEligible = retailTotal >= setting.customComboMinSubtotal;
    const appliedDiscountPercent = discountEligible
      ? setting.customComboDiscountPercent
      : 0;
    const unitPrice = this.money(
      retailTotal * (1 - appliedDiscountPercent / 100),
    );
    const purchaseCost = this.money(
      products.reduce(
        (sum, product) =>
          sum +
          this.asNumber(product.purchaseCost) *
            (requested.get(product.id) ?? 0),
        0,
      ),
    );
    const packagingCost = this.money(
      products.reduce(
        (sum, product) =>
          sum +
          this.asNumber(product.packagingCost) *
            (requested.get(product.id) ?? 0),
        0,
      ),
    );

    return {
      line: {
        clientKey,
        itemType: CartItemType.COMBO,
        quantity: boxQuantity,
        name: 'নিজের মতো সাজানো Solution Box',
        sku: 'CUSTOM-SOLUTION-BOX',
        image: config[0]?.image,
        unitPrice,
        lineTotal: this.money(unitPrice * boxQuantity),
        purchaseCost,
        packagingCost,
        customConfig: config,
      } satisfies QuoteLine,
      retailTotal,
      minimumSubtotal: setting.customComboMinSubtotal,
      discountPercent: setting.customComboDiscountPercent,
      appliedDiscountPercent,
      discountEligible,
      amountNeeded: this.money(
        Math.max(0, setting.customComboMinSubtotal - retailTotal),
      ),
      canonicalConfig: config.map(({ productId, quantity }) => ({
        productId,
        quantity,
      })),
    };
  }

  private async quoteCartInput(
    input: CartItemInput,
    clientKey: string,
  ): Promise<QuoteLine> {
    if (input.itemType === CartItemType.PRODUCT) {
      const productId = this.requiredText(input.productId, 'productId', 180);
      return this.quoteProduct(
        productId,
        Number(input.quantity),
        this.cleanText(input.variantId, 180),
        clientKey,
      );
    }

    if (input.itemType === CartItemType.COMBO) {
      return input.comboId
        ? (
            await this.quoteCombo(
              input.comboId,
              input.customConfig,
              Number(input.quantity),
              clientKey,
            )
          ).line
        : (
            await this.quoteCustomCombo(
              input.customConfig ?? [],
              Number(input.quantity),
              clientKey,
            )
          ).line;
    }

    throw new BadRequestException('Cart item type সঠিক নয়');
  }

  private async recalculateCart(cartId: string) {
    const items = await this.prisma.cartItem.findMany({ where: { cartId } });
    let subtotal = 0;

    for (const item of items) {
      try {
        const line =
          item.itemType === CartItemType.PRODUCT
            ? await this.quoteProduct(
                item.productId!,
                item.quantity,
                item.variantId ?? undefined,
                item.clientKey,
              )
            : item.comboId
              ? (
                  await this.quoteCombo(
                    item.comboId,
                    this.parseComboConfig(item.customConfig),
                    item.quantity,
                    item.clientKey,
                  )
                ).line
              : (
                  await this.quoteCustomCombo(
                    this.parseComboConfig(item.customConfig) ?? [],
                    item.quantity,
                    item.clientKey,
                  )
                ).line;

        subtotal += line.lineTotal;
        await this.prisma.cartItem.update({
          where: { id: item.id },
          data: {
            unitPriceSnapshot: line.unitPrice,
          },
        });
      } catch {
        // A stale/deleted/out-of-stock item remains visible to admins through
        // historical events, but is removed from the active cart so checkout
        // cannot accidentally charge an invalid item.
        await this.prisma.cartItem.delete({ where: { id: item.id } });
      }
    }

    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        subtotalSnapshot: this.money(subtotal),
        lastActivityAt: new Date(),
      },
    });

    return this.money(subtotal);
  }

  async putCartItem(
    identityInput: CommerceIdentity,
    rawClientKey: string,
    input: CartItemInput,
  ) {
    const clientKey = decodeURIComponent(
      this.requiredText(rawClientKey, 'clientKey', 220),
    );
    const { cart, customer, identity } = await this.activeCart(identityInput);
    if (!cart) throw new BadRequestException('Cart তৈরি করা যায়নি');

    const line = await this.quoteCartInput(input, clientKey);

    const data: Prisma.CartItemUncheckedCreateInput = {
      cartId: cart.id,
      clientKey,
      itemType: line.itemType,
      productId: line.productId,
      variantId: line.variantId,
      comboId: line.comboId,
      quantity: line.quantity,
      unitPriceSnapshot: line.unitPrice,
      customConfig: line.customConfig
        ? (line.customConfig.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })) as Prisma.InputJsonValue)
        : Prisma.DbNull,
    };

    await this.prisma.cartItem.upsert({
      where: {
        cartId_clientKey: {
          cartId: cart.id,
          clientKey,
        },
      },
      update: {
        itemType: data.itemType,
        productId: data.productId,
        variantId: data.variantId,
        comboId: data.comboId,
        quantity: data.quantity,
        unitPriceSnapshot: data.unitPriceSnapshot,
        customConfig: data.customConfig,
      },
      create: data,
    });

    await this.recalculateCart(cart.id);

    await this.track(identity, {
      type: CustomerEventType.CART_ADD,
      entityType: line.itemType,
      entityId: line.productId ?? line.comboId,
      metadata: {
        quantity: line.quantity,
        customized: Boolean(line.customConfig),
        identified: Boolean(customer),
      },
    });

    return this.getCart(identity);
  }

  async deleteCartItem(identityInput: CommerceIdentity, rawClientKey: string) {
    const clientKey = decodeURIComponent(
      this.requiredText(rawClientKey, 'clientKey', 220),
    );
    const { cart, identity } = await this.activeCart(identityInput, false);
    if (!cart) return { success: true };

    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_clientKey: {
          cartId: cart.id,
          clientKey,
        },
      },
    });

    if (item) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
      await this.recalculateCart(cart.id);
      await this.track(identity, {
        type: CustomerEventType.CART_REMOVE,
        entityType: item.itemType,
        entityId: item.productId ?? item.comboId ?? undefined,
      });
    }

    return this.getCart(identity);
  }

  private async cartView(cartId: string): Promise<CartView> {
    await this.recalculateCart(cartId);

    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: {
              include: {
                category: true,
                images: { orderBy: { sortOrder: 'asc' } },
              },
            },
            variant: {
              include: {
                values: {
                  include: { value: { include: { attribute: true } } },
                },
              },
            },
            combo: {
              include: {
                images: { orderBy: { sortOrder: 'asc' } },
                items: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    product: {
                      include: {
                        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cart) throw new NotFoundException('Cart পাওয়া যায়নি');

    const items: CartViewItem[] = [];
    for (const item of cart.items) {
      if (item.itemType === CartItemType.PRODUCT && item.product) {
        const currentPrice = item.variant?.price
          ? this.asNumber(item.variant.price)
          : this.asNumber(item.product.price);
        const stock = item.variant
          ? Math.max(0, item.variant.stock - item.variant.reservedStock)
          : Math.max(0, item.product.stock - item.product.reservedStock);

        items.push({
          id: item.id,
          clientKey: item.clientKey,
          quantity: item.quantity,
          customConfig: null,
          unitPrice: this.money(currentPrice),
          product: {
            id: item.product.id,
            slug: item.product.slug,
            href: `/products/${item.product.slug}`,
            name: item.product.name,
            description: item.product.description,
            category: item.product.category.name,
            images: item.variant?.imageUrl
              ? [
                  item.variant.imageUrl,
                  ...item.product.images
                    .map((image) => image.url)
                    .filter((image) => image !== item.variant?.imageUrl),
                ]
              : item.product.images.map((image) => image.url),
            price: this.money(currentPrice),
            compareAtPrice: item.variant?.compareAtPrice
              ? this.asNumber(item.variant.compareAtPrice)
              : item.product.compareAtPrice
                ? this.asNumber(item.product.compareAtPrice)
                : undefined,
            stock,
            productType: 'single',
            sku: item.variant?.sku ?? item.product.sku,
            selectedVariant: item.variant
              ? {
                  id: item.variant.id,
                  sku: item.variant.sku,
                  price: item.variant.price
                    ? this.asNumber(item.variant.price)
                    : null,
                  compareAtPrice: item.variant.compareAtPrice
                    ? this.asNumber(item.variant.compareAtPrice)
                    : null,
                  stock: item.variant.stock,
                  imageUrl: item.variant.imageUrl,
                  isActive: item.variant.isActive,
                  selections: item.variant.values.map((entry) => ({
                    attribute: entry.value.attribute.name,
                    value: entry.value.value,
                  })),
                }
              : undefined,
          },
        });
      }

      if (item.itemType === CartItemType.COMBO && item.combo) {
        const quote = await this.quoteCombo(
          item.combo.id,
          this.parseComboConfig(item.customConfig),
          item.quantity,
          item.clientKey,
        );

        items.push({
          id: item.id,
          clientKey: item.clientKey,
          quantity: item.quantity,
          customConfig: quote.canonicalConfig,
          unitPrice: quote.line.unitPrice,
          isCustomized: quote.isCustomized,
          product: {
            id: item.combo.id,
            slug: item.combo.slug,
            href: `/solution-box/${item.combo.slug}`,
            name: item.combo.name,
            description: item.combo.description,
            category: 'মানিকো সল্যুশন বক্স',
            images: item.combo.images.map((image) => image.url),
            price: quote.line.unitPrice,
            compareAtPrice: this.asNumber(item.combo.compareAtPrice),
            stock: Math.max(0, item.combo.stock - item.combo.reservedStock),
            productType: 'combo',
            sku: item.combo.sku,
            comboItems: quote.line.customConfig?.map((config) => ({
              productId: config.productId,
              slug:
                item.combo?.items.find(
                  (relation) => relation.productId === config.productId,
                )?.product.slug ?? config.productId,
              href: `/products/${
                item.combo?.items.find(
                  (relation) => relation.productId === config.productId,
                )?.product.slug ?? ''
              }`,
              name: config.name,
              image: config.image ?? '',
              quantity: config.quantity,
            })),
          },
        });
      }

      if (item.itemType === CartItemType.COMBO && !item.comboId) {
        const quote = await this.quoteCustomCombo(
          this.parseComboConfig(item.customConfig) ?? [],
          item.quantity,
          item.clientKey,
        );
        items.push({
          id: item.id,
          clientKey: item.clientKey,
          quantity: item.quantity,
          customConfig: quote.canonicalConfig,
          unitPrice: quote.line.unitPrice,
          isCustomized: true,
          product: {
            id: 'custom-solution-box',
            slug: 'customised',
            href: '/solution-box/customised',
            name: quote.line.name,
            description: 'আপনার পছন্দের পণ্য দিয়ে তৈরি Solution Box',
            category: 'মানিকো সল্যুশন বক্স',
            images: quote.line.image ? [quote.line.image] : [],
            price: quote.line.unitPrice,
            stock: MAX_CART_QUANTITY,
            productType: 'combo',
            sku: quote.line.sku ?? 'CUSTOM-SOLUTION-BOX',
            comboItems: quote.line.customConfig?.map((config) => ({
              productId: config.productId,
              slug: config.productId,
              href: '/solution-box/customised',
              name: config.name,
              image: config.image ?? '',
              quantity: config.quantity,
            })),
          },
        });
      }
    }

    return {
      id: cart.id,
      status: cart.status,
      subtotal: this.asNumber(cart.subtotalSnapshot),
      lastActivityAt: cart.lastActivityAt,
      items,
    };
  }

  async getCart(identityInput: CommerceIdentity): Promise<CartView> {
    await this.refreshCartLifecycle();
    const { cart } = await this.activeCart(identityInput);
    if (!cart) {
      return {
        id: null,
        status: CartStatus.ACTIVE,
        subtotal: 0,
        lastActivityAt: null,
        items: [],
      };
    }
    return this.cartView(cart.id);
  }

  async saveCheckoutDraft(
    identityInput: CommerceIdentity,
    input: CheckoutDraftInput,
  ) {
    const { cart, identity } = await this.activeCart(identityInput);
    if (!cart) throw new BadRequestException('Cart পাওয়া যায়নি');

    const data = {
      ...(input.name !== undefined
        ? { customerName: this.cleanText(input.name, 120) ?? null }
        : {}),
      ...(input.phone !== undefined
        ? { phone: this.cleanText(input.phone, 30) ?? null }
        : {}),
      ...(input.email !== undefined
        ? { email: this.cleanText(input.email, 160) ?? null }
        : {}),
      ...(input.address !== undefined
        ? { address: this.cleanText(input.address, 500) ?? null }
        : {}),
      ...(input.area !== undefined
        ? { area: this.cleanText(input.area, 160) ?? null }
        : {}),
      ...(input.city !== undefined
        ? { city: this.cleanText(input.city, 120) ?? null }
        : {}),
      ...(input.note !== undefined
        ? { note: this.cleanText(input.note, 500) ?? null }
        : {}),
      lastActivityAt: new Date(),
    };

    const updated = await this.prisma.cart.update({
      where: { id: cart.id },
      data,
    });

    let identified: Awaited<
      ReturnType<CommerceService['captureContact']>
    > | null = null;
    if (updated.customerName && updated.phone) {
      try {
        identified = await this.captureContact(identity, {
          name: updated.customerName,
          phone: updated.phone,
          email: updated.email ?? undefined,
          source: 'checkout_draft',
        });
      } catch {
        // Draft saving must never be blocked by an incomplete/invalid contact.
      }
    }

    const completedField = this.cleanText(input.completedField, 80);
    if (completedField) {
      await this.track(
        {
          ...identity,
          customerToken: identified?.customerToken ?? identity.customerToken,
        },
        {
          type: CustomerEventType.CHECKOUT_FIELD_COMPLETED,
          metadata: { field: completedField },
        },
      );
    }

    return {
      success: true,
      customer: identified?.customer,
      customerToken: identified?.customerToken,
    };
  }

  async saveCart(identityInput: CommerceIdentity, input: ContactInput) {
    const identified = await this.captureContact(identityInput, {
      ...input,
      source: input.source ?? 'cart_save',
    });

    const nextIdentity = {
      ...identityInput,
      customerToken: identified.customerToken,
    };
    const { cart, identity } = await this.activeCart(nextIdentity, false);
    if (!cart) throw new BadRequestException('সেভ করার মতো cart নেই');

    const count = await this.prisma.cartItem.count({
      where: { cartId: cart.id },
    });
    if (!count) throw new BadRequestException('কার্ট বর্তমানে খালি');

    const raw = this.issueRawToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: {
        recoveryTokenHash: this.hash(raw),
        recoveryExpiresAt: expiresAt,
        customerId: identified.customer.id,
        guestId: identity.guestId,
      },
    });

    await this.prisma.customerLead.create({
      data: {
        type: LeadType.CART_SAVE,
        guestId: identity.guestId,
        customerId: identified.customer.id,
        data: { cartId: cart.id },
      },
    });

    await this.track(nextIdentity, {
      type: CustomerEventType.CART_SAVED,
      metadata: { itemCount: count },
    });

    const base = (
      process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');

    return {
      ...identified,
      recoveryUrl: `${base}/cart/recover/${raw}`,
      expiresAt,
    };
  }

  async recoverCart(identityInput: CommerceIdentity, rawToken: string) {
    const identity = this.validateIdentity(identityInput);
    const tokenHash = this.hash(
      this.requiredText(rawToken, 'Recovery token', 500),
    );
    const cart = await this.prisma.cart.findFirst({
      where: {
        recoveryTokenHash: tokenHash,
        recoveryExpiresAt: { gt: new Date() },
        status: { in: [CartStatus.ACTIVE, CartStatus.ABANDONED] },
      },
    });

    if (!cart) {
      throw new NotFoundException('Recovery link invalid অথবা মেয়াদ শেষ হয়েছে');
    }

    let customerToken: string | undefined;
    let customer: CustomerSafe | undefined;

    if (cart.customerId) {
      await this.mergeGuestAssets(identity.guestId, cart.customerId);
      customerToken = await this.issueCustomerToken(cart.customerId);
      const profile = await this.prisma.customerProfile.findUniqueOrThrow({
        where: { id: cart.customerId },
      });
      customer = this.safeCustomer(profile);
    }

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: {
        guestId: identity.guestId,
        status: CartStatus.ACTIVE,
        recoveredAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    return {
      customer,
      customerToken,
      cart: await this.cartView(cart.id),
    };
  }

  private async wishlistForIdentity(
    identityInput: CommerceIdentity,
    create = true,
  ) {
    const identity = this.validateIdentity(identityInput);
    const customer = await this.customerForIdentity(identity);
    const ownerKey = customer
      ? `customer:${customer.id}`
      : `guest:${identity.guestId}`;

    let wishlist = await this.prisma.wishlist.findUnique({
      where: { ownerKey },
    });
    if (!wishlist && create) {
      wishlist = await this.prisma.wishlist.create({
        data: {
          ownerKey,
          guestId: identity.guestId,
          customerId: customer?.id,
        },
      });
    }
    return { wishlist, customer, identity };
  }

  private productToView(product: any) {
    return {
      id: product.id,
      slug: product.slug,
      href:
        product.__kind === 'combo'
          ? `/solution-box/${product.slug}`
          : `/products/${product.slug}`,
      name: product.name,
      description: product.description ?? product.subtitle ?? '',
      category:
        product.__kind === 'combo'
          ? 'মানিকো সল্যুশন বক্স'
          : (product.category?.name ?? ''),
      images: product.images?.map((image: any) => image.url) ?? [],
      price: this.asNumber(product.price),
      compareAtPrice: product.compareAtPrice
        ? this.asNumber(product.compareAtPrice)
        : undefined,
      stock: product.stock,
      productType: product.__kind === 'combo' ? 'combo' : 'single',
      sku: product.sku,
    };
  }

  async getWishlist(identityInput: CommerceIdentity) {
    const { wishlist } = await this.wishlistForIdentity(identityInput);
    if (!wishlist) return { items: [] };

    const rows = await this.prisma.wishlistItem.findMany({
      where: { wishlistId: wishlist.id },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            category: true,
            images: { orderBy: { sortOrder: 'asc' } },
          },
        },
        combo: {
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    return {
      items: rows.flatMap((row) => {
        if (row.itemType === CartItemType.PRODUCT && row.product) {
          return [this.productToView({ ...row.product, __kind: 'product' })];
        }
        if (row.itemType === CartItemType.COMBO && row.combo) {
          return [this.productToView({ ...row.combo, __kind: 'combo' })];
        }
        return [];
      }),
    };
  }

  async putWishlistItem(
    identityInput: CommerceIdentity,
    itemType: CartItemType,
    entityId: string,
  ) {
    const { wishlist, identity } =
      await this.wishlistForIdentity(identityInput);
    if (!wishlist) throw new BadRequestException('Wishlist তৈরি করা যায়নি');

    const id = this.requiredText(entityId, 'entityId', 180);
    if (itemType === CartItemType.PRODUCT) {
      const product = await this.prisma.product.findFirst({
        where: { id, status: 'ACTIVE' },
      });
      if (!product) throw new NotFoundException('পণ্য পাওয়া যায়নি');
    } else {
      const combo = await this.prisma.combo.findFirst({
        where: { id, status: 'ACTIVE' },
      });
      if (!combo) throw new NotFoundException('Solution Box পাওয়া যায়নি');
    }

    const clientKey = `${itemType}:${id}`;
    await this.prisma.wishlistItem.upsert({
      where: {
        wishlistId_clientKey: {
          wishlistId: wishlist.id,
          clientKey,
        },
      },
      update: {},
      create: {
        wishlistId: wishlist.id,
        clientKey,
        itemType,
        productId: itemType === CartItemType.PRODUCT ? id : undefined,
        comboId: itemType === CartItemType.COMBO ? id : undefined,
      },
    });

    await this.track(identity, {
      type: CustomerEventType.WISHLIST_ADD,
      entityType: itemType,
      entityId: id,
    });

    return this.getWishlist(identity);
  }

  async deleteWishlistItem(
    identityInput: CommerceIdentity,
    itemType: CartItemType,
    entityId: string,
  ) {
    const { wishlist, identity } = await this.wishlistForIdentity(
      identityInput,
      false,
    );
    if (!wishlist) return { items: [] };

    const id = this.requiredText(entityId, 'entityId', 180);
    const clientKey = `${itemType}:${id}`;
    await this.prisma.wishlistItem.deleteMany({
      where: {
        wishlistId: wishlist.id,
        clientKey,
      },
    });

    await this.track(identity, {
      type: CustomerEventType.WISHLIST_REMOVE,
      entityType: itemType,
      entityId: id,
    });

    return this.getWishlist(identity);
  }

  async saveWishlist(identityInput: CommerceIdentity, input: ContactInput) {
    const identified = await this.captureContact(identityInput, {
      ...input,
      source: input.source ?? 'wishlist_save',
    });

    const nextIdentity = {
      ...identityInput,
      customerToken: identified.customerToken,
    };
    const { wishlist, identity } = await this.wishlistForIdentity(
      nextIdentity,
      false,
    );
    const count = wishlist
      ? await this.prisma.wishlistItem.count({
          where: { wishlistId: wishlist.id },
        })
      : 0;

    if (!count) throw new BadRequestException('Wishlist বর্তমানে খালি');

    await this.prisma.customerLead.create({
      data: {
        type: LeadType.WISHLIST_SAVE,
        guestId: identity.guestId,
        customerId: identified.customer.id,
        data: { itemCount: count },
      },
    });

    await this.track(nextIdentity, {
      type: CustomerEventType.WISHLIST_SAVED,
      metadata: { itemCount: count },
    });

    const base = (
      process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');

    return {
      ...identified,
      accountUrl: `${base}/orders`,
    };
  }

  async createLead(identityInput: CommerceIdentity, input: LeadInput) {
    const identity = this.validateIdentity(identityInput);
    let customer = await this.customerForIdentity(identity);
    let customerToken: string | undefined;

    if (input.name && input.phone) {
      const identified = await this.captureContact(identity, {
        name: input.name,
        phone: input.phone,
        email: input.email,
        marketingConsent: input.marketingConsent,
        source: `lead:${input.type}`,
      });
      customer = await this.prisma.customerProfile.findUnique({
        where: { id: identified.customer.id },
      });
      customerToken = identified.customerToken;
    }

    if (
      input.type === LeadType.PRICE_DROP ||
      input.type === LeadType.BACK_IN_STOCK ||
      input.type === LeadType.CARE_TEAM
    ) {
      if (!customer) {
        throw new BadRequestException('নাম ও ফোন নম্বর প্রয়োজন');
      }
    }

    const lead = await this.prisma.customerLead.create({
      data: {
        type: input.type,
        guestId: identity.guestId,
        customerId: customer?.id,
        productId: this.cleanText(input.productId, 180),
        comboId: this.cleanText(input.comboId, 180),
        data: this.sanitizeMetadata(input.data) ?? Prisma.JsonNull,
      },
    });

    const eventMap: Partial<Record<LeadType, CustomerEventType>> = {
      [LeadType.PRICE_DROP]: CustomerEventType.PRICE_ALERT_CREATED,
      [LeadType.BACK_IN_STOCK]: CustomerEventType.STOCK_ALERT_CREATED,
      [LeadType.CARE_TEAM]: CustomerEventType.CARE_TEAM_REQUESTED,
      [LeadType.DELIVERY_ESTIMATE]:
        CustomerEventType.DELIVERY_ESTIMATE_REQUESTED,
    };

    const eventType = eventMap[input.type];
    if (eventType) {
      await this.track(
        { ...identity, customerToken: customerToken ?? identity.customerToken },
        {
          type: eventType,
          entityType: input.productId
            ? 'PRODUCT'
            : input.comboId
              ? 'COMBO'
              : undefined,
          entityId: input.productId ?? input.comboId,
        },
      );
    }

    return {
      success: true,
      leadId: lead.id,
      customerToken,
      customer: customer ? this.safeCustomer(customer) : undefined,
    };
  }

  async updateCareProfile(
    identityInput: CommerceIdentity,
    input: CareProfileInput,
  ) {
    const identity = this.validateIdentity(identityInput);
    const customer = await this.customerForIdentity(identity);
    if (!customer) {
      throw new UnauthorizedException(
        'Care Profile সেভ করতে আগে নাম ও ফোন নম্বর দিন',
      );
    }

    const interests = Array.isArray(input.interests)
      ? input.interests
          .map((item) => this.cleanText(item, 80))
          .filter((item): item is string => Boolean(item))
          .slice(0, 20)
      : undefined;

    const budgetMin =
      input.budgetMin === undefined
        ? undefined
        : Math.max(0, Math.round(Number(input.budgetMin)));
    const budgetMax =
      input.budgetMax === undefined
        ? undefined
        : Math.max(0, Math.round(Number(input.budgetMax)));

    if (
      budgetMin !== undefined &&
      budgetMax !== undefined &&
      budgetMin > budgetMax
    ) {
      throw new BadRequestException('Budget range সঠিক নয়');
    }

    const updated = await this.prisma.customerProfile.update({
      where: { id: customer.id },
      data: {
        ...(input.journeySlug !== undefined
          ? { journeySlug: this.cleanText(input.journeySlug, 120) ?? null }
          : {}),
        ...(interests !== undefined
          ? { interests: interests as Prisma.InputJsonValue }
          : {}),
        ...(budgetMin !== undefined ? { budgetMin } : {}),
        ...(budgetMax !== undefined ? { budgetMax } : {}),
        lastSeenAt: new Date(),
      },
    });

    await this.track(identity, {
      type: CustomerEventType.CARE_PROFILE_UPDATED,
      metadata: {
        journeySlug: updated.journeySlug ?? '',
        interestCount: interests?.length ?? 0,
        budgetMin: updated.budgetMin ?? 0,
        budgetMax: updated.budgetMax ?? 0,
      },
    });

    return this.safeCustomer(updated);
  }

  private deliveryCharge(subtotal: number) {
    const freeMinimum = Math.max(
      0,
      Number(
        process.env.FREE_DELIVERY_MINIMUM ?? DEFAULT_FREE_DELIVERY_MINIMUM,
      ),
    );
    const charge = Math.max(
      0,
      Number(process.env.DELIVERY_CHARGE ?? DEFAULT_DELIVERY_CHARGE),
    );
    return subtotal >= freeMinimum ? 0 : charge;
  }

  async quoteOrder(
    identityInput: CommerceIdentity,
    input: OrderQuoteInput,
  ): Promise<OrderQuote> {
    const identity = this.validateIdentity(identityInput);
    const items: QuoteLine[] = [];

    if (input.mode === 'CART') {
      const { cart } = await this.activeCart(identity, false);
      if (!cart) throw new BadRequestException('কার্ট খালি');

      const cartItems = await this.prisma.cartItem.findMany({
        where: { cartId: cart.id },
        orderBy: { createdAt: 'asc' },
      });
      if (!cartItems.length) throw new BadRequestException('কার্ট খালি');

      for (const item of cartItems) {
        if (item.itemType === CartItemType.PRODUCT) {
          items.push(
            await this.quoteProduct(
              item.productId!,
              item.quantity,
              item.variantId ?? undefined,
              item.clientKey,
            ),
          );
        } else if (item.comboId) {
          items.push(
            (
              await this.quoteCombo(
                item.comboId,
                this.parseComboConfig(item.customConfig),
                item.quantity,
                item.clientKey,
              )
            ).line,
          );
        } else {
          items.push(
            (
              await this.quoteCustomCombo(
                this.parseComboConfig(item.customConfig) ?? [],
                item.quantity,
                item.clientKey,
              )
            ).line,
          );
        }
      }
    } else if (input.mode === 'BUY_NOW') {
      if (!input.item)
        throw new BadRequestException('Buy now item পাওয়া যায়নি');

      if (input.item.itemType === CartItemType.PRODUCT) {
        items.push(
          await this.quoteProduct(
            this.requiredText(input.item.productId, 'productId', 180),
            Number(input.item.quantity),
            this.cleanText(input.item.variantId, 180),
            'buy-now',
          ),
        );
      } else if (input.item.comboId) {
        items.push(
          (
            await this.quoteCombo(
              input.item.comboId,
              input.item.customConfig,
              Number(input.item.quantity),
              'buy-now',
            )
          ).line,
        );
      } else {
        items.push(
          (
            await this.quoteCustomCombo(
              input.item.customConfig ?? [],
              Number(input.item.quantity),
              'buy-now',
            )
          ).line,
        );
      }
    } else {
      throw new BadRequestException('Checkout mode সঠিক নয়');
    }

    const subtotal = this.money(
      items.reduce((sum, item) => sum + item.lineTotal, 0),
    );
    const deliveryCharge = this.money(this.deliveryCharge(subtotal));

    return {
      items,
      subtotal,
      deliveryCharge,
      total: this.money(subtotal + deliveryCharge),
    };
  }

  private orderNumber() {
    const date = new Date();
    const y = String(date.getFullYear()).slice(-2);
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `MNK-${y}${m}${d}-${Date.now().toString(36).toUpperCase()}${randomBytes(
      2,
    )
      .toString('hex')
      .toUpperCase()}`;
  }

  private publicTrackingToken() {
    return randomBytes(24).toString('base64url');
  }

  private publicTrackingExpiry() {
    return new Date(Date.now() + PUBLIC_TRACKING_DAYS * 86_400_000);
  }

  private async decrementStockForLine(
    tx: Prisma.TransactionClient,
    line: QuoteLine,
  ) {
    if (line.itemType === CartItemType.PRODUCT) {
      if (line.variantId) {
        const result = await tx.productVariant.updateMany({
          where: {
            id: line.variantId,
            productId: line.productId,
            isActive: true,
            stock: { gte: line.quantity },
          },
          data: { stock: { decrement: line.quantity } },
        });
        if (result.count !== 1) {
          throw new ConflictException(`"${line.name}" পর্যাপ্ত স্টকে নেই`);
        }
      } else {
        const result = await tx.product.updateMany({
          where: {
            id: line.productId,
            status: 'ACTIVE',
            stock: { gte: line.quantity },
          },
          data: { stock: { decrement: line.quantity } },
        });
        if (result.count !== 1) {
          throw new ConflictException(`"${line.name}" পর্যাপ্ত স্টকে নেই`);
        }
      }
      return;
    }

    if (line.comboId) {
      const comboResult = await tx.combo.updateMany({
        where: {
          id: line.comboId,
          status: 'ACTIVE',
          stock: { gte: line.quantity },
        },
        data: { stock: { decrement: line.quantity } },
      });
      if (comboResult.count !== 1) {
        throw new ConflictException(`"${line.name}" পর্যাপ্ত স্টকে নেই`);
      }
    }

    for (const config of line.customConfig ?? []) {
      const required = config.quantity * line.quantity;
      const productResult = await tx.product.updateMany({
        where: {
          id: config.productId,
          status: 'ACTIVE',
          stock: { gte: required },
        },
        data: { stock: { decrement: required } },
      });
      if (productResult.count !== 1) {
        throw new ConflictException(`"${config.name}" পর্যাপ্ত স্টকে নেই`);
      }
    }
  }

  private async restoreStockForOrder(tx: Prisma.TransactionClient, order: any) {
    for (const item of order.items) {
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

      const config = this.parseOrderConfig(item.customConfig);
      for (const component of config) {
        await tx.product.updateMany({
          where: { id: component.productId },
          data: {
            stock: {
              increment: component.quantity * item.quantity,
            },
          },
        });
      }
    }
  }

  private parseOrderConfig(value: Prisma.JsonValue | null) {
    if (!Array.isArray(value))
      return [] as { productId: string; quantity: number }[];
    return value.flatMap((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
      const record = raw as Record<string, unknown>;
      const productId = this.cleanText(record.productId, 180);
      const quantity = Number(record.quantity);
      return productId && Number.isInteger(quantity) && quantity > 0
        ? [{ productId, quantity }]
        : [];
    });
  }

  async createOrder(identityInput: CommerceIdentity, input: CreateOrderInput) {
    const identity = this.validateIdentity(identityInput);
    const name = this.normalizeName(input.customer?.name).name;
    const phone = this.normalizePhone(input.customer?.phone);
    const alternativePhone = this.cleanText(
      input.customer?.alternativePhone,
      30,
    )
      ? this.normalizePhone(input.customer.alternativePhone)
      : undefined;
    const address = this.requiredText(
      input.customer?.address,
      'ডেলিভারি ঠিকানা',
      500,
    );
    const email = this.cleanText(input.customer?.email, 160)?.toLowerCase();
    const area = this.cleanText(input.customer?.area, 160);
    const city = this.cleanText(input.customer?.city, 120);
    const note = this.cleanText(input.customer?.note, 500);
    const deliveryType = Number(input.customer?.deliveryType) === 1 ? 1 : 0;

    if ([address, area, city].filter(Boolean).join(', ').length > 250) {
      throw new BadRequestException(
        'সম্পূর্ণ ডেলিভারি ঠিকানা ২৫০ অক্ষরের মধ্যে দিন',
      );
    }

    const identified = await this.captureContact(identity, {
      name,
      phone,
      email,
      marketingConsent: input.customer?.marketingConsent,
      source: 'order_checkout',
    });

    const nextIdentity: CommerceIdentity = {
      ...identity,
      customerToken: identified.customerToken,
    };

    // Price/availability is resolved from the database immediately before
    // the stock transaction. No client-supplied total is accepted.
    const quote = await this.quoteOrder(nextIdentity, {
      mode: input.mode,
      item: input.item,
    });

    const cartResult =
      input.mode === 'CART'
        ? await this.activeCart(nextIdentity, false)
        : { cart: null };

    const order = await this.prisma.$transaction(async (tx) => {
      await this.inventory.reserveQuote(tx, quote.items);

      const created = await tx.order.create({
        data: {
          orderNumber: this.orderNumber(),
          publicTrackingToken: this.publicTrackingToken(),
          publicTrackingExpiresAt: this.publicTrackingExpiry(),
          customerId: identified.customer.id,
          cartId: cartResult.cart?.id,
          status: OrderStatus.PENDING,
          customerName: name,
          phone,
          alternativePhone,
          email,
          address,
          area,
          city,
          note,
          deliveryType,
          subtotal: quote.subtotal,
          deliveryCharge: quote.deliveryCharge,
          total: quote.total,
          items: {
            create: quote.items.map((line) => ({
              itemType: line.itemType,
              productId: line.productId,
              variantId: line.variantId,
              comboId: line.comboId,
              nameSnapshot: line.name,
              skuSnapshot: line.sku,
              imageSnapshot: line.image,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              purchaseCostSnapshot: line.purchaseCost,
              packagingCostSnapshot: line.packagingCost,
              customConfig: line.customConfig
                ? (line.customConfig as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
            })),
          },
          history: {
            create: {
              status: OrderStatus.PENDING,
              note: 'অর্ডার গ্রহণ করা হয়েছে',
            },
          },
        },
        include: {
          items: true,
          history: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (cartResult.cart) {
        await tx.cart.update({
          where: { id: cartResult.cart.id },
          data: {
            status: CartStatus.CONVERTED,
            convertedAt: new Date(),
            lastActivityAt: new Date(),
          },
        });
      }

      return created;
    });

    await this.track(nextIdentity, {
      type: CustomerEventType.ORDER_CREATED,
      entityType: 'ORDER',
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        total: this.asNumber(order.total),
      },
    });

    void this.telegram.sendNewOrderNotification({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      address: order.address,
      area: order.area,
      city: order.city,
      note: order.note,
      total: this.asNumber(order.total),
      items: order.items.map((item) => ({
        name: item.nameSnapshot,
        quantity: item.quantity,
        lineTotal: this.asNumber(item.lineTotal),
      })),
    });

    return {
      customer: identified.customer,
      customerToken: identified.customerToken,
      order: this.serializeOrder(order),
    };
  }

  private serializeOrder(order: any, safe = true) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      customerName: order.customerName,
      phone: safe ? order.phone : order.phone,
      ...(safe
        ? {}
        : {
            alternativePhone: order.alternativePhone,
            email: order.email,
            address: order.address,
            area: order.area,
            city: order.city,
            note: order.note,
            steadfastConsignmentId: order.steadfastConsignmentId,
            steadfastError: order.steadfastError,
          }),
      deliveryType: order.deliveryType,
      steadfastTrackingCode: order.steadfastTrackingCode,
      steadfastStatus: order.steadfastStatus,
      steadfastSubmittedAt: order.steadfastSubmittedAt,
      steadfastLastSyncedAt: order.steadfastLastSyncedAt,
      publicTrackingToken: order.publicTrackingToken,
      publicTrackingExpiresAt: order.publicTrackingExpiresAt,
      subtotal: this.asNumber(order.subtotal),
      deliveryCharge: this.asNumber(order.deliveryCharge),
      total: this.asNumber(order.total),
      ...(!safe
        ? {
            revenue: this.asNumber(order.revenue),
            productCost: this.asNumber(order.productCost),
            packagingCost: this.asNumber(order.packagingCost),
            courierCost: this.asNumber(order.courierCost),
            gatewayFee: this.asNumber(order.gatewayFee),
            otherCost: this.asNumber(order.otherCost),
            totalCost: this.asNumber(order.totalCost),
            grossProfit: this.asNumber(order.grossProfit),
            netProfit: this.asNumber(order.netProfit),
            profitMargin: this.asNumber(order.profitMargin),
            financialRecognized: Boolean(order.financialRecognized),
            deliveredAt: order.deliveredAt,
            returnedAt: order.returnedAt,
          }
        : {}),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: (order.items ?? []).map((item: any) => ({
        id: item.id,
        itemType: item.itemType,
        productId: item.productId,
        variantId: item.variantId,
        comboId: item.comboId,
        name: item.nameSnapshot,
        sku: item.skuSnapshot,
        image: item.imageSnapshot,
        quantity: item.quantity,
        unitPrice: this.asNumber(item.unitPrice),
        lineTotal: this.asNumber(item.lineTotal),
        ...(!safe
          ? {
              purchaseCostSnapshot: this.asNumber(item.purchaseCostSnapshot),
              packagingCostSnapshot: this.asNumber(item.packagingCostSnapshot),
            }
          : {}),
        customConfig: item.customConfig,
      })),
      history: (order.history ?? []).map((history: any) => ({
        id: history.id,
        status: history.status,
        note: history.note,
        createdAt: history.createdAt,
      })),
    };
  }

  async createOrderShareLink(
    identityInput: CommerceIdentity,
    orderIdInput: string,
  ) {
    const identity = this.validateIdentity(identityInput);
    const customer = await this.customerFromRawToken(identity.customerToken);

    if (!customer) {
      throw new UnauthorizedException('Customer access পাওয়া যায়নি');
    }

    const orderId = this.requiredText(orderIdInput, 'orderId', 180);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId: customer.id },
      select: {
        id: true,
        publicTrackingToken: true,
        publicTrackingExpiresAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException('অর্ডার পাওয়া যায়নি');
    }

    const stillValid =
      order.publicTrackingToken &&
      order.publicTrackingExpiresAt &&
      order.publicTrackingExpiresAt.getTime() > Date.now();

    if (stillValid) {
      return {
        token: order.publicTrackingToken,
        expiresAt: order.publicTrackingExpiresAt,
      };
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        publicTrackingToken: this.publicTrackingToken(),
        publicTrackingExpiresAt: this.publicTrackingExpiry(),
      },
      select: {
        publicTrackingToken: true,
        publicTrackingExpiresAt: true,
      },
    });

    return {
      token: updated.publicTrackingToken,
      expiresAt: updated.publicTrackingExpiresAt,
    };
  }

  async publicOrderTracking(tokenInput: string) {
    const token = this.requiredText(tokenInput, 'tracking token', 120);
    const order = await this.prisma.order.findUnique({
      where: { publicTrackingToken: token },
      include: {
        items: true,
        history: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (
      !order ||
      !order.publicTrackingExpiresAt ||
      order.publicTrackingExpiresAt.getTime() <= Date.now()
    ) {
      throw new NotFoundException('Tracking linkটি পাওয়া যায়নি অথবা মেয়াদ শেষ');
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      expiresAt: order.publicTrackingExpiresAt,
      steadfastStatus: order.steadfastStatus,
      steadfastTrackingCode: order.steadfastTrackingCode,
      subtotal: this.asNumber(order.subtotal),
      deliveryCharge: this.asNumber(order.deliveryCharge),
      total: this.asNumber(order.total),
      items: order.items.map((item) => ({
        id: item.id,
        name: item.nameSnapshot,
        image: item.imageSnapshot,
        quantity: item.quantity,
        unitPrice: this.asNumber(item.unitPrice),
        lineTotal: this.asNumber(item.lineTotal),
      })),
      history: order.history.map((history) => ({
        id: history.id,
        status: history.status,
        note: history.note,
        createdAt: history.createdAt,
      })),
    };
  }

  async myAccount(identityInput: CommerceIdentity) {
    const identity = this.validateIdentity(identityInput);
    const customer = await this.customerFromRawToken(identity.customerToken);
    if (!customer) {
      throw new UnauthorizedException('Customer access পাওয়া যায়নি');
    }

    await this.mergeGuestAssets(identity.guestId, customer.id);

    const orders = await this.prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        history: { orderBy: { createdAt: 'asc' } },
      },
    });

    const events = await this.prisma.customerEvent.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        type: true,
        path: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    });

    const [cart, wishlist] = await Promise.all([
      this.getCart(identity),
      this.getWishlist(identity),
    ]);

    return {
      customer: this.safeCustomer(customer),
      stats: {
        orderCount: orders.length,
        deliveredCount: orders.filter(
          (order) => order.status === OrderStatus.DELIVERED,
        ).length,
        totalOrdered: this.money(
          orders
            .filter((order) => order.status !== OrderStatus.CANCELLED)
            .reduce((sum, order) => sum + this.asNumber(order.total), 0),
        ),
        cartItemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        wishlistCount: wishlist.items.length,
      },
      orders: orders.map((order) => this.serializeOrder(order, true)),
      cart,
      wishlist,
      activity: events,
    };
  }

  private allowedNextStatuses(current: OrderStatus) {
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
      [OrderStatus.RETURNED]: [],
      [OrderStatus.CANCELLED]: [],
    };
    return transitions[current];
  }

  async adminUpdateOrderStatus(orderId: string, input: AdminOrderStatusInput) {
    const id = this.requiredText(orderId, 'orderId', 180);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('অর্ডার পাওয়া যায়নি');

    if (
      order.status === OrderStatus.CONFIRMED &&
      input.status === OrderStatus.PROCESSING
    ) {
      const dispatched = await this.steadfast.dispatchOrder(order.id);
      return this.serializeOrder(dispatched, false);
    }

    if (!this.allowedNextStatuses(order.status).includes(input.status)) {
      throw new BadRequestException(
        `${order.status} থেকে ${input.status} status-এ যাওয়া যাবে না`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.status === OrderStatus.CANCELLED) {
        await this.inventory.releaseOrder(tx, order);
      }
      if (input.status === OrderStatus.DELIVERED) {
        await this.inventory.deliverOrder(tx, order);
      }
      if (input.status === OrderStatus.RETURNED) {
        await this.inventory.returnOrder(tx, order);
        await this.finance.reverseReturnedOrder(tx, order.id);
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: input.status,
          note: this.cleanText(input.note, 300),
        },
      });

      const saved = await tx.order.update({
        where: { id: order.id },
        data: {
          status: input.status,
          ...(input.status === OrderStatus.DELIVERED
            ? { deliveredAt: new Date() }
            : {}),
          ...(input.status === OrderStatus.RETURNED
            ? { returnedAt: new Date() }
            : {}),
        },
        include: {
          items: true,
          history: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (input.status === OrderStatus.DELIVERED) {
        await this.finance.recognizeDeliveredOrder(tx, order.id);
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { items: true, history: { orderBy: { createdAt: 'asc' } } },
        });
      }
      return saved;
    });

    if (input.status === OrderStatus.CONFIRMED) {
      const dispatched = await this.steadfast.dispatchOrder(order.id);
      return this.serializeOrder(dispatched, false);
    }

    return this.serializeOrder(updated, false);
  }

  async adminEditOrder(orderId: string, input: AdminOrderEditInput) {
    const id = this.requiredText(orderId, 'orderId', 180);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('অর্ডার পাওয়া যায়নি');
    if (
      (
        [
          OrderStatus.DELIVERED,
          OrderStatus.RETURNED,
          OrderStatus.CANCELLED,
        ] as OrderStatus[]
      ).includes(order.status)
    ) {
      throw new BadRequestException(
        'Delivered, returned বা cancelled order edit করা যাবে না',
      );
    }
    if (
      !Array.isArray(input.items) ||
      input.items.length !== order.items.length
    ) {
      throw new BadRequestException('Order-এর প্রতিটি item পাঠাতে হবে');
    }
    const edits = new Map(input.items.map((item) => [item.id, item]));
    for (const item of order.items) {
      const edit = edits.get(item.id);
      if (
        !edit ||
        !Number.isInteger(Number(edit.quantity)) ||
        Number(edit.quantity) < 1 ||
        Number(edit.quantity) > MAX_CART_QUANTITY
      ) {
        throw new BadRequestException('Item quantity সঠিক নয়');
      }
      if (
        !Number.isFinite(Number(edit.unitPrice)) ||
        Number(edit.unitPrice) < 0
      ) {
        throw new BadRequestException('Item price সঠিক নয়');
      }
    }

    const updated = await this.prisma.$transaction(
      async (tx) => {
        await this.inventory.releaseOrder(tx, order);
        for (const item of order.items) {
          const edit = edits.get(item.id)!;
          const quantity = Number(edit.quantity);
          const unitPrice = this.money(Number(edit.unitPrice));
          await tx.orderItem.update({
            where: { id: item.id },
            data: {
              quantity,
              unitPrice,
              lineTotal: this.money(quantity * unitPrice),
            },
          });
          if (edit.applyPriceToCatalog) {
            if (item.variantId)
              await tx.productVariant.update({
                where: { id: item.variantId },
                data: { price: unitPrice },
              });
            else if (item.productId)
              await tx.product.update({
                where: { id: item.productId },
                data: { price: unitPrice },
              });
            else if (item.comboId)
              await tx.combo.update({
                where: { id: item.comboId },
                data: { price: unitPrice },
              });
          }
        }
        const items = await tx.orderItem.findMany({
          where: { orderId: order.id },
        });
        const lines: QuoteLine[] = items.map((item) => ({
          clientKey: item.id,
          itemType: item.itemType,
          productId: item.productId ?? undefined,
          variantId: item.variantId ?? undefined,
          comboId: item.comboId ?? undefined,
          quantity: item.quantity,
          name: item.nameSnapshot,
          sku: item.skuSnapshot ?? undefined,
          image: item.imageSnapshot ?? undefined,
          unitPrice: this.asNumber(item.unitPrice),
          lineTotal: this.asNumber(item.lineTotal),
          purchaseCost: this.asNumber(item.purchaseCostSnapshot),
          packagingCost: this.asNumber(item.packagingCostSnapshot),
          customConfig: Array.isArray(item.customConfig)
            ? (item.customConfig as unknown as QuoteConfigItem[])
            : undefined,
        }));
        await this.inventory.reserveQuote(tx, lines);
        const subtotal = this.money(
          items.reduce((sum, item) => sum + this.asNumber(item.lineTotal), 0),
        );
        const deliveryCharge =
          input.deliveryCharge === undefined
            ? this.asNumber(order.deliveryCharge)
            : this.money(Math.max(0, Number(input.deliveryCharge)));
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: order.status,
            note:
              this.cleanText(input.note, 300) ??
              'Admin updated order items/price',
          },
        });
        return tx.order.update({
          where: { id: order.id },
          data: {
            subtotal,
            deliveryCharge,
            total: this.money(subtotal + deliveryCharge),
            ...(input.courierCost !== undefined
              ? { courierCost: Math.max(0, Number(input.courierCost)) }
              : {}),
            ...(input.gatewayFee !== undefined
              ? { gatewayFee: Math.max(0, Number(input.gatewayFee)) }
              : {}),
            ...(input.otherCost !== undefined
              ? { otherCost: Math.max(0, Number(input.otherCost)) }
              : {}),
          },
          include: { items: true, history: { orderBy: { createdAt: 'asc' } } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.serializeOrder(updated, false);
  }

  async adminOrders(
    status?: string,
    search?: string,
    pageInput?: string,
    limitInput?: string,
  ) {
    const orderStatus =
      status && Object.values(OrderStatus).includes(status as OrderStatus)
        ? (status as OrderStatus)
        : undefined;
    const searchTerm = String(search ?? '')
      .trim()
      .slice(0, 100);
    const parsedPage = Number.parseInt(String(pageInput ?? '1'), 10);
    const parsedLimit = Number.parseInt(String(limitInput ?? '25'), 10);
    const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(100, Math.max(10, parsedLimit))
      : 25;

    const searchWhere: Prisma.OrderWhereInput = searchTerm
      ? {
          OR: [
            { orderNumber: { contains: searchTerm, mode: 'insensitive' } },
            { customerName: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { address: { contains: searchTerm, mode: 'insensitive' } },
            { area: { contains: searchTerm, mode: 'insensitive' } },
            { city: { contains: searchTerm, mode: 'insensitive' } },
          ],
        }
      : {};
    const where: Prisma.OrderWhereInput = {
      ...searchWhere,
      ...(orderStatus ? { status: orderStatus } : {}),
    };

    const statuses = Object.values(OrderStatus);
    const [orders, total, statusCounts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: true,
          history: { orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.order.count({ where }),
      Promise.all(
        statuses.map((item) =>
          this.prisma.order.count({
            where: { ...searchWhere, status: item },
          }),
        ),
      ),
    ]);

    const counts = Object.fromEntries(
      statuses.map((item, index) => [item, statusCounts[index] ?? 0]),
    ) as Record<OrderStatus, number>;

    return {
      data: orders.map((order) => this.serializeOrder(order, false)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        counts: {
          ALL: Object.values(counts).reduce((sum, count) => sum + count, 0),
          ...counts,
        },
      },
    };
  }

  async adminCustomers() {
    await this.refreshCartLifecycle();

    const customers = await this.prisma.customerProfile.findMany({
      orderBy: { lastSeenAt: 'desc' },
      take: 300,
      include: {
        orders: {
          select: {
            id: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
        carts: {
          where: {
            status: { in: [CartStatus.ACTIVE, CartStatus.ABANDONED] },
          },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: { items: true },
        },
        leads: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            events: true,
            devices: true,
          },
        },
      },
    });

    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      marketingConsent: customer.marketingConsent,
      journeySlug: customer.journeySlug,
      interests: customer.interests,
      budgetMin: customer.budgetMin,
      budgetMax: customer.budgetMax,
      lastSeenAt: customer.lastSeenAt,
      createdAt: customer.createdAt,
      orderCount: customer.orders.length,
      totalOrdered: this.money(
        customer.orders
          .filter((order) => order.status !== OrderStatus.CANCELLED)
          .reduce((sum, order) => sum + this.asNumber(order.total), 0),
      ),
      activeCart: customer.carts[0]
        ? {
            id: customer.carts[0].id,
            status: customer.carts[0].status,
            value: this.asNumber(customer.carts[0].subtotalSnapshot),
            itemCount: customer.carts[0].items.reduce(
              (sum, item) => sum + item.quantity,
              0,
            ),
            lastActivityAt: customer.carts[0].lastActivityAt,
          }
        : null,
      recentLeads: customer.leads.map((lead) => ({
        id: lead.id,
        type: lead.type,
        productId: lead.productId,
        comboId: lead.comboId,
        data: lead.data,
        createdAt: lead.createdAt,
      })),
      eventCount: customer._count.events,
      deviceCount: customer._count.devices,
    }));
  }

  async adminCreateCartRecovery(cartId: string) {
    const id = this.requiredText(cartId, 'cartId', 180);
    const cart = await this.prisma.cart.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!cart || !cart.items.length) {
      throw new NotFoundException('Cart পাওয়া যায়নি');
    }
    if (
      cart.status === CartStatus.CONVERTED ||
      cart.status === CartStatus.EXPIRED
    ) {
      throw new BadRequestException('এই cart আর recover করা যাবে না');
    }

    const raw = this.issueRawToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    await this.prisma.cart.update({
      where: { id },
      data: {
        recoveryTokenHash: this.hash(raw),
        recoveryExpiresAt: expiresAt,
      },
    });

    const base = (
      process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
    return {
      recoveryUrl: `${base}/cart/recover/${raw}`,
      expiresAt,
    };
  }

  async adminAbandonedCarts() {
    await this.refreshCartLifecycle();
    const carts = await this.prisma.cart.findMany({
      where: { status: CartStatus.ABANDONED },
      orderBy: { lastActivityAt: 'desc' },
      take: 300,
      include: {
        customer: true,
        items: {
          include: {
            product: true,
            combo: true,
          },
        },
      },
    });

    return carts.map((cart) => ({
      id: cart.id,
      customer: cart.customer
        ? {
            id: cart.customer.id,
            name: cart.customer.name,
            phone: cart.customer.phone,
          }
        : null,
      contact: {
        name: cart.customerName,
        phone: cart.phone,
        email: cart.email,
      },
      subtotal: this.asNumber(cart.subtotalSnapshot),
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      items: cart.items.map((item) => ({
        id: item.id,
        itemType: item.itemType,
        name: item.product?.name ?? item.combo?.name ?? 'Unavailable item',
        quantity: item.quantity,
        unitPrice: this.asNumber(item.unitPriceSnapshot),
      })),
      lastActivityAt: cart.lastActivityAt,
      abandonedAt: cart.abandonedAt,
    }));
  }

  async adminActivity(customerId: string) {
    const id = this.requiredText(customerId, 'customerId', 180);
    const customer = await this.prisma.customerProfile.findUnique({
      where: { id },
    });
    if (!customer) throw new NotFoundException('Customer পাওয়া যায়নি');

    return this.prisma.customerEvent.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
