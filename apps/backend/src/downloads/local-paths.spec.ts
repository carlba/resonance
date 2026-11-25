import {
  checkDestinationPattern,
  getDownloadedFilePath,
  getFoldersToClean,
  getIncompleteFilePath,
} from './local-paths.js';

const DEFAULT_PATTERN = '${SOURCE_DIRECTORY}';
const REMOTE_FILE = '@@alice\\Music\\Daft Punk - Discovery (2001)\\01 - One More Time.flac';

describe('checkDestinationPattern', () => {
  it.each([
    '${SOURCE_DIRECTORY}',
    '${SOURCE_USERNAME}/${SOURCE_PATH}',
    '${source_username}/${Source_Directory}',
    '{}',
    'Music',
  ])('supports %s', pattern => {
    expect(checkDestinationPattern(pattern)).toEqual({ isSupported: true });
  });

  it.each(['${BATCH_ID}', '${BATCH_EXTERNAL_ID}', '${SEARCH_ID}', '${SEARCH_TEXT}'])(
    'does not support %s',
    token => {
      expect(checkDestinationPattern(`\${SOURCE_USERNAME}/${token}`)).toEqual({
        isSupported: false,
        unsupportedTokens: [token.slice(2, -1)],
      });
    }
  );

  it('does not support a token it does not know, and names each one once', () => {
    expect(checkDestinationPattern('${Foo}/${FOO}/${SOURCE_PATH}')).toEqual({
      isSupported: false,
      unsupportedTokens: ['FOO'],
    });
  });
});

describe('getDownloadedFilePath', () => {
  it('puts the file in the remote parent folder with the default pattern', () => {
    expect(getDownloadedFilePath(DEFAULT_PATTERN, 'alice', REMOTE_FILE)).toBe(
      'Daft Punk - Discovery (2001)/01 - One More Time.flac'
    );
  });

  it('resolves ${SOURCE_USERNAME} and ${SOURCE_PATH}, without the share root', () => {
    expect(getDownloadedFilePath('${SOURCE_USERNAME}/${SOURCE_PATH}', 'alice', REMOTE_FILE)).toBe(
      'alice/Music/Daft Punk - Discovery (2001)/01 - One More Time.flac'
    );
  });

  it('puts the file in the root of the downloads folder for {}', () => {
    expect(getDownloadedFilePath('{}', 'alice', REMOTE_FILE)).toBe('01 - One More Time.flac');
  });

  it('ignores the case of tokens', () => {
    expect(getDownloadedFilePath('${source_directory}', 'alice', 'Music\\Album\\01.flac')).toBe(
      'Album/01.flac'
    );
  });

  it('accepts slashes of either kind in the remote path and the pattern', () => {
    expect(getDownloadedFilePath('Music\\${SOURCE_USERNAME}', 'alice', 'a/b\\c.flac')).toBe(
      'Music/alice/c.flac'
    );
  });

  it('keeps each disc folder of a multi-disc album as the folder of its files', () => {
    expect(getDownloadedFilePath(DEFAULT_PATTERN, 'alice', 'Music\\Album\\CD1\\01.flac')).toBe(
      'CD1/01.flac'
    );
    expect(getDownloadedFilePath(DEFAULT_PATTERN, 'alice', 'Music\\Album\\CD2\\01.flac')).toBe(
      'CD2/01.flac'
    );
  });

  it('gives two albums with the same folder name one local folder with the default pattern', () => {
    const fromAlice = getDownloadedFilePath(DEFAULT_PATTERN, 'alice', 'Music\\Album\\01.flac');
    const fromBob = getDownloadedFilePath(DEFAULT_PATTERN, 'bob', 'Shared\\Rips\\Album\\01.flac');

    expect(fromAlice).toBe('Album/01.flac');
    expect(fromBob).toBe(fromAlice);
  });

  it('keeps those albums apart when the pattern has the username', () => {
    const pattern = '${SOURCE_USERNAME}/${SOURCE_DIRECTORY}';

    expect(getDownloadedFilePath(pattern, 'alice', 'Music\\Album\\01.flac')).toBe(
      'alice/Album/01.flac'
    );
    expect(getDownloadedFilePath(pattern, 'bob', 'Rips\\Album\\01.flac')).toBe('bob/Album/01.flac');
  });

  it('replaces the characters slskd replaces with an underscore', () => {
    expect(
      getDownloadedFilePath(DEFAULT_PATTERN, 'alice', 'Music\\Live: "Best?" <1>*\\01|a.flac')
    ).toBe('Live_ _Best__ _1__/01_a.flac');
  });

  it('replaces characters of a username used in the pattern', () => {
    expect(getDownloadedFilePath('${SOURCE_USERNAME}', 'a:b*c', 'Music\\Album\\01.flac')).toBe(
      'a_b_c/01.flac'
    );
  });

  it('sanitizes a folder name that is only dots', () => {
    expect(getDownloadedFilePath(DEFAULT_PATTERN, 'alice', 'Music\\..\\01.flac')).toBe('_/01.flac');
  });

  it('uses the root when the remote path has no parent folder', () => {
    expect(getDownloadedFilePath(DEFAULT_PATTERN, 'alice', '01.flac')).toBe('01.flac');
    expect(getDownloadedFilePath(DEFAULT_PATTERN, 'alice', '@@alice\\01.flac')).toBe('01.flac');
  });

  it('keeps a drive letter as a folder once sanitized, like slskd does', () => {
    expect(getDownloadedFilePath('${SOURCE_PATH}', 'alice', 'C:\\Music\\Album\\01.flac')).toBe(
      'C_/Music/Album/01.flac'
    );
  });

  it('has no path for a remote path without a file name', () => {
    expect(getDownloadedFilePath(DEFAULT_PATTERN, 'alice', '')).toBeUndefined();
    expect(getDownloadedFilePath(DEFAULT_PATTERN, 'alice', 'Music\\Album\\')).toBeUndefined();
    expect(getDownloadedFilePath(DEFAULT_PATTERN, 'alice', '@@alice\\')).toBeUndefined();
  });
});

