import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartItemType, Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AiAssistantService } from '../ai-assistant/ai-assistant.service';
import { CommerceService } from '../commerce/commerce.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AiHistoryMessage,
  MessengerCard,
  MessengerEvent,
  MessengerQuickReply,
  MessengerWebhookBody,
} from './facebook-messenger.types';

const CONVERSATION_TTL_DAYS = 30;
const MAX_HISTORY_MESSAGES = 6;
const MAX_MESSAGE_TEXT = 1900;

type Conversation = Awaited<
  ReturnType<FacebookMessengerService['getConversation']>
>;

@Injectable()
export class FacebookMessengerService {
  private readonly logger = new Logger(FacebookMessengerService.name);
  private lastCleanupAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ai: AiAssistantService,
    private readonly commerce: CommerceService,
  ) {}

  private requiredConfig(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(`${name} is not configured`);
    }
    return value;
  }

  verifyChallenge(mode?: string, token?: string) {
    const expected = this.config.get<string>('FACEBOOK_VERIFY_TOKEN')?.trim();
    return Boolean(expected && mode === 'subscribe' && token === expected);
  }

  assertValidSignature(rawBody?: Buffer, signature?: string) {
    if (!rawBody || !signature?.startsWith('sha256=')) {
      throw new ForbiddenException('Missing Facebook webhook signature');
    }

    const appSecret = this.requiredConfig('FACEBOOK_APP_SECRET');
    const expected = `sha256=${createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')}`;
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Invalid Facebook webhook signature');
    }
  }

  async handleWebhook(body: MessengerWebhookBody) {
    if (body.object !== 'page') return;

    await this.cleanupExpiredData();

    for (const entry of body.entry ?? []) {
      const pageId = entry.id?.trim();
      if (!pageId) continue;

      for (const event of entry.messaging ?? []) {
        try {
          await this.handleEvent(pageId, event);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`Messenger event failed: ${message}`);
        }
      }
    }
  }

  private async cleanupExpiredData() {
    const now = Date.now();
    if (now - this.lastCleanupAt < 60 * 60 * 1000) return;
    this.lastCleanupAt = now;

    const eventRetention = new Date(now - 90 * 24 * 60 * 60 * 1000);
    await Promise.all([
      this.prisma.facebookConversation.deleteMany({
        where: { expiresAt: { lt: new Date(now) } },
      }),
      this.prisma.facebookWebhookEvent.deleteMany({
        where: { createdAt: { lt: eventRetention } },
      }),
    ]);
  }

  private async handleEvent(pageId: string, event: MessengerEvent) {
    const psid = event.sender?.id?.trim();
    if (!psid || event.message?.is_echo) return;

    const eventId = event.message?.mid ?? event.postback?.mid;
    if (!eventId || !(await this.claimEvent(eventId, pageId, psid))) return;

    try {
      const payload =
        event.message?.quick_reply?.payload ?? event.postback?.payload;
      const text = event.message?.text?.trim() ?? event.postback?.title?.trim();

      if (payload) await this.handlePayload(pageId, psid, payload);
      else if (text) await this.handleText(pageId, psid, text);

      await this.prisma.facebookWebhookEvent.update({
        where: { eventId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.facebookWebhookEvent.update({
        where: { eventId },
        data: {
          status: 'FAILED',
          error: message.slice(0, 1000),
          processedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async claimEvent(eventId: string, pageId: string, psid: string) {
    try {
      await this.prisma.facebookWebhookEvent.create({
        data: { eventId, pageId, psid },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  private expiry() {
    return new Date(Date.now() + CONVERSATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  private getConversation(pageId: string, psid: string) {
    return this.prisma.facebookConversation.upsert({
      where: { pageId_psid: { pageId, psid } },
      update: { expiresAt: this.expiry() },
      create: { pageId, psid, expiresAt: this.expiry() },
    });
  }

  private identity(conversation: { id: string; pageId: string; psid: string }) {
    return {
      guestId: `facebook:${conversation.pageId}:${conversation.psid}`,
      sessionId: conversation.id,
    };
  }

  private normalizeDigits(value: string) {
    const bangla = '০১২৩৪৫৬৭৮৯';
    return value.replace(/[০-৯]/g, (digit) => String(bangla.indexOf(digit)));
  }

  private isCancel(text: string) {
    return /^(cancel|stop|reset|বাতিল|বন্ধ|শুরু)$/i.test(text.trim());
  }

  private isOrderIntent(text: string) {
    return /(order|অর্ডার|কিনতে চাই|নিতে চাই|কিনবো|কিনব)/i.test(text);
  }

  private async handlePayload(pageId: string, psid: string, payload: string) {
    const conversation = await this.getConversation(pageId, psid);

    if (payload === 'CANCEL_ORDER') {
      await this.resetConversation(conversation.id);
      await this.sendText(
        psid,
        'অর্ডারটি বাতিল করা হয়েছে। অন্য পণ্য সম্পর্কে জানতে লিখুন।',
      );
      return;
    }

    if (payload === 'CONFIRM_ORDER') {
      await this.confirmOrder(conversation);
      return;
    }

    if (payload.startsWith('ORDER_PRODUCT:')) {
      await this.selectProduct(
        conversation,
        payload.slice('ORDER_PRODUCT:'.length),
      );
      return;
    }

    if (payload.startsWith('ORDER_VARIANT:')) {
      await this.selectVariant(
        conversation,
        payload.slice('ORDER_VARIANT:'.length),
      );
      return;
    }

    if (payload.startsWith('ORDER_QTY:')) {
      await this.selectQuantity(
        conversation,
        payload.slice('ORDER_QTY:'.length),
      );
      return;
    }

    await this.handleText(pageId, psid, payload);
  }

  private async handleText(pageId: string, psid: string, text: string) {
    let conversation = await this.getConversation(pageId, psid);

    if (this.isCancel(text)) {
      await this.resetConversation(conversation.id);
      await this.sendText(
        psid,
        'চলমান অর্ডার বাতিল করা হয়েছে। নতুন করে প্রশ্ন করতে পারেন।',
      );
      return;
    }

    if (conversation.stage === 'AWAITING_VARIANT') {
      const matched = await this.matchVariant(conversation, text);
      if (matched) {
        await this.selectVariant(conversation, matched.id);
      } else {
        await this.promptVariants(conversation);
      }
      return;
    }

    if (conversation.stage === 'AWAITING_QUANTITY') {
      await this.selectQuantity(conversation, text);
      return;
    }

    if (conversation.stage === 'AWAITING_CUSTOMER') {
      await this.collectCustomer(conversation, text);
      return;
    }

    if (conversation.stage === 'AWAITING_CONFIRMATION') {
      if (/^(হ্যাঁ|হ্যা|yes|confirm|নিশ্চিত)$/i.test(text)) {
        await this.confirmOrder(conversation);
      } else {
        await this.sendConfirmation(conversation);
      }
      return;
    }

    if (conversation.stage === 'ORDERED') {
      await this.resetConversation(conversation.id);
      conversation = await this.getConversation(pageId, psid);
    }

    if (this.isOrderIntent(text)) {
      const products = await this.searchProducts(text);
      if (products.length === 1) {
        await this.selectProduct(conversation, products[0].id);
      } else if (products.length > 1) {
        await this.prisma.facebookConversation.update({
          where: { id: conversation.id },
          data: { stage: 'AWAITING_PRODUCT' },
        });
        await this.sendProductCards(psid, products);
      } else {
        await this.sendText(
          psid,
          'কোন পণ্যটি অর্ডার করতে চান—পণ্যের নামটি লিখুন।',
        );
      }
      return;
    }

    if (conversation.stage === 'AWAITING_PRODUCT') {
      const products = await this.searchProducts(text);
      if (products.length === 1) {
        await this.selectProduct(conversation, products[0].id);
      } else if (products.length > 1) {
        await this.sendProductCards(psid, products);
      } else {
        await this.sendText(
          psid,
          'নামটির সঙ্গে মিলে active পণ্য পাইনি। আরেকটু নির্দিষ্ট করে লিখুন।',
        );
      }
      return;
    }

    await this.answerWithAi(conversation, text);
  }

  private parseHistory(value: Prisma.JsonValue | null): AiHistoryMessage[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      return (role === 'user' || role === 'assistant') &&
        typeof content === 'string'
        ? [{ role, content: content.slice(0, 1200) }]
        : [];
    });
  }

  private async answerWithAi(conversation: Conversation, text: string) {
    const history = this.parseHistory(conversation.aiHistory).slice(
      -MAX_HISTORY_MESSAGES,
    );
    const result = await this.ai.chat(
      {
        message: text,
        history,
        pagePath: '/facebook-messenger',
        conversationId: `fb_${conversation.id}`,
      },
      this.identity(conversation).guestId,
      '',
    );

    const answer = this.messengerText(result.answer);
    await this.sendText(conversation.psid, answer);

    const nextHistory: AiHistoryMessage[] = [
      ...history,
      { role: 'user' as const, content: text },
      { role: 'assistant' as const, content: answer },
    ].slice(-MAX_HISTORY_MESSAGES);
    await this.prisma.facebookConversation.update({
      where: { id: conversation.id },
      data: { aiHistory: nextHistory },
    });

    const productPaths = result.recommendations
      .filter((item) => item.type === 'PRODUCT')
      .map((item) => item.href)
      .slice(0, 5);
    if (productPaths.length) {
      const slugs = productPaths
        .map((path) => path.split('/').filter(Boolean).at(-1))
        .filter((slug): slug is string => Boolean(slug));
      const products = await this.prisma.product.findMany({
        where: { slug: { in: slugs }, status: 'ACTIVE' },
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      });
      const bySlug = new Map(
        products.map((product) => [product.slug, product]),
      );
      const ordered = slugs.flatMap((slug) => {
        const product = bySlug.get(slug);
        return product ? [product] : [];
      });
      if (ordered.length)
        await this.sendProductCards(conversation.psid, ordered);
    }
  }

  private messengerText(value: string) {
    const frontend =
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ?? '';
    return value
      .replace(
        /\[([^\]]+)]\(([^)]+)\)/g,
        (_match, label: string, href: string) => {
          const url = href.startsWith('/') ? `${frontend}${href}` : href;
          return `${label}: ${url}`;
        },
      )
      .replace(/[*_`#]/g, '')
      .trim();
  }

  private searchTerms(text: string) {
    const stop = new Set([
      'order',
      'অর্ডার',
      'করতে',
      'দিতে',
      'চাই',
      'একটা',
      'একটি',
      'আমি',
      'কিনতে',
      'নিতে',
      'please',
      'product',
      'পণ্য',
      'টা',
      'টি',
    ]);
    return text
      .normalize('NFKC')
      .split(/[^\p{L}\p{N}]+/u)
      .map((term) => term.trim())
      .filter((term) => term.length > 1 && !stop.has(term.toLowerCase()))
      .slice(0, 6);
  }

  private async searchProducts(text: string) {
    const terms = this.searchTerms(text);
    if (!terms.length) return [];

    return this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        OR: terms.flatMap((term) => [
          { name: { contains: term, mode: 'insensitive' as const } },
          { description: { contains: term, mode: 'insensitive' as const } },
          { sku: { contains: term, mode: 'insensitive' as const } },
        ]),
      },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
      take: 5,
    });
  }

  private productUrl(slug: string) {
    const frontend = this.requiredConfig('FRONTEND_URL').replace(/\/$/, '');
    return `${frontend}/products/${encodeURIComponent(slug)}`;
  }

  private async sendProductCards(
    psid: string,
    products: Array<{
      id: string;
      slug: string;
      name: string;
      description: string;
      price: Prisma.Decimal;
      stock: number;
      reservedStock: number;
      images: Array<{ url: string }>;
    }>,
  ) {
    const cards: MessengerCard[] = products.map((product) => ({
      title: product.name.slice(0, 80),
      subtitle: `৳${Number(product.price).toLocaleString('bn-BD')} · ${
        product.stock - product.reservedStock > 0 ? 'স্টকে আছে' : 'স্টক শেষ'
      }`,
      imageUrl: product.images[0]?.url,
      buttons: [
        {
          type: 'web_url',
          title: 'বিস্তারিত দেখুন',
          url: this.productUrl(product.slug),
          webview_height_ratio: 'full',
        },
        {
          type: 'postback',
          title: 'অর্ডার করুন',
          payload: `ORDER_PRODUCT:${product.id}`,
        },
      ],
    }));
    await this.sendCards(psid, cards);
  }

  private async selectProduct(conversation: Conversation, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'ACTIVE' },
      include: {
        variants: {
          where: { isActive: true },
          include: {
            values: { include: { value: { include: { attribute: true } } } },
          },
        },
      },
    });
    if (!product) {
      await this.sendText(
        conversation.psid,
        'পণ্যটি এখন active নেই। অন্য একটি পণ্য বেছে নিন।',
      );
      return;
    }

    const availableVariants = product.variants.filter(
      (variant) => variant.stock - variant.reservedStock > 0,
    );
    if (product.variants.length && !availableVariants.length) {
      await this.sendText(
        conversation.psid,
        'এই পণ্যটির সব variant এখন stock out।',
      );
      return;
    }
    if (
      !product.variants.length &&
      product.stock - product.reservedStock <= 0
    ) {
      await this.sendText(conversation.psid, 'পণ্যটি এখন stock out।');
      return;
    }

    await this.prisma.facebookConversation.update({
      where: { id: conversation.id },
      data: {
        productId: product.id,
        variantId: null,
        quantity: null,
        customerName: null,
        phone: null,
        address: null,
        orderId: null,
        stage: availableVariants.length
          ? 'AWAITING_VARIANT'
          : 'AWAITING_QUANTITY',
      },
    });

    const updated = await this.getConversation(
      conversation.pageId,
      conversation.psid,
    );
    if (availableVariants.length) await this.promptVariants(updated);
    else await this.promptQuantity(updated, product.name);
  }

  private variantLabel(variant: {
    sku: string;
    values: Array<{ value: { value: string; attribute: { name: string } } }>;
  }) {
    const selections = variant.values.map(
      (entry) => `${entry.value.attribute.name}: ${entry.value.value}`,
    );
    return (selections.join(', ') || variant.sku).slice(0, 20);
  }

  private async promptVariants(conversation: Conversation) {
    if (!conversation.productId) return;
    const product = await this.prisma.product.findUnique({
      where: { id: conversation.productId },
      include: {
        variants: {
          where: { isActive: true },
          include: {
            values: { include: { value: { include: { attribute: true } } } },
          },
        },
      },
    });
    if (!product) return;

    const variants = product.variants.filter(
      (variant) => variant.stock - variant.reservedStock > 0,
    );
    const replies: MessengerQuickReply[] = variants
      .slice(0, 13)
      .map((variant) => ({
        title: this.variantLabel(variant),
        payload: `ORDER_VARIANT:${variant.id}`,
      }));
    await this.sendText(
      conversation.psid,
      `${product.name}–এর কোন variant চান?`,
      replies,
    );
  }

  private async matchVariant(conversation: Conversation, text: string) {
    if (!conversation.productId) return null;
    const normalized = text.normalize('NFKC').toLocaleLowerCase('bn-BD');
    const variants = await this.prisma.productVariant.findMany({
      where: { productId: conversation.productId, isActive: true },
      include: {
        values: { include: { value: { include: { attribute: true } } } },
      },
    });
    return (
      variants.find((variant) =>
        [variant.sku, ...variant.values.map((entry) => entry.value.value)]
          .join(' ')
          .normalize('NFKC')
          .toLocaleLowerCase('bn-BD')
          .includes(normalized),
      ) ?? null
    );
  }

  private async selectVariant(conversation: Conversation, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId: conversation.productId ?? undefined,
        isActive: true,
      },
      include: { product: true },
    });
    if (!variant || variant.stock - variant.reservedStock <= 0) {
      await this.sendText(
        conversation.psid,
        'Variantটি এখন পাওয়া যাচ্ছে না। অন্যটি বেছে নিন।',
      );
      await this.promptVariants(conversation);
      return;
    }

    await this.prisma.facebookConversation.update({
      where: { id: conversation.id },
      data: { variantId: variant.id, stage: 'AWAITING_QUANTITY' },
    });
    await this.promptQuantity(conversation, variant.product.name);
  }

  private async promptQuantity(
    conversation: Conversation,
    productName: string,
  ) {
    await this.sendText(conversation.psid, `${productName} কতটি চান?`, [
      { title: '১টি', payload: 'ORDER_QTY:1' },
      { title: '২টি', payload: 'ORDER_QTY:2' },
      { title: '৩টি', payload: 'ORDER_QTY:3' },
    ]);
  }

  private async selectQuantity(conversation: Conversation, raw: string) {
    const quantity = Number(this.normalizeDigits(raw).match(/\d+/)?.[0]);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      await this.sendText(
        conversation.psid,
        '১ থেকে ২০-এর মধ্যে quantity লিখুন।',
      );
      return;
    }

    const available = conversation.variantId
      ? await this.prisma.productVariant.findUnique({
          where: { id: conversation.variantId },
        })
      : conversation.productId
        ? await this.prisma.product.findUnique({
            where: { id: conversation.productId },
          })
        : null;
    if (!available || available.stock - available.reservedStock < quantity) {
      await this.sendText(
        conversation.psid,
        'চাওয়া quantity এখন stock-এ নেই। কম quantity দিন।',
      );
      return;
    }

    await this.prisma.facebookConversation.update({
      where: { id: conversation.id },
      data: { quantity, stage: 'AWAITING_CUSTOMER' },
    });
    await this.sendText(
      conversation.psid,
      'এক মেসেজে নিচের ৩টি তথ্য দিন:\nনাম: আপনার নাম\nফোন: 01XXXXXXXXX\nঠিকানা: সম্পূর্ণ ডেলিভারি ঠিকানা',
    );
  }

  private extractPhone(text: string) {
    const normalized = this.normalizeDigits(text);
    const match = normalized.match(/(?:\+?88)?01[3-9]\d{8}/);
    if (!match) return undefined;
    const phone = match[0].replace(/^\+?88/, '');
    return /^01[3-9]\d{8}$/.test(phone) ? phone : undefined;
  }

  private labelledValue(text: string, labels: string[]) {
    const label = labels.join('|');
    const other = 'নাম|name|ফোন|phone|mobile|মোবাইল|ঠিকানা|address';
    const match = text.match(
      new RegExp(
        `(?:^|\\n)(?:${label})\\s*[:：-]\\s*(.+?)(?=\\n(?:${other})\\s*[:：-]|$)`,
        'is',
      ),
    );
    return match?.[1]?.trim();
  }

  private customerParts(text: string, conversation: Conversation) {
    const phone = this.extractPhone(text);
    let name = this.labelledValue(text, ['নাম', 'name']);
    let address = this.labelledValue(text, ['ঠিকানা', 'address']);
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!name && phone && lines.length >= 2) {
      name = lines.find(
        (line) => !line.includes(phone) && !/(ঠিকানা|address)\s*:/i.test(line),
      );
    }
    if (!address && phone && lines.length >= 3) {
      const phoneIndex = lines.findIndex((line) => this.extractPhone(line));
      if (phoneIndex >= 0) address = lines.slice(phoneIndex + 1).join(', ');
    }

    if (
      !conversation.customerName &&
      !phone &&
      !address &&
      lines.length === 1
    ) {
      name = lines[0];
    } else if (conversation.customerName && !conversation.phone && phone) {
      name = undefined;
    } else if (
      conversation.customerName &&
      conversation.phone &&
      !conversation.address &&
      !phone &&
      !name
    ) {
      address = text.trim();
    }

    return {
      name: name
        ?.replace(/^(নাম|name)\s*[:：-]\s*/i, '')
        .trim()
        .slice(0, 120),
      phone,
      address: address
        ?.replace(/^(ঠিকানা|address)\s*[:：-]\s*/i, '')
        .trim()
        .slice(0, 500),
    };
  }

  private async collectCustomer(conversation: Conversation, text: string) {
    const parts = this.customerParts(text, conversation);
    const customerName = parts.name || conversation.customerName;
    const phone = parts.phone || conversation.phone;
    const address = parts.address || conversation.address;

    await this.prisma.facebookConversation.update({
      where: { id: conversation.id },
      data: {
        customerName,
        phone,
        address,
      },
    });

    if (!customerName || customerName.length < 2) {
      await this.sendText(conversation.psid, 'আপনার নাম লিখুন।');
      return;
    }
    if (!phone) {
      await this.sendText(
        conversation.psid,
        'সঠিক বাংলাদেশি মোবাইল নম্বর দিন—01XXXXXXXXX।',
      );
      return;
    }
    if (!address || address.length < 8) {
      await this.sendText(conversation.psid, 'সম্পূর্ণ ডেলিভারি ঠিকানা লিখুন।');
      return;
    }

    const updated = await this.prisma.facebookConversation.update({
      where: { id: conversation.id },
      data: { stage: 'AWAITING_CONFIRMATION' },
    });
    await this.sendConfirmation(updated);
  }

  private orderInput(conversation: Conversation) {
    if (
      !conversation.productId ||
      !conversation.quantity ||
      !conversation.customerName ||
      !conversation.phone ||
      !conversation.address
    ) {
      throw new BadRequestException('Messenger order তথ্য অসম্পূর্ণ');
    }
    return {
      mode: 'BUY_NOW' as const,
      item: {
        itemType: CartItemType.PRODUCT,
        productId: conversation.productId,
        variantId: conversation.variantId ?? undefined,
        quantity: conversation.quantity,
      },
      customer: {
        name: conversation.customerName,
        phone: conversation.phone,
        address: conversation.address,
        note: 'Facebook Messenger থেকে অর্ডার',
        deliveryType: 0 as const,
        marketingConsent: false,
      },
    };
  }

  private async sendConfirmation(conversation: Conversation) {
    try {
      const input = this.orderInput(conversation);
      const quote = await this.commerce.quoteOrder(
        this.identity(conversation),
        input,
      );
      const item = quote.items[0];
      await this.sendText(
        conversation.psid,
        [
          'অর্ডারটি যাচাই করুন:',
          `${item.name} × ${item.quantity}`,
          `পণ্য: ৳${quote.subtotal.toLocaleString('bn-BD')}`,
          `ডেলিভারি: ৳${quote.deliveryCharge.toLocaleString('bn-BD')}`,
          `মোট: ৳${quote.total.toLocaleString('bn-BD')}`,
          `নাম: ${conversation.customerName}`,
          `ফোন: ${conversation.phone}`,
          `ঠিকানা: ${conversation.address}`,
        ].join('\n'),
        [
          { title: 'অর্ডার নিশ্চিত করুন', payload: 'CONFIRM_ORDER' },
          { title: 'বাতিল', payload: 'CANCEL_ORDER' },
        ],
      );
    } catch (error) {
      await this.resetConversation(conversation.id);
      const message =
        error instanceof Error
          ? error.message
          : 'পণ্যটি এখন অর্ডার করা যাচ্ছে না';
      await this.sendText(
        conversation.psid,
        `${message}\nঅন্য পণ্য বেছে নিতে নাম লিখুন।`,
      );
    }
  }

  private async confirmOrder(conversation: Conversation) {
    if (conversation.stage !== 'AWAITING_CONFIRMATION') {
      await this.sendText(
        conversation.psid,
        'আগে পণ্য ও ডেলিভারি তথ্য সম্পূর্ণ করুন।',
      );
      return;
    }

    // Two webhook deliveries can run in separate serverless instances. This
    // conditional write gives exactly one of them permission to create the
    // order, even when a customer double-taps Confirm.
    const claim = await this.prisma.facebookConversation.updateMany({
      where: { id: conversation.id, stage: 'AWAITING_CONFIRMATION' },
      data: { stage: 'ORDER_PROCESSING' },
    });
    if (claim.count !== 1) {
      await this.sendText(
        conversation.psid,
        'অর্ডারটি ইতিমধ্যে process হচ্ছে। কয়েক সেকেন্ড অপেক্ষা করুন।',
      );
      return;
    }

    try {
      const result = (await this.commerce.createOrder(
        this.identity(conversation),
        this.orderInput(conversation),
      )) as {
        order: {
          id: string;
          orderNumber: string;
          total: number;
          publicTrackingToken: string;
        };
      };
      const trackingUrl = `${this.requiredConfig('FRONTEND_URL').replace(/\/$/, '')}/track-order/${encodeURIComponent(
        result.order.publicTrackingToken,
      )}`;
      await this.prisma.facebookConversation.update({
        where: { id: conversation.id },
        data: {
          stage: 'ORDERED',
          orderId: result.order.id,
          customerName: null,
          phone: null,
          address: null,
        },
      });
      await this.sendText(
        conversation.psid,
        `অর্ডার নিশ্চিত হয়েছে ✅\nOrder ID: ${result.order.orderNumber}\nমোট: ৳${result.order.total.toLocaleString('bn-BD')}\nTrack: ${trackingUrl}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'অর্ডার তৈরি করা যায়নি';
      // Validation/stock conflicts happen before an order is committed and
      // are safe to retry. Unknown failures stay locked for manual review so
      // a post-commit notification failure cannot create a duplicate order.
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        await this.prisma.facebookConversation.update({
          where: { id: conversation.id },
          data: { stage: 'AWAITING_CONFIRMATION' },
        });
      }
      await this.sendText(
        conversation.psid,
        `${message}\nঅর্ডার নম্বর না পেলে আবার Confirm চাপবেন না; Maaniko support-এর সঙ্গে যোগাযোগ করুন।`,
      );
    }
  }

  private async resetConversation(id: string) {
    await this.prisma.facebookConversation.update({
      where: { id },
      data: {
        stage: 'BROWSING',
        productId: null,
        variantId: null,
        quantity: null,
        customerName: null,
        phone: null,
        address: null,
        orderId: null,
        aiHistory: Prisma.JsonNull,
      },
    });
  }

  private async graphRequest(psid: string, message: Record<string, unknown>) {
    const accessToken = this.requiredConfig('FACEBOOK_PAGE_ACCESS_TOKEN');
    const version =
      this.config.get<string>('FACEBOOK_GRAPH_VERSION')?.trim() || 'v24.0';
    const response = await fetch(
      `https://graph.facebook.com/${version}/me/messages?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: psid },
          messaging_type: 'RESPONSE',
          message,
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Facebook Send API ${response.status}: ${body.slice(0, 500)}`,
      );
    }
  }

  private splitMessage(text: string) {
    const chunks: string[] = [];
    let remaining = text.trim();
    while (remaining.length > MAX_MESSAGE_TEXT) {
      let end = remaining.lastIndexOf('\n', MAX_MESSAGE_TEXT);
      if (end < MAX_MESSAGE_TEXT / 2)
        end = remaining.lastIndexOf(' ', MAX_MESSAGE_TEXT);
      if (end < MAX_MESSAGE_TEXT / 2) end = MAX_MESSAGE_TEXT;
      chunks.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  private async sendText(
    psid: string,
    text: string,
    quickReplies: MessengerQuickReply[] = [],
  ) {
    const chunks = this.splitMessage(text);
    for (let index = 0; index < chunks.length; index += 1) {
      const isLast = index === chunks.length - 1;
      await this.graphRequest(psid, {
        text: chunks[index],
        ...(isLast && quickReplies.length
          ? {
              quick_replies: quickReplies.slice(0, 13).map((reply) => ({
                content_type: 'text',
                title: reply.title.slice(0, 20),
                payload: reply.payload.slice(0, 1000),
              })),
            }
          : {}),
      });
    }
  }

  private async sendCards(psid: string, cards: MessengerCard[]) {
    await this.graphRequest(psid, {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: cards.slice(0, 10).map((card) => ({
            title: card.title.slice(0, 80),
            ...(card.subtitle ? { subtitle: card.subtitle.slice(0, 80) } : {}),
            ...(card.imageUrl ? { image_url: card.imageUrl } : {}),
            buttons: card.buttons.slice(0, 3).map((button) =>
              button.type === 'web_url'
                ? {
                    type: button.type,
                    title: button.title.slice(0, 20),
                    url: button.url,
                    webview_height_ratio: button.webview_height_ratio ?? 'full',
                  }
                : {
                    type: button.type,
                    title: button.title.slice(0, 20),
                    payload: button.payload.slice(0, 1000),
                  },
            ),
          })),
        },
      },
    });
  }
}
