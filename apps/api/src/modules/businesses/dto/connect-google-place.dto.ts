import { IsString, MinLength } from 'class-validator';

export class ConnectGooglePlaceDto {
  @IsString()
  @MinLength(1)
  placeId: string;
}
