import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { EngagementService } from './engagement.service';
import type {
  ApplyReferralInput,
  ReorderPreferenceInput,
  RewardAdjustmentInput,
} from './engagement.types';

@Controller('commerce/engagement')
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  private identity(guestId?: string, customerToken?: string) {
    return { guestId: guestId ?? '', customerToken };
  }

  @Get()
  dashboard(
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.engagement.dashboard(this.identity(guestId, customerToken));
  }

  @Get('process')
  processScheduled(
    @Headers('x-cron-secret') cronSecret?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const expected = process.env.ENGAGEMENT_CRON_SECRET;
    const supplied = cronSecret || authorization?.replace(/^Bearer\s+/i, '');
    if (!expected || supplied !== expected) {
      throw new UnauthorizedException('Cron access denied');
    }
    return this.engagement.processLifecycle();
  }

  @Post('referral')
  applyReferral(
    @Body() body: ApplyReferralInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.engagement.applyReferral(
      this.identity(guestId, customerToken),
      body,
    );
  }

  @Patch('reorder-reminder')
  updateReminder(
    @Body() body: ReorderPreferenceInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.engagement.updateReorderPreference(
      this.identity(guestId, customerToken),
      body,
    );
  }
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('commerce/admin/growth')
export class AdminEngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get()
  overview() {
    return this.engagement.adminOverview();
  }

  @Post('process')
  process() {
    return this.engagement.processLifecycle();
  }

  @Post('points')
  adjustPoints(@Body() body: RewardAdjustmentInput) {
    return this.engagement.adjustPoints(body);
  }
}
