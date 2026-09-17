import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { NotificationsService } from './notifications.service';
import type {
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
}
