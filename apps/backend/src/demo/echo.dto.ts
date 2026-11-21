import { IsString, Length } from 'class-validator';

const MAX_MESSAGE_LENGTH = 200;

export class EchoDto {
  @IsString()
  @Length(1, MAX_MESSAGE_LENGTH)
  message: string;
}
