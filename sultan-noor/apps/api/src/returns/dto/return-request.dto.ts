import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsPositive, IsString, MinLength, ValidateNested } from 'class-validator';

export class ReturnRequestItemDto {
  @IsString()
  orderItemId: string;

  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateReturnRequestDto {
  @IsString()
  orderId: string;

  @IsString()
  @MinLength(5)
  reason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnRequestItemDto)
  items: ReturnRequestItemDto[];
}

export class UpdateReturnRequestStatusDto {
  @IsIn(['APPROVED', 'REJECTED', 'REFUNDED'])
  status: 'APPROVED' | 'REJECTED' | 'REFUNDED';

  @IsOptional()
  @IsString()
  adminNote?: string;
}
