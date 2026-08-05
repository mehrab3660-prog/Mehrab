import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get('products')
  search(@Query('q') q: string, @Query('category') category?: string, @Query('brand') brand?: string) {
    const filters: string[] = ['status = PUBLISHED'];
    if (category) filters.push(`categoryName = "${category}"`);
    if (brand) filters.push(`brandName = "${brand}"`);
    return this.searchService.searchProducts(q ?? '', { filter: filters.join(' AND ') });
  }
}
