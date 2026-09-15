import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoreSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomCombo() {
    const setting = await this.prisma.commerceSetting.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    return {
      customComboMinSubtotal: Number(setting.customComboMinSubtotal),
      customComboDiscountPercent: Number(setting.customComboDiscountPercent),
    };
  }

  async updateCustomCombo(input: {
    customComboMinSubtotal: number;
    customComboDiscountPercent: number;
  }) {
    const minimum = Number(input.customComboMinSubtotal);
    const percent = Number(input.customComboDiscountPercent);
    if (!Number.isFinite(minimum) || minimum < 0) {
      throw new BadRequestException('Minimum subtotal must be zero or more');
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException(
        'Discount percent must be between 0 and 100',
      );
    }
    const setting = await this.prisma.commerceSetting.upsert({
      where: { id: 'default' },
      update: {
        customComboMinSubtotal: minimum,
        customComboDiscountPercent: percent,
      },
      create: {
        id: 'default',
        customComboMinSubtotal: minimum,
        customComboDiscountPercent: percent,
      },
    });
    return {
      customComboMinSubtotal: Number(setting.customComboMinSubtotal),
      customComboDiscountPercent: Number(setting.customComboDiscountPercent),
    };
  }
}
