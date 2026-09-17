import { Module } from '@nestjs/common';
import { AdminCommerceController } from './admin-commerce.controller';
import { CommerceAiService } from './commerce-ai.service';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { TelegramModule } from '../telegram/telegram.module';
import { SteadfastModule } from '../steadfast/steadfast.module';
import { StoreSettingsModule } from '../store-settings/store-settings.module';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    TelegramModule,
    SteadfastModule,
    StoreSettingsModule,
    InventoryModule,
    FinanceModule,
  ],
  controllers: [CommerceController, AdminCommerceController],
  providers: [CommerceService, CommerceAiService],
  exports: [CommerceService],
})
export class CommerceModule {}
