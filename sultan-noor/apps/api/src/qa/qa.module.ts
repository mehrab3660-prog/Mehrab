import { Module } from '@nestjs/common';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [QaController],
  providers: [QaService],
})
export class QaModule {}
