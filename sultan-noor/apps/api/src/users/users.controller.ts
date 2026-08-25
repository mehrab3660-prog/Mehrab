import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findMe(user.id);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  list(@Query('skip') skip?: string, @Query('take') take?: string, @Query('role') role?: Role) {
    return this.usersService.list({ skip: skip ? Number(skip) : undefined, take: take ? Number(take) : undefined, role });
  }

  @Patch(':id/role')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  updateRole(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.usersService.updateRole(admin.id, admin.role as Role, id, dto.role);
  }
}
