import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../auth/roles.guard';
import {
  GuideCategoryDto,
  GuideInputDto,
  GuidePageContentDto,
  GuideQueryDto,
  GuideStatusDto,
} from './guides.dto';
import { GuidesService } from './guides.service';

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('guides')
@UsePipes(validation)
export class GuidesController {
  constructor(private readonly guides: GuidesService) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @Query() query: GuideQueryDto,
  ) {
    return this.guides.list(query);
  }
  @Get('hub') @Header('Cache-Control', 'no-store') hub() {
    return this.guides.hub();
  }

  @Get('admin/all')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  allAdmin() {
    return this.guides.allAdmin();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  create(@Body() body: GuideInputDto) {
    return this.guides.create(body);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  status(@Param('id') id: string, @Body() body: GuideStatusDto) {
    return this.guides.status(id, body.status);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() body: GuideInputDto) {
    return this.guides.update(id, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.guides.remove(id);
  }

  @Get(':slug') @Header('Cache-Control', 'no-store') detail(
    @Param('slug') slug: string,
  ) {
    return this.guides.detail(slug);
  }
}

@Controller('guide-categories')
@UsePipes(validation)
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class GuideCategoriesController {
  constructor(private readonly guides: GuidesService) {}
  @Get('admin/all') list() {
    return this.guides.categoriesAdmin();
  }
  @Post() create(@Body() body: GuideCategoryDto) {
    return this.guides.createCategory(body);
  }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() body: GuideCategoryDto,
  ) {
    return this.guides.updateCategory(id, body);
  }
  @Delete(':id') remove(@Param('id') id: string) {
    return this.guides.removeCategory(id);
  }
}

@Controller('guide-page')
@UsePipes(validation)
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class GuidePageController {
  constructor(private readonly guides: GuidesService) {}
  @Get('admin/all') get() {
    return this.guides.pageAdmin();
  }
  @Patch('main') save(@Body() body: GuidePageContentDto) {
    return this.guides.savePage(body);
  }
}
