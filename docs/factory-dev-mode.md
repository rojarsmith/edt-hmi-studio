# Factory Engineer Development Mode

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/factory-dev-mode.md">繁體中文</a>
</p>

**原廠人員研發模式** is a hidden runtime mode intended for EDT engineers. It is
unlocked from the About dialog and lasts only until the application is reloaded
or restarted.

> **This is not a security boundary.** The passphrase ships in the client bundle
> and is written down below. It exists to keep internal tooling out of the way
> of ordinary users, not to protect anything. Never gate a destructive action,
> a credential, or customer data behind it.

## How to unlock

1. Open **Help → About**. There is no toolbar button; the item exists only in
   the menu bar dropdown.
2. Click the developer's name — **Rojar Smith（吳斌）** — **five times**. The
   clicks must be within 2 seconds of each other, otherwise the run restarts.
3. An **Access code** field appears. Enter:

   ```
   edt321
   ```

4. On success the field closes and a **Factory Dev Mode** badge appears both in
   the About dialog and in the menu bar, next to the Web/Desktop badge. The UI
   updates immediately — no reload is needed.

A wrong code turns the field red and clears it; the mode is left off.

## Lifetime

The flag lives in `useAppStore().factoryDevMode` and is **held in memory only**.
It is never written to `localStorage`, IndexedDB or the project file, so:

- reloading the page or restarting the desktop app turns it off,
- it cannot be left on by accident for the next person,
- it never travels with an exported project.

It can also be left on demand: click the **Factory Dev Mode** badge in the menu
bar and confirm. The editor returns to its normal state immediately, and getting
back in needs the access code again.

## Using the flag

```tsx
import { useAppStore } from '../store/appStore';

const factoryDevMode = useAppStore(s => s.factoryDevMode);

return factoryDevMode ? <InternalDiagnostics /> : null;
```

The passphrase itself is exported as `FACTORY_DEV_MODE_PASSPHRASE` from
`src/store/appStore.ts` so it is defined in exactly one place.

## What the mode changes

| Surface | In factory dev mode | Normally |
| --- | --- | --- |
| **Code** editor tab (generated C source), last in the tab row | shown | hidden |
| **View → Code** menu item, after Preview | shown | hidden |
| **LVGL** section of the toolbar **Info** dialog — heap size, default font, large font support | shown | hidden |
| **Image Placement** section of the **Deploy** tab — each flashed image's address, size and memory region | shown | hidden |

More surfaces will be added here as they are decided.

### Notes on the Info dialog

Everything else in that dialog describes the board: resolution, colour format,
frame buffer size, flash, the field bus, and the ST-LINK board name. Those are
facts an operator can reasonably need. The LVGL rows are build settings of the
firmware rather than properties of the hardware, which is why only they are
gated. The section carries a badge so it is clear why it appeared.

### Notes on the Code tab

Leaving the mode while the Code tab is open would otherwise strand an empty
content area, so the tab is *derived* rather than stored: `effectiveTab` reads
as `design` whenever `activeTab` is `code` and the flag is off. Everything —
the rendered panel, the active tab highlight, the menu — follows that one value,
so no state has to be synced back and no effect is involved.

Hiding the tab does not disable code generation itself: `generateCode()` still
runs for the WASM preview, the Build & Run flow and project export. Only the
tab that displays the generated source is gated.

## Where it is implemented

| Concern | File |
| --- | --- |
| Flag, passphrase, `unlockFactoryDevMode()` | `src/store/appStore.ts` |
| About dialog and the five-click unlock | `src/components/AboutDialog/AboutDialog.tsx` |
| Menu bar badge | `src/components/DesktopMenuBar/DesktopMenuBar.tsx` |
| `Help → About` menu item | `src/components/DesktopMenuBar/DesktopMenuBar.tsx` |
