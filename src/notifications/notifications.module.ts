import { Global, Module } from '@nestjs/common';
import {
  AdminNotificationsController,
  PushNotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [PushNotificationsController, AdminNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
