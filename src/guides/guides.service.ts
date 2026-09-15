import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GuideCategoryDto,
  GuideInputDto,
  GuidePageContentDto,
  GuideQueryDto,
} from './guides.dto';

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImage: true,
  coverPublicId: true,
  coverAlt: true,
  authorName: true,
  readMinutes: true,
  pdfUrl: true,
  pageCount: true,
  featured: true,
  popular: true,
  sortOrder: true,
  publishedAt: true,
  reviewedAt: true,
  updatedAt: true,
  category: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.GuideSelect;

const detailInclude = {
  category: true,
  sections: { orderBy: { sortOrder: 'asc' as const } },
  sources: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.GuideInclude;

@Injectable()
export class GuidesService {
  constructor(private readonly prisma: PrismaService) {}

  private publicWhere(): Prisma.GuideWhereInput {
    return {
      status: CatalogStatus.ACTIVE,
      publishedAt: { lte: new Date() },
      category: { isPublished: true },
    };
  }

  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException('এই slug ইতোমধ্যে ব্যবহার করা হয়েছে।');
        if (error.code === 'P2003' || error.code === 'P2014')
          throw new ConflictException(
            'এই ক্যাটাগরিতে গাইড আছে। আগে গাইডগুলো অন্য ক্যাটাগরিতে সরান।',
          );
        if (error.code === 'P2025')
          throw new NotFoundException('তথ্যটি পাওয়া যায়নি।');
      }
      throw error;
    }
  }

  async hub() {
    const [page, categories, featuredGuides] = await Promise.all([
      this.prisma.guidePage.findUnique({ where: { id: 'main' } }),
      this.prisma.guideCategory.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.guide.findMany({
        where: { ...this.publicWhere(), featured: true },
        select: cardSelect,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: 3,
      }),
    ]);
    return { page: page?.content ?? null, categories, featuredGuides };
  }

  async list(query: GuideQueryDto) {
    const { q, category, limit, sort } = query;
    const where: Prisma.GuideWhereInput = {
      ...this.publicWhere(),
      ...(category ? { category: { slug: category, isPublished: true } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { excerpt: { contains: q, mode: 'insensitive' } },
              {
                sections: {
                  some: {
                    OR: [
                      { title: { contains: q, mode: 'insensitive' } },
                      { body: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.GuideOrderByWithRelationInput[] =
      sort === 'newest'
        ? [{ publishedAt: 'desc' }, { id: 'asc' }]
        : [
            { popular: 'desc' },
            { sortOrder: 'asc' },
            { publishedAt: 'desc' },
            { id: 'asc' },
          ];
    return this.prisma.$transaction(
      async (tx) => {
        const total = await tx.guide.count({ where });
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const page = Math.min(query.page, totalPages);
        const items = await tx.guide.findMany({
          where,
          select: cardSelect,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
        });
        return { items, total, page, totalPages, limit };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async detail(slug: string) {
    const guide = await this.prisma.guide.findFirst({
      where: { slug, ...this.publicWhere() },
      include: detailInclude,
    });
    if (!guide) throw new NotFoundException('গাইডটি পাওয়া যায়নি।');
    const related = await this.prisma.guide.findMany({
      where: {
        ...this.publicWhere(),
        categoryId: guide.categoryId,
        id: { not: guide.id },
      },
      select: cardSelect,
      orderBy: [{ popular: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      take: 3,
    });
    const page = await this.prisma.guidePage.findUnique({
      where: { id: 'main' },
    });
    return { guide, related, page: page?.content ?? null };
  }

  allAdmin() {
    return this.prisma.guide.findMany({
      include: detailInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  private async data(input: GuideInputDto, previousPublishedAt?: Date | null) {
    const category = await this.prisma.guideCategory.findUnique({
      where: { id: input.categoryId },
    });
    if (!category)
      throw new BadRequestException('একটি সঠিক ক্যাটাগরি নির্বাচন করুন।');
    if (input.pageCount && !input.pdfUrl)
      throw new BadRequestException('পৃষ্ঠা সংখ্যা দিতে হলে PDF link দিন।');
    if (input.reviewedAt && new Date(input.reviewedAt) > new Date())
      throw new BadRequestException(
        'তথ্য যাচাইয়ের তারিখ ভবিষ্যতে হতে পারে না।',
      );
    const {
      sections: _sections,
      sources: _sources,
      publishedAt,
      reviewedAt,
      ...scalar
    } = input;
    return {
      ...scalar,
      pdfUrl: input.pdfUrl || null,
      pageCount: input.pdfUrl ? (input.pageCount ?? null) : null,
      publishedAt: publishedAt
        ? new Date(publishedAt)
        : (previousPublishedAt ??
          (input.status === 'ACTIVE' ? new Date() : null)),
      reviewedAt: reviewedAt ? new Date(reviewedAt) : null,
    };
  }

  async create(input: GuideInputDto) {
    const data = await this.data(input);
    return this.write(() =>
      this.prisma.guide.create({
        data: {
          ...data,
          sections: {
            create: input.sections.map((section, sortOrder) => ({
              ...section,
              sortOrder,
            })),
          },
          sources: {
            create: input.sources.map((source, sortOrder) => ({
              ...source,
              sortOrder,
            })),
          },
        },
        include: detailInclude,
      }),
    );
  }

  async update(id: string, input: GuideInputDto) {
    const existing = await this.prisma.guide.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('গাইডটি পাওয়া যায়নি।');
    const data = await this.data(input, existing.publishedAt);
    // Prisma nested writes are atomic: a failed edit preserves the old article.
    return this.write(() =>
      this.prisma.guide.update({
        where: { id },
        data: {
          ...data,
          sections: {
            deleteMany: {},
            create: input.sections.map((section, sortOrder) => ({
              ...section,
              sortOrder,
            })),
          },
          sources: {
            deleteMany: {},
            create: input.sources.map((source, sortOrder) => ({
              ...source,
              sortOrder,
            })),
          },
        },
        include: detailInclude,
      }),
    );
  }

  async status(id: string, status: CatalogStatus) {
    const existing = await this.prisma.guide.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('গাইডটি পাওয়া যায়নি।');
    return this.write(() =>
      this.prisma.guide.update({
        where: { id },
        data: {
          status,
          ...(status === 'ACTIVE' && !existing.publishedAt
            ? { publishedAt: new Date() }
            : {}),
        },
        include: detailInclude,
      }),
    );
  }

  async remove(id: string) {
    await this.write(() => this.prisma.guide.delete({ where: { id } }));
    return { success: true };
  }

  categoriesAdmin() {
    return this.prisma.guideCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }
  createCategory(input: GuideCategoryDto) {
    return this.write(() => this.prisma.guideCategory.create({ data: input }));
  }
  updateCategory(id: string, input: GuideCategoryDto) {
    return this.write(() =>
      this.prisma.guideCategory.update({ where: { id }, data: input }),
    );
  }
  async removeCategory(id: string) {
    if (await this.prisma.guide.count({ where: { categoryId: id } })) {
      throw new ConflictException(
        'এই ক্যাটাগরিতে গাইড আছে। আগে গাইডগুলো অন্য ক্যাটাগরিতে সরান।',
      );
    }
    await this.write(() => this.prisma.guideCategory.delete({ where: { id } }));
    return { success: true };
  }
  async pageAdmin() {
    return (
      (await this.prisma.guidePage.findUnique({ where: { id: 'main' } }))
        ?.content ?? null
    );
  }
  async savePage(input: GuidePageContentDto) {
    // Validation has already checked every nested value; produce plain JSON.
    const content = JSON.parse(JSON.stringify(input)) as Prisma.InputJsonObject;
    return (
      await this.prisma.guidePage.upsert({
        where: { id: 'main' },
        create: { id: 'main', content },
        update: { content },
      })
    ).content;
  }
}
