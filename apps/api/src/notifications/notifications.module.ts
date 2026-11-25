import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushWorker } from './push.worker';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushWorker],
  exports: [NotificationsService, PushWorker],
})
export class NotificationsModule {}
