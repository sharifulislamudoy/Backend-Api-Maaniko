import { Module } from '@nestjs/common';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { CommerceModule } from '../commerce/commerce.module';
import { FacebookMessengerController } from './facebook-messenger.controller';
import { FacebookMessengerService } from './facebook-messenger.service';

@Module({
  imports: [AiAssistantModule, CommerceModule],
  controllers: [FacebookMessengerController],
  providers: [FacebookMessengerService],
})
export class FacebookMessengerModule {}
