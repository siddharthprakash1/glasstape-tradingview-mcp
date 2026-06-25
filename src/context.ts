import { CdpClient } from "./cdp/client.js";
import { loadConfig, type GlasstapeConfig } from "./config.js";
import { TvAdapter } from "./tv/adapter.js";
import { PineController } from "./tv/pine.js";

/**
 * The shared context handed to every tool and CLI command. Owns the single CDP
 * connection and the TradingView controllers built on top of it.
 */
export interface GlasstapeContext {
  cfg: GlasstapeConfig;
  cdp: CdpClient;
  tv: TvAdapter;
  pine: PineController;
}

export function createContext(overrides: Partial<GlasstapeConfig> = {}): GlasstapeContext {
  const cfg = loadConfig(overrides);
  const cdp = new CdpClient(cfg);
  return {
    cfg,
    cdp,
    tv: new TvAdapter(cdp),
    pine: new PineController(cdp),
  };
}
