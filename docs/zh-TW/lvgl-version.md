# LVGL 版本

<p align="center">
  <a href="../lvgl-version.md">English</a> · <strong>繁體中文</strong>
</p>

**EDT HMI Studio 以 LVGL v9.5 作為主要版本。**

| | 內容 |
| --- | --- |
| 發布版本 | `v9.5.0`，2026-02-18 發布 |
| Commit | `85aa60d18b3d5e5588d7b247abf90198f07c8a63` |
| 先前釘選 | `v9.2.2` — `7f07a129e8d77f4984fff8e623fd5be18ff42e74` |

## 1. 各建置路徑的 LVGL 來源

兩條建置路徑取得 LVGL 的方式不同，而且只有其中一條有釘選版本。

### 1.1 韌體 — 已釘選，位於 v9.5.0

`firmware/<board>/scripts/bootstrap-deps.ps1` 會下載不可變的 commit 壓縮檔到該板子的
`.hmi-cache/`：

```powershell
Install-PinnedArchive `
    -Name "lvgl-85aa60d" `
    -Uri "https://codeload.github.com/lvgl/lvgl/zip/85aa60d18b3d5e5588d7b247abf90198f07c8a63" `
    -Target (Join-Path $CacheRoot "Middlewares\Third_Party\lvgl") `
    -Sentinel "src\lv_init.c"
```

兩片板子使用同一個釘選，各自的腳本會把解析後的版本寫進
`.hmi-cache/DEPENDENCIES.txt`。

快取以 `-Name` 的值作為失效判斷，因此改版本就會改名稱，下次 bootstrap 會自動重新
下載，不需要手動清快取。

這個壓縮檔有 104 MB。若 `firmware/vendor` 底下已有同等的壓縮檔，就會直接採用而不下載
—— 比對的是 GitHub 內嵌在 zip 裡的 commit 而非檔名，因此同樣受釘選約束。詳見
`firmware/vendor/README.md`。

### 1.2 `wasm/` 建置樹 — **現在釘選了；簽進 repo 的產物仍是 9.2**

這條路徑本來完全沒有版本釘選：`wasm/build_lvgl_lib.sh` 編的是某位貢獻者 home 目錄底下
一條寫死絕對路徑剛好簽出的內容，Emulator 也是。

現在兩者都改用 [emulator.md](./emulator.md) §4.1 的搜尋順序來找 LVGL——`LVGL_ROOT`、
`.hmi-cache/emulator/lvgl`，再來是**任一塊韌體板子的相依快取**。最後那一項才是重點：在
建置過韌體的機器上，Emulator 編譯用的就是 §1.1 裝下來的那份 checkout、同一個 commit，
於是兩條路徑在結構上就一致，不必再靠紀律。沒有板子快取的機器，`npm run emulator:setup`
會照同一個 pin 裝一份。

Emulator 的靜態庫是一個建置產物，快取在 `.hmi-cache/emulator/lib/<hash>/`，鍵是產生它的
那份設定；所以改上面那個 pin，下一次執行就會自動重建，沒有手動步驟。

**第二階簽進 repo 的產物則是另一回事，而且仍然是 9.2：**

| 檔案 | 建置來源 |
| --- | --- |
| `public/lvgl-wasi/liblvgl.a` | LVGL 9.2.x |
| `public/lvgl-wasi/lvgl-headers.json` | `v9.2.3-dev`（見檔案內的標頭註解） |

**改上面的釘選不會動到這兩個檔案。** 它們是簽進版控的二進位檔，在有人重新建置之前會維持
在 9.2；也就是說 Simulator 那一階跑的是 9.2，而韌體與 Emulator 跑的是 9.5。

重新產生方式：工具鏈還沒有的話先跑 `npm run emulator:setup`，然後執行 `wasm/build.sh`
——它現在會自己在任何機器上找到工具鏈——再把產出的函式庫與標頭包複製到 `public/lvgl-wasi/`。

## 2. 應用程式裡那兩個版本欄位**不是**版本選擇器

有兩個設定看起來像版本選擇，實際上不是：

- **`CodeGenOptions.lvglVersion: '8' | '9'`**（預設 `'9'`）切換的是 LVGL 的
  **v8 與 v9 API** — `lv_image_set_src` 對 `lv_img_set_src`、`LV_IMAGE_DECLARE`
  對 `LV_IMG_DECLARE` 等等的改名。它是大版本 API 開關，與次版本無關。沒有 `'9.5'`
  這個值，也不需要：v9.5 用的就是 v9 API。
