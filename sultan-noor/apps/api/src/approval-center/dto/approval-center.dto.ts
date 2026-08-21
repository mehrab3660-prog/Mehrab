import { IsOptional, IsString } from 'class-validator';

export class RejectApprovalItemDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
