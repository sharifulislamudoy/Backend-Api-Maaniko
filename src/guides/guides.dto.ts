import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CatalogStatus } from '@prisma/client';

const trim = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cloudinaryImagePattern =
  /^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/.+$/;

export class GuideSectionDto {
  @trim @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @trim @IsString() @MaxLength(12000) body!: string;
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  points!: string[];
}

export class GuideSourceDto {
  @trim @IsString() @IsNotEmpty() @MaxLength(200) label!: string;
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  url!: string;
}

export class GuideInputDto {
  @trim @IsString() @Matches(slugPattern) @MaxLength(160) slug!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(240) title!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(1200) excerpt!: string;
  @trim
  @IsString()
  @Matches(cloudinaryImagePattern)
  @MaxLength(2000)
  coverImage!: string;
  @IsOptional() @trim @IsString() @MaxLength(500) coverPublicId?: string | null;
  @trim @IsString() @IsNotEmpty() @MaxLength(240) coverAlt!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(120) authorName!: string;
  @IsInt() @Min(1) @Max(120) readMinutes!: number;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  pdfUrl?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(2000) pageCount?: number | null;
  @IsEnum(CatalogStatus) status!: CatalogStatus;
  @IsBoolean() featured!: boolean;
  @IsBoolean() popular!: boolean;
  @IsInt() @Min(0) @Max(100000) sortOrder!: number;
  @IsOptional() @IsDateString() publishedAt?: string | null;
  @IsOptional() @IsDateString() reviewedAt?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(100) categoryId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => GuideSectionDto)
  sections!: GuideSectionDto[];
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GuideSourceDto)
  sources!: GuideSourceDto[];
}

export class GuideStatusDto {
  @IsEnum(CatalogStatus) status!: CatalogStatus;
}

export class GuideCategoryDto {
  @trim @IsString() @Matches(slugPattern) @MaxLength(100) slug!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsInt() @Min(0) @Max(100000) sortOrder!: number;
  @IsBoolean() isPublished!: boolean;
}

export class GuideQueryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @trim
  @IsString()
  @MaxLength(120)
  q?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(slugPattern)
  @MaxLength(100)
  category?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(24) limit = 8;
  @IsIn(['popular', 'newest']) sort: 'popular' | 'newest' = 'popular';
}

export class GuideInfoItemDto {
  @IsIn(['message', 'file', 'refresh', 'research', 'edit', 'check'])
  icon!: 'message' | 'file' | 'refresh' | 'research' | 'edit' | 'check';
  @trim @IsString() @IsNotEmpty() @MaxLength(200) text!: string;
}

export class GuidePageContentDto {
  @trim @IsString() @IsNotEmpty() @MaxLength(240) title!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(1200) description!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(120) searchPlaceholder!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(160) trustTitle!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(160) journeyTitle!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(160) featuredTitle!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(160) popularTitle!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(160) processTitle!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(1000) processNote!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(160) noticeTitle!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(1600) noticeText!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(160) ctaTitle!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(600) ctaDescription!: string;
  @trim @IsString() @IsNotEmpty() @MaxLength(100) ctaLabel!: string;
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => GuideInfoItemDto)
  trustItems!: GuideInfoItemDto[];
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => GuideInfoItemDto)
  processItems!: GuideInfoItemDto[];
}
