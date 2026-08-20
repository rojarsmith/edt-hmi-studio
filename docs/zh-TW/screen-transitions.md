# 換頁動畫

<p align="center">
  <a href="../screen-transitions.md">English</a> · <strong>繁體中文</strong>
</p>

一次導覽自己決定要怎麼被畫出來。在 Edit Event 對話框選擇 **Navigate to
Screen** 之後，目標畫面的下方會問三件事：用哪一種效果、往哪個方向走、走多久。

這個選擇屬於「這次導覽」，不屬於目的地。Next 想往左滑、Back 想往右滑，而被進入
的那個畫面無從得知使用者是從哪一邊來的——所以兩顆按鈕可以抵達同一個畫面，過程
卻完全不同。

## 五種效果

名稱沿用 TouchGFX Designer 的說法，因為那是多數人腦中既有的詞彙。其中四種各自
對應 LVGL 原生就會畫的一族：

| 效果 | LVGL | 什麼在動 |
| --- | --- | --- |
| **None** | 立即載入 | 什麼都不動——下一幀新畫面就已經在那裡 |
| **Slide** | `LV_SCR_LOAD_ANIM_MOVE_*` | 兩張畫面一起走，舊的被新的推出去 |
| **Cover** | `LV_SCR_LOAD_ANIM_OVER_*` | 只有進場的畫面在走，蓋過舊的 |
| **Wipe** | `LV_SCR_LOAD_ANIM_OUT_*` | 只有離場的畫面在走，露出底下的新畫面 |
| **Fade** | `LV_SCR_LOAD_ANIM_FADE_IN` | 都不動——新畫面在舊畫面上淡入 |

TouchGFX 的第五種 Block 是把畫面分塊重繪，LVGL 沒有對應；而 LVGL 的淡入在
TouchGFX 沒有對應。這個位置給了 Fade，而不是給一個引擎做不到的名字。

**None** 值得單獨說明，因為它讓一件事變得可能：同一個圖案畫在兩個畫面的同一個
位置時，它完全不會動，於是這次換頁肉眼看不出來——工具列可以留在原地，底下的內容
整批換掉，使用者看到的是一個畫面而不是兩個。

## 方向

Left、Right、Up、Down 指的是畫面**移動的方向**，與 LVGL 的命名一致，而不是新畫面
從哪一邊出現。Slide Left 是整個畫面往左走，也就是新畫面從右邊進來。

只有會移動的三種效果才會出現方向欄位。LVGL 說 `TOP` 和 `BOTTOM` 的地方，編輯器
說 Up 和 Down。

## 產生出來的程式碼

載入的呼叫直接寫在事件處理函式裡，而不是交給畫面自己的 load 函式，因為這個轉場
屬於這一次導覽：

```c
static void ui_event_btn_next_clicked(lv_event_t * e) {
    /* Navigate to: Settings */
    lv_scr_load_anim(ui_screen_settings, LV_SCR_LOAD_ANIM_MOVE_LEFT, 300, 0, false);
}
```

None 產生的是 `lv_scr_load(ui_screen_settings);`——LVGL 自己對長度為零的轉場所提供
的捷徑，會在兩幀之間把畫面換掉。

`ui_<screen>_load()` 仍然存在，仍然執行專案預設的淡入。`ui_init` 用它進入啟動
畫面，手寫程式碼不在意換頁長相時也應該呼叫它。

## 還有哪裡看得到

邏輯圖的 **Navigate to Screen** 節點提供同樣的五種效果、同樣的方向與同樣的長度，
並且走同一個產碼器——同一個選擇在兩邊產生同一行程式碼。

預覽也照做：轉場期間兩張畫面同時畫在面板上，位移與淡入的方式與
`lv_screen_load_anim` 一致，所以不必燒錄就能判斷手感。

## 時間軸，以及它與入場動畫的關係

LVGL 用四個事件把一次轉場包起來，兩個給進場、兩個給離場：

```
t=0        進場：LV_EVENT_SCREEN_LOAD_START    離場：LV_EVENT_SCREEN_UNLOAD_START
           ├──────────────── 轉場期間 ────────────────┤
t=duration 進場：LV_EVENT_SCREEN_LOADED        離場：LV_EVENT_SCREEN_UNLOADED
```

畫面的入場動畫綁在 **Screen Loaded**，所以轉場時間會整段延後它：300 ms 的 Cover
接一段 3 秒的入場動畫，從按下按鈕算起是 3.3 秒。選 None 時四個事件在同一次呼叫裡
連續發完，入場動畫立刻開始。

兩者可以正確疊加。入場動畫所驅動的元件會在 **Screen Load Start** 先被歸位——那是
轉場第一幀被畫出來之前——所以畫面不會以動到一半的樣子出現。而
`lv_screen_load_anim` 只會取消 var 是畫面物件本身的動畫，元件身上的動畫不受影響。

有一個後果值得在設計時考慮：Cover、Wipe、Slide 會讓新畫面在移動途中就被看見一
部分，而它的入場動畫要等它抵達才開始。也就是元件會先靜止地跟著轉場移動，停下來
之後才動起來。300 ms 幾乎看不出來，500 ms 就很明顯。

反過來——換頁之前先播一段**離場**動畫——要綁在動畫身上，而不是綁在按鈕上：換頁是
立刻發生的，會把自己的離場動畫從中間切斷。把換頁綁到該動畫的 **Animation
Finished** 事件即可，詳見 [animation-model.md](./animation-model.md)。

## 刻意沒有做的

- **畫面層級的預設值**：畫面無法宣告「進入我一律用淡入」。專案若想要如此，就由
  每一次導覽各自說明。
- **緩動曲線**：LVGL 的換頁動畫走線性路徑，也沒有提供更換的方法。
- **Block**：如上，引擎畫不出來。
- **啟動畫面的轉場**：`ui_init` 透過畫面的 load 函式進入啟動畫面，那是一段淡入。
  在它之前螢幕上沒有東西，也就沒有可以轉場的來源。
