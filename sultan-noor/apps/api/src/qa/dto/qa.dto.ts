import { IsString } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  productId: string;

  @IsString()
  body: string;
}

export class CreateAnswerDto {
  @IsString()
  body: string;
}
