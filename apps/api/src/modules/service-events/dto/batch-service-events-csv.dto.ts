import { IsNotEmpty, IsString } from 'class-validator';

export class BatchServiceEventsCsvDto {
  @IsString()
  @IsNotEmpty()
  csv: string;
}
