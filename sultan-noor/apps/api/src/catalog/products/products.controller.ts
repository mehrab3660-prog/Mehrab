import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto';

@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@CurrentUser() requester: AuthenticatedUser | undefined, @Query() query: ListProductsQueryDto) {
    return this.productsService.list(query, requester);
  }

  @Get('best-sellers')
  bestSellers(@Query('take') take?: string) {
    return this.productsService.bestSellers(take ? Number(take) : undefined);
  }

  @Get(':idOrSlug/related')
  related(@Param('idOrSlug') idOrSlug: string, @Query('take') take?: string) {
    return this.productsService.relatedForProduct(idOrSlug, take ? Number(take) : undefined);
  }

  @Get(':idOrSlug')
  @UseGuards(OptionalJwtAuthGuard)
  get(@CurrentUser() requester: AuthenticatedUser | undefined, @Param('idOrSlug') idOrSlug: string) {
    return this.productsService.get(idOrSlug, requester);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
