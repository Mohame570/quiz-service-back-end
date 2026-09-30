import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../../auth/guards/email-verified.guard';
import { StudentRoleGuard } from '../../student/guards/student-role.guard';
import {
  CertificatesService,
  CertificatePublicView,
} from '../services/certificates.service';

@UseGuards(JwtAuthGuard, EmailVerifiedGuard, StudentRoleGuard)
@Controller('student/certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  // POST /api/student/certificates/attempts/:attemptId
  @Post('attempts/:attemptId')
  issue(
    @Param('attemptId') attemptId: string,
    @Request() req: any,
  ): Promise<CertificatePublicView> {
    return this.certificates.issueForAttempt(req.user.sub, attemptId);
  }

  // GET /api/student/certificates/attempts/:attemptId
  @Get('attempts/:attemptId')
  mine(
    @Param('attemptId') attemptId: string,
    @Request() req: any,
  ): Promise<CertificatePublicView> {
    return this.certificates.getMyCertificate(req.user.sub, attemptId);
  }
}

// No guards — public logged-out share link.
@Controller('certificates')
export class CertificatesPublicController {
  constructor(private readonly certificates: CertificatesService) {}

  // GET /api/certificates/:code
  @Get(':code')
  verify(@Param('code') code: string): Promise<CertificatePublicView> {
    return this.certificates.verifyByCode(code);
  }
}