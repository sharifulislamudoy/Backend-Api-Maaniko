import { Module } from '@nestjs/common';
import { AdminCommerceController } from './admin-commerce.controller';
import { CommerceAiService } from './commerce-ai.service';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { TelegramModule } from '../telegram/telegram.module';
import { SteadfastModule } from '../steadfast/steadfast.module';
import { StoreSettingsModule } from '../store-settings/store-settings.module';

@Module({
  imports: [TelegramModule, SteadfastModule, StoreSettingsModule],
  controllers: [CommerceController, AdminCommerceController],
  providers: [CommerceService, CommerceAiService],
  exports: [CommerceService],
})
export class CommerceModule {}
