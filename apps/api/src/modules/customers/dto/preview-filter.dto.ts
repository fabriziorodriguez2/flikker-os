import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

const VALID_MODES = [
  'all',
  'by-origin',
  'birthday-month',
  'no-review',
  'not-attended-30d',
] as const;
export type FilterPreviewMode = (typeof VALID_MODES)[number];

const VALID_ORIGINS = ['qr', 'whatsapp', 'manual'] as const;

export class PreviewFilterDto {
  @IsIn(VALID_MODES)
  mode!: FilterPreviewMode;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(VALID_ORIGINS, { each: true })
  origins?: string[];
}
