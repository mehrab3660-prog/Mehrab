import { Module } from '@nestjs/common';
import { AiProductModule } from '../ai-product/ai-product.module';
import { SeoAutopilotModule } from '../seo-autopilot/seo-autopilot.module';
import { ContentAutopilotModule } from '../content-autopilot/content-autopilot.module';
import { SalesAutopilotModule } from '../sales-autopilot/sales-autopilot.module';
import { NewsModule } from '../news/news.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ApprovalCenterController } from './approval-center.controller';
import { ApprovalCenterService } from './approval-center.service';
import { AiActivityLogService } from './ai-activity-log.service';

@Module({
  imports: [AiProductModule, SeoAutopilotModule, ContentAutopilotModule, SalesAutopilotModule, NewsModule, InventoryModule],
  controllers: [ApprovalCenterController],
  providers: [ApprovalCenterService, AiActivityLogService],
  exports: [ApprovalCenterService, AiActivityLogService],
})
export class ApprovalCenterModule {}