describe('getIncompleteFilePath', () => {
  it('is the user, the remote folder without the share root, and the file name', () => {
    expect(getIncompleteFilePath('alice', REMOTE_FILE)).toBe(
      'alice/Music/Daft Punk - Discovery (2001)/01 - One More Time.flac'
    );
  });

  it('strips a drive from the raw remote path, unlike the destination pattern', () => {
    expect(getIncompleteFilePath('alice', 'C:\\Music\\Album\\01.flac')).toBe(
      'alice/Music/Album/01.flac'
    );
  });

  it('sanitizes the username and every segment', () => {
    expect(getIncompleteFilePath('a:b', 'Music\\Live?\\01*.flac')).toBe('a_b/Music/Live_/01_.flac');
  });

  it('is only the user and the file name when the remote path has no folder', () => {
    expect(getIncompleteFilePath('alice', '01.flac')).toBe('alice/01.flac');
  });

  it('has no path for a remote path without a file name', () => {
    expect(getIncompleteFilePath('alice', 'Music\\Album\\')).toBeUndefined();
  });
});

describe('getFoldersToClean', () => {
  it('lists every folder up to the top one, deepest first', () => {
    expect(getFoldersToClean(['alice/Music/Album/01.flac'])).toEqual([
      'alice/Music/Album',
      'alice/Music',
      'alice',
    ]);
  });

  it('lists a shared folder once, after the folders inside it', () => {
    expect(
      getFoldersToClean(['Album/CD1/01.flac', 'Album/CD1/02.flac', 'Album/CD2/01.flac'])
    ).toEqual(['Album/CD1', 'Album/CD2', 'Album']);
  });

  it('never lists the root, so a file in the root asks for nothing', () => {
    expect(getFoldersToClean(['01.flac', '02.flac'])).toEqual([]);
  });

  it('asks for nothing when there are no files', () => {
    expect(getFoldersToClean([])).toEqual([]);
  });
});
