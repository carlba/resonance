import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { MAX_SEARCH_QUERY_LENGTH, trimString } from '../utils/search-query.js';

export class SearchAlbumsQueryDto {
  // Trimmed first, so a query of only whitespace counts as empty.
  @Transform(trimString)
  @IsString()
  @Length(1, MAX_SEARCH_QUERY_LENGTH)
  // oxlint-disable-next-line id-length -- `q` is the public query parameter name.
  q: string;
}
