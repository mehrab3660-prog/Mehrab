import { IsOptional, IsString } from 'class-validator';

export class AskAdvisorDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsString()
  message: string;
}

export class StaffReplyDto {
  @IsString()
  message: string;
}