- 專案檔裡的 **`LvglConfig.version: '9'`** 目前**沒有任何程式讀取**。它只是在存檔／
  載入之間往返，其餘毫無作用。

也就是說，主要版本由 §1 的釘選決定，不是由 UI 上的任何東西決定。

## 3. 設定檔

`lv_conf.h` 存在於三個地方，各自手動維護：

| 檔案 | 使用者 |
| --- | --- |
| `firmware/stm32f746g-disco/include/lv_conf.h` | F746 韌體 |
| `firmware/stm32h747i-disco/include/lv_conf.h` | H747 韌體 |
| `wasm/lv_conf.h` | WASM 預覽建置 |

這些檔案是針對 9.2 撰寫的，目前標頭註解已改為 9.5。LVGL 對於找不到的選項會提供預設值
（`lv_conf_internal.h`），因此 9.2 時期的設定檔仍能對 9.5 編譯；本專案有設定的選項在
9.3–9.5 之間都沒有被改名或移除。

各選項的意義、以及哪些是由板子定義帶入的，參見
[LVGL 設定](./lvgl-configuration.md)。

### 3.1 CMake 選項是另一回事，而且它確實改了

`lv_conf.h` 的選項在 9.3–9.5 之間存活了下來，但韌體傳給 LVGL 自身 CMake 的那些選項
沒有 —— 而且舊名稱是**無聲失效**，不會報錯：

| v9.5 移除 | 取代者 | 上游預設 |
| --- | --- | --- |
| `LV_CONF_BUILD_DISABLE_EXAMPLES` | `CONFIG_LV_BUILD_EXAMPLES` | **ON** |
| `LV_CONF_BUILD_DISABLE_DEMOS` | `CONFIG_LV_BUILD_DEMOS` | **ON** |
| `LV_CONF_BUILD_DISABLE_THORVG_INTERNAL` | `CONFIG_LV_USE_THORVG_INTERNAL` | **ON** |

由於取代者一律預設為 ON，沿用舊名稱的後果不是編譯失敗，而是把 demos、examples 與
ThorVG 一起編進韌體映像。

此外 v9.5 只會從專案頂層目錄尋找 `lv_conf.h`，找不到就直接 `FATAL_ERROR`。本專案的
放在 `include/` 底下，因此兩片板子都在 `add_subdirectory` 之前設定
`LV_BUILD_CONF_DIR`。

## 4. 日後升版步驟

1. 查出發布 commit：`https://api.github.com/repos/lvgl/lvgl/git/ref/tags/vX.Y.Z`。
2. 在**兩份** `firmware/*/scripts/bootstrap-deps.ps1` 中更新 `-Name`、`-Uri` 的
   commit，以及 manifest 裡的 `LVGL vX.Y.Z <sha>` 那一行。
3. 更新三份 `lv_conf.h` 的標頭註解。
4. 重新建置並替換 `public/lvgl-wasi/` 底下的 WASM 產物（§1.2）。
5. 檢查上游 changelog 中影響 `src/codegen/templates/` 的 `lv_conf.h` 選項與
   widget API 改名。
6. 比對前一版的 `env_support/cmake/os_desktop.cmake`，確認板子設定的每一個
   `CONFIG_LV_*` 都還存在（§3.1）。選項被移除時不會有任何警告。
7. 實際跑一次韌體建置。升版導致 configure 或連結失敗是常態，不是意外。
8. 更新本文件開頭的表格。

## 5. 驗證狀態

釘選、manifest 與設定檔標頭都已比對過 9.3–9.5 的上游 changelog，其中沒有影響本專案的
`lv_conf.h` 或 widget API 破壞性變更。

**韌體 — 已建置。** 兩片板子都能對 v9.5.0 完成 configure、編譯與連結，使用
CubeCLT 1.22.0（`arm-none-eabi-gcc` 14.3.1），並產出 `elf`、`hex`、`bin` 與 `map`：

| 板子 | text | data | bss |
| --- | --- | --- | --- |
| STM32H747I-DISCO | 281344 | 812 | 279516 |
| STM32F746G-DISCO | 273368 | 608 | 112948 |

這需要 §3.1 的 CMake 變更；只改釘選是建不起來的。

**尚未驗證：** 兩個映像都還沒燒錄，因此 v9.5 上的畫面渲染、觸控與 Modbus 迴圈都未經
實機執行。WASM 預覽未動，仍是 §1.2 所述的 9.2 產物。
