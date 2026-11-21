import { formatAudioQuality, formatBytes, formatDuration, formatSpeed } from './format.ts';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1500, '1.5 kB'],
    [4_200_000, '4.2 MB'],
    [1_230_000_000, '1.2 GB'],
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatSpeed', () => {
  it('formats bytes per second', () => {
    expect(formatSpeed(1_500_000)).toBe('1.5 MB/s');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [65, '1:05'],
    [599.6, '10:00'],
    [3723, '1:02:03'],
  ])('formats %d seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it('shows a dash for an unknown duration', () => {
    expect(formatDuration(undefined)).toBe('–');
  });
});

describe('formatAudioQuality', () => {
  it('joins the known facts', () => {
    expect(formatAudioQuality({ bitDepth: 24, sampleRate: 96_000, bitRate: 4608 })).toBe(
      '24 bit · 96 kHz · 4,608 kbps'
    );
  });

  it('marks a variable bitrate', () => {
    expect(formatAudioQuality({ bitRate: 245, isVariableBitRate: true })).toBe('245 kbps VBR');
  });

  it('shows a dash when nothing is known', () => {
    expect(formatAudioQuality({})).toBe('–');
  });
});
