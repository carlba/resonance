import { Transform, type TransformFnParams } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const MAX_QUERY_LENGTH = 200;

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SearchTracksQueryDto {
  // Trimmed first, so a query of only whitespace counts as empty.
  @Transform(trimString)
  @IsString()
  @Length(1, MAX_QUERY_LENGTH)
  // oxlint-disable-next-line id-length -- `q` is the public query parameter name.
  q: string;
}
