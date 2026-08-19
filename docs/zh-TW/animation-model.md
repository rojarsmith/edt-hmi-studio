# 動畫 — 定義、目標、觸發

<p align="center">
  <a href="../animation-model.md">English</a> · <strong>繁體中文</strong>
</p>

動畫過去是它所驅動的那個元件的附屬品：存在該元件裡、因為所屬畫面出現而啟動、
只能用「在清單裡的第幾個」來指稱。沒有東西叫得出它的名字，所以除了「畫面載入」
之外沒有任何東西能啟動它；要設計入場動畫，只能接受產碼器自行決定的行為。

現在有三件事是分開的，而這個分離就是整個設計的核心：

| | 回答什麼 | 存在哪裡 |
| --- | --- | --- |
| **定義** | 動什麼、動多遠、動多久 | 專案的動畫清單 |
| **目標** | 驅動哪一個元件 | `Animation.targetComponentId` |
| **觸發** | 什麼時候執行 | 事件綁定——掛在畫面或元件上 |

因此設計者不需要寫任何程式碼就能做出畫面的入場動畫：擺好元件、定義動畫、
綁到該畫面的 **Screen Loaded** 事件上。

## 動畫清單

動畫是專案層級的資產，不論畫布上選了什麼（包含什麼都沒選），Animations 管理器
都會列出全部。每個動畫「指名」它驅動的元件，而不是住在元件裡面，所以改變目標
不會搬動動畫，刪除元件也不會連帶刪掉指向它的動畫。

名稱在全專案唯一，因為名稱會成為產生的 C 函式名（見下）。編輯對話框依照與元件
Id 相同的補洞規則發放 `Fade_In_1`、`Slide_Left_1` 等名稱，並拒絕與其他動畫重複
的名字。

### 缺少的依賴只會被標示，不會被擅自修復

目標被刪除、或從未指定目標的動畫，會留在清單裡並帶著紫色 **LACK** 標籤說明缺
什麼。綁定了已刪除動畫的事件也一樣。悄悄清掉引用等於把使用者還得重做的工作藏
起來；兩者都不會產生任何程式碼，建置時會留下註解，而不是去呼叫一個不存在的
符號。

## 觸發就是事件綁定

畫面本身也帶事件，在屬性編輯器的 **Events** 分區裡呈現，與元件的完全一樣。
畫面的事件目錄是它的生命週期，而不是輸入：

| 事件 | LVGL 何時發出 |
| --- | --- |
| `LV_EVENT_SCREEN_LOADED` | 切換到此畫面的轉場已結束——入場動畫該綁在這裡 |
| `LV_EVENT_SCREEN_LOAD_START` | 此畫面的第一幀被繪製之前 |
| `LV_EVENT_SCREEN_UNLOAD_START` | 此畫面開始離開時 |
| `LV_EVENT_SCREEN_UNLOADED` | 此畫面已完全離開 |

有兩個內建動作可以驅動動畫，畫面與元件皆可使用：**Play Animation** 從起始值
開始播放（不論上一次跑到哪裡），**Stop Animation** 則讓元件停在當下位置。
綁定是以 id 指名動畫的，所以替動畫改名不會靜默地解開每一個播放它的按鈕。

沒有任何綁定的動畫就不會執行。這正是「留一個動畫給按鈕、同時讓畫面的入場動畫
在載入時播放」之所以可能的原因。

### 歸位（parking）

起始值仍然必須自動套用。元件會停在上一次執行結束的地方，所以第二次進入畫面時，
它會在整個轉場期間停在終點位置，然後才跳回起點。因此產碼器會在
`LV_EVENT_SCREEN_LOAD_START`——轉場繪製之前——把該畫面入場動畫所驅動的元件
歸位。

而且只有那些。留給按鈕的動畫會停在使用者放置的地方：畫面沒有理由去移動一個它
並不播放的元件。

## Offset 與 Absolute

位置動畫的數值是從元件所在的位置起算的。「Slide in from the left」給出的是
`x: -100 → 0`，意思是*在它的位置左邊一百像素處，然後回家*——而不是座標 `-100`
再到座標 `0`。

這是實實在在的缺陷，不是偏好問題。產碼器過去把這些數字直接寫進
`lv_obj_set_x`，所以任何不是設計在 `x: 0` 的元件，在板子上都會滑到錯誤的位置
——而預覽把同樣的數字畫成「相對元件位置的位移」，顯示的結果是正確的。畫布與
韌體彼此矛盾，而錯的是韌體。兩者現在都經由
`src/utils/animationValues.ts` 的 `resolvedAnimationValues()` 解析。

**Absolute** 仍然保留，供真的要指定座標的動畫使用。對話框只對 `x` 與 `y` 提供
這個選擇：只有它們有「可以被位移的位置」。寬度 100 不論從哪裡量都是一百像素，
而不透明度根本沒有位置可言。

基準是**設計時**的位置，不是執行時的位置。若從元件當下所在處起算會產生漂移：
每次畫面載入前把它歸位到起始值，再把那個歸位後的位置當成下一次的基準，會讓它
每進入一次就往外走一段。

