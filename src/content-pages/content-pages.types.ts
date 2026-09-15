import type { ContentPageCategory } from '@prisma/client';

export type ContentPageInput = {
  category: ContentPageCategory;
  title: string;
  eyebrow?: string;
  summary?: string;
  isPublished?: boolean;
  sortOrder?: number;
  sections: Array<{ title: string; body: string }>;
};
