import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

// Letters, digits, `-` and `_` only: the URL-safe base64 alphabet, without padding.
const BASE64_URL = /^[A-Za-z0-9_-]+$/;

/** Path parameters of `DELETE /downloads/:username/:directory`. */
export class DeleteDownloadParamsDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  /** The group's remote folder, base64url-encoded, since it is full of path separators. */
  @IsString()
  @Matches(BASE64_URL, { message: 'directory must be base64url-encoded' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/=+$/, '') : value))
  directory: string;
}

/** Decodes the `directory` parameter back into the folder path. */
export function decodeDirectory(encodedDirectory: string): string {
  return Buffer.from(encodedDirectory, 'base64url').toString('utf8');
}
