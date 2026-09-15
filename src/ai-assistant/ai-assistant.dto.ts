import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AiMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(1200)
  content!: string;
}

export class AiChatDto {
  @IsString()
  @MinLength(2)
  @MaxLength(600)
  message!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => AiMessageDto)
  history: AiMessageDto[] = [];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  pagePath?: string;
}
