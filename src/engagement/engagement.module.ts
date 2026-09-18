import { Module } from '@nestjs/common';
import {
  EngagementController,
  AdminEngagementController,
} from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  controllers: [EngagementController, AdminEngagementController],
  providers: [EngagementService],
  exports: [EngagementService],
})
export class EngagementModule {}
