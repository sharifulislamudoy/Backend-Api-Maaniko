import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import type { ComboInput } from '../catalog.types';
import { CombosService } from './combos.service';

@Controller('combos')
export class CombosController {
  constructor(private readonly combos: CombosService) {}

  @Get()
  findAll() {
    return this.combos.findAll();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get('admin/all')
  findAllAdmin() {
    return this.combos.findAll(true);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.combos.findOne(slug);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post()
  create(@Body() input: ComboInput) {
    return this.combos.create(input);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() input: ComboInput) {
    return this.combos.update(id, input);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.combos.remove(id);
  }
}
