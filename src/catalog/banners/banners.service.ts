import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BannerPlacement, type Banner } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { optionalText, required } from '../catalog.helpers';
import type { BannerInput } from '../catalog.types';

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(banner: Banner) {
    return {
      id: banner.id,
      key: banner.key,
      placement: banner.placement,
      desktopImage: banner.desktopImage,
      mobileImage: banner.mobileImage,
      publicId: banner.publicId,
      mobilePublicId: banner.mobilePublicId,
      imageUrl: banner.desktopImage,
      mobileImageUrl: banner.mobileImage,
      productLink: banner.link,
      eyebrow: banner.eyebrow ?? undefined,
      title: banner.title ?? undefined,
      description: banner.description ?? undefined,
      buttonLabel: banner.buttonLabel ?? undefined,
      buttonHref: banner.link,
      tone: banner.tone,
      isPublished: banner.isPublished,
      sortOrder: banner.sortOrder,
      startsAt: banner.startsAt,
      endsAt: banner.endsAt,
      updatedAt: banner.updatedAt,
    };
  }

  async findAll(placement?: BannerPlacement, includeInactive = false) {
    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        ...(placement ? { placement } : {}),
        ...(includeInactive
          ? {}
          : {
              isPublished: true,
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
              ],
            }),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return banners.map((banner) => this.serialize(banner));
  }

  private data(input: BannerInput) {
    const eyebrow = optionalText(input.eyebrow);
    const title = optionalText(input.title);
    const description = optionalText(input.description);
    const buttonLabel = optionalText(input.buttonLabel);
    return {
      key: required(input.key, 'key'),
      placement: input.placement,
      desktopImage: required(input.desktopImage, 'desktopImage'),
      mobileImage: input.mobileImage || null,
      publicId: input.publicId,
      mobilePublicId: input.mobilePublicId,
      eyebrow: eyebrow,
      title: title,
      description: description,
      buttonLabel: buttonLabel,
      link: input.link,
      tone: input.tone,
      isPublished: input.isPublished ?? true,
      sortOrder: input.sortOrder ?? 0,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    };
  }

  async create(input: BannerInput) {
    return this.serialize(
      await this.prisma.banner.create({
        data: { ...(input.id ? { id: input.id } : {}), ...this.data(input) },
      }),
    );
  }

  async update(id: string, input: BannerInput) {
    const exists = await this.prisma.banner.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('ব্যানারটি পাওয়া যায়নি');
    return this.serialize(
      await this.prisma.banner.update({
        where: { id },
        data: this.data(input),
      }),
    );
  }

  async updatePublication(id: string, isPublished: boolean) {
    if (typeof isPublished !== 'boolean') {
      throw new BadRequestException('isPublished অবশ্যই boolean হতে হবে');
    }

    const exists = await this.prisma.banner.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('ব্যানারটি পাওয়া যায়নি');

    return this.serialize(
      await this.prisma.banner.update({
        where: { id },
        data: { isPublished },
      }),
    );
  }

  async remove(id: string) {
    const exists = await this.prisma.banner.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('ব্যানারটি পাওয়া যায়নি');
    await this.prisma.banner.delete({ where: { id } });
    return { success: true };
  }
}
