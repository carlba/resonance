import type { TransformFnParams } from 'class-transformer';

/** The longest search text the search endpoints accept. */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/** A `class-transformer` `@Transform` function that trims strings and leaves other values alone. */
export function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
