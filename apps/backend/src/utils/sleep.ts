/**
 * Resolves after `milliseconds`. Built on the global `setTimeout` rather than
 * `node:timers/promises`, because Vitest's fake timers only replace the global one, and the tests
 * rely on them to run through polling without waiting.
 */
export function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
