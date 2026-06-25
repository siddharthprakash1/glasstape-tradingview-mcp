import { z } from "zod";
import { defineTool } from "../mcp/registry.js";

/** Screenshot tool. */

export const screenshot = defineTool({
  name: "screenshot",
  description:
    "Capture a screenshot of the TradingView window and return it as an image. Optionally clip to a region.",
  input: {
    format: z.enum(["png", "jpeg"]).default("png").describe("Image format."),
    quality: z.number().int().min(1).max(100).optional().describe("JPEG quality (ignored for png)."),
    region: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .optional()
      .describe("Optional clip region in CSS pixels."),
  },
  handler: async (ctx, args) => {
    const base64 = await ctx.tv.screenshot({
      format: args.format,
      quality: args.quality,
      clip: args.region,
    });
    return {
      text: `Captured ${args.format} screenshot${args.region ? " (clipped)" : ""}.`,
      image: { base64, mimeType: args.format === "jpeg" ? "image/jpeg" : "image/png" },
    };
  },
});

export const captureTools = [screenshot];
