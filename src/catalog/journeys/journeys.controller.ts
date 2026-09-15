import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('journeys')
export class JourneysController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll() {
    const journeys = await this.prisma.journey.findMany({
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
    });
    return journeys.map((journey) => ({
      id: journey.slug,
      slug: journey.slug,
      number: journey.number,
      name: journey.name,
      description: journey.description ?? '',
      icon: journey.icon,
      color: journey.color,
      softColor: journey.softColor,
    }));
  }
}
