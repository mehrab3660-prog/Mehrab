import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { BlogService } from './blog.service';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto/blog-post.dto';

@Controller('blog')
export class BlogController {
  constructor(private blogService: BlogService) {}

  @Get()
  listPublished() {
    return this.blogService.listPublished();
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  listAllForAdmin() {
    return this.blogService.listAllForAdmin();
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.blogService.get(slug);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBlogPostDto) {
    return this.blogService.create(user.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  update(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blogService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.blogService.remove(id);
  }
}
