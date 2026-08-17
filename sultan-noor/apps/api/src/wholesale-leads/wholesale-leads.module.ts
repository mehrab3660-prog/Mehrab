import { Module } from '@nestjs/common';
import { WholesaleLeadsController } from './wholesale-leads.controller';
import { WholesaleLeadsService } from './wholesale-leads.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [WholesaleLeadsController],
  providers: [WholesaleLeadsService],
})
export class WholesaleLeadsModule {}
