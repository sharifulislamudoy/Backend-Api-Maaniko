import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';

@Module({
  imports: [TelegramModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
