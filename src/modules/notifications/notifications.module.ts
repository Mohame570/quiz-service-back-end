import { Module } from '@nestjs/common';

import {
  NOTIFICATION_SERVICE,
} from './services/notification-service.interface';
import { NotificationService } from './services/notification.service';

@Module({
  providers: [
    NotificationService,
    {
      provide: NOTIFICATION_SERVICE,
      useExisting: NotificationService,
    },
  ],
  exports: [NotificationService, NOTIFICATION_SERVICE],
})
export class NotificationsModule {}
