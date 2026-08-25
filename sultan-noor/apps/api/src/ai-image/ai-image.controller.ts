import { BadRequestException, Body, Controller, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AiImageAutopilotService } from './ai-image-autopilot.service';
import { RejectImageDto } from './dto/ai-image.dto';

function baseUrlOf(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

// Same staff-only posture as AiProductController — every route here only
// ever touches ProductAiDraftImage rows, never a live Product directly.
@Controller('ai-product/drafts/:draftId/images')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
export class AiImageController {
  constructor(private aiImage: AiImageAutopilotService) {}

  @Post('search')
  async search(@Param('draftId') draftId: string, @Req() req: Request) {
    await this.aiImage.runForDraft(draftId, baseUrlOf(req));
    return this.aiImage.listImages(draftId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async upload(
    @Param('draftId') draftId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('فایل تصویر ارسال نشده است');
    return this.aiImage.uploadManualImage(draftId, file.buffer, baseUrlOf(req), user.id);
  }

  @Post(':imageId/approve')
  approve(@Param('draftId') draftId: string, @Param('imageId') imageId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiImage.approveImage(draftId, imageId, user.id);
  }

  @Post(':imageId/reject')
  reject(
    @Param('draftId') draftId: string,
    @Param('imageId') imageId: string,
    @Body() dto: RejectImageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.aiImage.rejectImage(draftId, imageId, dto.reason, user.id);
  }

  @Patch(':imageId/set-main')
  setMain(@Param('draftId') draftId: string, @Param('imageId') imageId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiImage.setMainImage(draftId, imageId, user.id);
  }

  @Post(':imageId/regenerate')
  regenerate(
    @Param('draftId') draftId: string,
    @Param('imageId') imageId: string,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.aiImage.regenerateImage(draftId, imageId, baseUrlOf(req), user.id);
  }
}
