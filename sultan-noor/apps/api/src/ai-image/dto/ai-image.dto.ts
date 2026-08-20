import { IsOptional, IsString } from 'class-validator';

export class RejectImageDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
