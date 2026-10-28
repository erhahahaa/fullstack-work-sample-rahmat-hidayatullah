import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

afterEach(() => {
  cleanup();
});

type ObserveCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

export const resizeObserverInstances: ResizeObserver[] = [];

function createEntry(target: Element): ResizeObserverEntry {
  const rect = target.getBoundingClientRect();

  return {
    target,
    contentRect: rect,
    borderBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
    contentBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
    devicePixelContentBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
  };
}

class ResizeObserverPolyfill implements ResizeObserver {
  private readonly callback: ObserveCallback;

  constructor(callback: ObserveCallback) {
    this.callback = callback;
    resizeObserverInstances.push(this);
  }

  observe(target: Element): void {
    this.callback([createEntry(target)], this);
  }

  unobserve(): void {}

  disconnect(): void {
    const index = resizeObserverInstances.indexOf(this);

    if (index >= 0) {
      resizeObserverInstances.splice(index, 1);
    }
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverPolyfill;
}

if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    window.setTimeout(() => {
      callback(performance.now());
    }, 16);

  globalThis.cancelAnimationFrame = (handle: number): void => {
    window.clearTimeout(handle);
  };
}
