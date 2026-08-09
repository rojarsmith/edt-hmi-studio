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

4. On success the field closes and a **原廠人員研發模式** badge appears both in
   the About dialog and in the menu bar, next to the Web/Desktop badge. The UI
   updates immediately — no reload is needed.

A wrong code turns the field red and clears it; the mode is left off.

## Lifetime

The flag lives in `useAppStore().factoryDevMode` and is **held in memory only**.
It is never written to `localStorage`, IndexedDB or the project file, so:

- reloading the page or restarting the desktop app turns it off,
- it cannot be left on by accident for the next person,
- it never travels with an exported project.

There is deliberately no UI to turn it off again — reload instead.

## Using the flag

```tsx
import { useAppStore } from '../store/appStore';

const factoryDevMode = useAppStore(s => s.factoryDevMode);

return factoryDevMode ? <InternalDiagnostics /> : null;
```

The passphrase itself is exported as `FACTORY_DEV_MODE_PASSPHRASE` from
`src/store/appStore.ts` so it is defined in exactly one place.

## What the mode changes

**Nothing yet.** The flag and its unlock flow are in place, and the badge shows
when it is on, but no feature is currently gated on it. What the mode exposes,
and what gets hidden outside it, is still to be decided — list the decisions
here as they are made:

| Surface | Visible in factory dev mode | Visible normally |
| --- | --- | --- |
| _(to be decided)_ | | |

## Where it is implemented

| Concern | File |
| --- | --- |
| Flag, passphrase, `unlockFactoryDevMode()` | `src/store/appStore.ts` |
| About dialog and the five-click unlock | `src/components/AboutDialog/AboutDialog.tsx` |
| Menu bar badge | `src/components/DesktopMenuBar/DesktopMenuBar.tsx` |
| `Help → About` menu item | `src/components/DesktopMenuBar/DesktopMenuBar.tsx` |
