import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SeoAutopilotModule } from '../seo-autopilot/seo-autopilot.module';
import { SalesAutopilotModule } from '../sales-autopilot/sales-autopilot.module';

@Module({
  imports: [SeoAutopilotModule, SalesAutopilotModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
