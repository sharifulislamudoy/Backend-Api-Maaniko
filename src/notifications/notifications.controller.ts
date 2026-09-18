import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { NotificationsService } from './notifications.service';
import type {
  CreatePushCampaignInput,
  RegisterPushDeviceInput,
  SendOfferInput,
} from './notifications.types';

@Controller('commerce/push')
export class PushNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  private identity(guestId?: string, customerToken?: string) {
    return { guestId: guestId ?? '', customerToken };
  }

  @Post('devices')
  register(
    @Body() body: RegisterPushDeviceInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.notifications.registerDevice(
      this.identity(guestId, customerToken),
      body,
    );
  }

  @Get('inbox')
  inbox(
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.notifications.inbox(this.identity(guestId, customerToken));
  }

  @Delete('devices')
  unregister(
    @Body() body: { token?: string },
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.notifications.unregisterDevice(
      this.identity(guestId, customerToken),
      body.token,
    );
  }
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('commerce/admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  overview() {
    return this.notifications.adminOverview();
  }

  @Post('offers')
  sendOffer(@Body() body: SendOfferInput) {
    return this.notifications.sendOffer(body);
  }

  @Post('drafts')
  createDraft(@Body() body: CreatePushCampaignInput) {
    return this.notifications.createDraft(body);
  }

  @Post('templates')
  createTemplate(@Body() body: CreatePushCampaignInput) {
    return this.notifications.createTemplate(body);
  }

  @Post('templates/:id/send')
  sendTemplate(@Param('id') id: string) {
    return this.notifications.sendTemplate(id);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.notifications.deleteTemplate(id);
  }

  @Post('campaigns/:id/send')
  sendCampaign(@Param('id') id: string) {
    return this.notifications.sendCampaign(id);
  }

  @Delete('drafts/:id')
  deleteDraft(@Param('id') id: string) {
    return this.notifications.deleteDraft(id);
  }
}
