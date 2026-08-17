# Logo 設計

<p align="center">
  <a href="../logo-design.md">English</a> · <strong>繁體中文</strong>
</p>

EDT HMI Studio 產品 logo 的設計紀錄。資產保存在
[`branding/`](../../branding/)；在選定變體之前，`src/` 不引用任何
一份。設計日期：2026-08-17。

## 1. 概念

圓角正方形的顯示面板作為外框，框住三種 HMI widget — **儀表**
（弧 + 指針，左上）、**垂直滑桿**（右側）、**水平滑桿**（底部）。
讀出來就是*在顯示面板上設計介面*，正是產品本質；面板作框也呼應
EDT 的顯示器製造本業。

純描邊的幾何風格延續 splash 畫面的視覺語言（圓／方／三角／六邊形
的繪製循環），讓產品的各個表面像同一個家族。互動元素（指針、
滑桿旋鈕）以強調色與主線條區隔。

## 2. 迭代紀錄

- **v1 — 橫式面板**（`logo-horizontal-green*.svg`）：橫向螢幕配
  儀表 + 兩支水平滑桿。保留備用；因 app 圖示、favicon、頭像框
  都要 1:1，被正方形版取代。
- **v2 初稿 — 儀表 + 撥動開關**：淘汰。兩個圓形並排在底部滑桿
  上方，產生「臉」的錯視（眼睛 + 嘴），一旦看見就無法忽視。
- **v2 定稿 — 儀表 + 垂直滑桿 + 水平滑桿**：打破對稱、消除臉部
  錯視，同時呈現三種不同的 widget 類型。

## 3. 配色變體

| 檔案 | 主色 / 強調色 | 個性 |
| --- | --- | --- |
| `logo-square-teal.svg` | `#0e7490` / `#06b6d4` | 顯示器產業科技感；深淺底表現最穩 |
| `logo-square-indigo.svg` | `#3730a3` / `#6366f1` | 開發者工具氣質 |
| `logo-square-graphite.svg` | `#374151` / `#f97316` | 工業儀器感；深底時框偏弱，靠橘色撐辨識度 |
| `logo-square-green.svg` | `#285838` / `#4f9d68` | 與 EDT 母品牌一致（取樣自 EDT 潑墨 logo） |

`branding/logo-preview.html` 內含各變體的深淺底對照、
128/64/32/16 px 尺寸階梯與字標 lockup。

## 4. 使用指引

- 128–32 px 清晰可讀；16 px 時內部細節聚合，favicon 使用簡化
  glyph（僅面板 + 儀表，加粗線條）：`logo-favicon.svg`，以 data URI
  內聯於 `index.html`。
- 字標未轉曲進 SVG。與圖標並用時，以 system-ui semibold、
  字距約 0.13em 排「EDT HMI Studio」，與 splash 畫面一致。
- 選定變體後：favicon 內聯進 `index.html`；app 內使用時將選中
  檔案複製到 `src/assets/`；桌面圖示轉 `.ico` 放 `desktop/`，
  接 NativeWebHost 的 `IconPath`。`branding/` 永遠保存全部變體
  與本紀錄。
