import { IsOptional, IsString } from 'class-validator';

export class CreateCustomerGroupDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
