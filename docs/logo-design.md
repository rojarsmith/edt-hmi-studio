# Logo Design

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/logo-design.md">繁體中文</a>
</p>

Design record for the EDT HMI Studio product logo. The assets live in
[`branding/`](../branding/); nothing in `src/` references them until a
variant is adopted. Designed 2026-08-17.

## 1. Concept

A rounded-square display panel framing three HMI widgets — a gauge
(arc + needle, top left), a vertical slider (right), and a horizontal
slider (bottom). It reads as *designing an interface on a display
panel*, which is literally what the product does, and the panel-as-frame
nods to EDT's display-manufacturing business.

The stroke-only geometric style continues the splash screen's visual
language (circle / square / triangle / hexagon draw-loop), so the
product surfaces feel like one family. Interactive elements (needle,
slider knobs) carry an accent color against the main stroke color.

## 2. Iteration notes

- **v1 — horizontal panel** (`logo-horizontal-green*.svg`): landscape
  screen with gauge + two horizontal sliders. Kept as a fallback; the
  square mark replaced it because app icons, favicons and avatar slots
  all want 1:1.
- **v2 first draft — gauge + toggle switch**: rejected. The two round
  shapes side by side over the bottom slider produced a face-pareidolia
  effect (eyes + mouth) that could not be unseen.
- **v2 final — gauge + vertical slider + horizontal slider**: breaks the
  symmetry, kills the face illusion, and shows three distinct widget
  types.

## 3. Color variants

| File | Main / accent | Character |
| --- | --- | --- |
| `logo-square-teal.svg` | `#0e7490` / `#06b6d4` | display-industry tech; strongest on both light and dark |
| `logo-square-indigo.svg` | `#3730a3` / `#6366f1` | developer-tool temperament |
| `logo-square-graphite.svg` | `#374151` / `#f97316` | industrial-instrument; frame is weak on dark, the orange carries it |
| `logo-square-green.svg` | `#285838` / `#4f9d68` | matches the EDT parent brand (sampled from the EDT blob logo) |

`branding/logo-preview.html` shows every variant on light and dark
backgrounds with a 128/64/32/16 px size ladder and a wordmark lockup.

## 4. Usage guidance

- Legible at 128–32 px; at 16 px the interior merges, so a favicon
  should use a simplified glyph (panel + gauge only) — not yet drawn.
- The wordmark is not outlined into the SVG. Pair the mark with
  "EDT HMI Studio" set in system-ui semibold, letter-spacing ~0.13em,
  exactly as the splash screen does.
- When a variant is adopted: favicon inlines into `index.html`;
  in-app usage copies the chosen file into `src/assets/`; the desktop
  icon converts to `.ico` under `desktop/` wired to NativeWebHost's
  `IconPath`. `branding/` always keeps every variant and this history.
