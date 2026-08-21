import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ProductsModule } from '../catalog/products/products.module';
import { CartModule } from '../cart/cart.module';
import { ElectricalConsultantController } from './electrical-consultant.controller';
import { ElectricalConsultantService } from './electrical-consultant.service';
import { ConsultantRuleController } from './consultant-rule.controller';
import { ConsultantRuleService } from './consultant-rule.service';

@Module({
  imports: [SettingsModule, ProductsModule, CartModule],
  controllers: [ElectricalConsultantController, ConsultantRuleController],
  providers: [ElectricalConsultantService, ConsultantRuleService],
})
export class ElectricalConsultantModule {}
