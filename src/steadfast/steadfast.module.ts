import { Module } from '@nestjs/common';
import { SteadfastController } from './steadfast.controller';
import { SteadfastService } from './steadfast.service';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';


@Module({
  imports: [InventoryModule, FinanceModule],
  controllers: [SteadfastController],
  providers: [SteadfastService],
  exports: [SteadfastService],
})
export class SteadfastModule {}
