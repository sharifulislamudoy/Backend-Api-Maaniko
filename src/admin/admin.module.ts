import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { UserModule } from '../user/user.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [UserModule, EmailModule],
  controllers: [AdminController],
})
export class AdminModule {}