## 產生出來的程式碼

每個動畫會產生一對函式，命名只取動畫本身——絕不含目標，這樣把它改指到別的元件
時，按鈕所呼叫的函式名不會跟著變：

```c
void ui_anim_slide_in_1_start(void) {
    lv_anim_t anim;
    lv_anim_init(&anim);
    lv_anim_set_var(&anim, ui_title);
    lv_anim_set_exec_cb(&anim, (lv_anim_exec_xcb_t)lv_obj_set_x);
    lv_anim_set_values(&anim, -70, 40);   /* 設計在 x: 40，位移 -110 */
    lv_anim_set_time(&anim, 400);
    lv_anim_set_path_cb(&anim, lv_anim_path_ease_out);
    lv_anim_start(&anim);
}

void ui_anim_slide_in_1_stop(void) {
    lv_anim_delete(ui_title, (lv_anim_exec_xcb_t)lv_obj_set_x);
}
```

兩者都宣告在 `ui.h`，所以任何東西都能呼叫。`lv_anim_start` 本身就會先刪除同一
組（目標，exec callback）的執行中動畫，所以播放兩次是重新開始而不是疊加兩個，
不需要自己再刪一次。

觸發則像其他綁定一樣，從事件表產生出來：

```c
void ui_event_screen_main_screen_loaded(lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    (void)code;

    if (code == LV_EVENT_SCREEN_LOADED) {
        ui_anim_slide_in_1_start();
    }
}
```

畫面的 init 函式則把它與歸位 callback 一起註冊：

```c
lv_obj_add_event_cb(ui_screen_main, ui_screen_main_reset_anims, LV_EVENT_SCREEN_LOAD_START, NULL);
lv_obj_add_event_cb(ui_screen_main, ui_event_screen_main_screen_loaded, LV_EVENT_SCREEN_LOADED, NULL);
```

### 一個物件的一種事件 = 一個 handler

一個 handler 服務一個物件的一種事件，並依清單順序執行該類型的所有綁定；
callback 也是每種事件註冊一次，而不是每個綁定註冊一次。若每個綁定各產生一個
函式，同型的兩個綁定就會得到同名函式，那是編譯不過的——而一個畫面播放三個入場
動畫，天生就是這個形狀。

## 開啟舊專案

開啟、匯入、讀取專案檔三條路徑上會執行兩個遷移，與既有的 typography 和文字資源
遷移是同一套做法：

1. **提升（hoisting）**：存在元件內的動畫被提升到專案清單，並以當初所在的元件
   作為目標。
2. **綁定**：畫面上的每個動畫都會在該畫面獲得一筆 Screen Loaded 綁定，完整重現
   產碼器過去自行做的事。

空的 `events` 陣列代表該畫面已完成遷移。因此「刪光所有綁定」是一個能撐過下次
開啟的決定，而不會被遷移復原。

這類專案裡的位置動畫在板子上的行為會改變：它們現在會落在預覽一直以來所顯示的
位置。真的想指定座標的動畫可以切換成 Absolute。

## 預覽

Quick Preview 完整支援上述行為。進入畫面時——開機進入 Entry Screen、按下導覽
按鈕、或點擊底部的畫面清單——會播放該畫面的 Screen Loaded 綁定，與韌體一致。
點擊元件會執行它的 Play Animation 與 Stop Animation 綁定。工具列的播放鍵會重播
目前畫面的入場；沒有任何綁定的畫面則退回播放所有指向它的動畫，讓留給按鈕的動畫
仍然可以預覽。

## 實作位置

| 關注點 | 檔案 |
| --- | --- |
| 動畫與綁定型別 | `src/types/index.ts` |
| 命名規則 | `src/utils/animationNames.ts` |
| 遷移、目標解析、LACK | `src/utils/animationAssets.ts` |
| Offset 與 Absolute | `src/utils/animationValues.ts` |
| C 符號與解析後的數值 | `src/codegen/animationSymbols.ts` |
| 動畫函式與歸位 | `src/codegen/templates/ui.c.ts` |
| 事件 handler 與兩個動作 | `src/codegen/templates/ui_events.c.ts` |
| 動畫管理器 | `src/components/AnimationPanel/` |
| Events 分區 | `src/components/EventPanel/` |

## 尚未完成

- **時間軸**：動畫彼此獨立，目前沒有辦法表達「先這個、再那個」。基礎已經在了
  ——「動畫播放完畢」可以成為另一種觸發——但還沒有任何介面把它呈現出來。
- **Style transition**：LVGL 的 `lv_style_transition_dsc` 幾乎不花成本就能涵蓋
  「按下去要有回饋感」這類需求，而且它與這套機制是不同的東西，不是競爭關係：
  狀態過渡負責質感，觸發負責編排。
- **尺寸的 Offset**：`width` 與 `height` 其實也可以相對於設計尺寸做位移；目前
  還沒有這個需求。
