import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { TelegramService } from '../telegram/telegram.service';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import { Role, Status } from '@prisma/client';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private telegramService: TelegramService,
    private config: ConfigService,
  ) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID সেট করা নেই');
    }
    this.googleClient = new OAuth2Client(clientId);
  }

  async verifyGoogleToken(idToken: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.config.get<string>('GOOGLE_CLIENT_ID')!,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Token-এর তথ্য সঠিক নয়');
      }
      return {
        email: payload.email,
        name: payload.name || '',
      };
    } catch (error) {
      throw new UnauthorizedException('Google token যাচাই করা যায়নি');
    }
  }

  async loginWithGoogle(idToken: string) {
    const googleUser = await this.verifyGoogleToken(idToken);
    const user = await this.userService.findByEmail(googleUser.email);

    if (!user) {
      const isSuperAdmin =
        googleUser.email === this.config.get('SUPER_ADMIN_EMAIL');
      const newUser = await this.userService.createUser({
        email: googleUser.email,
        name: googleUser.name,
        role: isSuperAdmin ? Role.SUPER_ADMIN : Role.ADMIN,
        status: isSuperAdmin ? Status.APPROVED : Status.PENDING,
      });

      if (!isSuperAdmin) {
        await this.telegramService.sendNewSignupNotification(
          newUser.email,
          newUser.id,
          newUser.name ?? undefined,
        );
      }

      if (isSuperAdmin) {
        return this.generateToken(newUser);
      } else {
        throw new UnauthorizedException(
          'আপনার অ্যাকাউন্ট অনুমোদনের অপেক্ষায় আছে। অনুমোদিত হলে ইমেইলে জানানো হবে।',
        );
      }
    }

    if (user.status === Status.PENDING) {
      throw new UnauthorizedException(
        'আপনার অ্যাকাউন্ট এখনো অনুমোদনের অপেক্ষায় আছে।',
      );
    }
    if (user.status === Status.REJECTED) {
      throw new UnauthorizedException(
        'আপনার অ্যাকাউন্টের আবেদন প্রত্যাখ্যাত হয়েছে।',
      );
    }

    return this.generateToken(user);
  }

  private generateToken(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async getProfile(userId: string) {
    return this.userService.findById(userId);
  }
}
