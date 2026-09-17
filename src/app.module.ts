import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { TelegramModule } from './telegram/telegram.module';
import { EmailModule } from './email/email.module';
import { UserModule } from './user/user.module';
import { ProductsModule } from './catalog/products/products.module';
import { CombosModule } from './catalog/combos/combos.module';
import { BannersModule } from './catalog/banners/banners.module';
import { JourneysModule } from './catalog/journeys/journeys.module';
import { CommerceModule } from './commerce/commerce.module';
import { GuidesModule } from './guides/guides.module';
import { ContentPagesModule } from './content-pages/content-pages.module';
import { StoreSettingsModule } from './store-settings/store-settings.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { InventoryModule } from './inventory/inventory.module';
import { FinanceModule } from './finance/finance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    AuthModule,
    UserModule,
    AdminModule,
    TelegramModule,
    EmailModule,
    ProductsModule,
    CombosModule,
    BannersModule,
    JourneysModule,
    CommerceModule,
    GuidesModule,
    ContentPagesModule,
    StoreSettingsModule,
    AiAssistantModule,
    DashboardModule,
    InventoryModule,
    FinanceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
