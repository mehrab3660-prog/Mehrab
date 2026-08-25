import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

// Escapes a value for safe embedding inside a double-quoted Meilisearch
// filter string literal (backslash-escape backslashes, then quotes) —
// without this, an unescaped `"` lets a caller break out of the literal and
// inject arbitrary filter clauses (e.g. `OR status = "DRAFT"`).
function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get('products')
  search(@Query('q') q: string, @Query('category') category?: string, @Query('brand') brand?: string) {
    const filters: string[] = ['status = PUBLISHED'];
    if (category) filters.push(`categoryName = "${escapeFilterValue(category)}"`);
    if (brand) filters.push(`brandName = "${escapeFilterValue(brand)}"`);
    return this.searchService.searchProducts(q ?? '', { filter: filters.join(' AND ') });
  }
}
