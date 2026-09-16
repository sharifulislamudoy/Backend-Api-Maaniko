import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AiAssistantService } from './ai-assistant.service';
import {
  AiChatDto,
  AiFeedbackDto,
  AiKnowledgeReviewDto,
} from './ai-assistant.dto';

@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly ai: AiAssistantService) {}

  @Post('chat')
  chat(
    @Body() input: AiChatDto,
    @Headers('x-maaniko-guest-id') guestId = '',
    @Headers('x-maaniko-customer-token') customerToken = '',
  ) {
    return this.ai.chat(input, guestId, customerToken);
  }

  @Post('messages/:messageId/feedback')
  feedback(
    @Param('messageId') messageId: string,
    @Body() input: AiFeedbackDto,
    @Headers('x-maaniko-guest-id') guestId = '',
    @Headers('x-maaniko-customer-token') customerToken = '',
  ) {
    return this.ai.feedback(messageId, input, guestId, customerToken);
  }

  @Get('admin/analytics')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  analytics(@Query('days', new ParseIntPipe({ optional: true })) days = 30) {
    return this.ai.analytics(days);
  }

  @Get('admin/conversations/:conversationId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  conversation(@Param('conversationId') conversationId: string) {
    return this.ai.conversation(conversationId);
  }

  @Patch('admin/knowledge/:knowledgeId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  reviewKnowledge(
    @Param('knowledgeId') knowledgeId: string,
    @Body() input: AiKnowledgeReviewDto,
  ) {
    return this.ai.reviewKnowledge(knowledgeId, input);
  }
}
