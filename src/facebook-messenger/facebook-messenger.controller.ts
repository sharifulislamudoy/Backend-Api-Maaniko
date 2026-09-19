import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { FacebookMessengerService } from './facebook-messenger.service';
import type { MessengerWebhookBody } from './facebook-messenger.types';

@Controller('webhooks/facebook')
export class FacebookMessengerController {
  constructor(private readonly messenger: FacebookMessengerService) {}

  @Get()
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    if (!this.messenger.verifyChallenge(mode, verifyToken)) {
      throw new ForbiddenException('Facebook webhook verification failed');
    }
    return challenge ?? '';
  }

  @Post()
  @HttpCode(200)
  async receiveWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    this.messenger.assertValidSignature(request.rawBody, signature);
    await this.messenger.handleWebhook(request.body as MessengerWebhookBody);
    return 'EVENT_RECEIVED';
  }
}
