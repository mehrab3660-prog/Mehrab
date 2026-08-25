import { IsOptional, IsString } from 'class-validator';

export class AddWishlistItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  productVariantId?: string;
}
