import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Status } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async createUser(data: {
    email: string;
    name: string;
    role?: Role;
    status?: Status;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role || Role.ADMIN,
        status: data.status || Status.PENDING,
      },
    });
  }

  async updateStatus(userId: string, status: Status) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }

  async getPendingUsers() {
    return this.prisma.user.findMany({
      where: { status: Status.PENDING },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
