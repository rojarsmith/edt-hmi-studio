# LVGL Version

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/lvgl-version.md">繁體中文</a>
</p>

**EDT GUI Studio targets LVGL v9.5 as its primary version.**

| | Value |
| --- | --- |
| Release | `v9.5.0`, published 2026-02-18 |
| Commit | `85aa60d18b3d5e5588d7b247abf90198f07c8a63` |
| Previous pin | `v9.2.2` — `7f07a129e8d77f4984fff8e623fd5be18ff42e74` |

## 1. Where each build path gets LVGL

The two build paths obtain LVGL differently, and only one of them is pinned.

### 1.1 Firmware — pinned, on v9.5.0

`firmware/<board>/scripts/bootstrap-deps.ps1` downloads an immutable commit
archive into the board's `.hmi-cache/`:

```powershell
Install-PinnedArchive `
    -Name "lvgl-85aa60d" `
    -Uri "https://codeload.github.com/lvgl/lvgl/zip/85aa60d18b3d5e5588d7b247abf90198f07c8a63" `
    -Target (Join-Path $CacheRoot "Middlewares\Third_Party\lvgl") `
    -Sentinel "src\lv_init.c"
```

Both boards use the same pin, and each script writes the resolved version into
`.hmi-cache/DEPENDENCIES.txt`.

The cache invalidates on the `-Name` value, so changing the pin changes the name
and the next bootstrap re-downloads automatically. No manual cache clearing is
needed.

### 1.2 WASM preview — **not pinned, and its prebuilt artifacts are still 9.2**

This path has no version pin at all. `wasm/build_lvgl_lib.sh` compiles whatever
happens to be checked out at a hardcoded absolute path:

```bash
LVGL_DIR="/home/xcssa/.openclaw/workspace/tools/lvgl"
```

The results are committed as prebuilt artifacts:

| File | Built from |
| --- | --- |
| `public/lvgl-wasi/liblvgl.a` | LVGL 9.2.x |
| `public/lvgl-wasi/lvgl-headers.json` | `v9.2.3-dev` (see the header comment inside) |

**Bumping the pin above does not touch these.** They stay on 9.2 until someone
rebuilds them on a machine with emsdk and an LVGL v9.5.0 checkout. Until then
the in-browser preview runs 9.2 while the firmware runs 9.5.

To regenerate: check out LVGL v9.5.0 at the path `build_lvgl_lib.sh` expects,
run it, and copy the resulting library and header bundle into
`public/lvgl-wasi/`. Consider replacing the hardcoded path with a pinned
download while you are there.

## 2. What the version fields in the app do *not* mean

Two settings look like version selectors and are not:

- **`CodeGenOptions.lvglVersion: '8' | '9'`** (default `'9'`) selects between the
  LVGL **v8 and v9 APIs** — `lv_image_set_src` vs `lv_img_set_src`,
  `LV_IMAGE_DECLARE` vs `LV_IMG_DECLARE`, and similar renames. It is a major
  API switch and says nothing about the minor version. There is no `'9.5'`
  value and none is needed: v9.5 uses the v9 API.
- **`LvglConfig.version: '9'`** in the project file is currently **read by
  nothing**. It round-trips through save/load and is otherwise inert.

So the primary version is decided by the pin in §1, not by anything in the UI.

## 3. Configuration files

`lv_conf.h` exists in three places and each is maintained by hand:

| File | Used by |
| --- | --- |
| `firmware/stm32f746g-disco/include/lv_conf.h` | F746 firmware |
| `firmware/stm32h747i-disco/include/lv_conf.h` | H747 firmware |
| `wasm/lv_conf.h` | WASM preview build |

They were written against 9.2 and carry a 9.5 header comment now. LVGL supplies
defaults for every option it does not find (`lv_conf_internal.h`), so a
9.2-era config still compiles against 9.5; no option this project sets was
renamed or removed in 9.3–9.5.

See [LVGL Configuration](./lvgl-configuration.md) for what the individual
options mean and which of them the project drives from the board definition.

## 4. Bumping the version in future

1. Find the release commit: `https://api.github.com/repos/lvgl/lvgl/git/ref/tags/vX.Y.Z`.
2. In **both** `firmware/*/scripts/bootstrap-deps.ps1`, update the `-Name`, the
   `-Uri` commit and the `LVGL vX.Y.Z <sha>` line in the manifest.
3. Update the header comment in the three `lv_conf.h` files.
4. Rebuild and replace the WASM artifacts in `public/lvgl-wasi/` (§1.2).
5. Check the upstream changelog for `lv_conf.h` options and widget API renames
   that affect `src/codegen/templates/`.
6. Update the table at the top of this file.

## 5. Verification status

The pin, the manifest and the config headers were changed and reviewed against
the upstream changelog for 9.3–9.5, which records no `lv_conf.h` or widget API
breaks affecting this project.

**Neither build has been run against v9.5.0.** The firmware build needs the ARM
toolchain and the WASM build needs emsdk, neither of which was available when
this change was made. The first real bootstrap on v9.5.0 is still unverified —
treat a first failed firmware build as a likely consequence of this bump.
