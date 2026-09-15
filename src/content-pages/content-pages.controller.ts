import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ContentPagesService } from './content-pages.service';
import type { ContentPageInput } from './content-pages.types';

@Controller('content-pages')
export class ContentPagesController {
  constructor(private readonly pages: ContentPagesService) {}

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get('admin/all')
  findAllAdmin() {
    return this.pages.findAllAdmin();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() input: ContentPageInput) {
    return this.pages.update(id, input);
  }

  @Get(':slug')
  findPublished(@Param('slug') slug: string) {
    return this.pages.findPublished(slug);
  }
}
