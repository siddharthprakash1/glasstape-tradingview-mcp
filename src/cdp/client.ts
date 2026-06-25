import CDP from "chrome-remote-interface";
import type { GlasstapeConfig } from "../config.js";
import { GlasstapeError, toGlasstapeError } from "../util/errors.js";
import { log } from "../util/logger.js";
import { withRetry } from "../util/retry.js";
import type {
  CdpTarget,
  KeyModifiers,
  NamedKey,
  PageDriver,
  ScreenshotOptions,
  Viewport,
} from "./types.js";

/** Windows virtual key codes for the named keys we support. */
const KEY_CODES: Record<NamedKey, { code: string; vk: number }> = {
  Enter: { code: "Enter", vk: 13 },
  Escape: { code: "Escape", vk: 27 },
  Backspace: { code: "Backspace", vk: 8 },
  Tab: { code: "Tab", vk: 9 },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  ArrowDown: { code: "ArrowDown", vk: 40 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
};

/**
 * Live CDP connection to a TradingView Desktop (Electron) window.
 *
 * Pure transport: it discovers the TradingView target among Electron pages,
 * connects with retry/backoff, and exposes evaluate/screenshot/input. It knows
 * nothing about TradingView's DOM — that lives in the adapter layer.
 */
export class CdpClient implements PageDriver {
  private client: CDP.Client | undefined;
  private target: CdpTarget | undefined;

  constructor(private readonly cfg: GlasstapeConfig) {}

  get connected(): boolean {
    return this.client !== undefined;
  }

  get targetInfo(): CdpTarget | undefined {
    return this.target;
  }

  /** List all DevTools targets exposed on the debug port. */
  async listTargets(): Promise<CdpTarget[]> {
    try {
      const targets = await CDP.List({ host: this.cfg.host, port: this.cfg.port });
      return targets as unknown as CdpTarget[];
    } catch (e) {
      throw new GlasstapeError(
        "CDP_CONNECT_FAILED",
        `Could not reach Chrome DevTools at ${this.cfg.host}:${this.cfg.port}.`,
        {
          hint:
            "Launch TradingView Desktop with --remote-debugging-port=" +
            `${this.cfg.port} (see scripts/), then run \`glasstape health\`.`,
          cause: e,
        },
      );
    }
  }

  /** Choose the TradingView page from a list of targets. Exported logic for tests. */
  pickTarget(targets: CdpTarget[]): CdpTarget | undefined {
    const pages = targets.filter((t) => t.type === "page");
    const matchers = this.cfg.targetMatchers.map((m) => m.toLowerCase());
    const matched = pages.find((t) => {
      const hay = `${t.url ?? ""} ${t.title ?? ""}`.toLowerCase();
      return matchers.some((m) => hay.includes(m));
    });
    return matched ?? pages[0];
  }

  /** Connect to the TradingView target (idempotent). */
  async connect(): Promise<void> {
    if (this.client) return;
    const targets = await this.listTargets();
    const target = this.pickTarget(targets);
    if (!target) {
      throw new GlasstapeError("TV_TARGET_NOT_FOUND", "No browser page found among DevTools targets.", {
        hint: "Open a chart in TradingView Desktop, then retry.",
      });
    }

    const client = await withRetry(
      () => CDP({ target: target.id, host: this.cfg.host, port: this.cfg.port }),
      { attempts: 3, baseMs: 250 },
    );

    await Promise.all([client.Runtime.enable(), client.Page.enable()]);
    client.on("disconnect", () => {
      this.client = undefined;
      log.warn("CDP connection dropped; will reconnect on next call.");
    });

    this.client = client;
    this.target = target;
    log.info(`connected to "${target.title}" (${target.url})`);
  }

  /** Ensure a connection exists, reconnecting transparently if it dropped. */
  async ensureConnected(): Promise<void> {
    if (!this.client) await this.connect();
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        /* ignore */
      }
      this.client = undefined;
    }
  }

  private requireClient(): CDP.Client {
    if (!this.client) {
      throw new GlasstapeError("CDP_NOT_CONNECTED", "Not connected to TradingView.", {
        hint: "Run `glasstape health` or call connect() first.",
      });
    }
    return this.client;
  }

  async evaluate<T = unknown>(expression: string, opts?: { timeoutMs?: number }): Promise<T> {
    await this.ensureConnected();
    const client = this.requireClient();
    const timeoutMs = opts?.timeoutMs ?? this.cfg.evalTimeoutMs;
    try {
      const { result, exceptionDetails } = await client.Runtime.evaluate({
        expression,
        awaitPromise: true,
        returnByValue: true,
        timeout: timeoutMs,
      });
      if (exceptionDetails) {
        const text =
          exceptionDetails.exception?.description ??
          exceptionDetails.text ??
          "evaluation threw";
        throw new GlasstapeError("EVAL_FAILED", `Page evaluation failed: ${text}`);
      }
      return result.value as T;
    } catch (e) {
      throw toGlasstapeError(e, "EVAL_FAILED");
    }
  }

  async screenshot(opts: ScreenshotOptions = {}): Promise<string> {
    await this.ensureConnected();
    const client = this.requireClient();
    const params: Record<string, unknown> = {
      format: opts.format ?? "png",
      captureBeyondViewport: false,
    };
    if (opts.format === "jpeg" && opts.quality !== undefined) params.quality = opts.quality;
    if (opts.clip) params.clip = { ...opts.clip, scale: opts.clip.scale ?? 1 };
    const { data } = await client.Page.captureScreenshot(params as never);
    return data;
  }

  async viewport(): Promise<Viewport> {
    return this.evaluate<Viewport>(
      "(() => ({ width: window.innerWidth, height: window.innerHeight }))()",
    );
  }

  async typeText(text: string): Promise<void> {
    await this.ensureConnected();
    const client = this.requireClient();
    await client.Input.insertText({ text });
  }

  async pressKey(key: NamedKey): Promise<void> {
    await this.ensureConnected();
    const client = this.requireClient();
    const { code, vk } = KEY_CODES[key];
    const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await client.Input.dispatchKeyEvent({ type: "rawKeyDown", ...base } as never);
    await client.Input.dispatchKeyEvent({ type: "keyUp", ...base } as never);
  }

  async clickAt(x: number, y: number): Promise<void> {
    await this.ensureConnected();
    const client = this.requireClient();
    const common = { x, y, button: "left" as const, clickCount: 1 };
    await client.Input.dispatchMouseEvent({ type: "mousePressed", ...common } as never);
    await client.Input.dispatchMouseEvent({ type: "mouseReleased", ...common } as never);
  }

  async pressShortcut(key: string, modifiers: KeyModifiers = {}): Promise<void> {
    await this.ensureConnected();
    const client = this.requireClient();
    let mask = 0;
    if (modifiers.alt) mask |= 1;
    if (modifiers.ctrl) mask |= 2;
    if (modifiers.meta) mask |= 4;
    if (modifiers.shift) mask |= 8;
    const upper = key.toUpperCase();
    const base = {
      modifiers: mask,
      key,
      code: `Key${upper}`,
      windowsVirtualKeyCode: upper.charCodeAt(0),
    };
    await client.Input.dispatchKeyEvent({ type: "keyDown", ...base } as never);
    await client.Input.dispatchKeyEvent({ type: "keyUp", ...base } as never);
  }

  async drag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    await this.ensureConnected();
    const client = this.requireClient();
    const left = { button: "left" as const, clickCount: 1 };
    await client.Input.dispatchMouseEvent({ type: "mousePressed", x: x1, y: y1, ...left } as never);
    await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: (x1 + x2) / 2, y: (y1 + y2) / 2 } as never);
    await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: x2, y: y2 } as never);
    await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: x2, y: y2, ...left } as never);
  }
}
