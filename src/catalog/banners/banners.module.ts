import { Module } from '@nestjs/common';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
