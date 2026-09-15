import { BadRequestException } from '@nestjs/common';

export function required(value: string | undefined, field: string) {
  if (!value?.trim()) {
    throw new BadRequestException(`${field} ফিল্ডটি আবশ্যক`);
  }
  return value.trim();
}

export function requiredText(value: string | undefined, field: string) {
  return required(value, field);
}

export function optionalText(value: string | undefined) {
  return value?.trim() || undefined;
}

export function toNumber(value: unknown) {
  return value == null ? null : Number(value);
}

export function imageData(
  images: (
    | { url: string; publicId?: string; alt?: string }
    | string
  )[] = [],
) {
  return images.map((image, sortOrder) => {
    const item = typeof image === 'string' ? { url: image } : image;
    return {
      url: required(item.url, 'image.url'),
      publicId: item.publicId,
      alt: item.alt,
      sortOrder,
    };
  });
}
