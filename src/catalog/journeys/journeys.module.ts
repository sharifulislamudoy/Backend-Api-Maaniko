import { Module } from '@nestjs/common';
import { JourneysController } from './journeys.controller';

@Module({ controllers: [JourneysController] })
export class JourneysModule {}
