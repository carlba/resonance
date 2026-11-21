import { sleep } from './sleep.js';

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves once the time has passed, not before', async () => {
    const onResolved = vi.fn();
    const sleeping = sleep(1000).then(onResolved);

    await vi.advanceTimersByTimeAsync(999);
    expect(onResolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await sleeping;
    expect(onResolved).toHaveBeenCalledOnce();
  });
});
