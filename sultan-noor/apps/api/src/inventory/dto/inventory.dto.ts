import { IsOptional, IsString } from 'class-validator';

export class RejectReorderRecommendationDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
