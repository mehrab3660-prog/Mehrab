import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SeoAutopilotModule } from '../seo-autopilot/seo-autopilot.module';
import { SalesAutopilotModule } from '../sales-autopilot/sales-autopilot.module';
import { SettingsModule } from '../settings/settings.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CrmModule } from '../crm/crm.module';
import { OwnerReportModule } from '../owner-report/owner-report.module';
import { ApprovalCenterModule } from '../approval-center/approval-center.module';

@Module({
  imports: [SeoAutopilotModule, SalesAutopilotModule, SettingsModule, InventoryModule, CrmModule, OwnerReportModule, ApprovalCenterModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
