import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ContentPageInput } from './content-pages.types';

@Injectable()
export class ContentPagesService {
  constructor(private readonly prisma: PrismaService) {}

  private include = { sections: { orderBy: { sortOrder: 'asc' as const } } };

  findAllAdmin() {
    return this.prisma.contentPage.findMany({
      include: this.include,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async findPublished(slug: string) {
    const page = await this.prisma.contentPage.findFirst({
      where: { slug, isPublished: true },
      include: this.include,
    });
    if (!page) throw new NotFoundException('পেজটি পাওয়া যায়নি');
    return page;
  }

  async update(id: string, input: ContentPageInput) {
    const title = input.title?.trim();
    if (!title) throw new BadRequestException('Title is required');
    const sections = (input.sections ?? [])
      .map((section) => ({
        title: section.title?.trim(),
        body: section.body?.trim(),
      }))
      .filter((section) => section.title && section.body);
    if (!sections.length)
      throw new BadRequestException(
        'At least one complete section is required',
      );

    const exists = await this.prisma.contentPage.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Page not found');

    return this.prisma.contentPage.update({
      where: { id },
      data: {
        category: input.category,
        title,
        eyebrow: input.eyebrow?.trim() || null,
        summary: input.summary?.trim() || null,
        isPublished: input.isPublished ?? true,
        sortOrder: Number.isFinite(input.sortOrder)
          ? Math.floor(input.sortOrder!)
          : 0,
        sections: {
          deleteMany: {},
          create: sections.map((section, sortOrder) => ({
            ...section,
            sortOrder,
          })),
        },
      },
      include: this.include,
    });
  }
}
