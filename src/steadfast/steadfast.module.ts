import { Module } from '@nestjs/common';
import { SteadfastController } from './steadfast.controller';
import { SteadfastService } from './steadfast.service';

@Module({
  controllers: [SteadfastController],
  providers: [SteadfastService],
  exports: [SteadfastService],
})
export class SteadfastModule {}
