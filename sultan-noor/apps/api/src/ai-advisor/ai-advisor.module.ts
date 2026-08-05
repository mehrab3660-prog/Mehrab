import { Module } from '@nestjs/common';
import { AiAdvisorController } from './ai-advisor.controller';
import { AiAdvisorService } from './ai-advisor.service';

@Module({
  controllers: [AiAdvisorController],
  providers: [AiAdvisorService],
})
export class AiAdvisorModule {}
