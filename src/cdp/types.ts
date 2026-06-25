/**
 * The seam between "how we talk to the browser" and "what we do with the page".
 *
 * Domains and the TradingView adapter depend ONLY on {@link PageDriver}, never
 * on chrome-remote-interface directly. That keeps the adapter unit-testable
 * with a fake driver and makes the transport swappable.
 */

export interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export interface ScreenshotOptions {
  format?: "png" | "jpeg";
  /** JPEG quality 0-100 (ignored for png). */
  quality?: number;
  /** Capture only this region (CSS pixels). */
  clip?: { x: number; y: number; width: number; height: number; scale?: number };
}

export interface Viewport {
  width: number;
  height: number;
}

/** Named keys glasstape knows how to press. */
export type NamedKey =
  | "Enter"
  | "Escape"
  | "Backspace"
  | "Tab"
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight";

export interface PageDriver {
  /** Whether a live connection currently exists. */
  readonly connected: boolean;
  /** Evaluate a JS expression in the page and return its (JSON-serialisable) value. */
  evaluate<T = unknown>(expression: string, opts?: { timeoutMs?: number }): Promise<T>;
  /** Capture a screenshot, returning base64-encoded image data. */
  screenshot(opts?: ScreenshotOptions): Promise<string>;
  /** Insert literal text as if typed (used for symbol/Pine entry). */
  typeText(text: string): Promise<void>;
  /** Press a single named key. */
  pressKey(key: NamedKey): Promise<void>;
  /** Click at viewport coordinates (CSS pixels). */
  clickAt(x: number, y: number): Promise<void>;
  /** Press a single character key with optional modifiers (e.g. Alt+H for drawings). */
  pressShortcut(key: string, modifiers?: KeyModifiers): Promise<void>;
  /** Drag the mouse from one point to another (used to draw trend lines). */
  drag(x1: number, y1: number, x2: number, y2: number): Promise<void>;
  /** Current inner viewport size. */
  viewport(): Promise<Viewport>;
}

export interface KeyModifiers {
  alt?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
}
