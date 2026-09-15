import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { StoreSettingsService } from './store-settings.service';

@Controller('store-settings')
export class StoreSettingsController {
  constructor(private readonly settings: StoreSettingsService) {}

  @Get('custom-combo')
  getPublicCustomCombo() {
    return this.settings.getCustomCombo();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get('admin/custom-combo')
  getAdminCustomCombo() {
    return this.settings.getCustomCombo();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch('admin/custom-combo')
  updateCustomCombo(
    @Body()
    input: {
      customComboMinSubtotal: number;
      customComboDiscountPercent: number;
    },
  ) {
    return this.settings.updateCustomCombo(input);
  }
}
