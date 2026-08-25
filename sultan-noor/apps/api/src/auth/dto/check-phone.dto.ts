import { IsPhoneNumber } from 'class-validator';

export class CheckPhoneDto {
  @IsPhoneNumber('IR')
  phone: string;
}
