import { guessAlbumTitle } from './album-title.js';

describe('guessAlbumTitle', () => {
  it.each([
    [
      'Artist - Album (Year)',
      '@@share\\Music\\Daft Punk - Discovery (2001)',
      { artist: 'Daft Punk', album: 'Discovery', year: 2001 },
    ],
    [
      'Artist - Album [Year]',
      'music/Daft Punk - Discovery [2001]',
      { artist: 'Daft Punk', album: 'Discovery', year: 2001 },
    ],
    [
      'Artist - Year - Album',
      '@@share\\Music\\Daft Punk - 1997 - Homework',
      { artist: 'Daft Punk', album: 'Homework', year: 1997 },
    ],
    [
      'Artist - Album',
      '@@share\\Music\\Daft Punk - Discovery',
      { artist: 'Daft Punk', album: 'Discovery' },
    ],
    [
      'Artist - Album with dashes',
      'Music/Daft Punk - Alive 2007 - Live',
      { artist: 'Daft Punk', album: 'Alive 2007 - Live' },
    ],
    [
      'Artist/Album',
      '@@share\\Music\\Daft Punk\\Discovery',
      { artist: 'Daft Punk', album: 'Discovery' },
    ],
    [
      'Artist/Album (Year)',
      'music/Daft Punk/Discovery (2001)',
      { artist: 'Daft Punk', album: 'Discovery', year: 2001 },
    ],
    [
      'Artist/Year - Album',
      'music/Daft Punk/1997 - Homework',
      { artist: 'Daft Punk', album: 'Homework', year: 1997 },
    ],
    [
      'a trailing separator',
      'music/Daft Punk/Discovery/',
      { artist: 'Daft Punk', album: 'Discovery' },
    ],
  ])('reads %s', (_pattern, directoryPath, expected) => {
    expect(guessAlbumTitle(directoryPath)).toEqual(expected);
  });

  it.each([
    ['below a share root', '@@share\\Discovery (2001)', { album: 'Discovery (2001)' }],
    ['below a collection folder', '@@share\\Music\\Discovery', { album: 'Discovery' }],
    ['below a lowercase collection folder', 'shared/flac/Discovery', { album: 'Discovery' }],
    ['without a parent', 'Discovery', { album: 'Discovery' }],
    ['with a year first and no artist', 'Music\\1997 - Homework', { album: '1997 - Homework' }],
    ['that is empty', '', { album: '' }],
  ])('falls back to the directory name as the album for a name %s', (_case, path, expected) => {
    expect(guessAlbumTitle(path)).toEqual(expected);
  });
});
