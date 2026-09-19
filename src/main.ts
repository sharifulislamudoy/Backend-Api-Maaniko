import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Meta signs the exact request bytes. Nest must retain them so the
  // Messenger webhook can verify X-Hub-Signature-256 before trusting events.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: false,
    }),
  );

  const origins = (config.get<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Maaniko-Guest-Id',
      'X-Maaniko-Session-Id',
      'X-Maaniko-Customer-Token',
    ],
  });

  await app.listen(config.get<number>('PORT') ?? 5000);
}

void bootstrap();
