import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Maaniko API সচল আছে';
  }

  // Example: fetch all users
  async getAllUsers() {
    return this.prisma.user.findMany();
  }
}
