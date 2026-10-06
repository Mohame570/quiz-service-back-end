import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';

import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Request() req: any) {
    const rawIp = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress;
    const ipAddress = Array.isArray(rawIp)
      ? rawIp[0]
      : (typeof rawIp === 'string' ? rawIp.split(',')[0]?.trim() : req.ip);
    const userAgent = req.headers?.['user-agent'];
    return this.authService.login(dto, { ipAddress, userAgent });
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // TEMPORARY bootstrap — removed after first admin is promoted.
  @Post('bootstrap-admin')
  @HttpCode(HttpStatus.OK)
  bootstrapAdmin(@Body() dto: { email: string; secret: string }) {
    return this.authService.bootstrapAdmin(dto.email, dto.secret);
  }
}
