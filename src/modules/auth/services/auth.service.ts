import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../../generated/prisma/client';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';
import { AuthResult, SafeUser } from '../types/auth.types';
import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { NotificationService } from '../../notifications/services/notification.service';

type JwtPayload = {
  sub: string;
  email: string;
  role: User['role'];
};

@Injectable()
export class AuthService {
  private static readonly PASSWORD_SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,

    private readonly notificationService: NotificationService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const verificationToken = randomUUID();

    const role = dto.role ?? UserRole.STUDENT;

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        role,
        emailVerified: false,
        verificationToken,
        ...(role === UserRole.STUDENT
          ? { studentProfile: { create: {} } }
          : {}),
      },
    });

    await this.notificationService.sendVerificationEmail({
      recipientEmail: user.email,
      recipientName: user.name ?? undefined,
      verificationUrl: `${this.configService.get<string>(
        'FRONTEND_BASE_URL',
        )}/verify-email?token=${verificationToken}`,
      });


    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.validateUser(dto.email, dto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResult(user);
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async findUserById(id: string): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return null;
    }

    return this.toSafeUser(user);
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, AuthService.PASSWORD_SALT_ROUNDS);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ success: boolean }> {
  // 1. Find user by token
  const user = await this.prisma.user.findFirst({
    where: {
      verificationToken: dto.token,
    },
  });

  // 2. Token invalid or expired (not found)
  if (!user) {
    throw new UnauthorizedException('Invalid or expired verification token');
  }

  // 3. If already verified, we can just return success (idempotent behavior)
  if (user.emailVerified) {
    return { success: true };
  }

  // 4. Update user as verified
  await this.prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
    },
  });

  return { success: true };
}

async resendVerification(dto: ResendVerificationDto): Promise<{ success: boolean }> {
  // 1. Find user by email
  const user = await this.prisma.user.findUnique({
    where: { email: dto.email },
  });

  // 2. If user doesn't exist
  if (!user) {
    throw new NotFoundException('User not found');
  }

  // 3. If already verified
  if (user.emailVerified) {
    return { success: true };
  }

  // 4. Generate new token
  const verificationToken = randomUUID();

  // 5. Update user with new token
  await this.prisma.user.update({
    where: { id: user.id },
    data: {
      verificationToken,
    },
  });

  // 6. Send email again
  await this.notificationService.sendVerificationEmail({
    recipientEmail: user.email,
    recipientName: user.name ?? undefined,
    verificationUrl: `${this.configService.get<string>(
      'FRONTEND_BASE_URL',
    )}/verify-email?token=${verificationToken}`,
  });

  return { success: true };
}

  private async buildAuthResult(user: User): Promise<AuthResult> {
    const tokens = await this.createTokens(user);

    return {
      user: this.toSafeUser(user),
      tokens,
    };
  }

  private async createTokens(user: User): Promise<AuthResult['tokens']> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const expiresIn = (this.configService.get<string>(
      'jwt.accessTokenExpiresIn',
    ) ?? '1h') as any;

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
    };
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
