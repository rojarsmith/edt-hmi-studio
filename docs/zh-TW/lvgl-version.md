# LVGL 版本

<p align="center">
  <a href="../lvgl-version.md">English</a> · <strong>繁體中文</strong>
</p>

**EDT GUI Studio 以 LVGL v9.5 作為主要版本。**

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

### 1.2 WASM 預覽 — **未釘選，且 prebuilt 產物仍是 9.2**

這條路徑完全沒有版本釘選。`wasm/build_lvgl_lib.sh` 編譯的是某個寫死絕對路徑底下
剛好簽出的內容：

```bash
LVGL_DIR="/home/xcssa/.openclaw/workspace/tools/lvgl"
```

編譯結果以 prebuilt 產物的形式納入版控：

| 檔案 | 建置來源 |
| --- | --- |
| `public/lvgl-wasi/liblvgl.a` | LVGL 9.2.x |
| `public/lvgl-wasi/lvgl-headers.json` | `v9.2.3-dev`（見檔案內的標頭註解） |

**改上面的釘選不會動到這兩個檔案。** 在有人於具備 emsdk 且簽出 LVGL v9.5.0 的機器上
重新建置之前，它們會維持在 9.2。在那之前，瀏覽器內的預覽跑的是 9.2，韌體跑的是 9.5。

重新產生方式：在 `build_lvgl_lib.sh` 預期的路徑簽出 LVGL v9.5.0、執行該腳本，再把
產出的函式庫與標頭包複製到 `public/lvgl-wasi/`。順便可以考慮把那個寫死的路徑改成
釘選下載。

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

## 4. 日後升版步驟

1. 查出發布 commit：`https://api.github.com/repos/lvgl/lvgl/git/ref/tags/vX.Y.Z`。
2. 在**兩份** `firmware/*/scripts/bootstrap-deps.ps1` 中更新 `-Name`、`-Uri` 的
   commit，以及 manifest 裡的 `LVGL vX.Y.Z <sha>` 那一行。
3. 更新三份 `lv_conf.h` 的標頭註解。
4. 重新建置並替換 `public/lvgl-wasi/` 底下的 WASM 產物（§1.2）。
5. 檢查上游 changelog 中影響 `src/codegen/templates/` 的 `lv_conf.h` 選項與
   widget API 改名。
6. 更新本文件開頭的表格。

## 5. 驗證狀態

釘選、manifest 與設定檔標頭都已修改，並比對過 9.3–9.5 的上游 changelog，其中沒有
影響本專案的 `lv_conf.h` 或 widget API 破壞性變更。

**但兩條建置路徑都尚未實際對 v9.5.0 建置過。** 韌體建置需要 ARM 工具鏈、WASM 建置
需要 emsdk，進行這項變更時兩者都不具備。第一次真正以 v9.5.0 bootstrap 仍屬未驗證 —
若第一次韌體建置失敗，請優先懷疑是這次升版造成的。
