// Soulseek paths come from Windows and Unix shares alike, so both separators occur.
const PATH_SEPARATOR = /[\\/]/;

const YEAR = String.raw`(?:19|20)\d{2}`;

// `Artist - 1999 - Album`
const ARTIST_YEAR_ALBUM = new RegExp(
  String.raw`^(?<artist>.+?)\s+-\s+(?<year>${YEAR})\s+-\s+(?<album>.+)$`
);
// `Artist - Album`, the album possibly ending in a year (see ALBUM_WITH_TRAILING_YEAR).
const ARTIST_ALBUM = /^(?<artist>.+?)\s+-\s+(?<album>.+)$/;
// `Album (1999)` or `Album [1999]`
const ALBUM_WITH_TRAILING_YEAR = new RegExp(
  String.raw`^(?<album>.+?)\s*[([](?<year>${YEAR})[)\]]$`
);
// `1999 - Album`, used below an artist folder.
const YEAR_DASH_ALBUM = new RegExp(String.raw`^(?<year>${YEAR})\s+-\s+(?<album>.+)$`);

// Soulseek share roots look like `@@abcde`; they name the share, not an artist.
const SHARE_ROOT_PREFIX = '@@';

// Folders that commonly hold a collection rather than one artist's albums, so they are never taken
// as the artist in an `.../Artist/Album` layout.
const COLLECTION_FOLDER_NAMES: ReadonlySet<string> = new Set([
  'albums',
  'downloads',
  'flac',
  'mp3',
  'music',
  'share',
  'shared',
]);

/** The artist, album and year read from an album's directory name. */
export interface AlbumTitleGuess {
  artist?: string;
  album: string;
  year?: number;
}

/** Splits a trailing `(1999)` or `[1999]` off an album name. */
function splitTrailingYear(name: string): AlbumTitleGuess {
  const groups = ALBUM_WITH_TRAILING_YEAR.exec(name)?.groups;
  return groups ? { album: groups.album, year: Number(groups.year) } : { album: name };
}

function isArtistFolder(name: string | undefined): name is string {
  return (
    name !== undefined &&
    name !== '' &&
    !name.startsWith(SHARE_ROOT_PREFIX) &&
    !COLLECTION_FOLDER_NAMES.has(name.toLowerCase())
  );
}

/** Reads an album name, optionally with a year, that sits below an artist folder. */
function guessAlbumBelowArtist(name: string, artist: string): AlbumTitleGuess {
  const groups = YEAR_DASH_ALBUM.exec(name)?.groups;
  if (groups) {
    return { artist, album: groups.album, year: Number(groups.year) };
  }
  return { artist, ...splitTrailingYear(name) };
}

/**
 * Guesses the artist, album and year of an album from its directory path, e.g.
 * `Artist - Album (1999)`, `Artist - 1999 - Album` or `.../Artist/Album`. Falls back to the
 * directory name as the album, without an artist, when none of these patterns fits.
 */
export function guessAlbumTitle(directoryPath: string): AlbumTitleGuess {
  const segments = directoryPath.split(PATH_SEPARATOR).filter(segment => segment !== '');
  const name = segments.at(-1)?.trim() ?? '';
  const parentName = segments.at(-2)?.trim();

  const artistYearAlbum = ARTIST_YEAR_ALBUM.exec(name)?.groups;
  if (artistYearAlbum) {
    return {
      artist: artistYearAlbum.artist,
      album: artistYearAlbum.album,
      year: Number(artistYearAlbum.year),
    };
  }

  // `1999 - Album` would otherwise be read as artist `1999`.
  const isYearFirst = YEAR_DASH_ALBUM.test(name);
  const artistAlbum = isYearFirst ? undefined : ARTIST_ALBUM.exec(name)?.groups;
  if (artistAlbum) {
    return { artist: artistAlbum.artist, ...splitTrailingYear(artistAlbum.album) };
  }

  if (isArtistFolder(parentName)) {
    return guessAlbumBelowArtist(name, parentName);
  }

  return { album: name };
}
