import { IsArray, IsString, ArrayMaxSize } from 'class-validator';

export class SelectCalendarsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  calendarIds: string[];
}
