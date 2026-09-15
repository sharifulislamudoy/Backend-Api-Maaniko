import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { UserModule } from '../user/user.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [UserModule, EmailModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
