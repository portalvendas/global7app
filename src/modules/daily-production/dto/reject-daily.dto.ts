import { IsString, MinLength } from 'class-validator';

export class RejectDailyDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
