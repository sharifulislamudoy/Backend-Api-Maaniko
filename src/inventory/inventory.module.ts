import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { EngagementModule } from '../engagement/engagement.module';

@Module({
  imports: [EngagementModule],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
