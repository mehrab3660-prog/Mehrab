import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  productVariantId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  // Purely informational — lets the real add-to-cart flow record where the
  // click came from (e.g. the Store-only AI chat) for real usage metrics.
  // Never affects auth, pricing, or stock — those are validated exactly the
  // same regardless of this field.
  @IsOptional()
  @IsIn(['ai_advisor'])
  source?: 'ai_advisor';
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  quantity: number;
}
