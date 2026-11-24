import { parsePollInterval } from './poll-interval.ts';

describe('parsePollInterval', () => {
  it('reads the interval in milliseconds', () => {
    expect(parsePollInterval('5000')).toBe(5000);
  });

  it.each([undefined, '', 'soon', '1.5', '100', '-2000'])('falls back to 2000 for %j', value => {
    expect(parsePollInterval(value)).toBe(2000);
  });
});
