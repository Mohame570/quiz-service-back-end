import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AttemptsModule } from '../attempts/attempts.module';
import {
  CertificatesController,
  CertificatesPublicController,
} from './controllers/certificates.controller';
import { CertificatesService } from './services/certificates.service';

@Module({
  imports: [PrismaModule, AuthModule, AttemptsModule],
  controllers: [CertificatesController, CertificatesPublicController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}