import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

// Every field optional and independently settable — the customer answers
// the consultant's questions one or a few at a time; nothing here is ever
// defaulted to a guessed value server-side.
export class UpdateConsultationInputDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  areaSqm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  livingRooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  kitchens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  otherRooms?: number;

  @IsOptional()
  @IsBoolean()
  hasStaircase?: boolean;

  @IsOptional()
  @IsString()
  buildingType?: string;
}

export class SetConsultationPreferencesDto {
  @IsOptional()
  @IsString()
  text?: string;
}

export class AddConsultationToCartDto {
  @IsIn(['ECONOMIC', 'STANDARD', 'PROFESSIONAL'])
  tier: 'ECONOMIC' | 'STANDARD' | 'PROFESSIONAL';
}

export class CreateConsultantItemRuleDto {
  @IsString()
  itemKey: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxQuantity?: number;

  @IsOptional()
  @IsString()
  priorityBrandIds?: string;

  @IsOptional()
  allowedProductIdsJson?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateConsultantItemRuleDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxQuantity?: number;

  @IsOptional()
  @IsString()
  priorityBrandIds?: string;

  @IsOptional()
  allowedProductIdsJson?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
