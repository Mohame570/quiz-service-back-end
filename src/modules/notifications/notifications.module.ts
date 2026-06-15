import { Module } from '@nestjs/common';

import { NotificationsController } from './controllers/notifications.controller';
import {
  NOTIFICATION_SERVICE,
} from './services/notification-service.interface';
import { MailTransportService } from './services/mail-transport.service';
import { NotificationService } from './services/notification.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    MailTransportService,
    NotificationService,
    {
      provide: NOTIFICATION_SERVICE,
      useExisting: NotificationService,
    },
  ],
  exports: [NotificationService, NOTIFICATION_SERVICE, MailTransportService],
})
export class NotificationsModule {}
