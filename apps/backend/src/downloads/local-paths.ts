// Works out where slskd saves a download on disk. slskd's transfers only report the remote path,
// so this mirrors slskd's own rules (`DownloadService.DeriveDestination` and `FileSafety`, checked
// against its `master` branch). If slskd changes them, files are reported as already gone and stay
// on disk, so keep `local-paths.spec.ts` in line with slskd's behavior.
//
// Every path returned here is relative to the folder it belongs to (slskd's downloads or incomplete
// folder) and uses `/` as separator, which slskd's Files API accepts on every platform.

const SEPARATOR = '/';
const REPLACEMENT = '_';
const EMPTY_PATTERN = '{}';

// slskd's InvalidFileNameCharactersOnWindows. They are replaced on every platform here, since the
// pattern's `:`, `?` and `*` must give the same local path as on a Windows slskd.
// oxlint-disable-next-line no-control-regex -- control characters are part of the invalid set
const INVALID_SEGMENT_CHARACTERS = /["<>|:*?\\/\u0000-\u001f]/g;
const SEPARATORS = /[\\/]/;
const TRAILING_SEPARATORS = /[\\/]+$/;

// A drive (`C:\`), a UNC share (`\\server\`) or a SoulseekQt share prefix (`@@abcde\`) at the start
// of a path. slskd strips them when it takes the directory of a file, but keeps them in a path it
// has sanitized first, since sanitizing turns `C:` into `C_`.
const PATH_ROOTS = [/^[a-zA-Z]:[\\/]?/, /^[\\/]{2}[^\\/]+[\\/]?/, /^@@[a-zA-Z0-9]{5,}[\\/]?/];

const TOKEN = /\$\{([^{}]*)\}/gi;

const SOURCE_USERNAME_TOKEN = 'SOURCE_USERNAME';
const SOURCE_PATH_TOKEN = 'SOURCE_PATH';
const SOURCE_DIRECTORY_TOKEN = 'SOURCE_DIRECTORY';
const SUPPORTED_TOKENS: readonly string[] = [
  SOURCE_USERNAME_TOKEN,
  SOURCE_PATH_TOKEN,
  SOURCE_DIRECTORY_TOKEN,
];

/** What a destination pattern asks for, and whether resonance can follow it. */
export type DestinationPatternSupport =
  { isSupported: true } | { isSupported: false; unsupportedTokens: string[] };

/**
 * Whether every `${TOKEN}` of the pattern is one resonance can resolve from a transfer alone.
 * `${BATCH_ID}`, `${SEARCH_TEXT}` and the like depend on how the download was started, and slskd
 * doesn't report that with the transfer.
 */
export function checkDestinationPattern(pattern: string): DestinationPatternSupport {
  const unsupportedTokens = [...pattern.matchAll(TOKEN)]
    .map(([, name]) => name.toUpperCase())
    .filter(name => !SUPPORTED_TOKENS.includes(name));
  return unsupportedTokens.length === 0
    ? { isSupported: true }
    : { isSupported: false, unsupportedTokens: [...new Set(unsupportedTokens)] };
}

/** slskd's `SanitizePathSegment`: invalid characters become `_`, and `.` and `..` are replaced. */
function sanitizeSegment(segment: string): string {
  const sanitized = segment.replace(INVALID_SEGMENT_CHARACTERS, REPLACEMENT);
  return sanitized === '.' || sanitized === '..' ? REPLACEMENT : sanitized;
}

/** slskd's `SanitizePath`: `/`-separated, without empty segments, each segment sanitized. */
function sanitizePath(path: string): string {
  return path
    .split(SEPARATORS)
    .filter(segment => segment !== '')
    .map(sanitizeSegment)
    .filter(segment => segment !== '')
    .join(SEPARATOR);
}

function stripPathRoot(path: string): string {
  return PATH_ROOTS.reduce((remaining, root) => remaining.replace(root, ''), path);
}

function splitSegments(path: string): string[] {
  return path.split(SEPARATORS).filter(segment => segment !== '');
}

/**
 * slskd's `GetDirectoryNameSafely`: the parent folder of a path without its root, sanitized.
 * `undefined` when there is none, i.e. the path is a bare name or only a root and a name.
 */
function getParentDirectory(path: string): string | undefined {
  if (!SEPARATORS.test(path)) {
    return undefined;
  }
  const segments = splitSegments(stripPathRoot(path.replace(TRAILING_SEPARATORS, '')));
  return segments.length <= 1
    ? undefined
    : segments.slice(0, -1).map(sanitizeSegment).join(SEPARATOR);
}

/** slskd's `GetFileNameSafely`: the last segment of a path, sanitized. */
function getLastSegment(path: string): string | undefined {
  if (path === '' || TRAILING_SEPARATORS.test(path) || stripPathRoot(path) === '') {
    return undefined;
  }
  const lastSegment = path.split(SEPARATORS).at(-1);
  return lastSegment === undefined ? undefined : sanitizeSegment(lastSegment);
}

/** Replaces each token in one pass, so the value of one can't be mistaken for another. */
function fillPattern(pattern: string, values: Readonly<Record<string, string>>): string {
  return pattern.replace(TOKEN, (match, name: string) => values[name.toUpperCase()] ?? match);
}

/**
 * The sub-folder of slskd's downloads folder that `${...}` tokens in `pattern` resolve to for a
 * file of `remotePath`; `''` for the root. The pattern must be supported, see
 * {@link checkDestinationPattern}.
 */
function getDestinationDirectory(pattern: string, username: string, remotePath: string): string {
  if (pattern.toLowerCase() === EMPTY_PATTERN) {
    return '';
  }
  const sanitizedRemotePath = sanitizePath(remotePath);
  const sourcePath = (getParentDirectory(sanitizedRemotePath) ?? '').replace(
    TRAILING_SEPARATORS,
    ''
  );
  const values = {
    [SOURCE_USERNAME_TOKEN]: username.replace(INVALID_SEGMENT_CHARACTERS, REPLACEMENT),
    [SOURCE_PATH_TOKEN]: sourcePath,
    [SOURCE_DIRECTORY_TOKEN]: (getLastSegment(sourcePath) ?? '').replace(TRAILING_SEPARATORS, ''),
  };
  return sanitizePath(fillPattern(pattern, values));
}

function joinPath(segments: readonly (string | undefined)[]): string {
  return segments.filter(segment => segment !== undefined && segment !== '').join(SEPARATOR);
}

/**
 * Where slskd saves a finished download, relative to its downloads folder. `undefined` when the
 * remote path has no file name, which slskd can't have downloaded.
 */
export function getDownloadedFilePath(
  pattern: string,
  username: string,
  remotePath: string
): string | undefined {
  const fileName = getLastSegment(remotePath);
  return fileName === undefined
    ? undefined
    : joinPath([getDestinationDirectory(pattern, username, remotePath), fileName]);
}

/**
 * Where slskd keeps a partial download, relative to its incomplete folder: the user, then the
 * remote folder without its root, then the file name. `undefined` when the remote path has no
 * file name.
 */
export function getIncompleteFilePath(username: string, remotePath: string): string | undefined {
  const fileName = getLastSegment(remotePath);
  return fileName === undefined
    ? undefined
    : joinPath([sanitizeSegment(username), getParentDirectory(remotePath), fileName]);
}

/**
 * The folders a set of files lives in, each with its parents, deepest first, so removing them in
 * that order can empty a parent after its child. The root is `''` and never part of the result,
 * so a file in the root asks for nothing.
 */
export function getFoldersToClean(filePaths: readonly string[]): string[] {
  const folders = new Set<string>();
  for (const filePath of filePaths) {
    const segments = splitSegments(filePath).slice(0, -1);
    for (let depth = 1; depth <= segments.length; depth += 1) {
      folders.add(segments.slice(0, depth).join(SEPARATOR));
    }
  }
  return [...folders].toSorted((first, second) => depthOf(second) - depthOf(first));
}

function depthOf(folder: string): number {
  return splitSegments(folder).length;
}
