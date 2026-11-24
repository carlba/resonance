import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** The most files one request may download; a large album with scans and logs stays far below. */
export const MAX_FILES_PER_DOWNLOAD = 1000;

export class DownloadFileDto {
  @IsString()
  @IsNotEmpty()
  path: string;

  /** Size in bytes, as the search returned it. */
  @IsInt()
  @Min(0)
  size: number;
}

export class StartDownloadDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_FILES_PER_DOWNLOAD)
  @ValidateNested({ each: true })
  @Type(() => DownloadFileDto)
  files: DownloadFileDto[];
}
