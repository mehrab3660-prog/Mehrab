import { Module } from '@nestjs/common';
import { ProductsModule } from '../catalog/products/products.module';
import { CrmController } from './crm.controller';
import { PersonalizationController } from './personalization.controller';
import { CustomerSegmentationService } from './customer-segmentation.service';
import { CustomerInsightsService } from './customer-insights.service';
import { PersonalizationService } from './personalization.service';

@Module({
  imports: [ProductsModule],
  controllers: [CrmController, PersonalizationController],
  providers: [CustomerSegmentationService, CustomerInsightsService, PersonalizationService],
  exports: [CustomerSegmentationService, CustomerInsightsService, PersonalizationService],
})
export class CrmModule {}
