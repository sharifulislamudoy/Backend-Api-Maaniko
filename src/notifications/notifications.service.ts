import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  Prisma,
  PushCampaignStatus,
  PushNotificationType,
} from '@prisma/client';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePushCampaignInput,
  OrderStatusPushInput,
  PushIdentity,
  RegisterPushDeviceInput,
  SendOfferInput,
} from './notifications.types';

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

const CUSTOMER_ORDER_PUSH_STATUSES = new Set<OrderStatus>([
  OrderStatus.CONFIRMED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

const STATUS_COPY: Record<OrderStatus, { title: string; body: string }> = {
  PENDING: {
    title: 'অর্ডারটি গ্রহণ করা হয়েছে',
    body: 'আপনার অর্ডারটি যাচাইয়ের অপেক্ষায় আছে।',
  },
  CONFIRMED: {
    title: 'অর্ডার নিশ্চিত হয়েছে',
    body: 'আপনার অর্ডারটি নিশ্চিত করা হয়েছে।',
  },
  PROCESSING: {
    title: 'অর্ডার প্রস্তুত হচ্ছে',
    body: 'আপনার অর্ডারটি ডেলিভারির জন্য প্রস্তুত করা হচ্ছে।',
  },
  SHIPPED: {
    title: 'অর্ডারটি পথে আছে',
    body: 'আপনার অর্ডারটি কুরিয়ারের কাছে হস্তান্তর করা হয়েছে।',
  },
  DELIVERED: {
    title: 'অর্ডার ডেলিভারি সম্পন্ন',
    body: 'Maaniko-এর সঙ্গে থাকার জন্য ধন্যবাদ।',
  },
  RETURNED: {
    title: 'অর্ডারটি রিটার্ন হয়েছে',
    body: 'আপনার অর্ডারের রিটার্ন আপডেট সম্পন্ন হয়েছে।',
  },
  CANCELLED: {
    title: 'অর্ডারটি বাতিল হয়েছে',
    body: 'আপনার অর্ডারটি বাতিল করা হয়েছে। প্রয়োজনে আমাদের সঙ্গে যোগাযোগ করুন।',
  },
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private clean(value: unknown, max: number) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).trim().replace(/\s+/g, ' ').slice(0, max);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private firebaseApp() {
    if (getApps().length) return getApps()[0];

    const encoded = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_BASE64');
    let serviceAccount: {
      projectId?: string;
      clientEmail?: string;
      privateKey?: string;
    } | null = null;

    if (encoded) {
      try {
        const parsed = JSON.parse(
          Buffer.from(encoded, 'base64').toString('utf8'),
        ) as Record<string, string>;
        serviceAccount = {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        };
      } catch {
        throw new ServiceUnavailableException(
          'FIREBASE_SERVICE_ACCOUNT_BASE64 সঠিক নয়',
        );
      }
    } else {
      serviceAccount = {
        projectId: this.config.get<string>('FIREBASE_PROJECT_ID'),
        clientEmail: this.config.get<string>('FIREBASE_CLIENT_EMAIL'),
        privateKey: this.config
          .get<string>('FIREBASE_PRIVATE_KEY')
          ?.replace(/\\n/g, '\n'),
      };
    }

    if (
      !serviceAccount.projectId ||
      !serviceAccount.clientEmail ||
      !serviceAccount.privateKey
    ) {
      throw new ServiceUnavailableException(
        'Firebase Admin credentials configure করা হয়নি',
      );
    }

    return initializeApp({ credential: cert(serviceAccount) });
  }

  private async customerId(identity: PushIdentity) {
    const customerToken = this.clean(identity.customerToken, 500);
    if (customerToken) {
      const access = await this.prisma.customerAccessToken.findUnique({
        where: { tokenHash: this.hash(customerToken) },
        select: { customerId: true },
      });
      if (access) return access.customerId;
    }

    const device = await this.prisma.deviceIdentity.findUnique({
      where: { guestId: identity.guestId },
      select: { customerId: true },
    });
    return device?.customerId ?? null;
  }

  async registerDevice(identity: PushIdentity, input: RegisterPushDeviceInput) {
    const guestId = this.clean(identity.guestId, 180);
    const token = this.clean(input.token, 4096);
    if (guestId.length < 8) {
      throw new BadRequestException('Guest identity পাওয়া যায়নি');
    }
    if (token.length < 40) {
      throw new BadRequestException('Firebase token সঠিক নয়');
    }

    const customerId = await this.customerId({ ...identity, guestId });
    const device = await this.prisma.pushDevice.upsert({
      where: { token },
      update: {
        guestId,
        customerId,
        platform: this.clean(input.platform, 80) || null,
        userAgent: this.clean(input.userAgent, 1000) || null,
        allowOffers: input.allowOffers !== false,
        enabled: true,
        lastSeenAt: new Date(),
      },
      create: {
        token,
        guestId,
        customerId,
        platform: this.clean(input.platform, 80) || null,
        userAgent: this.clean(input.userAgent, 1000) || null,
        allowOffers: input.allowOffers !== false,
      },
      select: {
        id: true,
        allowOffers: true,
        enabled: true,
        customerId: true,
      },
    });

    return { subscribed: true, device };
  }

  async unregisterDevice(identity: PushIdentity, tokenInput: unknown) {
    const guestId = this.clean(identity.guestId, 180);
    const token = this.clean(tokenInput, 4096);
    if (!token) return { subscribed: false };

    await this.prisma.pushDevice.updateMany({
      where: { token, guestId },
      data: { enabled: false, lastSeenAt: new Date() },
    });
    return { subscribed: false };
  }

  async inbox(identity: PushIdentity) {
    const guestId = this.clean(identity.guestId, 180);
    const customerId = guestId
      ? await this.customerId({ ...identity, guestId })
      : null;

    const notifications = await this.prisma.pushInboxItem.findMany({
      where: {
        OR: [
          { isGlobal: true },
          ...(guestId ? [{ guestId }] : []),
          ...(customerId ? [{ customerId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        imageUrl: true,
        link: true,
        createdAt: true,
      },
    });

    return { notifications };
  }

  private async send(
    tokens: string[],
    message: Omit<MulticastMessage, 'tokens'>,
  ) {
    const uniqueTokens = [...new Set(tokens)];
    let sentCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    for (let start = 0; start < uniqueTokens.length; start += 500) {
      const batch = uniqueTokens.slice(start, start + 500);
      const response = await getMessaging(
        this.firebaseApp(),
      ).sendEachForMulticast({
        ...message,
        tokens: batch,
      });
      sentCount += response.successCount;
      failureCount += response.failureCount;
      response.responses.forEach((item, index) => {
        if (!item.success && INVALID_TOKEN_CODES.has(item.error?.code ?? '')) {
          invalidTokens.push(batch[index]);
        }
      });
    }

    if (invalidTokens.length) {
      await this.prisma.pushDevice.updateMany({
        where: { token: { in: invalidTokens } },
        data: { enabled: false },
      });
    }

    return { recipientCount: uniqueTokens.length, sentCount, failureCount };
  }

  async sendCustomerMessage(input: {
    customerId: string;
    title: string;
    body: string;
    link: string;
    tag: string;
    imageUrl?: string;
  }) {
    const title = this.clean(input.title, 100);
    const body = this.clean(input.body, 240);
    const link = this.clean(input.link, 500) || '/';
    const imageUrl = this.clean(input.imageUrl, 1000) || undefined;
    if (!title || !body || !input.customerId) {
      throw new BadRequestException('Customer notification data সঠিক নয়');
    }

    await this.prisma.pushInboxItem.create({
      data: {
        type: PushNotificationType.OFFER,
        title,
        body,
        link,
        imageUrl,
        customerId: input.customerId,
      },
    });

    const devices = await this.prisma.pushDevice.findMany({
      where: {
        customerId: input.customerId,
        enabled: true,
      },
      select: { token: true },
    });
    if (!devices.length) {
      return {
        recipientCount: 0,
        sentCount: 0,
        failureCount: 0,
        inboxOnly: true,
      };
    }

    const publicSiteUrl = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    const webLink = /^https?:\/\//i.test(link)
      ? link
      : `${publicSiteUrl}${link.startsWith('/') ? link : `/${link}`}`;

    try {
      return await this.send(
        devices.map((device) => device.token),
        {
          notification: { title, body, imageUrl },
          data: { type: 'OFFER', link },
          webpush: {
            fcmOptions: { link: webLink },
            notification: {
              icon: '/icons/pwa-192.png',
              badge: '/icons/pwa-192.png',
              image: imageUrl,
              tag: this.clean(input.tag, 100) || `customer-${Date.now()}`,
              renotify: true,
            },
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Customer lifecycle push failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        recipientCount: devices.length,
        sentCount: 0,
        failureCount: devices.length,
        inboxOnly: true,
      };
    }
  }

  async sendOffer(input: SendOfferInput) {
    const campaign = await this.createDraft(input);
    return this.sendCampaign(campaign.id);
  }

  private campaignData(
    input: CreatePushCampaignInput,
    type: PushNotificationType = PushNotificationType.OFFER,
  ) {
    const title = this.clean(input.title, 100);
    const body = this.clean(input.body, 240);
    if (!title || !body) {
      throw new BadRequestException('Title এবং message প্রয়োজন');
    }
    return {
      type,
      title,
      body,
      link: this.clean(input.link, 500) || '/',
      imageUrl: this.clean(input.imageUrl, 1000) || null,
      sourceKey: this.clean(input.sourceKey, 240) || null,
    };
  }

  async createDraft(
    input: CreatePushCampaignInput,
    type: PushNotificationType = PushNotificationType.OFFER,
  ) {
    return this.prisma.pushCampaign.create({
      data: this.campaignData(input, type),
    });
  }

  async createTemplate(input: CreatePushCampaignInput) {
    return this.createDraft(input, PushNotificationType.OFFER);
  }

  async sendTemplate(idInput: string) {
    const id = this.clean(idInput, 180);
    const template = await this.prisma.pushCampaign.findFirst({
      where: { id, status: PushCampaignStatus.DRAFT },
    });
    if (!template) {
      throw new NotFoundException('Saved notification পাওয়া যায়নি');
    }

    // A saved notification is never consumed. Every click creates a fresh
    // campaign so the template remains available and each send has history.
    const campaign = await this.prisma.pushCampaign.create({
      data: {
        type: template.type,
        title: template.title,
        body: template.body,
        link: template.link,
        imageUrl: template.imageUrl,
      },
    });
    return this.sendCampaign(campaign.id);
  }

  async deleteTemplate(idInput: string) {
    const id = this.clean(idInput, 180);
    const deleted = await this.prisma.pushCampaign.deleteMany({
      where: { id, status: PushCampaignStatus.DRAFT },
    });
    if (deleted.count !== 1) {
      throw new NotFoundException('Saved notification পাওয়া যায়নি');
    }
    return { success: true };
  }

  async deleteDraft(idInput: string) {
    const id = this.clean(idInput, 180);
    const deleted = await this.prisma.pushCampaign.deleteMany({
      where: { id, status: PushCampaignStatus.DRAFT },
    });
    if (deleted.count !== 1) {
      throw new NotFoundException('Draft notification পাওয়া যায়নি');
    }
    return { success: true };
  }

  async sendCampaign(idInput: string) {
    const id = this.clean(idInput, 180);
    const claimed = await this.prisma.pushCampaign.updateMany({
      where: {
        id,
        status: {
          in: [PushCampaignStatus.DRAFT, PushCampaignStatus.FAILED],
        },
      },
      data: { status: PushCampaignStatus.SENDING },
    });
    if (claimed.count !== 1) {
      const current = await this.prisma.pushCampaign.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException('Notification পাওয়া যায়নি');
      throw new ConflictException(
        current.status === PushCampaignStatus.SENDING
          ? 'Notification ইতোমধ্যে send হচ্ছে'
          : 'Notification ইতোমধ্যে send করা হয়েছে',
      );
    }

    const campaign = await this.prisma.pushCampaign.findUniqueOrThrow({
      where: { id },
    });
    const title = campaign.title;
    const body = campaign.body;
    const link = campaign.link || '/';
    const publicSiteUrl = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    const webLink = /^https?:\/\//i.test(link)
      ? link
      : `${publicSiteUrl}${link.startsWith('/') ? link : `/${link}`}`;
    const imageUrl = campaign.imageUrl || undefined;

    const devices = await this.prisma.pushDevice.findMany({
      where: { enabled: true, allowOffers: true },
      select: { token: true },
    });

    try {
      const result = devices.length
        ? await this.send(
            devices.map((device) => device.token),
            {
              notification: { title, body, imageUrl },
              data: { type: campaign.type, link },
              webpush: {
                fcmOptions: { link: webLink },
                notification: {
                  icon: '/icons/pwa-192.png',
                  badge: '/icons/pwa-192.png',
                  image: imageUrl,
                  tag: `campaign-${campaign.id}`,
                },
              },
            },
          )
        : { recipientCount: 0, sentCount: 0, failureCount: 0 };

      const status =
        result.failureCount === 0
          ? PushCampaignStatus.SENT
          : result.sentCount > 0
            ? PushCampaignStatus.PARTIAL
            : PushCampaignStatus.FAILED;
      const [saved] = await this.prisma.$transaction([
        this.prisma.pushCampaign.update({
          where: { id: campaign.id },
          data: { ...result, status, sentAt: new Date() },
        }),
        this.prisma.pushInboxItem.create({
          data: {
            type: campaign.type,
            title,
            body,
            link,
            imageUrl,
            isGlobal: true,
          },
        }),
      ]);
      return { campaign: saved, ...result };
    } catch (error) {
      await this.prisma.pushCampaign.update({
        where: { id: campaign.id },
        data: { status: PushCampaignStatus.FAILED },
      });
      throw error;
    }
  }

  async sendBannerPublished(input: {
    id: string;
    title?: string | null;
    eyebrow?: string | null;
    description?: string | null;
    desktopImage: string;
    link?: string | null;
  }) {
    try {
      const campaign = await this.createDraft(
        {
          title: input.title || input.eyebrow || 'Maaniko-তে নতুন আয়োজন',
          body:
            input.description ||
            'নতুন ব্যানারটি দেখুন এবং আপনার প্রয়োজনীয় পণ্য বেছে নিন।',
          imageUrl: input.desktopImage,
          link: input.link || '/',
          sourceKey: `banner-published:${input.id}`,
        },
        PushNotificationType.BANNER,
      );
      return this.sendCampaign(campaign.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { duplicate: true, skipped: true };
      }
      this.logger.error(
        `Banner push failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { failed: true };
    }
  }

  async sendOrderStatus(input: OrderStatusPushInput) {
    if (!CUSTOMER_ORDER_PUSH_STATUSES.has(input.status)) {
      return {
        recipientCount: 0,
        sentCount: 0,
        failureCount: 0,
        skipped: true,
      };
    }

    try {
      const copy = STATUS_COPY[input.status];
      const link = input.trackingToken
        ? `/track-order/${encodeURIComponent(input.trackingToken)}`
        : '/orders';

      await this.prisma.pushInboxItem.create({
        data: {
          type: PushNotificationType.ORDER_STATUS,
          title: copy.title,
          body: `${input.orderNumber}: ${copy.body}`,
          link,
          customerId: input.customerId,
        },
      });

      const devices = await this.prisma.pushDevice.findMany({
        where: { customerId: input.customerId, enabled: true },
        select: { token: true },
      });
      if (!devices.length)
        return { recipientCount: 0, sentCount: 0, failureCount: 0 };

      const publicSiteUrl = (
        this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
      ).replace(/\/$/, '');
      return await this.send(
        devices.map((device) => device.token),
        {
          notification: {
            title: copy.title,
            body: `${input.orderNumber}: ${copy.body}`,
          },
          data: {
            type: 'ORDER_STATUS',
            orderNumber: input.orderNumber,
            status: input.status,
            link,
          },
          webpush: {
            fcmOptions: { link: `${publicSiteUrl}${link}` },
            notification: {
              icon: '/icons/pwa-192.png',
              badge: '/icons/pwa-192.png',
              tag: `order-${input.orderNumber}`,
              renotify: true,
            },
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Order push failed for ${input.orderNumber}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { recipientCount: 0, sentCount: 0, failureCount: 1 };
    }
  }

  async adminOverview() {
    const [activeDevices, offerDevices, templates, campaigns] =
      await Promise.all([
        this.prisma.pushDevice.count({ where: { enabled: true } }),
        this.prisma.pushDevice.count({
          where: { enabled: true, allowOffers: true },
        }),
        this.prisma.pushCampaign.findMany({
          where: { status: PushCampaignStatus.DRAFT },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.pushCampaign.findMany({
          where: { status: { not: PushCampaignStatus.DRAFT } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      ]);
    return { activeDevices, offerDevices, templates, campaigns };
  }
}
