import { Module } from '@nestjs/common';
import {
  GuideCategoriesController,
  GuidePageController,
  GuidesController,
} from './guides.controller';
import { GuidesService } from './guides.service';

@Module({
  controllers: [
    GuidesController,
    GuideCategoriesController,
    GuidePageController,
  ],
  providers: [GuidesService],
})
export class GuidesModule {}
