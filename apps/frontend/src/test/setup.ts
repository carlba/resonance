import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { toast } from 'sonner';

// Radix Select calls pointer capture and scrolling APIs that jsdom doesn't implement.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

// Radix Tooltip measures its arrow with a ResizeObserver, which jsdom doesn't implement.
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// sonner's Toaster reads the color scheme through matchMedia, which jsdom doesn't implement.
window.matchMedia = query => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

afterEach(() => {
  cleanup();
  // The toast store is global, so a toast would otherwise show up in the next test.
  toast.dismiss();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
