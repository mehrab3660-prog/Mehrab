import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ImageProcessingService } from './image-processing.service';
import { AiImageAutopilotService } from './ai-image-autopilot.service';
import { AiImageController } from './ai-image.controller';

@Module({
  imports: [SettingsModule],
  controllers: [AiImageController],
  providers: [ImageProcessingService, AiImageAutopilotService],
  exports: [ImageProcessingService, AiImageAutopilotService],
})
export class AiImageModule {}
