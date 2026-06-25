# glasstape landing page

`index.html` is a **self-contained design prototype** of the glasstape landing
page — open it directly in a browser, no build step.

It establishes the visual direction: a dark-terminal base, an animated
multi-hue gradient field, Apple "Liquid Glass" surfaces, a liquid-metal
wordmark, and a live hero (a glass terminal that types a command and draws the
chart in response). It honours Apple's Human Interface Guidelines for the glass
material, including the `prefers-reduced-transparency`, `prefers-contrast`, and
`prefers-reduced-motion` accessibility modes.

## Prototype vs. production

The prototype approximates the target libraries with pure CSS/Canvas so it can
ship as one file. The production site is intended to wire in the real ones:

- **[react-three-fiber](https://github.com/pmndrs/react-three-fiber)** — one persistent 3D canvas as the page background.
- **[ShaderGradient](https://github.com/ruucm/shadergradient)** (`@shadergradient/react`) — the animated gradient.
- **[@paper-design/shaders-react](https://github.com/paper-design/liquid-logo)** — the `<LiquidMetal>` wordmark.
- **[liquid-glass-js](https://github.com/dashersw/liquid-glass-js)** — real refraction for the hero hotspots (nav + primary CTA); CSS `backdrop-filter` glass everywhere else for performance.

Performance principle: **one hero "wow," cheap glass below** — avoid running
multiple expensive WebGL/`html2canvas` contexts across the whole page.
