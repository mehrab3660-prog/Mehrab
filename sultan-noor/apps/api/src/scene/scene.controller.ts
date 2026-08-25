import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SceneService } from './scene.service';
import { CreateSceneHotspotDto, UpdateSceneHotspotDto } from './dto/scene-hotspot.dto';

@Controller('scene')
export class SceneController {
  constructor(private sceneService: SceneService) {}

  @Get('config')
  getConfig() {
    return this.sceneService.getPublicConfig();
  }

  @Get('hotspots')
  listPublicHotspots() {
    return this.sceneService.listPublicHotspots();
  }

  @Get('admin/hotspots')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  listAdmin() {
    return this.sceneService.listAdmin();
  }

  @Post('admin/hotspots')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  create(@Body() dto: CreateSceneHotspotDto) {
    return this.sceneService.create(dto);
  }

  @Patch('admin/hotspots/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  update(@Param('id') id: string, @Body() dto: UpdateSceneHotspotDto) {
    return this.sceneService.update(id, dto);
  }

  @Delete('admin/hotspots/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.sceneService.remove(id);
  }
}
