import {
  Controller,
  Get,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SteadfastService } from './steadfast.service';

@Controller('steadfast')
export class SteadfastController {
  constructor(
    private readonly config: ConfigService,
    private readonly steadfast: SteadfastService,
  ) {}

  /**
   * Optional endpoint for Vercel Cron, cron-job.org or another scheduler.
   * Send: Authorization: Bearer <STEADFAST_SYNC_SECRET>
   */
  @Get('sync')
  sync(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('STEADFAST_SYNC_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'STEADFAST_SYNC_SECRET সেট করা হয়নি',
      );
    }
    if (authorization !== `Bearer ${secret}`) {
      throw new UnauthorizedException('Invalid sync secret');
    }
    return this.steadfast.syncActiveOrders();
  }
}
