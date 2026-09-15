import { Controller, Get, Put, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { Status, Role } from '@prisma/client';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private userService: UserService,
    private emailService: EmailService,
  ) {}

  @Get('pending-users')
  async getPendingUsers() {
    return this.userService.getPendingUsers();
  }

  @Put('approve/:userId')
  async approveUser(@Param('userId') userId: string) {
    const user = await this.userService.updateStatus(userId, Status.APPROVED);
    await this.emailService.sendApprovalEmail(user.email, user.name || '');
    return { message: 'ব্যবহারকারী অনুমোদিত হয়েছেন', user };
  }

  @Put('reject/:userId')
  async rejectUser(@Param('userId') userId: string) {
    await this.userService.updateStatus(userId, Status.REJECTED);
    return { message: 'ব্যবহারকারীর আবেদন প্রত্যাখ্যাত হয়েছে' };
  }
}
