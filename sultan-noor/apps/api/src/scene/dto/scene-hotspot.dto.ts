import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSceneHotspotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  icon?: string;

  @IsNumber()
  positionX: number;

  @IsNumber()
  positionY: number;

  @IsNumber()
  positionZ: number;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsString()
  productId: string;
}

export class UpdateSceneHotspotDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  icon?: string;

  @IsOptional()
  @IsNumber()
  positionX?: number;

  @IsOptional()
  @IsNumber()
  positionY?: number;

  @IsOptional()
  @IsNumber()
  positionZ?: number;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  productId?: string;
}
