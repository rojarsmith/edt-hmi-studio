# Marketing assets

Launch teaser ads for the November 2026 release. English copy, aimed to pass the
"grandma test" — anyone should understand it.

| File | What it is |
|---|---|
| `edt-hmi-studio-teaser-a4.docx` | Print ad, landscape A4, brand-green palette |
| `edt-hmi-studio-teaser-a4-vivid.docx` | Same layout, vivid multicolor palette |
| `edt-hmi-studio-teaser.pptx` | Two-slide deck (A4 landscape): teaser + "coming soon" page with real app screenshots |

All artwork (hero illustration, icons, shape strips) is generated SVG→PNG — no
stock assets. The logo is read from `src/assets/edt-logo.png`.

## Regenerating

Everything is script-generated; edit the generator, don't hand-edit the binaries.
Run from `generator/` so relative paths resolve:

```bash
cd docs/marketing/generator
npm install --no-save docx pptxgenjs sharp puppeteer-core   # sharp is already a repo dependency
node make_art.js            # green-palette artwork (hero.png, icon-*.png, shapes.png)
node make_art_vivid.js      # vivid-palette artwork (hero-vivid.png, ...)
node make_teaser_v2.js      # -> ../edt-hmi-studio-teaser-a4.docx
node make_teaser_vivid.js   # -> ../edt-hmi-studio-teaser-a4-vivid.docx
node make_pptx.js           # -> ../edt-hmi-studio-teaser.pptx (needs shot-*.png)
```

### App screenshots (`shot-*.png`)

`take_shots6.js` captures them headlessly with `puppeteer-core` + system Chrome
(path at the top of the script — adjust for your machine). Start the dev server
(`npm run dev`) first, then:

```bash
node take_shots6.js
```

It loads the STM32F746 Modbus demo project, builds a small logic graph
(Event Trigger → If/Else → Set Property / Write Tag) so the Logic view isn't
empty, and dismisses toasts before shooting. The splash shot uses
`?splash-hold` plus `prefers-reduced-motion` emulation so the shape animation
renders in its finished state. Committed shots are checked in, so this step is
only needed when the UI changes.

Palette constants sit at the top of each `make_art*.js` / `make_teaser*.js` /
`make_pptx.js` — copy tweaks (date, tagline, card text) are one-line edits.
