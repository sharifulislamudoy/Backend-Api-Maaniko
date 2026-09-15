import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('google')
  async googleLogin(@Body('idToken') idToken: string) {
    if (!idToken) {
      throw new UnauthorizedException('idToken দেওয়া আবশ্যক');
    }
    return this.authService.loginWithGoogle(idToken);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@Req() req) {
    const user = await this.authService.getProfile(req.user.userId);
    // Exclude sensitive fields if any
    return user;
  }
}
